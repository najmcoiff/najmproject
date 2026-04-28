/**
 * POST /api/recettes/verify
 * Marque une recette comme vérifiée + crée une ENTRÉE dans nc_gestion_fond.
 * Réservé : owner, chef d'equipe, drh, acheteur.
 *
 * body: { token, recette_id }
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";
import { verifyToken }   from "@/lib/server-auth";
import { randomUUID }    from "crypto";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VERIFY_ROLES = ["owner", "chef d'equipe", "drh", "acheteur", "responsable"];

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function canVerify(role) {
  const r = (role || "").toLowerCase();
  return VERIFY_ROLES.some(vr => r === vr || r.includes(vr));
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    if (!canVerify(session.role)) {
      return NextResponse.json(
        { ok: false, error: "Accès refusé — réservé aux responsables, chef d'équipe, DRH, acheteur" },
        { status: 403 }
      );
    }

    const { recette_id } = body;
    if (!recette_id) return NextResponse.json({ ok: false, error: "recette_id requis" }, { status: 400 });

    const sb = adminSB();

    // Charger la recette
    const { data: recette, error: fetchErr } = await sb
      .from("nc_recettes_v2")
      .select("*")
      .eq("id", recette_id)
      .maybeSingle();

    if (fetchErr || !recette) {
      return NextResponse.json({ ok: false, error: "Recette introuvable" }, { status: 404 });
    }

    if (recette.verified) {
      return NextResponse.json({ ok: false, error: "Recette déjà vérifiée" }, { status: 409 });
    }

    // Créer la transaction dans nc_gestion_fond
    const fond_id   = `REC-${recette.agent.toUpperCase()}-${recette.date_recette}-${Date.now()}`;
    const fondEntry = {
      id_fond:     fond_id,
      timestamp:   new Date().toISOString(),
      source:      "recette_depot",
      agent:       recette.agent,
      categorie:   "déposer une recette",
      type:        "ENTRÉE",
      montant:     Number(recette.montant_declare),
      description: `Recette vérifiée du ${recette.date_recette} — déclarée par ${recette.agent}${recette.notes ? ` — ${recette.notes}` : ""}`,
      order_id:    recette_id,
    };

    const { error: fondErr } = await sb.from("nc_gestion_fond").insert(fondEntry);
    if (fondErr) {
      console.error("[recettes/verify] fond insert error:", fondErr.message);
      return NextResponse.json({ ok: false, error: "Erreur ajout caisse : " + fondErr.message }, { status: 500 });
    }

    // Marquer la recette comme vérifiée
    const { data: updated, error: updateErr } = await sb
      .from("nc_recettes_v2")
      .update({
        verified:    true,
        verified_by: session.nom,
        verified_at: new Date().toISOString(),
        fond_id,
      })
      .eq("id", recette_id)
      .select("*")
      .single();

    if (updateErr) {
      console.error("[recettes/verify] update error:", updateErr.message);
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    // Log
    await sb.from("nc_events").insert({
      ts:       new Date().toISOString(),
      log_type: "RECETTE_VERIFIEE",
      source:   "dashboard",
      actor:    session.nom,
      note:     `Recette ${recette.agent} du ${recette.date_recette} vérifiée par ${session.nom} — ${Number(recette.montant_declare).toLocaleString("fr-DZ")} DA ajoutés au fond`,
      extra:    { recette_id, agent: recette.agent, date: recette.date_recette, montant: Number(recette.montant_declare), verified_by: session.nom },
    });

    return NextResponse.json({ ok: true, recette: updated, fond_id });

  } catch (err) {
    console.error("[recettes/verify]", err.message);
    return NextResponse.json({ ok: false, error: String(err.message) }, { status: 500 });
  }
}
