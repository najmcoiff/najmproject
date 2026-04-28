// POST /api/fond/reset
// Supprime toutes les transactions nc_gestion_fond (remise à zéro du solde)
// Réservé au rôle owner. Log dans nc_events.
// Migration depuis GAS RESET_FOND → 0 Google Sheets
// Body: { token }

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

    if (String(session.role || "").toLowerCase() !== "owner") {
      return NextResponse.json({ ok: false, error: "Reset réservé au owner" }, { status: 403 });
    }

    const sb  = adminSB();
    const now = new Date().toISOString();

    // Compter avant suppression pour le log
    const { count: beforeCount } = await sb
      .from("nc_gestion_fond")
      .select("*", { count: "exact", head: true });

    // Supprimer toutes les transactions (remise à zéro)
    const { error } = await sb
      .from("nc_gestion_fond")
      .delete()
      .not("id_fond", "is", null);

    if (error) throw new Error(error.message);

    // Log dans nc_events
    try {
      await sb.from("nc_events").insert({
        ts: now, log_type: "RESET_FOND", source: "VERCEL",
        actor: session.nom,
        note: `${beforeCount || 0} lignes supprimées — remise à zéro solde`,
      });
    } catch { /* fire-and-forget */ }

    return NextResponse.json({ ok: true, deleted: beforeCount || 0, reset_at: now });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
