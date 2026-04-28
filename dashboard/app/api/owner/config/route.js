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
  if (!user || user.nom?.toLowerCase() !== "najm" && user.role?.toLowerCase() !== "owner") {
    return null;
  }
  return user;
}

/** GET /api/owner/config — retourne tous les paramètres */
export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { data, error } = await sb().from("nc_boutique_config").select("*").order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

/** POST /api/owner/config — met à jour une clé */
export async function POST(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { key, value } = await req.json();
  if (!key) return NextResponse.json({ error: "Clé manquante" }, { status: 400 });
  const { error } = await sb()
    .from("nc_boutique_config")
    .upsert({ key, value: String(value ?? ""), updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
