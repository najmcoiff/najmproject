// ═══════════════════════════════════════════════════════════════════
//  POST /api/cloture — V2 (sans order_id, sans Shopify)
//
//  Logique :
//    1. Charge toutes les commandes NON archivées (archived=false)
//    2. Archive les commandes avec tracking (envoyées au livreur)
//    3. Archive + restock les commandes annulées (decision_status='annuler', non-POS)
//
//  La page confirmation n'affiche que archived=false
//  (seules les commandes non traitées sont visibles : à appeler, injoignable, rappel)
//
//  Body : { token }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request) {
  const t0 = Date.now();
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const supabase = adminSB();

    // ── 1. Charger toutes les commandes actives (non archivées) ─────
    const { data: allOrders, error: loadErr } = await supabase
      .from("nc_orders")
      .select("order_id, tracking, decision_status, order_source, items_json")
      .or("archived.is.null,archived.eq.false");

    if (loadErr) throw new Error("Chargement nc_orders: " + loadErr.message);
    const orders = allOrders || [];

    // ── 2. Catégoriser ──────────────────────────────────────────────
    const toArchiveWithTracking = [];  // ont un tracking → archiver
    const toAnnule              = [];  // annulées non-POS → restock + archiver

    for (const o of orders) {
      const src      = (o.order_source || "").toLowerCase();
      const isPos    = src === "pos";
      const ds       = (o.decision_status || "").toLowerCase();
      const hasTrack = (o.tracking || "").trim() !== "";
      const isAnnule = ds === "annuler";

      if (isAnnule && !isPos) {
        toAnnule.push(o);
      } else if (hasTrack && !isAnnule) {
        toArchiveWithTracking.push(o);
      }
    }

    // ── 3. Archiver les commandes avec tracking ──────────────────────
    let archivedWithTrackingCount = 0;
    if (toArchiveWithTracking.length > 0) {
      const ids = toArchiveWithTracking.map(o => o.order_id);
      const { data: ua } = await supabase
        .from("nc_orders")
        .update({ archived: true })
        .in("order_id", ids)
        .select("order_id");
      archivedWithTrackingCount = ua?.length || 0;
    }

    // ── 4. Restock + archiver les commandes annulées ─────────────────
    let cancelledCount = 0;
    let restockedItems = 0;
    const cancelErrors = [];

    for (const o of toAnnule) {
      try {
        const items = Array.isArray(o.items_json) ? o.items_json : [];
        let orderRestocked = 0;

        for (const item of items) {
          const variantId = item.variant_id;
          const qty       = Number(item.qty || item.quantity || 1);
          if (!variantId || qty <= 0) continue;

          const { error: rpcErr } = await supabase.rpc("increment_stock", {
            p_variant_id: String(variantId),
            p_qty:        qty,
          });
          if (rpcErr) {
            console.warn(`CLOTURE increment_stock_fail order=${o.order_id} variant=${variantId}`, rpcErr.message);
          } else {
            orderRestocked++;
            restockedItems++;
          }
        }

        // Archiver + marquer restocked
        await supabase
          .from("nc_orders")
          .update({ archived: true, restocked: true })
          .eq("order_id", o.order_id);

        // Log individuel
        try {
          await supabase.from("nc_events").insert({
            ts:       new Date().toISOString(),
            log_type: "ORDER_CANCELLED",
            source:   "VERCEL",
            order_id: o.order_id,
            actor:    session.nom,
            note:     `Annulation clôture — ${orderRestocked} article(s) restitué(s)`,
            extra:    JSON.stringify({
              order_id:        o.order_id,
              restocked_items: orderRestocked,
              via:             "CLOTURE_JOURNEE",
            }),
          });
        } catch { /* fire-and-forget */ }

        cancelledCount++;
      } catch (e) {
        cancelErrors.push({ order_id: o.order_id, error: e.message });
        console.warn(`CLOTURE cancel_fail order=${o.order_id}`, e.message);
      }
    }

    const totalArchived = archivedWithTrackingCount + cancelledCount;

    // ── 5. Log global CLOTURE_JOURNEE ───────────────────────────────
    try {
      await supabase.from("nc_events").insert({
        ts:       new Date().toISOString(),
        log_type: "CLOTURE_JOURNEE",
        source:   "VERCEL",
        actor:    session.nom,
        note:     `Clôture — ${totalArchived} archivées (${archivedWithTrackingCount} avec tracking, ${cancelledCount} annulées, ${restockedItems} articles restitués)`,
        extra:    JSON.stringify({
          archived_with_tracking: archivedWithTrackingCount,
          cancelled_count:        cancelledCount,
          restocked_items:        restockedItems,
          cancel_errors:          cancelErrors.length,
          total_archived:         totalArchived,
        }),
      });
    } catch { /* fire-and-forget */ }

    const duration = Date.now() - t0;
    console.log(`CLOTURE archived_tracking=${archivedWithTrackingCount} cancelled=${cancelledCount} restocked=${restockedItems} ${duration}ms`);

    return NextResponse.json({
      ok:                      true,
      archived_with_tracking:  archivedWithTrackingCount,
      cancelled_count:         cancelledCount,
      restocked_items:         restockedItems,
      total_archived:          totalArchived,
      cancel_errors:           cancelErrors,
      cancelled_shopify:       0,
      duration_ms:             duration,
      message: `Clôture effectuée — ${totalArchived} commandes archivées (${archivedWithTrackingCount} expédiées, ${cancelledCount} annulées avec ${restockedItems} article(s) restitué(s))`,
    });

  } catch (err) {
    console.error("CLOTURE_EXCEPTION", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
