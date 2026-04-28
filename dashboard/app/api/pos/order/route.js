/**
 * POST /api/pos/order
 * Crée une vente POS (comptoir) dans nc_orders + déduit le stock immédiatement.
 *
 * Body : {
 *   token: string,
 *   items: [{ variant_id, qty, price, title, image_url? }],
 *   agent: string,
 *   note?: string,
 *   customer_name?: string,
 *   customer_phone?: string,
 *   discount_amount?: number,  -- remise globale sur le bon (en DA)
 * }
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";
import { randomUUID } from "crypto";
import { printPosOrder } from "@/lib/printnode";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function buildPosOrderName(seq) {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `POS-${y}${m}${day}-${String(seq).padStart(4, "0")}`;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
    }

    const { items, agent, note, customer_name, customer_phone, discount_amount } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: "Panier vide" }, { status: 400 });
    }

    const sb = adminSB();

    // ── Vérification stock ──────────────────────────────────
    const variantIds = items.map((i) => String(i.variant_id));
    const { data: variants, error: varErr } = await sb
      .from("nc_variants")
      .select("variant_id, inventory_quantity, product_title, price")
      .in("variant_id", variantIds);

    if (varErr) {
      return NextResponse.json({ ok: false, error: "Erreur lecture stock" }, { status: 500 });
    }

    const stockMap = Object.fromEntries(
      (variants || []).map((v) => [String(v.variant_id), v])
    );

    for (const item of items) {
      const stock = stockMap[String(item.variant_id)];
      if (!stock) {
        return NextResponse.json(
          { ok: false, error: `Article introuvable : ${item.title || item.variant_id}` },
          { status: 400 }
        );
      }
      // POS : vente forcée autorisée même si stock <= 0 (stock peut devenir négatif)
    }

    // ── Numéro de commande POS (compteur atomique — évite les doublons) ──
    const today = new Date().toISOString().slice(0, 10);
    const { data: seqData, error: seqErr } = await sb.rpc("get_next_pos_seq", { p_day: today });
    if (seqErr) {
      console.error("[pos/order] Counter error:", seqErr.message);
      return NextResponse.json({ ok: false, error: "Erreur compteur commande" }, { status: 500 });
    }
    const order_name = buildPosOrderName(seqData);

    // ── Calcul total ────────────────────────────────────────
    const subtotal       = items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.qty || 1), 0);
    const posDiscount    = Math.min(subtotal, Math.max(0, Number(discount_amount) || 0));
    const total          = Math.max(0, subtotal - posDiscount);

    // ── INSERT nc_orders ────────────────────────────────────
    const orderPayload = {
      order_id:            randomUUID(),
      order_name,
      order_date:          new Date().toISOString(),
      order_source:        "pos",
      confirmation_status: "confirmé",
      decision_status:     "confirmé",
      full_name:           customer_name || agent || "Vente comptoir",
      customer_name:       customer_name || agent || "Vente comptoir",
      phone:               customer_phone || null,
      customer_phone:      customer_phone || null,
      total_price:         total,
      order_total:         total,
      pos_discount:        posDiscount || null,
      items_json:          items,
      order_items_summary: items.map((i) => `${i.qty} x ${i.title || i.variant_id} — ${Number(i.price || 0)} DA`).join(" | ")
        + (posDiscount > 0 ? ` | REMISE: −${posDiscount} DA | ENCAISSÉ: ${total} DA` : ""),
      sold_by:             agent || session.nom || null,
      prepared_by:         agent || session.nom || null,
      note:                note || null,
      stock_deducted:      false,
    };

    const { data: newOrder, error: insertErr } = await sb
      .from("nc_orders")
      .insert(orderPayload)
      .select("order_id, order_name")
      .single();

    if (insertErr) {
      console.error("[pos/order] Insert error:", insertErr.message);
      return NextResponse.json({ ok: false, error: "Erreur création commande" }, { status: 500 });
    }

    // ── Déduction stock + audit trail ───────────────────────
    const stockResults = await Promise.allSettled(
      items.map(async (item) => {
        const { data: movement, error: rpcErr } = await sb.rpc("decrement_stock_force", {
          p_variant_id: String(item.variant_id),
          p_qty:        Number(item.qty),
        });

        if (rpcErr) {
          console.error(`[pos/order] decrement_stock error ${item.variant_id}:`, rpcErr.message);
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
          order_id:      newOrder.order_id,
          source:        "pos",
          agent:         agent || session.nom || null,
          note:          `Vente POS ${order_name}`,
        });
      })
    );

    const allOk = stockResults.every((r) => r.status === "fulfilled");
    await sb
      .from("nc_orders")
      .update({ stock_deducted: allOk })
      .eq("order_id", newOrder.order_id);

    // ── Log nc_events ───────────────────────────────────────
    await sb.from("nc_events").insert({
      ts:       new Date().toISOString(),
      log_type: "POS_ORDER_PLACED",
      source:   "pos",
      actor:    agent || session.nom || null,
      order_id: newOrder.order_id,
      montant:  total,
      note:     `Vente POS ${order_name} — ${total} DA${posDiscount > 0 ? ` (remise: −${posDiscount} DA, sous-total: ${subtotal} DA)` : ""} — ${items.length} article(s) — ${agent || session.nom}`,
      extra: {
        order_name,
        subtotal,
        discount:   posDiscount,
        total,
        item_count: items.length,
        agent:      agent || session.nom,
        stock_deducted: allOk,
      },
    }).throwOnError();

    // ── Auto-print thermique (synchrone — même requête serveur) ─
    let printedAt = null;
    try {
      await printPosOrder({
        order_id:            newOrder.order_id,
        order_name:          order_name,
        order_date:          orderPayload.order_date,
        order_source:        "pos",
        subtotal:            subtotal,
        pos_discount:        posDiscount,
        order_total:         total,
        order_items_summary: orderPayload.order_items_summary,
        items_json:          items,
      });
      printedAt = new Date().toISOString();
      await sb.from("nc_orders").update({ printed_at: printedAt }).eq("order_id", newOrder.order_id);
    } catch (printErr) {
      console.error("[pos/order] Auto-print failed:", printErr.message);
    }

    return NextResponse.json({
      ok:         true,
      order_id:   newOrder.order_id,
      order_name: newOrder.order_name,
      subtotal,
      discount:   posDiscount,
      total,
      printed:    !!printedAt,
    });

  } catch (err) {
    console.error("[pos/order] Unexpected error:", err.message);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
