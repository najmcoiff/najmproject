// ═══════════════════════════════════════════════════════════════════
//  POST /api/suivi-zr/refresh — T210b (fix critical)
//
//  Stratégie : POST /parcels/search avec pagination (ZR API)
//  ZR ne supporte PAS GET /parcels/{tracking} ni le filtrage par trackingNumber.
//  On pagine les colis ZR et on matche par trackingNumber contre nos colis actifs.
//
//  Flow :
//    1. Charger tous les tracking actifs depuis nc_suivi_zr (final_status IS NULL)
//    2. Paginer POST /parcels/search (pageSize=200) jusqu'à avoir trouvé tous nos trackings
//       OU avoir dépassé MAX_PAGES
//    3. Pour chaque match : update nc_suivi_zr + nc_orders.shipping_status
//
//  Body: { token }
//  Réponse: { ok, updated, skipped, pages_fetched, total_zr, duration_ms }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse }   from "next/server";
import { verifyToken }    from "@/lib/server-auth";
import { zrHeaders, ZR_BASE } from "@/lib/zr-express";
import { mapZRState } from "@/lib/zr-states";

export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}


// ── Paginer POST /parcels/search pour chercher nos trackings ─────
async function fetchZRPage(pageNumber, pageSize = 200) {
  const res = await fetch(`${ZR_BASE}/parcels/search`, {
    method:  "POST",
    headers: zrHeaders(),
    body:    JSON.stringify({ pageNumber, pageSize }),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function POST(request) {
  const t0 = Date.now();
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const supabase = adminSB();

    // ── 1. Charger les colis actifs depuis nc_suivi_zr ───────────
    const { data: colis } = await supabase
      .from("nc_suivi_zr")
      .select("tracking, parcel_id, order_id, statut_livraison")
      .is("final_status", null)
      .not("tracking", "is", null)
      .limit(500);

    if (!colis?.length) {
      return NextResponse.json({ ok: true, updated: 0, skipped: 0, pages_fetched: 0, total_zr: 0, duration_ms: Date.now() - t0, message: "Aucun colis actif" });
    }

    // Construire un Map tracking → colis pour les lookups O(1)
    const trackingMap = new Map();
    for (const c of colis) {
      if (c.tracking) trackingMap.set(c.tracking.trim().toUpperCase(), c);
    }

    const MAX_PAGES = 25;
    const PAGE_SIZE = 200;
    let updated     = 0;
    let pagesFetched = 0;
    let totalZR     = 0;
    let found       = 0;
    const now       = new Date().toISOString();

    // Aussi stocker les résultats pour batch update
    const updates = [];

    // ── 2. Paginer les colis ZR ─────────────────────────────────
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (found >= trackingMap.size) break;

      const data = await fetchZRPage(page, PAGE_SIZE);
      if (!data?.items?.length) break;

      pagesFetched++;
      totalZR = data.totalCount || 0;

      for (const parcel of data.items) {
        const zrTracking = String(parcel.trackingNumber || "").trim().toUpperCase();
        if (!zrTracking) continue;

        const colisItem = trackingMap.get(zrTracking);
        if (!colisItem) continue;

        found++;
        const { label, shipping, final: finalStatus } = mapZRState(parcel.state);
        const parcelId = parcel.id || null;
        const attempts = Number(parcel.failedDeliveriesCount || 0);

        updates.push({
          tracking:    colisItem.tracking,
          order_id:    colisItem.order_id,
          label, shipping, finalStatus, parcelId, attempts,
        });
      }

      if (!data.hasNext) break;
    }

    // ── 3. Appliquer les mises à jour en batch ───────────────────
    for (const u of updates) {
      const suiviFields = {
        statut_livraison: u.label,
        updated_at:       now,
        attempts_count:   u.attempts,
        ...(u.parcelId ? { parcel_id: u.parcelId } : {}),
        ...(u.finalStatus === "livré"    ? { final_status: "livré",    date_livraison: now } : {}),
        ...(u.finalStatus === "retourné" ? { final_status: "retourné" }                     : {}),
        ...(u.finalStatus === "annulé"   ? { final_status: "annulé" }                       : {}),
      };

      await supabase.from("nc_suivi_zr").update(suiviFields).eq("tracking", u.tracking);

      if (u.shipping && u.order_id) {
        await supabase.from("nc_orders")
          .update({ shipping_status: u.shipping })
          .eq("order_id", u.order_id);
      }
      updated++;
    }

    const duration = Date.now() - t0;
    const skipped  = colis.length - found;

    console.log(`SUIVI_ZR_REFRESH total_local=${colis.length} found=${found} updated=${updated} pages=${pagesFetched} total_zr=${totalZR} ${duration}ms`);

    return NextResponse.json({
      ok:           true,
      total_local:  colis.length,
      updated,
      skipped,
      pages_fetched: pagesFetched,
      total_zr:     totalZR,
      duration_ms:  duration,
      message:      `${updated} colis mis à jour sur ${colis.length} actifs (${pagesFetched} pages ZR consultées)`,
    });

  } catch (err) {
    console.error("SUIVI_ZR_REFRESH_ERROR", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
