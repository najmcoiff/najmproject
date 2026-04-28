// ═══════════════════════════════════════════════════════════════════
//  POST /api/orders/pos-sync — DÉSACTIVÉ (Phase M4 — T206)
//
//  Synchronisait les commandes POS depuis Shopify. Obsolète depuis T97
//  (POS est maintenant entièrement natif Supabase via /api/pos/order).
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Route supprimée — POS natif Supabase (T97)" },
    { status: 410 }
  );
}
