// GET  /api/partenaires        → liste tous les codes partenaires
// POST /api/partenaires        → ajoute un code partenaire
// Migration depuis GAS ADD_CODE_PARTENAIRE → nc_partenaires
//
// Table Supabase à créer (exécuter dans l'éditeur SQL Supabase) :
// CREATE TABLE IF NOT EXISTS nc_partenaires (
//   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   code        text NOT NULL UNIQUE,
//   nom         text,
//   percentage  numeric DEFAULT 50,
//   active      boolean DEFAULT true,
//   created_at  timestamptz DEFAULT now(),
//   created_by  text
// );

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

function getToken(request) {
  return request.headers.get("Authorization")?.replace("Bearer ", "") || "";
}

export async function GET(request) {
  try {
    const token   = getToken(request);
    const session = verifyToken(token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const { data, error } = await adminSB()
      .from("nc_partenaires")
      .select("id,code,nom,percentage,active,created_at,created_by")
      .eq("active", true)
      .order("code");

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, rows: data || [], count: (data || []).length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body    = await request.json().catch(() => ({}));
    const token   = body.token || getToken(request);
    const session = verifyToken(token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const code       = String(body.code || "").trim().toUpperCase();
    const nom        = String(body.nom  || "").trim();
    const percentage = Number(body.percentage ?? 50);

    if (!code) return NextResponse.json({ ok: false, error: "Code requis" });
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      return NextResponse.json({ ok: false, error: "Pourcentage invalide (0–100)" });
    }

    const sb = adminSB();

    // Vérifier doublon
    const { data: existing } = await sb
      .from("nc_partenaires")
      .select("id")
      .eq("code", code)
      .limit(1);

    if (existing?.length > 0) {
      return NextResponse.json({ ok: false, error: `Code "${code}" existe déjà` });
    }

    const { data, error } = await sb
      .from("nc_partenaires")
      .insert({ code, nom, percentage, created_by: session.nom })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, code, nom, percentage, id: data?.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
