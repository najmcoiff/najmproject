// POST /api/variants/mark-achete
// Marque une variante comme commandée (achete=TRUE) dans nc_kpi_stock
// Migration depuis GAS MARK_ACHETE → 0 Google Sheets
// Body: { token, variant_id, achete: bool }

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

    const variantId = String(body.variant_id || "").trim();
    const achete    = body.achete !== false;

    if (!variantId) return NextResponse.json({ ok: false, error: "variant_id requis" });

    const sb = adminSB();

    // Patch nc_variants — source de vérité pour la vue nc_kpi_stock_view
    const { error } = await sb
      .from("nc_variants")
      .update({ achetee: achete })
      .eq("variant_id", variantId);

    if (error) throw new Error(error.message);

    // Log nc_events
    try {
      await sb.from("nc_events").insert({
        ts: new Date().toISOString(), log_type: "MARK_ACHETE", source: "VERCEL",
        variant_id: variantId, actor: session.nom,
        note: `achete=${achete}`,
      });
    } catch { /* fire-and-forget */ }

    return NextResponse.json({ ok: true, variant_id: variantId, achete });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
