// ═══════════════════════════════════════════════════════════════════
//  POST /api/inject/batch
//  Injecte TOUTES les commandes confirmées/modifiées sans tracking vers ZR
//
//  Corrections S8 :
//    - Filtre : tracking IS NULL OU tracking = '' ET zr_locked IS NULL
//    - Inclut decision_status='modifier' (en plus de 'confirmer')
//    - Après succès : set tracking + zr_locked='OUI'
//
//  Body : { token }
//  Réponse : { ok, injected, skipped, errors, results[], duration_ms }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";
import { zrCreateParcel, zrGetParcelStatus } from "@/lib/zr-express";

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

    // ── 1. Lire les commandes confirmées ou modifiées, sans tracking ni zr_locked ──
    //  decision_status IN ('confirmer','modifier') + tracking vide/null + zr_locked null
      const { data: orders, error: ordErr } = await supabase
      .from("nc_orders")
      .select("order_id,customer_name,customer_phone,wilaya,commune,adresse,order_total,shopify_delivery_mode,delivery_mode,delivery_type,order_items_summary,shopify_order_name")
      .eq("archived", false)
      .is("zr_locked", null)
      .or("tracking.is.null,tracking.eq.")
      .or("decision_status.ilike.%confirm%,decision_status.ilike.%modifier%,confirmation_status.ilike.%confirm%");

    if (ordErr) throw new Error("Lecture nc_orders: " + ordErr.message);
    if (!orders?.length) {
      return NextResponse.json({ ok: true, injected: 0, skipped: 0, errors: 0, results: [], duration_ms: Date.now() - t0, message: "Aucune commande à injecter" });
    }

    // ── 2. Filtrer celles qui ont les données minimales ───────────
    const toInject = orders.filter(o => o.customer_phone && o.wilaya);
    const skippedNoData = orders.length - toInject.length;

    // ── 3. Injecter chacune séquentiellement ─────────────────────
    let injected = 0, errorCount = 0;
    const results = [];
    const now = new Date().toISOString();

    for (const order of toInject) {
      try {
        const zrResult = await zrCreateParcel(order);
        if (!zrResult.ok) {
          results.push({ order_id: order.order_id, ok: false, error: zrResult.error });
          errorCount++;
          // Logger l'erreur dans nc_events (colonnes réelles)
          supabase.from("nc_events").insert({
            ts:       now,
            log_type: "INJECT_ZR_ERROR",
            source:   "VERCEL",
            order_id: order.order_id,
            note:     `Erreur injection ZR: ${zrResult.error}`,
            extra:    JSON.stringify({ error: zrResult.error, wilaya: order.wilaya, agent: session.nom }),
          }).then(() => {}).catch(() => {});
          continue;
        }

        const { tracking, parcel_id } = zrResult;

        // Fetch statut réel depuis ZR
        let initialStatut = "Créé";
        let initialAttempts = 0;
        try {
          const zrStatus = await zrGetParcelStatus(parcel_id, tracking);
          if (zrStatus.ok) {
            initialStatut   = zrStatus.stateLabel || "Créé";
            initialAttempts = zrStatus.attempts    || 0;
          }
        } catch { /* non-bloquant */ }

        // Update nc_orders : tracking + zr_locked='OUI' + shipping_status
        await supabase
          .from("nc_orders")
          .update({ tracking, zr_locked: "OUI", shipping_status: "expédié" })
          .eq("order_id", order.order_id);

        // Upsert nc_suivi_zr
        await supabase.from("nc_suivi_zr").upsert({
          tracking,
          parcel_id:          parcel_id   || "",
          order_id:           order.order_id,
          customer_name:      order.customer_name  || "",
          customer_phone:     order.customer_phone || "",
          wilaya:             order.wilaya         || "",
          adresse:            order.adresse        || order.commune || "",
          carrier:            "ZR Express",
          statut_livraison:   initialStatut,
          attempts_count:     initialAttempts,
          delivery_mode:      order.shopify_delivery_mode || order.delivery_mode || order.delivery_type || "",
          shopify_order_name: order.shopify_order_name    || "",
          order_total:        order.order_total    || null,
          date_injection:     now,
          updated_at:         now,
          link_zr:            `https://track.zrexpress.app/?tracking=${tracking}`,
        }, { onConflict: "tracking" });

        results.push({ order_id: order.order_id, ok: true, tracking });
        injected++;

      } catch (itemErr) {
        results.push({ order_id: order.order_id, ok: false, error: String(itemErr.message || itemErr) });
        errorCount++;
      }
    }

    // ── 4. Log global ────────────────────────────────────────────
    try {
      await supabase.from("nc_events").insert({
        ts:       now,
        log_type: "INJECT_ALL_ZR",
        source:   "VERCEL",
        note:     `Injection batch ZR — ${injected} injectés, ${errorCount} erreurs, ${skippedNoData} ignorés (agent: ${session.nom})`,
        extra:    JSON.stringify({ injected, errors: errorCount, skipped: skippedNoData, agent: session.nom }),
      });
    } catch { /* fire-and-forget */ }

    const duration = Date.now() - t0;
    console.log(`INJECT_BATCH total=${orders.length} injected=${injected} errors=${errorCount} ${duration}ms`);

    return NextResponse.json({
      ok:          true,
      injected,
      skipped:     skippedNoData,
      errors:      errorCount,
      results,
      duration_ms: duration,
      message:     `${injected} colis injectés, ${errorCount} erreurs, ${skippedNoData} ignorés (données manquantes)`,
    });

  } catch (err) {
    console.error("INJECT_BATCH_EXCEPTION", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
