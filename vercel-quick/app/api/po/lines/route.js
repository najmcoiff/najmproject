// ═══════════════════════════════════════════════════════════════════
//  POST /api/po/lines
//  Sauvegarder les lignes d'un bon de commande — Phase M4 (T204)
//
//  Remplace sbAddPOLines (supabase-direct.js) qui utilisait de vieilles
//  colonnes inexistantes (quantite, prix_unitaire, fournisseur, statut).
//
//  Schéma réel nc_po_lines :
//    po_line_id, po_id, variant_id, qty_add, purchase_price, sell_price,
//    note, barcode, agent, display_name, product_title,
//    collections_titles_pick, synced_at, created_at
//
//  Body : { token, po_id, lines[] }
//    lines[i] : { variant_id, qty_add, sell_price, purchase_price,
//                 display_name?, product_title?, barcode?, note?,
//                 collections_titles_pick? }
//
//  Validation : refus si qty_add <= 0 ou variant_id manquant
// ═══════════════════════════════════════════════════════════════════

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

function genLineId(poId, i) {
  return `${poId}-L${String(i + 1).padStart(3, "0")}-${Date.now()}`;
}

export async function POST(request) {
  try {
    const body   = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const po_id = String(body.po_id || "").trim();
    if (!po_id) return NextResponse.json({ ok: false, error: "po_id requis" }, { status: 400 });

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) return NextResponse.json({ ok: false, error: "lines requis et non vide" }, { status: 400 });

    // ── Validation ────────────────────────────────────────────────
    const invalid = lines.filter(l => !l.variant_id || !(Number(l.qty_add) > 0));
    if (invalid.length > 0) {
      return NextResponse.json({
        ok:    false,
        error: `${invalid.length} ligne(s) invalide(s) — variant_id obligatoire et qty_add >= 1`,
        invalid_lines: invalid.map(l => ({ variant_id: l.variant_id, qty_add: l.qty_add })),
      }, { status: 400 });
    }

    // ── Construction des lignes à insérer ─────────────────────────
    const now = new Date().toISOString();
    const toInsert = lines.map((l, i) => ({
      po_line_id:              genLineId(po_id, i),
      po_id,
      variant_id:              String(l.variant_id).trim(),
      qty_add:                 Number(l.qty_add),
      sell_price:              Number(l.sell_price  || 0) || null,
      purchase_price:          Number(l.purchase_price || 0) || null,
      barcode:                 l.barcode        ? String(l.barcode).trim()        : null,
      display_name:            l.display_name   ? String(l.display_name).trim()  : null,
      product_title:           l.product_title  ? String(l.product_title).trim() : null,
      note:                    l.note           ? String(l.note).trim()           : null,
      collections_titles_pick: l.collections_titles_pick || null,
      agent:                   session.nom || null,
      synced_at:               null,
      created_at:              now,
    }));

    // ── Insert dans nc_po_lines ───────────────────────────────────
    const sb = adminSB();
    const { error } = await sb.from("nc_po_lines").insert(toInsert);
    if (error) {
      console.error("PO_LINES_INSERT_ERROR", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // ── Log nc_events ─────────────────────────────────────────────
    try {
      await sb.from("nc_events").insert({
        ts:       now,
        log_type: "PO_LINES_ADDED",
        source:   "VERCEL",
        actor:    session.nom,
        note:     `Bon ${po_id} sauvegardé — ${toInsert.length} ligne(s)`,
        extra:    JSON.stringify({ po_id, lines_added: toInsert.length }),
      });
    } catch { /* fire-and-forget */ }

    console.log(`PO_LINES agent=${session.nom} po_id=${po_id} lines=${toInsert.length}`);

    return NextResponse.json({
      ok:          true,
      lines_added: toInsert.length,
      po_id,
    });

  } catch (err) {
    console.error("PO_LINES_EXCEPTION", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
