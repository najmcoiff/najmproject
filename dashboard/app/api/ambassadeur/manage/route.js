import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ownerGuard as jwtOwnerGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

function adminSB() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
function ownerGuard(req) {
  if (jwtOwnerGuard(req)) return true;
  const raw = req.headers.get("x-owner-token") || new URL(req.url).searchParams.get("token");
  return raw === process.env.DASHBOARD_SECRET;
}

/**
 * GET  /api/ambassadeur/manage  → liste en attente + actifs
 * POST /api/ambassadeur/manage  { phone, active }  → active/désactive
 * (Écran owner — voit tout, y compris le numéro complet pour contacter le coiffeur.)
 */
export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const sb = adminSB();
  const { data } = await sb
    .from("nc_ambassadeurs")
    .select("code, phone, full_name, salon, actif, cagnotte_da, total_filleuls, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = data || [];
  return NextResponse.json({
    pending: rows.filter((r) => !r.actif),
    active:  rows.filter((r) => r.actif),
  });
}

export async function POST(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone || "").replace(/\D/g, "").slice(-9);
  if (phone.length < 9) return NextResponse.json({ error: "phone requis" }, { status: 400 });

  const sb = adminSB();
  const { error } = await sb
    .from("nc_ambassadeurs")
    .update({ actif: !!body.active, updated_at: new Date().toISOString() })
    .eq("phone", phone);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
