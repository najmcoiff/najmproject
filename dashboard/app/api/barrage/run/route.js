// ═══════════════════════════════════════════════════════════════════
//  POST /api/barrage/run
//  Applique les corrections de stock définies dans nc_barrage
//
//  Migration T200 (Phase M4) : plus d'appel Shopify.
//  Source de vérité : nc_variants.inventory_quantity (Supabase direct)
//
//  Logique :
//    1. Lit nc_barrage WHERE stock_cible IS NOT NULL
//    2. Pour chaque variante : UPDATE nc_variants SET inventory_quantity = stock_cible
//    3. Marque nc_barrage : stock_cible = NULL, verifie = true
//    4. Log nc_events par correction
//
//  Body : { token }
//  Réponse : { ok, applied, skipped, errors, results[], duration_ms }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";
import { logScript } from "@/lib/logscript";

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

    const supabase = adminSB();

    // ── 1. Lire nc_barrage (items avec stock_cible saisi) ─────────
    const { data: barrageRows, error: bErr } = await supabase
      .from("nc_barrage")
      .select("variant_id,product_title,stock_cible,agent,available")
      .not("stock_cible", "is", null);

    if (bErr) throw new Error("Lecture nc_barrage: " + bErr.message);
    if (!barrageRows?.length) {
      return NextResponse.json({
        ok: true, applied: 0, skipped: 0, errors: 0, results: [],
        duration_ms: Date.now() - t0, message: "Aucun barrage à traiter",
      });
    }

    // ── 2. Filtrer les candidats valides ──────────────────────────
    const candidates = barrageRows.filter(r =>
      r.variant_id &&
      String(r.variant_id).trim() !== "" &&
      Number.isFinite(Number(r.stock_cible)) &&
      Number(r.stock_cible) >= 0
    );
    const skippedNoId = barrageRows.length - candidates.length;

    if (!candidates.length) {
      return NextResponse.json({
        ok: true, applied: 0, skipped: skippedNoId, errors: 0, results: [],
        duration_ms: Date.now() - t0, message: "Aucun candidat valide",
      });
    }

    // ── 3. Appliquer les corrections (UPDATE nc_variants direct) ──
    let applied = 0, errorCount = 0;
    const results = [];
    const now = new Date().toISOString();
    const correctedIds = [];

    for (const item of candidates) {
      const variantId  = String(item.variant_id).trim();
      const stockCible = Number(item.stock_cible);
      const title      = item.product_title || variantId;

      try {
        // UPDATE nc_variants.inventory_quantity = stock_cible
        const { error: updErr } = await supabase
          .from("nc_variants")
          .update({ inventory_quantity: stockCible })
          .eq("variant_id", variantId);

        if (updErr) throw new Error(updErr.message);

        // Log nc_events par correction
        try {
          await supabase.from("nc_events").insert({
            ts:        now,
            log_type:  "BARRAGE_CORRECTION",
            source:    "VERCEL",
            actor:     item.agent || session.nom,
            variant_id: variantId,
            label:     `Correction barrage : ${title} → ${stockCible}`,
            extra: {
              product_title:   title,
              available_avant: item.available,
              stock_cible:     stockCible,
            },
          });
        } catch { /* fire-and-forget */ }

        results.push({ variant_id: variantId, ok: true, title, stock_cible: stockCible });
        correctedIds.push(variantId);
        applied++;

      } catch (itemErr) {
        results.push({ variant_id: variantId, ok: false, error: String(itemErr.message || itemErr), title });
        errorCount++;
      }
    }

    // ── 4. Marquer comme traités dans nc_barrage ──────────────────
    //      stock_cible = NULL + verifie = true
    if (correctedIds.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < correctedIds.length; i += BATCH) {
        const chunk = correctedIds.slice(i, i + BATCH);
        try {
          await supabase
            .from("nc_barrage")
            .update({ stock_cible: null, verifie: "true" })
            .in("variant_id", chunk);
        } catch { /* fire-and-forget */ }
      }
    }

    // ── 5. Log global nc_events ───────────────────────────────────
    try {
      await supabase.from("nc_events").insert({
        ts:       now,
        log_type: "BARRAGE_RUN_GLOBAL",
        source:   "VERCEL",
        actor:    session.nom,
        label:    `Barrage run : ${applied} corrections appliquées`,
        extra:    { applied, errors: errorCount, skipped: skippedNoId },
      });
    } catch { /* fire-and-forget */ }

    const duration = Date.now() - t0;
    console.log(`BARRAGE_RUN applied=${applied} errors=${errorCount} ${duration}ms`);
    logScript({
      level:      errorCount > 0 ? "WARN" : "INFO",
      action:     "BARRAGE_RUN",
      message:    `applied=${applied} errors=${errorCount} skipped=${skippedNoId}`,
      duration_ms: duration,
      details:    { applied, errors: errorCount, skipped: skippedNoId, agent: session.nom, results: results.slice(0, 20) },
    });

    return NextResponse.json({
      ok:          true,
      applied,
      skipped:     skippedNoId,
      errors:      errorCount,
      results,
      duration_ms: duration,
      message:     `${applied} stocks corrigés dans Supabase, ${errorCount} erreurs, ${skippedNoId} ignorés`,
    });

  } catch (err) {
    console.error("BARRAGE_RUN_EXCEPTION", err);
    logScript({ level: "ERROR", action: "BARRAGE_RUN", message: String(err.message || err), details: { stack: String(err.stack || "").slice(0, 400) } });
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
