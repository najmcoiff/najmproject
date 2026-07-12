// lib/ambassadeur.js
// Cœur du programme « Ambassadeur NajmCoiff ».
//
// Rôles :
//  - normPhone      : clé de matching téléphone (9 derniers chiffres, formats variés)
//  - computeMargin  : marge réelle d'un panier (INTERNE — jamais renvoyée au client)
//  - resolveCode    : retrouve un ambassadeur actif par son code
//  - resolveParrain : retrouve le parrain d'un numéro (attribution gravée en base)
//  - commissionFor  : applique la grille d'argent (plancher NajmCoiff 40 %)
//
// ⚠️ La marge = ton coût d'achat déguisé. On ne la renvoie JAMAIS côté client ni coiffeur.
//    Seul `montant_da` (ce que gagne l'ambassadeur) est affiché.

export const normPhone = (p) => String(p || "").replace(/\D/g, "").slice(-9);

// ── Marge réelle du panier ─────────────────────────────────────────────────
// Coût par variant : Source 1 nc_po_lines.purchase_price (le plus récent),
// Source 2 nc_variants.cost_price (fallback). Coût inconnu → marge 0 sur l'article
// (on ne surestime jamais la marge → on ne sur-rémunère jamais).
export async function computeMargin(sb, items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return { marge: 0, costs: {} };

  const variantIds = [...new Set(list.map((i) => i.variant_id).filter(Boolean))];
  const costs = {};

  // Source 1 — nc_po_lines (DESC = plus récent d'abord)
  const { data: poLines } = await sb
    .from("nc_po_lines")
    .select("variant_id, purchase_price, created_at")
    .in("variant_id", variantIds)
    .order("created_at", { ascending: false });

  for (const line of poLines || []) {
    if (!(line.variant_id in costs) && line.purchase_price != null) {
      costs[line.variant_id] = Number(line.purchase_price);
    }
  }

  // Source 2 — nc_variants.cost_price pour les manquants
  const missing = variantIds.filter((id) => !(id in costs));
  if (missing.length > 0) {
    const { data: ncVariants } = await sb
      .from("nc_variants")
      .select("variant_id, cost_price")
      .in("variant_id", missing);
    for (const v of ncVariants || []) {
      if (v.cost_price != null && Number(v.cost_price) > 0) {
        costs[String(v.variant_id)] = Number(v.cost_price);
      }
    }
  }

  const marge = list.reduce((sum, item) => {
    const cost = costs[item.variant_id];
    if (cost == null) return sum;                 // coût inconnu → 0
    const unit = Number(item.price) - Number(cost);
    if (unit <= 0) return sum;
    return sum + unit * Number(item.qty || 1);
  }, 0);

  return { marge: Math.max(0, Math.round(marge)), costs };
}

// ── Résolution d'un code ambassadeur ───────────────────────────────────────
export async function resolveCode(sb, rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return null;
  const { data } = await sb
    .from("nc_ambassadeurs")
    .select("code, phone, full_name, type, grade, parrain_phone, actif, cagnotte_da, cagnotte_attente_da")
    .ilike("code", code)
    .eq("actif", true)
    .maybeSingle();
  return data || null;
}

// ── Attribution déjà gravée pour un numéro (le parrain à vie) ───────────────
export async function resolveParrain(sb, phone) {
  const key = normPhone(phone);
  if (key.length < 9) return null;
  const { data } = await sb
    .from("nc_ambassadeur_liens")
    .select("ambassadeur_code, ambassadeur_phone, filleul_type")
    .eq("filleul_phone", key)
    .maybeSingle();
  return data || null;
}

// ── Grille d'argent — plancher NajmCoiff 40 %, rente protégée ──────────────
// Retourne les DA à créditer à l'ambassadeur (et au parrain le cas échéant),
// selon le scénario. Ne renvoie JAMAIS la marge au-delà de ce module.
//
// scenario :
//  '2_vente_directe'      client via code coiffeur (1ʳᵉ)      → coiffeur 50 %
//  '3_rente_sans_code'    client rachète sans code            → parrain 20 %
//  '4_rente_ambassadeur'  ambassadeur-client via son code     → parrain 20 % (client a sa remise 40 %)
//  '1b_coiffeur_recrute'  coiffeur recruté achète pour lui    → coiffeur 40 % + parrain 20 %
const TAUX = {
  "2_vente_directe":     { self: 0.50, parrain: 0 },
  "3_rente_sans_code":   { self: 0,    parrain: 0.20 },
  "4_rente_ambassadeur": { self: 0,    parrain: 0.20 },
  "1b_coiffeur_recrute": { self: 0.40, parrain: 0.20 },
};

const FLOOR_NAJM = 0.40; // tu gardes toujours au moins 40 % de la marge

export function commissionFor(scenario, marge, { hasParrain = false } = {}) {
  const t = TAUX[scenario];
  if (!t || marge <= 0) return { self_da: 0, parrain_da: 0, taux_self: 0, taux_parrain: 0 };

  let selfPct = t.self;
  let parrainPct = hasParrain ? t.parrain : 0;

  // Plancher : si le total distribué dépasse 60 %, on rabote la REMISE PERSO
  // (jamais la rente, qui est le moteur de croissance).
  const distributable = 1 - FLOOR_NAJM; // 0.60
  if (selfPct + parrainPct > distributable) {
    selfPct = Math.max(0, distributable - parrainPct);
  }

  return {
    self_da:     Math.round(marge * selfPct),
    parrain_da:  Math.round(marge * parrainPct),
    taux_self:    selfPct,
    taux_parrain: parrainPct,
  };
}
