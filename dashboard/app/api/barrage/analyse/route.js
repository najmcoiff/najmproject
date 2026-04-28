// ═══════════════════════════════════════════════════════════════════
//  POST /api/barrage/analyse
//  Seuil barrage : stock entre 1 et 4 (critique)
//    • Ajoute les produits avec stock 1-4
//    • Rafraîchit les valeurs de stock des produits déjà présents
//    • Retire automatiquement les produits avec stock = 0 ou stock ≥ 5
//
//  Body : { token }
//  Réponse : { ok, added, updated, removed, total, duration_ms }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEUIL_MIN = 1; // stock < 1 (rupture) → sortir
const SEUIL_MAX = 4; // stock > 4 → stock OK → sortir

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
    const actor    = session.nom || "dashboard";
    const now      = new Date().toISOString();

    // ── 1. Lire tous les variants actifs (pagination) ──────────────
    let allVariants = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("nc_variants")
        .select("variant_id,product_title,image_url,inventory_quantity,collections_titles,world,tags")
        .eq("status", "active")
        .range(from, from + PAGE - 1);
      if (error) throw new Error("Lecture nc_variants: " + error.message);
      if (!data || data.length === 0) break;
      allVariants = allVariants.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // ── 2. Seuil 1-4 : critiques → entrent/restent | hors seuil → sortent
    const critiques = allVariants.filter(v =>
      v.inventory_quantity !== null &&
      v.inventory_quantity >= SEUIL_MIN &&
      v.inventory_quantity <= SEUIL_MAX
    );
    const idsCritiques = new Set(critiques.map(v => String(v.variant_id)));

    // ── 3. Lire nc_barrage actuel (avec pagination) ───────────────
    let barrageActuel = [];
    let bFrom = 0;
    while (true) {
      const { data: bPage, error: bErr } = await supabase
        .from("nc_barrage")
        .select("variant_id,stock_cible,note_agent,balise,verifie,agent,product_title,available")
        .range(bFrom, bFrom + PAGE - 1);
      if (bErr) throw new Error("Lecture nc_barrage: " + bErr.message);
      if (!bPage || bPage.length === 0) break;
      barrageActuel = barrageActuel.concat(bPage);
      if (bPage.length < PAGE) break;
      bFrom += PAGE;
    }

    const barrageMap = {};
    barrageActuel.forEach(r => { barrageMap[String(r.variant_id)] = r; });

    // ── 4. Retirer les produits hors seuil (stock < 1 ou stock > 4) ─
    // Batcher les suppressions par 200 pour éviter URL trop longue (>2000 IDs)
    const aRetirer = barrageActuel.filter(r => !idsCritiques.has(String(r.variant_id)));
    let removed = 0;
    if (aRetirer.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < aRetirer.length; i += BATCH) {
        const chunk = aRetirer.slice(i, i + BATCH);
        const ids   = chunk.map(r => r.variant_id);
        const { error: delErr } = await supabase
          .from("nc_barrage")
          .delete()
          .in("variant_id", ids);
        if (!delErr) {
          removed += chunk.length;
          // Log EXIT_BARRAGE en batch
          try {
          const exitEvents = chunk.map(r => ({
            ts: now, log_type: "EXIT_BARRAGE", source: "VERCEL",
            actor, variant_id: String(r.variant_id),
            ancien_statut: "barrage", nouveau_statut: "hors_seuil",
            label: r.product_title || String(r.variant_id),
          }));
            await supabase.from("nc_events").insert(exitEvents);
          } catch (_) { /* fire-and-forget */ }
        } else {
          console.error("Delete batch error:", delErr.message);
        }
      }
    }

    // ── 5. Upsert les produits critiques ──────────────────────────
    let added = 0, updated = 0;
    const upsertRows = critiques.map(v => {
      const existing = barrageMap[String(v.variant_id)];
      if (existing) updated++; else added++;
      // Dériver le monde depuis nc_variants.world (source de vérité)
      // Fallback : tags contient "onglerie" → onglerie, sinon coiffure
      let derivedWorld = v.world || null;
      if (!derivedWorld) {
        const tagsLower = (Array.isArray(v.tags) ? v.tags.join(" ") : String(v.tags || "")).toLowerCase();
        const ctLower   = (v.collections_titles || "").toLowerCase();
        derivedWorld = (tagsLower.includes("onglerie") || ctLower.includes("onglerie")) ? "onglerie" : "coiffure";
      }

      return {
        variant_id:    v.variant_id,
        product_title: v.product_title || "",
        variant_image_url: v.image_url || "",
        available:         v.inventory_quantity,
        on_hand:           v.inventory_quantity,
        stock_cible:       existing?.stock_cible ?? null,
        note_agent:        existing?.note_agent  ?? null,
        balise:            derivedWorld,
        verifie:           existing?.verifie      ?? false,
        agent:             existing?.agent        ?? actor,
        synced_at:         now,
      };
    });

    if (upsertRows.length > 0) {
      for (let i = 0; i < upsertRows.length; i += 200) {
        const batch = upsertRows.slice(i, i + 200);
        const { error: uErr } = await supabase
          .from("nc_barrage")
          .upsert(batch, { onConflict: "variant_id" });
        if (uErr) console.error("Upsert barrage batch error:", uErr.message);
      }
    }

    // ── 6. Log global ─────────────────────────────────────────────
    try {
      await supabase.from("nc_events").insert({
        ts: now, log_type: "BARRAGE_ANALYSE", source: "VERCEL",
        actor,
        extra: { added, updated, removed, total: upsertRows.length },
      });
    } catch (_) { /* fire-and-forget */ }

    const duration = Date.now() - t0;
    console.log(`BARRAGE_ANALYSE added=${added} updated=${updated} removed=${removed} ${duration}ms`);

    return NextResponse.json({
      ok: true,
      added,
      updated,
      removed,
      total:       upsertRows.length,
      duration_ms: duration,
      message:     `${added} ajoutés, ${updated} mis à jour, ${removed} sortis (stock < 1 ou > 4)`,
    });

  } catch (err) {
    console.error("BARRAGE_ANALYSE_ERROR", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
