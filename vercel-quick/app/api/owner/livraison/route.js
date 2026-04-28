import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function ownerGuard(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "").trim() || req.nextUrl?.searchParams.get("token");
  const user = verifyToken(token);
  if (!user || (user.nom?.toLowerCase() !== "najm" && user.role?.toLowerCase() !== "owner")) return null;
  return user;
}

/** GET /api/owner/livraison?wilaya_code=XX */
export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const wilaya = req.nextUrl.searchParams.get("wilaya_code");
  let query = sb().from("nc_delivery_config").select("*").order("wilaya_code").order("commune_name");
  if (wilaya) query = query.eq("wilaya_code", Number(wilaya));
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}

/** POST /api/owner/livraison — update (si id fourni) ou upsert une ligne */
export async function POST(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const body = await req.json();
  const { id, wilaya_code, wilaya_name, commune_name = "", price_home, price_office, is_active = true } = body;
  if (!wilaya_code || !wilaya_name) return NextResponse.json({ error: "Champs manquants" }, { status: 400 });

  const payload = {
    price_home:   Number(price_home  ?? 400),
    price_office: Number(price_office ?? 300),
    is_active,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (id) {
    // Ligne existante — UPDATE direct par id (évite la contrainte unique)
    ({ error } = await sb().from("nc_delivery_config").update(payload).eq("id", id));
  } else {
    // Nouvelle ligne — UPSERT avec résolution sur (wilaya_code, commune_name)
    ({ error } = await sb().from("nc_delivery_config").upsert(
      { ...payload, wilaya_code: Number(wilaya_code), wilaya_name, commune_name },
      { onConflict: "wilaya_code,commune_name" }
    ));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/owner/livraison — désactive une zone */
export async function DELETE(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID manquant" }, { status: 400 });
  const { error } = await sb().from("nc_delivery_config").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
