import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ownerGuard as jwtOwnerGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

function adminSB() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
function ownerGuard(req) {
  if (jwtOwnerGuard(req)) return true;
  const raw = req.headers.get("x-owner-token") || new URL(req.url).searchParams.get("token");
  return raw === process.env.DASHBOARD_SECRET;
}

/**
 * GET    → tous les avis (pending + approved)
 * POST   { action:'approve'|'reject', id } OU { action:'create', body, author_name, author_city }
 * DELETE ?id=...
 */
export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const sb = adminSB();
  const { data } = await sb
    .from("nc_ambassadeur_avis")
    .select("id, author_name, author_city, body, statut, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = data || [];
  return NextResponse.json({
    pending: rows.filter((r) => r.statut === "pending"),
    approved: rows.filter((r) => r.statut === "approved"),
  });
}

export async function POST(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const sb = adminSB();

  if (b.action === "approve" || b.action === "reject") {
    if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await sb.from("nc_ambassadeur_avis")
      .update({ statut: b.action === "approve" ? "approved" : "rejected" })
      .eq("id", b.id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "create") {
    const body = String(b.body || "").trim().slice(0, 500);
    if (!body) return NextResponse.json({ error: "texte requis" }, { status: 400 });
    await sb.from("nc_ambassadeur_avis").insert({
      author_name: String(b.author_name || "حلاق").trim().slice(0, 60),
      author_city: b.author_city ? String(b.author_city).trim().slice(0, 60) : null,
      body,
      statut: "approved",       // créé par l'owner = publié direct
      created_by: "owner",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action inconnue" }, { status: 400 });
}

export async function DELETE(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await adminSB().from("nc_ambassadeur_avis").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
