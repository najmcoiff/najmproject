// ═══════════════════════════════════════════════════════════════════
//  POST /api/suivi-zr/zr-debug — Diagnostic ZR Express API (T210)
//  Teste tous les endpoints ZR possibles avec un tracking connu
//  Body: { token, tracking? }
//  À SUPPRIMER après debug
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { verifyToken }  from "@/lib/server-auth";
import { zrHeaders, ZR_BASE } from "@/lib/zr-express";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

export async function POST(request) {
  const body    = await request.json().catch(() => ({}));
  const session = verifyToken(body.token);
  if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Récupérer un tracking connu depuis nc_suivi_zr
  let tracking = body.tracking;
  let parcelId = body.parcel_id;
  if (!tracking) {
    const { data } = await sb.from("nc_suivi_zr")
      .select("tracking, parcel_id")
      .is("final_status", null)
      .not("tracking", "is", null)
      .limit(1);
    tracking = data?.[0]?.tracking;
    parcelId  = data?.[0]?.parcel_id;
  }

  const results = {};

  // ── Test 1: GET /parcels/{parcel_id} ─────────────────────────────
  if (parcelId) {
    const r1 = await fetch(`${ZR_BASE}/parcels/${parcelId}`, { headers: zrHeaders() });
    results["GET /parcels/{parcel_id}"] = {
      status: r1.status,
      body:   await r1.json().catch(() => null),
    };
  } else {
    results["GET /parcels/{parcel_id}"] = "SKIP: parcel_id NULL";
  }

  // ── Test 2: GET /parcels/tracking/{tracking} ──────────────────────
  if (tracking) {
    const r2 = await fetch(`${ZR_BASE}/parcels/tracking/${encodeURIComponent(tracking)}`, { headers: zrHeaders() });
    results["GET /parcels/tracking/{tracking}"] = {
      status: r2.status,
      body:   await r2.json().catch(() => null),
    };

    // ── Test 3: GET /parcels?trackingNumber={tracking} ──────────────
    const r3 = await fetch(`${ZR_BASE}/parcels?trackingNumber=${encodeURIComponent(tracking)}`, { headers: zrHeaders() });
    results["GET /parcels?trackingNumber={tracking}"] = {
      status: r3.status,
      body:   await r3.json().catch(() => null),
    };

    // ── Test 4: POST /parcels/search ──────────────────────────────
    const r4 = await fetch(`${ZR_BASE}/parcels/search`, {
      method: "POST",
      headers: zrHeaders(),
      body: JSON.stringify({ trackingNumber: tracking, pageSize: 5 }),
    });
    results["POST /parcels/search"] = {
      status: r4.status,
      body:   await r4.json().catch(() => null),
    };

    // ── Test 5: GET /parcels (liste paginée) ──────────────────────
    const r5 = await fetch(`${ZR_BASE}/parcels?pageNumber=1&pageSize=5`, { headers: zrHeaders() });
    results["GET /parcels?page"] = {
      status: r5.status,
      body:   await r5.json().catch(() => null),
    };
  }

  // ── Test 6: Webhooks enregistrés ──────────────────────────────
  const r6 = await fetch(`${ZR_BASE}/webhooks/endpoints`, { headers: zrHeaders() });
  results["GET /webhooks/endpoints"] = {
    status: r6.status,
    body:   await r6.json().catch(() => null),
  };

  // ── Test 7 : Recherche territoire ────────────────────────────────
  if (body.search_territory) {
    const keyword = body.search_territory;
    const r7 = await fetch(`${ZR_BASE}/territories/search`, {
      method: "POST",
      headers: zrHeaders(),
      body: JSON.stringify({ keyword, pageSize: 10, pageNumber: 1 }),
    });
    results[`POST /territories/search (${keyword})`] = {
      status: r7.status,
      body:   await r7.json().catch(() => null),
    };
  }

  // ── Test 8 : Hubs search avec différents formats ─────────────────
  const hubSearchVariants = [
    { name: "Alger", pageSize: 5, pageNumber: 1 },
    { keyword: "Alger", pageSize: 5, pageNumber: 1 },
    { pageSize: 20, pageNumber: 1 },
    { name: "", pageSize: 20, pageNumber: 1 },
    { search: "Alger", pageSize: 5, pageNumber: 1 },
  ];
  for (const variant of hubSearchVariants) {
    const rh = await fetch(`${ZR_BASE}/hubs/search`, {
      method: "POST", headers: zrHeaders(),
      body: JSON.stringify(variant),
    });
    const rhBody = await rh.json().catch(() => null);
    results[`POST /hubs/search (${JSON.stringify(variant)})`] = {
      status: rh.status,
      totalCount: rhBody?.totalCount,
      items: rhBody?.items?.slice(0, 3),
    };
    if (rhBody?.totalCount > 0) break; // on a trouvé, inutile de continuer
  }

  return NextResponse.json({ ok: true, tracking, parcelId, results });
}
