// ═══════════════════════════════════════════════════════════════════
//  POST /api/orders/test — DÉSACTIVÉ (Phase M4 — T206)
//
//  Créait une commande test sur Shopify. Plus utilisé depuis Phase M4.
//  Pour tester, insérer directement dans nc_orders via Supabase.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Route supprimée — Shopify hors service (Phase M4)" },
    { status: 410 }
  );
}
