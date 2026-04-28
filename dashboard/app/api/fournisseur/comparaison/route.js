// GET /api/fournisseur/comparaison?token=&po_id=
// Retourne le tableau comparatif de prix entre fournisseurs pour un BC

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const po_id = searchParams.get("po_id");

  const session = verifyToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

  const sb = adminSB();

  // Lignes du BC
  const { data: lines, error: lErr } = await sb
    .from("nc_po_lines")
    .select("variant_id, product_title, qty_add, purchase_price, image_url:variant_id")
    .eq("po_id", po_id)
    .order("created_at");

  if (lErr) return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 });

  // Tous les devis pour ce BC
  const { data: devis, error: dErr } = await sb
    .from("nc_fournisseur_devis")
    .select("variant_id, prix_unitaire, delai_jours, disponible, note, fournisseur_id, nc_fournisseurs(nom)")
    .eq("po_id", po_id);

  if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 });

  // Construire le tableau comparatif
  const result = (lines || []).map(line => {
    const ligneDevis = (devis || []).filter(d => d.variant_id === line.variant_id);
    const disponibles = ligneDevis.filter(d => d.disponible && d.prix_unitaire > 0);

    // Trouver le meilleur prix
    const meilleurPrix = disponibles.length > 0
      ? Math.min(...disponibles.map(d => d.prix_unitaire))
      : null;

    // Économie potentielle vs prix actuel
    const economie = line.purchase_price && meilleurPrix
      ? Math.round((Number(line.purchase_price) - meilleurPrix) * Number(line.qty_add))
      : null;

    return {
      variant_id:     line.variant_id,
      product_title:  line.product_title,
      qty_demandee:   line.qty_add,
      prix_actuel:    line.purchase_price,
      meilleur_prix:  meilleurPrix,
      economie_da:    economie,
      devis: ligneDevis.map(d => ({
        fournisseur_nom: d.nc_fournisseurs?.nom || "—",
        fournisseur_id:  d.fournisseur_id,
        prix_unitaire:   d.prix_unitaire,
        delai_jours:     d.delai_jours,
        disponible:      d.disponible,
        note:            d.note,
        est_meilleur:    d.disponible && d.prix_unitaire === meilleurPrix,
      })).sort((a, b) => (a.prix_unitaire || Infinity) - (b.prix_unitaire || Infinity)),
    };
  });

  const totalEconomie = result.reduce((s, r) => s + (r.economie_da || 0), 0);

  return NextResponse.json({ ok: true, po_id, lignes: result, total_economie_da: totalEconomie });
}
