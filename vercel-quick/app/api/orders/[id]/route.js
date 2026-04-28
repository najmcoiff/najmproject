/**
 * DELETE /api/orders/[id]
 * Suppression définitive d'une commande — owner uniquement.
 *
 * Body : { token: string, restock: boolean }
 *   - restock=true  → restituer le stock via increment_stock pour chaque article
 *   - restock=false → supprimer sans toucher au stock
 *
 * Fonctionne pour toutes les commandes (nc_boutique, pos, Shopify).
 * Hard DELETE de nc_orders + log nc_events.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";
import { verifyToken }   from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function DELETE(request, { params }) {
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);

    if (!session) {
      return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
    }
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Accès refusé — owner uniquement" }, { status: 403 });
    }

    const orderId = (await params).id;
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "order_id manquant" }, { status: 400 });
    }

    const restock = body.restock === true;
    const supabase = adminSB();

    // ── 1. Charger la commande ──────────────────────────────────────
    const { data: orders, error: fetchErr } = await supabase
      .from("nc_orders")
      .select("order_id, order_source, items_json, order_total, customer_name, shopify_order_name")
      .eq("order_id", orderId)
      .limit(1);

    if (fetchErr) throw new Error("Chargement commande: " + fetchErr.message);
    const order = orders?.[0];
    if (!order) {
      return NextResponse.json({ ok: false, error: `Commande ${orderId} introuvable` }, { status: 404 });
    }

    let restockDetails = [];

    // ── 2. Restock optionnel ────────────────────────────────────────
    if (restock) {
      const items = Array.isArray(order.items_json) ? order.items_json : [];
      for (const item of items) {
        const variantId = item.variant_id;
        const qty       = Number(item.qty || item.quantity || 1);
        if (!variantId || qty <= 0) continue;

        const { error: rpcErr } = await supabase.rpc("increment_stock", {
          p_variant_id: variantId,
          p_qty:        qty,
        });

        if (rpcErr) {
          console.warn(`DELETE_ORDER restock_fail variant=${variantId} qty=${qty}`, rpcErr.message);
        } else {
          restockDetails.push({ variant_id: variantId, qty });
        }
      }
    }

    // ── 3. Hard DELETE nc_orders ────────────────────────────────────
    const { error: deleteErr } = await supabase
      .from("nc_orders")
      .delete()
      .eq("order_id", orderId);

    if (deleteErr) throw new Error("Suppression nc_orders: " + deleteErr.message);

    // ── 4. Log nc_events ────────────────────────────────────────────
    try {
      await supabase.from("nc_events").insert({
        ts:        new Date().toISOString(),
        log_type:  "DELETE_ORDER",
        source:    "VERCEL",
        order_id:  orderId,
        action:    "DELETE_ORDER",
        new_value: JSON.stringify({
          order_id:       orderId,
          order_source:   order.order_source,
          shopify_name:   order.shopify_order_name,
          customer_name:  order.customer_name,
          order_total:    order.order_total,
          restock,
          restocked_items: restockDetails,
          deleted_by:     session.nom,
        }),
        status: "success",
      });
    } catch { /* fire-and-forget */ }

    return NextResponse.json({
      ok:              true,
      order_id:        orderId,
      restock,
      restocked_items: restockDetails.length,
      message:         `Commande ${orderId} supprimée définitivement${restock ? ` — ${restockDetails.length} article(s) restitué(s) au stock` : " — sans restock"}`,
    });

  } catch (err) {
    console.error("DELETE_ORDER_EXCEPTION", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
