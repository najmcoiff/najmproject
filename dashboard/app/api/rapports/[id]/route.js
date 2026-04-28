/**
 * DELETE /api/rapports/[id]
 * Supprime définitivement un rapport de nc_rapports.
 * Réservé au owner uniquement (role = 'owner').
 * Log dans nc_events après suppression.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";
import { verifyToken }   from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ ok: false, error: "report_id requis" }, { status: 400 });
    }

    // Vérification token + rôle owner
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim()
      || (await request.json().catch(() => ({}))).token;

    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
    }
    if ((session.role || "").toLowerCase() !== "owner") {
      return NextResponse.json({ ok: false, error: "Accès refusé — réservé au owner" }, { status: 403 });
    }

    const sb = adminSB();

    // Vérifier que le rapport existe
    const { data: existing, error: fetchErr } = await sb
      .from("nc_rapports")
      .select("report_id, categorie, cas, agent")
      .eq("report_id", id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ ok: false, error: "Rapport introuvable" }, { status: 404 });
    }

    // Supprimer le rapport
    const { error: deleteErr } = await sb
      .from("nc_rapports")
      .delete()
      .eq("report_id", id);

    if (deleteErr) {
      console.error("[rapports/delete] Delete error:", deleteErr.message);
      return NextResponse.json({ ok: false, error: "Erreur suppression" }, { status: 500 });
    }

    // Log nc_events
    const { error: logErr } = await sb.from("nc_events").insert({
      ts:       new Date().toISOString(),
      log_type: "RAPPORT_DELETED",
      source:   "dashboard",
      actor:    session.nom,
      note:     `Rapport supprimé par ${session.nom} — ${existing.categorie} · ${existing.cas} (agent: ${existing.agent})`,
      extra: {
        report_id:  id,
        categorie:  existing.categorie,
        cas:        existing.cas,
        agent:      existing.agent,
        deleted_by: session.nom,
      },
    });
    if (logErr) console.warn("[rapports/delete] Log failed:", logErr.message);

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[rapports/delete] Unexpected error:", err.message);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
