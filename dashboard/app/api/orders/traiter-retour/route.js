// ═══════════════════════════════════════════════════════════════════
//  POST /api/orders/traiter-retour
//
//  Traite un lot de retours colis ZR Express :
//    1. Pour chaque order_id : restitue le stock (increment_stock)
//    2. Met à jour shipping_status = 'retour récupéré'
//    3. NE TOUCHE PAS decision_status
//    4. Log dans nc_events
//
//  Body : { token, order_ids: string[] }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request) {
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const { order_ids } = body;
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json({ ok: false, error: "order_ids[] requis et non vide" }, { status: 400 });
    }

    const supabase = adminSB();

    // ── Charger les commandes ────────────────────────────────────────
    const { data: orders, error: loadErr } = await supabase
      .from("nc_orders")
      .select("order_id, customer_name, tracking, items_json, shipping_status")
      .in("order_id", order_ids);

    if (loadErr) throw new Error("Chargement nc_orders: " + loadErr.message);

    const results  = [];
    let totalItems = 0;

    for (const order of orders || []) {
      const items = Array.isArray(order.items_json) ? order.items_json : [];
      let restocked = 0;

      // Restock chaque article
      for (const item of items) {
        const variantId = item.variant_id;
        const qty       = Number(item.qty || item.quantity || 1);
        if (!variantId || qty <= 0) continue;

        const { error: rpcErr } = await supabase.rpc("increment_stock", {
          p_variant_id: String(variantId),
          p_qty:        qty,
        });

        if (rpcErr) {
          console.warn(`RETOUR increment_stock_fail order=${order.order_id} variant=${variantId}`, rpcErr.message);
        } else {
          restocked++;
          totalItems++;
        }
      }

      // Mettre à jour shipping_status uniquement (NE PAS toucher decision_status)
      await supabase
        .from("nc_orders")
        .update({ shipping_status: "retour récupéré" })
        .eq("order_id", order.order_id);

      // Log nc_events
      try {
        await supabase.from("nc_events").insert({
          ts:       new Date().toISOString(),
          log_type: "RETOUR_RECUPERE",
          source:   "VERCEL",
          order_id: order.order_id,
          actor:    session.nom,
          note:     `Retour récupéré — ${restocked} article(s) restitué(s) au stock`,
          extra:    JSON.stringify({
            order_id:        order.order_id,
            tracking:        order.tracking,
            customer_name:   order.customer_name,
            restocked_items: restocked,
          }),
        });
      } catch { /* fire-and-forget */ }

      results.push({
        order_id:        order.order_id,
        tracking:        order.tracking,
        customer_name:   order.customer_name,
        restocked_items: restocked,
      });
    }

    return NextResponse.json({
      ok:           true,
      processed:    results.length,
      total_items:  totalItems,
      results,
      message:      `${results.length} retour(s) traité(s) — ${totalItems} article(s) restitué(s) au stock`,
    });

  } catch (err) {
    console.error("TRAITER_RETOUR_EXCEPTION", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
