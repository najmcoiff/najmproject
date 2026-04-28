// ═══════════════════════════════════════════════════════════════════
//  POST /api/po/inject
//  Injection bon de commande natif Supabase — Phase M4 (T203)
//
//  Remplace GAS RUN_INJECT_PO. Lit nc_po_lines (synced_at IS NULL)
//  et met à jour nc_variants directement :
//    - inventory_quantity += qty_add  (RPC increment_stock)
//    - price = sell_price             (si > 0)
//    - cost_price = purchase_price    (si > 0)
//    - barcode = barcode              (si rempli)
//  Marque les lignes traitées : nc_po_lines.synced_at = NOW()
//
//  Body : { token, po_id? }
//    po_id (optionnel) : injecter seulement ce bon. Sans po_id = tout injecter.
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";
import { verifyToken }   from "@/lib/server-auth";

export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request) {
  const t0 = Date.now();
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const poIdFilter = body.po_id ? String(body.po_id).trim() : null;
    const sb = adminSB();

    // ── 1. Charger les lignes PO non encore injectées ─────────────
    let query = sb
      .from("nc_po_lines")
      .select("po_line_id, po_id, variant_id, qty_add, sell_price, purchase_price, barcode, display_name")
      .is("synced_at", null)
      .order("po_id", { ascending: true })
      .limit(500);

    if (poIdFilter) {
      query = query.eq("po_id", poIdFilter);
    }

    const { data: lines, error: loadErr } = await query;
    if (loadErr) throw new Error("Lecture nc_po_lines : " + loadErr.message);

    const pending = (lines || []).filter(l => l.variant_id && Number(l.qty_add) > 0);

    if (pending.length === 0) {
      return NextResponse.json({
        ok:          true,
        lignes_ok:   0,
        lignes_ko:   0,
        message:     poIdFilter
          ? `Bon ${poIdFilter} — aucune ligne en attente (déjà injecté ou vide).`
          : "Aucune ligne en attente d'injection.",
        duration_ms: Date.now() - t0,
      });
    }

    // ── 2. Traiter chaque ligne ───────────────────────────────────
    let lignes_ok = 0;
    let lignes_ko = 0;
    const errors  = [];

    for (const line of pending) {
      const variantId = String(line.variant_id).trim();
      const qty       = Number(line.qty_add);
      const sellPrice = Number(line.sell_price  || 0);
      const costPrice = Number(line.purchase_price || 0);
      const barcode   = line.barcode ? String(line.barcode).trim() : null;

      let lineFailed = false;

      // 2a. Incrémenter le stock
      const { error: stockErr } = await sb.rpc("increment_stock", {
        p_variant_id: variantId,
        p_qty:        qty,
      });
      if (stockErr) {
        console.warn(`PO_INJECT stock_fail po=${line.po_id} variant=${variantId}`, stockErr.message);
        lineFailed = true;
        errors.push({ po_line_id: line.po_line_id, variant_id: variantId, step: "stock", error: stockErr.message });
      }

      if (!lineFailed) {
        // 2b. Construire le patch nc_variants
        const patch = {};
        if (sellPrice > 0)  patch.price      = sellPrice;
        if (costPrice > 0)  patch.cost_price  = costPrice;
        if (barcode)        patch.barcode     = barcode;

        if (Object.keys(patch).length > 0) {
          const { error: patchErr } = await sb
            .from("nc_variants")
            .update(patch)
            .eq("variant_id", variantId);
          if (patchErr) {
            console.warn(`PO_INJECT patch_fail po=${line.po_id} variant=${variantId}`, patchErr.message);
            // Patch non-bloquant : la ligne est quand même comptée OK (stock est OK)
          }
        }

        // 2c. Marquer la ligne comme injectée
        const { error: syncErr } = await sb
          .from("nc_po_lines")
          .update({ synced_at: new Date().toISOString() })
          .eq("po_line_id", line.po_line_id);
        if (syncErr) {
          console.warn(`PO_INJECT sync_fail po_line_id=${line.po_line_id}`, syncErr.message);
        }

        lignes_ok++;
      } else {
        lignes_ko++;
      }
    }

    // ── 3. Log nc_events ─────────────────────────────────────────
    try {
      await sb.from("nc_events").insert({
        ts:       new Date().toISOString(),
        log_type: "PO_INJECT",
        source:   "VERCEL",
        actor:    session.nom,
        note:     `Injection PO${poIdFilter ? " " + poIdFilter : ""} — ${lignes_ok} OK, ${lignes_ko} KO`,
        extra:    JSON.stringify({
          po_id:     poIdFilter || "ALL",
          lignes_ok,
          lignes_ko,
          total:     pending.length,
          errors:    errors.length,
        }),
      });
    } catch { /* fire-and-forget */ }

    const duration = Date.now() - t0;
    console.log(`PO_INJECT po=${poIdFilter || "ALL"} lignes_ok=${lignes_ok} lignes_ko=${lignes_ko} ${duration}ms`);

    return NextResponse.json({
      ok:          lignes_ko === 0,
      lignes_ok,
      lignes_ko,
      errors:      errors.slice(0, 10),
      message:     `Stock mis à jour dans la base — ${lignes_ok} article(s)${lignes_ko > 0 ? ` (${lignes_ko} erreur(s))` : ""}`,
      duration_ms: duration,
    });

  } catch (err) {
    console.error("PO_INJECT_EXCEPTION", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
