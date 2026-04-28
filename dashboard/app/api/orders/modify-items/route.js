/**
 * PATCH /api/orders/modify-items
 * Modifie les articles d'une commande nc_boutique ou POS (natif Supabase).
 * Remplace l'action MODIFY_ORDER → GAS → Shopify pour les commandes nc_boutique/pos.
 *
 * Règles :
 *   - Uniquement pour order_source IN ('nc_boutique', 'pos')
 *   - Uniquement si decision_status NOT IN ('expédié', 'livré', 'retourné', 'annulé')
 *   - Opération : restaurer stock anciens items → vérifier → déduire stock nouveaux items → mettre à jour commande
 *
 * Body : {
 *   token: string,
 *   order_id: string,
 *   new_items: [{ variant_id, qty, price, title, image_url? }],
 *   note?: string
 * }
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BLOCKED_STATUSES = ["expédié", "livré", "retourné", "annulé", "shipped", "delivered", "returned", "cancelled"];

/**
 * Compare anciens et nouveaux articles, retourne un tableau de chaînes lisibles.
 * Exemples : "+Shampoing Pro ×2", "-Gel Fixant", "Mousse ×1→×3"
 */
function buildItemsDiff(oldItems, newItems) {
  const oldMap = {};
  for (const item of oldItems) {
    const vid = String(item.variant_id);
    oldMap[vid] = {
      title: item.title || item.product_title || vid,
      qty:   Number(item.qty || item.quantity || 1),
    };
  }
  const newMap = {};
  for (const item of newItems) {
    const vid = String(item.variant_id);
    newMap[vid] = { title: item.title || vid, qty: Number(item.qty || 1) };
  }

  const parts = [];

  for (const [vid, item] of Object.entries(newMap)) {
    if (!oldMap[vid]) {
      parts.push(`+${item.title} ×${item.qty}`);
    }
  }
  for (const [vid, item] of Object.entries(oldMap)) {
    if (!newMap[vid]) {
      parts.push(`-${item.title}`);
    }
  }
  for (const [vid, newItem] of Object.entries(newMap)) {
    if (oldMap[vid] && oldMap[vid].qty !== newItem.qty) {
      parts.push(`${newItem.title} ×${oldMap[vid].qty}→×${newItem.qty}`);
    }
  }

  return parts;
}

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
    }

    const { order_id, new_items, note } = body;

    if (!order_id) {
      return NextResponse.json({ ok: false, error: "order_id requis" }, { status: 400 });
    }
    if (!new_items || !Array.isArray(new_items) || new_items.length === 0) {
      return NextResponse.json({ ok: false, error: "new_items requis et non vide" }, { status: 400 });
    }

    const sb = adminSB();

    // ── 1. Lire la commande actuelle ────────────────────────
    const { data: order, error: fetchErr } = await sb
      .from("nc_orders")
      .select("order_id, order_name, order_source, decision_status, items_json, total_price, order_total, delivery_price, coupon_discount, customer_name")
      .eq("order_id", order_id)
      .maybeSingle();

    if (fetchErr || !order) {
      return NextResponse.json({ ok: false, error: "Commande introuvable" }, { status: 404 });
    }

    if (!["nc_boutique", "pos"].includes(order.order_source)) {
      return NextResponse.json({
        ok:    false,
        error: `Modification native impossible pour order_source='${order.order_source}'. Utiliser GAS MODIFY_ORDER pour les commandes Shopify.`,
      }, { status: 422 });
    }

    if (BLOCKED_STATUSES.includes((order.decision_status || "").toLowerCase())) {
      return NextResponse.json({
        ok:    false,
        error: `Commande en statut '${order.decision_status}' — modification impossible.`,
      }, { status: 422 });
    }

    const oldItems = Array.isArray(order.items_json) ? order.items_json : [];

    // ── 2. Restaurer le stock pour les anciens items ─────────
    const restoreResults = await Promise.allSettled(
      oldItems.map(async (item) => {
        const qty = Number(item.qty || item.quantity || 1);
        if (qty <= 0) return;

        const { data: movement, error: rpcErr } = await sb.rpc("increment_stock", {
          p_variant_id: String(item.variant_id),
          p_qty:        qty,
        });

        if (rpcErr) {
          console.warn(`[modify-items] Restore failed for ${item.variant_id}:`, rpcErr.message);
        } else {
          const row = Array.isArray(movement) ? movement[0] : movement;
          await sb.from("nc_stock_movements").insert({
            variant_id:    String(item.variant_id),
            movement_type: "RETURN",
            qty_before:    row?.qty_before ?? null,
            qty_change:    +qty,
            qty_after:     row?.qty_after ?? null,
            order_id:      order_id,
            source:        order.order_source,
            agent:         session.nom || null,
            note:          `Retour stock — modification commande ${order.order_name}`,
          });
        }
      })
    );

    const restoreErrors = restoreResults.filter(r => r.status === "rejected");
    if (restoreErrors.length > 0) {
      console.error(`[modify-items] ${restoreErrors.length} restore errors for order ${order_id}`);
    }

    // ── 3. Vérifier le stock pour les nouveaux items ─────────
    const newVariantIds = new_items.map(i => String(i.variant_id));
    const { data: freshVariants, error: varErr } = await sb
      .from("nc_variants")
      .select("variant_id, inventory_quantity, product_title")
      .in("variant_id", newVariantIds);

    if (varErr) {
      // Si vérification échoue, restaurer est déjà fait → continuer avec avertissement
      console.error("[modify-items] Stock check error:", varErr.message);
    }

    const stockMap = Object.fromEntries(
      (freshVariants || []).map(v => [String(v.variant_id), v])
    );

    for (const item of new_items) {
      const stock = stockMap[String(item.variant_id)];
      if (!stock) {
        return NextResponse.json({
          ok:    false,
          error: `Article introuvable après restauration : ${item.title || item.variant_id}`,
        }, { status: 400 });
      }
      if (Number(stock.inventory_quantity) < Number(item.qty)) {
        return NextResponse.json({
          ok:         false,
          error:      `Stock insuffisant pour "${stock.product_title}" : disponible ${stock.inventory_quantity}, demandé ${item.qty}`,
          variant_id: item.variant_id,
        }, { status: 422 });
      }
    }

    // ── 4. Déduire le stock pour les nouveaux items ──────────
    await Promise.allSettled(
      new_items.map(async (item) => {
        const { data: movement, error: rpcErr } = await sb.rpc("decrement_stock", {
          p_variant_id: String(item.variant_id),
          p_qty:        Number(item.qty),
        });

        if (rpcErr) {
          console.error(`[modify-items] decrement_stock error ${item.variant_id}:`, rpcErr.message);
          return;
        }

        const row = Array.isArray(movement) ? movement[0] : movement;
        if (!row) return;

        await sb.from("nc_stock_movements").insert({
          variant_id:    String(item.variant_id),
          movement_type: "SALE",
          qty_before:    row.qty_before,
          qty_change:    -Number(item.qty),
          qty_after:     row.qty_after,
          order_id:      order_id,
          source:        order.order_source,
          agent:         session.nom || null,
          note:          `Modification commande ${order.order_name}`,
        });
      })
    );

    // ── 5. Recalculer le total ───────────────────────────────
    const newItemsTotal = new_items.reduce(
      (sum, i) => sum + Number(i.price || 0) * Number(i.qty || 1), 0
    );
    const deliveryPrice  = Number(order.delivery_price || 0);
    const couponDiscount = Number(order.coupon_discount || 0);
    const newTotal       = newItemsTotal - couponDiscount + deliveryPrice;

    // ── 6. Mettre à jour nc_orders ───────────────────────────
    const { error: updateErr } = await sb
      .from("nc_orders")
      .update({
        items_json:          new_items,
        total_price:         newTotal,
        order_total:         newTotal,
        order_items_summary: new_items.map(i => `${i.title || i.variant_id} x${i.qty}`).join(", "),
        stock_deducted:      true,
        statut_preparation:  null,
        prepared_by:         null,
      })
      .eq("order_id", order_id);

    if (updateErr) {
      console.error("[modify-items] Update order error:", updateErr.message);
      return NextResponse.json({ ok: false, error: "Erreur mise à jour commande" }, { status: 500 });
    }

    // ── 7. Log nc_events ─────────────────────────────────────
    await sb.from("nc_events").insert({
      log_type: "ORDER_ITEMS_MODIFIED",
      source:   "dashboard",
      order_id,
      note:     `Articles commande ${order.customer_name || order.order_name} modifiés par ${session.nom} — nouveau total ${newTotal} DA`,
      metadata: {
        order_name:   order.order_name,
        customer_name: order.customer_name,
        old_items:    oldItems,
        new_items,
        new_total:    newTotal,
        modified_by:  session.nom,
        note:         note || null,
      },
    });

    // ── 8. Push notification — détail des modifications ──────
    try {
      const diffParts = buildItemsDiff(oldItems, new_items);
      const diffText  = diffParts.length > 0 ? diffParts.join(" | ") : "Articles mis à jour";
      const clientName = order.customer_name || order.order_name || order_id;

      await fetch(new URL("/api/push/send", request.url).toString(), {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       `🔄 Articles modifiés — ${clientName}`,
          body:        diffText,
          url:         "/dashboard/preparation",
          tag:         `modify-${order_id}`,
          type:        "order_modified",
          fromUser:    session.nom,
          excludeUser: session.nom,
        }),
      });
    } catch (_) {
      // Notification non bloquante — ignorer les erreurs push
    }

    return NextResponse.json({
      ok:         true,
      order_id,
      order_name: order.order_name,
      new_total:  newTotal,
      items:      new_items,
    });

  } catch (err) {
    console.error("[modify-items] Unexpected error:", err.message);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
