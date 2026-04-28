// POST /api/po/send-to-fournisseur
// Envoie un BC à un ou plusieurs fournisseurs (statut → "envoye")
// Body: { token, po_id, fournisseur_ids: [] }

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const session = verifyToken(body.token);
  if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

  const { po_id, fournisseur_ids } = body;

  if (!po_id) return NextResponse.json({ ok: false, error: "po_id requis" }, { status: 400 });
  if (!fournisseur_ids?.length) return NextResponse.json({ ok: false, error: "Au moins un fournisseur requis" }, { status: 400 });

  const sb = adminSB();

  // Vérifier que les fournisseurs existent et sont actifs
  const { data: fournisseurs } = await sb
    .from("nc_fournisseurs")
    .select("id, nom, token_secret")
    .in("id", fournisseur_ids)
    .eq("active", true);

  if (!fournisseurs?.length) {
    return NextResponse.json({ ok: false, error: "Aucun fournisseur actif trouvé" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Pour chaque fournisseur : dupliquer les lignes du BC avec son fournisseur_id
  // (si le BC a déjà été envoyé à ce fournisseur, on met juste à jour la date)
  const results = [];
  for (const f of fournisseurs) {
    // Récupérer les lignes du BC original
    const { data: lines } = await sb
      .from("nc_po_lines")
      .select("po_line_id, po_id, variant_id, product_title, qty_add, sell_price, purchase_price, barcode, note, collections_titles_pick, display_name, agent")
      .eq("po_id", po_id)
      .is("fournisseur_id", null); // lignes originales (sans fournisseur assigné)

    if (!lines?.length) {
      // Essai avec les lignes déjà existantes pour ce BC
      const { error } = await sb
        .from("nc_po_lines")
        .update({ fournisseur_id: f.id, fournisseur_nom: f.nom, statut: "envoye", date_envoi_fournisseur: now })
        .eq("po_id", po_id);

      results.push({ fournisseur: f.nom, ok: !error, lien: `${process.env.NEXT_PUBLIC_APP_URL || "https://najmcoiffdashboard.vercel.app"}/fournisseur/${f.token_secret}` });
      continue;
    }

    // Créer des copies des lignes pour ce fournisseur
    const copies = lines.map(l => ({
      po_id:               l.po_id,
      variant_id:          l.variant_id,
      product_title:       l.product_title,
      display_name:        l.display_name,
      qty_add:             l.qty_add,
      sell_price:          l.sell_price,
      purchase_price:      l.purchase_price,
      barcode:             l.barcode,
      note:                l.note,
      collections_titles_pick: l.collections_titles_pick,
      agent:               l.agent || session.nom,
      fournisseur_id:      f.id,
      fournisseur_nom:     f.nom,
      statut:              "envoye",
      date_envoi_fournisseur: now,
    }));

    const { error } = await sb.from("nc_po_lines").upsert(copies, {
      onConflict: "po_id,variant_id,fournisseur_id",
      ignoreDuplicates: false,
    });

    const lien = `${process.env.NEXT_PUBLIC_APP_URL || "https://najmcoiffdashboard.vercel.app"}/fournisseur/${f.token_secret}`;
    results.push({ fournisseur: f.nom, ok: !error, lien, error: error?.message });
  }

  // Log nc_events
  await sb.from("nc_events").insert({
    log_type: "PO_SENT_FOURNISSEUR",
    source:   "VERCEL",
    actor:    session.nom,
    note:     `BC ${po_id} envoyé à ${fournisseurs.map(f => f.nom).join(", ")}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, po_id, results });
}
