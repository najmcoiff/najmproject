// ═══════════════════════════════════════════════════════════════════
//  POST /api/orders/for-modify — DÉSACTIVÉ (Phase M4 — T206)
//
//  Cette route récupérait les line items depuis Shopify GraphQL.
//  Remplacée par NativeEditModal qui lit items_json depuis nc_orders (T202).
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Route supprimée — utiliser items_json depuis nc_orders (T202)" },
    { status: 410 }
  );
}
