// GET/POST /api/fournisseur/list — Gestion des fournisseurs (owner only)

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET — liste tous les fournisseurs
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const session = verifyToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

  const sb = adminSB();
  const { data, error } = await sb
    .from("nc_fournisseurs")
    .select("id, nom, phone, email, token_secret, active, note, created_at")
    .order("nom");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Masquer le token pour les non-owners
  const isOwner = (session.role || "").toLowerCase() === "owner";
  const rows = isOwner ? data : (data || []).map(f => ({ ...f, token_secret: undefined }));

  return NextResponse.json({ ok: true, rows });
}

// POST — créer un fournisseur (owner only)
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const session = verifyToken(body.token);
  if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
  if ((session.role || "").toLowerCase() !== "owner") {
    return NextResponse.json({ ok: false, error: "Accès owner requis" }, { status: 403 });
  }

  const { nom, phone, email, note } = body;
  if (!nom?.trim()) return NextResponse.json({ ok: false, error: "Nom requis" }, { status: 400 });

  const sb = adminSB();
  const { data, error } = await sb
    .from("nc_fournisseurs")
    .insert({ nom: nom.trim(), phone: phone || null, email: email || null, note: note || null })
    .select("id, nom, token_secret")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, fournisseur: data });
}

// PATCH — activer/désactiver un fournisseur (owner only)
export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const session = verifyToken(body.token);
  if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
  if ((session.role || "").toLowerCase() !== "owner") {
    return NextResponse.json({ ok: false, error: "Accès owner requis" }, { status: 403 });
  }

  const { id, active, nom, phone, email, note } = body;
  if (!id) return NextResponse.json({ ok: false, error: "id requis" }, { status: 400 });

  const sb = adminSB();
  const updates = {};
  if (active !== undefined) updates.active = active;
  if (nom)   updates.nom   = nom.trim();
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (note  !== undefined) updates.note  = note;

  const { error } = await sb.from("nc_fournisseurs").update(updates).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
