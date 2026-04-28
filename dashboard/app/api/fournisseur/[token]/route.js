// GET  /api/fournisseur/[token]     → portail fournisseur : BC en attente + articles
// POST /api/fournisseur/[token]     → soumission du devis (prix + dispo + délai)

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── GET : retourner les BCs "envoye" pour ce fournisseur ──────────
export async function GET(request, { params }) {
  const { token } = await params;
  const sb = adminSB();

  // Vérifier le token fournisseur
  const { data: fournisseur, error: fErr } = await sb
    .from("nc_fournisseurs")
    .select("id, nom, phone, email, active")
    .eq("token_secret", token)
    .maybeSingle();

  if (fErr || !fournisseur) {
    return NextResponse.json({ ok: false, error: "Lien invalide ou expiré" }, { status: 404 });
  }

  if (!fournisseur.active) {
    return NextResponse.json({ ok: false, error: "Accès désactivé" }, { status: 403 });
  }

  // Récupérer les lignes BC envoyées à ce fournisseur (statut "envoye")
  const { data: lines, error: lErr } = await sb
    .from("nc_po_lines")
    .select("po_line_id, po_id, variant_id, product_title, qty_add, sell_price, purchase_price, barcode, note, statut, created_at")
    .eq("fournisseur_id", fournisseur.id)
    .in("statut", ["envoye", "confirme"])
    .order("created_at", { ascending: false });

  if (lErr) {
    return NextResponse.json({ ok: false, error: "Erreur chargement BC" }, { status: 500 });
  }

  // Récupérer les devis déjà soumis par ce fournisseur
  const poIds = [...new Set((lines || []).map(l => l.po_id))];
  let devis = [];
  if (poIds.length > 0) {
    const { data: d } = await sb
      .from("nc_fournisseur_devis")
      .select("po_id, variant_id, prix_unitaire, delai_jours, disponible, note, submitted_at")
      .eq("fournisseur_id", fournisseur.id)
      .in("po_id", poIds);
    devis = d || [];
  }

  // Grouper les lignes par po_id
  const grouped = {};
  (lines || []).forEach(l => {
    if (!grouped[l.po_id]) {
      grouped[l.po_id] = { po_id: l.po_id, statut: l.statut, created_at: l.created_at, lines: [] };
    }
    const d = devis.find(x => x.po_id === l.po_id && x.variant_id === l.variant_id);
    grouped[l.po_id].lines.push({ ...l, devis: d || null });
  });

  return NextResponse.json({
    ok: true,
    fournisseur: { nom: fournisseur.nom },
    bons: Object.values(grouped).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  });
}

// ── POST : soumettre un devis ──────────────────────────────────────
export async function POST(request, { params }) {
  const { token } = await params;
  const sb = adminSB();

  const body = await request.json().catch(() => ({}));
  const { po_id, lines } = body;
  // lines = [{ variant_id, product_title, prix_unitaire, delai_jours, disponible, note }]

  if (!po_id || !lines || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ ok: false, error: "Données manquantes" }, { status: 400 });
  }

  // Vérifier le token
  const { data: fournisseur } = await sb
    .from("nc_fournisseurs")
    .select("id, nom, active")
    .eq("token_secret", token)
    .maybeSingle();

  if (!fournisseur?.active) {
    return NextResponse.json({ ok: false, error: "Lien invalide" }, { status: 403 });
  }

  // Vérifier que ce BC est bien envoyé à ce fournisseur
  const { data: poCheck } = await sb
    .from("nc_po_lines")
    .select("po_id")
    .eq("po_id", po_id)
    .eq("fournisseur_id", fournisseur.id)
    .limit(1)
    .maybeSingle();

  if (!poCheck) {
    return NextResponse.json({ ok: false, error: "Bon de commande introuvable" }, { status: 404 });
  }

  // Upsert les devis (un par article)
  const rows = lines.map(l => ({
    po_id,
    fournisseur_id:  fournisseur.id,
    variant_id:      String(l.variant_id),
    product_title:   l.product_title || "",
    prix_unitaire:   Number(l.prix_unitaire) || 0,
    delai_jours:     Number(l.delai_jours) || null,
    disponible:      l.disponible !== false,
    note:            l.note || "",
    submitted_at:    new Date().toISOString(),
  }));

  const { error } = await sb
    .from("nc_fournisseur_devis")
    .upsert(rows, { onConflict: "po_id,fournisseur_id,variant_id" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Passer le statut BC à "confirme" si tous les articles ont un devis
  await sb
    .from("nc_po_lines")
    .update({ statut: "confirme" })
    .eq("po_id", po_id)
    .eq("fournisseur_id", fournisseur.id)
    .eq("statut", "envoye");

  return NextResponse.json({ ok: true, message: `Devis soumis — ${rows.length} article(s)` });
}
