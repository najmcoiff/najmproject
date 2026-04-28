"use client";
// ═══════════════════════════════════════════════════════════════════
//  supabase-cache.js
//  Lit les tables de cache Supabase au lieu d'appeler GAS.
//  Résultat : < 100ms au lieu de 2-5 secondes.
//
//  Tables (créer via SQL Editor Supabase) :
//    nc_orders           — ORDERS_V2
//    nc_variants         — VARIANTES_CACHE
//    nc_suivi_zr         — SUIVI ZR (colis actifs)
//    nc_barrage          — 🚧BARRAGE_TRAVAIL (non vérifiés)
//    nc_rapports         — RAPPORT V2
//    nc_gestion_fond     — gestion de fond (actifs)
//    nc_recettes         — recette
//    nc_kpi_stock        — kpi_stock_urgence (depuis BQ)
//    nc_kpi_jamais_vendus— kpi_articles_jamais_vendus_60j (depuis BQ)
//    nc_po_lines         — PO_LINES_V2
// ═══════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";

// ── Remap des noms de colonnes normalisés → noms attendus par les pages ──
// GAS stocke avec des noms normalisés (lowercase + underscore)
// Les pages attendent les noms originaux du Sheet
const ORDER_FIELD_REMAP = {
  adresse:          "Adresse",
  adress_error:     "adress error",
  zr_locked:        "ZR_LOCKED",
  annuler_shopify:  "annuler shopify",
};

function remapOrderRow(row) {
  const out = { ...row };
  for (const [from, to] of Object.entries(ORDER_FIELD_REMAP)) {
    if (from in out) {
      out[to] = out[from];
      // Garder aussi la version normalisée pour compatibilité
    }
  }
  return out;
}

// ── Recalcul des doublons (fenêtre 24h, exclut last='OUI') ───────
// Doublon = même téléphone ET moins de 24h entre deux commandes.
// Les commandes clôturées (last='OUI') sont ignorées.
function computeDoublons(rows) {
  const MS_24H = 24 * 60 * 60 * 1000;

  const active = rows.filter(o => (o.last || "") !== "OUI");

  const byPhone = {};
  active.forEach(o => {
    const phone = String(o.customer_phone || "").trim();
    if (!phone) return;
    if (!byPhone[phone]) byPhone[phone] = [];
    byPhone[phone].push(o);
  });

  const dupIds = new Set();
  Object.values(byPhone).forEach(group => {
    if (group.length <= 1) return;
    const sorted = [...group].sort(
      (a, b) => new Date(a.order_date || 0) - new Date(b.order_date || 0)
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const tA = new Date(sorted[i].order_date || 0).getTime();
        const tB = new Date(sorted[j].order_date || 0).getTime();
        if (Math.abs(tB - tA) < MS_24H) {
          dupIds.add(sorted[i].order_id);
          dupIds.add(sorted[j].order_id);
        }
      }
    }
  });

  const phoneCounters = {};
  rows.forEach(o => {
    if (dupIds.has(o.order_id)) {
      const phone = String(o.customer_phone || "").trim();
      phoneCounters[phone] = (phoneCounters[phone] || 0) + 1;
      o.doublon      = "doublon_" + phoneCounters[phone];
      o.is_duplicate = true;
    } else {
      o.doublon = o.doublon || "";
    }
  });

  return rows;
}

// ── Tri commandes (même logique que GAS) ─────────────────────────
function sortOrders(rows) {
  return rows.sort((a, b) => {
    const aDecided = a.decision_status ? 1 : 0;
    const bDecided = b.decision_status ? 1 : 0;
    if (aDecided !== bDecided) return aDecided - bDecided;
    return new Date(b.order_date || 0) - new Date(a.order_date || 0);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  GET ORDERS — depuis nc_orders
// ═══════════════════════════════════════════════════════════════════
export async function getOrdersFromCache() {
  const { data, error } = await supabase
    .from("nc_orders")
    .select("*");

  if (error) {
    console.warn("[supabase-cache] getOrders error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const rows = sortOrders(computeDoublons(data.map(remapOrderRow)));
  return { ok: true, rows, count: rows.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET VARIANTS — depuis nc_variants
// ═══════════════════════════════════════════════════════════════════
export async function getVariantsFromCache() {
  const { data, error } = await supabase
    .from("nc_variants")
    .select("*");

  if (error) {
    console.warn("[supabase-cache] getVariants error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  return { ok: true, rows: data, count: data.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET SUIVI ZR — depuis nc_suivi_zr
// ═══════════════════════════════════════════════════════════════════
export async function getSuiviZRFromCache() {
  const { data, error } = await supabase
    .from("nc_suivi_zr")
    .select("*");

  if (error) {
    console.warn("[supabase-cache] getSuiviZR error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  return { ok: true, rows: data, count: data.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET BARRAGE — depuis nc_barrage (articles non vérifiés)
// ═══════════════════════════════════════════════════════════════════
export async function getBarrageFromCache() {
  const { data, error } = await supabase
    .from("nc_barrage")
    .select("*");

  if (error) {
    console.warn("[supabase-cache] getBarrage error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  // Remap verifie → "verifié" (accent supprimé pour SQL, attendu par la page)
  const rows = data.map(r => ({ ...r, "verifié": r.verifie ?? "" }));
  return { ok: true, rows, count: rows.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET RAPPORTS — depuis nc_rapports
// ═══════════════════════════════════════════════════════════════════
export async function getRapportsFromCache() {
  const { data, error } = await supabase
    .from("nc_rapports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[supabase-cache] getRapports error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  // Remap piece_jointe → "piece jointe" (nom original attendu par la page)
  const rows = data.map(r => ({ ...r, "piece jointe": r.piece_jointe ?? "" }));
  return { ok: true, rows, count: rows.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET GESTION FOND — depuis nc_gestion_fond
// ═══════════════════════════════════════════════════════════════════
export async function getGestionFondFromCache() {
  const { data, error } = await supabase
    .from("nc_gestion_fond")
    .select("*")
    .order("row_num", { ascending: false });

  if (error) {
    console.warn("[supabase-cache] getGestionFond error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  // Remap row_num → _row (utilisé par deleteTransaction)
  const rows = data.map(r => ({ ...r, _row: r.row_num }));
  return { ok: true, rows, count: rows.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET RECETTES FOND — depuis nc_recettes
// ═══════════════════════════════════════════════════════════════════
export async function getRecettesFondFromCache() {
  const { data, error } = await supabase
    .from("nc_recettes")
    .select("*")
    .order("depot_timestamp", { ascending: false });

  if (error) {
    console.warn("[supabase-cache] getRecettesFond error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  return { ok: true, rows: data, count: data.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET KPI STOCK — depuis nc_kpi_stock (calculé par BigQuery)
// ═══════════════════════════════════════════════════════════════════
export async function getKpiStockFromCache() {
  const { data, error } = await supabase
    .from("nc_kpi_stock")
    .select("*")
    .order("score_urgence", { ascending: false });

  if (error) {
    console.warn("[supabase-cache] getKpiStock error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  // Remap achetee (string "TRUE"/"") → Achetee (bool) attendu par la page
  const rows = data.map(r => ({ ...r, Achetee: r.achetee === "TRUE" }));
  return { ok: true, rows, count: rows.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET KPI JAMAIS VENDUS — depuis nc_kpi_jamais_vendus
// ═══════════════════════════════════════════════════════════════════
export async function getKpiJamaisVendusFromCache() {
  const { data, error } = await supabase
    .from("nc_kpi_jamais_vendus")
    .select("*")
    .order("valeur_stock", { ascending: false });

  if (error) {
    console.warn("[supabase-cache] getKpiJamaisVendus error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  return { ok: true, rows: data, count: data.length };
}

// ═══════════════════════════════════════════════════════════════════
//  GET PO LINES — depuis nc_po_lines
// ═══════════════════════════════════════════════════════════════════
export async function getPOLinesFromCache() {
  const { data, error } = await supabase
    .from("nc_po_lines")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[supabase-cache] getPOLines error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  return { ok: true, rows: data, count: data.length };
}
