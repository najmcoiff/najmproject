/**
 * smart-search.js — Recherche intelligente client-side pour le dashboard
 *
 * Deux niveaux d'intelligence :
 * 1. Multi-tokens AND : chaque mot doit matcher au moins un champ
 * 2. Fuzzy mot-par-mot (trigrammes JS) : "gilette" → "gillette", "bandidu" → "bandido"
 *
 * Correction critique : comparaison MOT PAR MOT (word_similarity réel de pg_trgm),
 * pas sur la chaîne entière — évite les faux positifs dus à de longues chaînes
 * (ex: "Smart Products Filter Index - Do not delete" en collections_titles).
 */

/**
 * Calcule les trigrammes d'une chaîne.
 * @param {string} str
 * @returns {Set<string>}
 */
function trigrams(str) {
  const s = `  ${str}  `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i++) {
    set.add(s.slice(i, i + 3));
  }
  return set;
}

/**
 * Similarité trigramme entre deux mots courts.
 * Score = |intersection| / max(|trigrams(a)|, |trigrams(b)|)
 * (correspond à similarity() de pg_trgm sur deux mots)
 *
 * @param {string} a — mot token (ex: "gilette")
 * @param {string} b — mot cible (ex: "gillette")
 * @returns {number} 0..1
 */
function wordSimilarity(a, b) {
  const tgA = trigrams(a);
  const tgB = trigrams(b);
  if (tgA.size === 0 || tgB.size === 0) return 0;
  let common = 0;
  for (const t of tgA) {
    if (tgB.has(t)) common++;
  }
  return common / Math.max(tgA.size, tgB.size);
}

/**
 * Découpe un champ en mots individuels pour la comparaison fuzzy mot par mot.
 * Analogue au comportement de pg_trgm word_similarity(token, text).
 */
function fieldWords(field) {
  return field
    .split(/[^a-z0-9àâäéèêëîïôùûüçñ]+/i)
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 2);
}

/**
 * Vérifie si un token correspond à un champ (exact substring OU fuzzy mot-par-mot).
 *
 * L'approche MOT PAR MOT est essentielle pour éviter les faux positifs :
 * "gillette" ne doit PAS matcher "Smart Products Filter Index - Do not delete"
 * même si la chaîne entière contient les trigrammes "let", "te ", "e  ".
 *
 * @param {string} token   — mot cherché (ex: "gilette")
 * @param {string} field   — champ normalisé lowercase (ex: "lame gillette bleu")
 * @param {number} threshold — seuil de similarité (0.55 = bon équilibre)
 */
function tokenMatchesField(token, field, threshold = 0.55) {
  if (!field) return false;
  const t = token.toLowerCase();
  const f = field.toLowerCase();
  // 1. Correspondance exacte (substring) — toujours vérifiée en premier
  if (f.includes(t)) return true;
  // 2. Fuzzy MOT PAR MOT (comme pg_trgm word_similarity) — évite les faux positifs
  //    Chaque mot du champ est comparé séparément au token
  return fieldWords(f).some(word => wordSimilarity(t, word) >= threshold);
}

/**
 * Recherche intelligente multi-tokens + multi-champs + fuzzy mot-par-mot.
 *
 * Chaque mot de la requête doit matcher au moins un des champs fournis
 * (exact substring OU similarité trigramme ≥ threshold sur un mot du champ).
 *
 * @param {string}   query     — texte saisi par l'utilisateur
 * @param {string[]} fields    — tableau de valeurs à chercher (ex: [v.display_name, v.vendor, v.sku])
 * @param {number}   [threshold=0.55] — seuil fuzzy
 * @returns {boolean}
 */
export function smartMatch(query, fields, threshold = 0.55) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const normalizedFields = fields.map(f => String(f || '').toLowerCase());
  // Chaque token doit matcher au moins un champ (AND entre tokens, OR entre champs)
  return tokens.every(token =>
    normalizedFields.some(field => tokenMatchesField(token, field, threshold))
  );
}

/**
 * Filtre un tableau d'items avec smartMatch.
 * @param {any[]}  items      — liste à filtrer
 * @param {string} query      — requête utilisateur
 * @param {function} getFields — (item) => string[] des champs à chercher
 * @param {number} [threshold=0.55]
 * @returns {any[]}
 */
export function smartFilter(items, query, getFields, threshold = 0.55) {
  if (!query || !query.trim()) return items;
  return items.filter(item => smartMatch(query, getFields(item), threshold));
}
