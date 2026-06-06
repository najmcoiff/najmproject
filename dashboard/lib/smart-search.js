/**
 * smart-search.js — Recherche intelligente client-side pour le dashboard
 *
 * Niveaux :
 * 1. Multi-tokens AND : chaque mot doit matcher au moins un champ
 * 2. Fuzzy mot-par-mot (trigrammes JS) : "gilette" → "gillette"
 * 3. Scoring : exact substring sur champ "principal" > exact autre > fuzzy
 * 4. Threshold adaptatif : durcit à 0.7 quand > 100 résultats fuzzy
 *
 * Correction critique : comparaison MOT PAR MOT (word_similarity de
 * pg_trgm) pour éviter les faux positifs sur de longues chaînes
 * (collections_titles type "Smart Products Filter Index").
 */

// ─── Trigrammes / similarité ───────────────────────────────────────

function trigrams(str) {
  const s = `  ${str}  `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
  return set;
}

function wordSimilarity(a, b) {
  const tgA = trigrams(a);
  const tgB = trigrams(b);
  if (tgA.size === 0 || tgB.size === 0) return 0;
  let common = 0;
  for (const t of tgA) if (tgB.has(t)) common++;
  return common / Math.max(tgA.size, tgB.size);
}

function fieldWords(field) {
  return field
    .split(/[^a-z0-9àâäéèêëîïôùûüçñ]+/i)
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 2);
}

// ─── Match boolean (compat ascendante) ─────────────────────────────

function tokenMatchesField(token, field, threshold = 0.55) {
  if (!field) return false;
  const t = token.toLowerCase();
  const f = field.toLowerCase();
  if (f.includes(t)) return true;
  return fieldWords(f).some(word => wordSimilarity(t, word) >= threshold);
}

/**
 * Match boolean (kept for backward compat).
 * Préférer smartScore() pour avoir le tri par pertinence.
 */
export function smartMatch(query, fields, threshold = 0.55) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const normalizedFields = fields.map(f => String(f || "").toLowerCase());
  return tokens.every(token =>
    normalizedFields.some(field => tokenMatchesField(token, field, threshold))
  );
}

export function smartFilter(items, query, getFields, threshold = 0.55) {
  if (!query || !query.trim()) return items;
  return items.filter(item => smartMatch(query, getFields(item), threshold));
}

// ─── Scoring ──────────────────────────────────────────────────────

/**
 * Score un token sur un champ.
 * Renvoie 0 si pas de match. Sinon :
 *   - 100 : exact substring (entier ou partiel)
 *   - 50..99 : similarité trigramme * 100 (sur le meilleur mot du champ)
 *
 * @returns {number} 0..100
 */
function tokenScoreOnField(token, field, threshold) {
  if (!field) return 0;
  const t = token.toLowerCase();
  const f = field.toLowerCase();
  if (f.includes(t)) return 100;
  let best = 0;
  for (const word of fieldWords(f)) {
    const s = wordSimilarity(t, word);
    if (s > best) best = s;
  }
  return best >= threshold ? Math.round(best * 100) : 0;
}

/**
 * Score global d'un item pour une query.
 *
 * Stratégie :
 *   - tableau `fields` est ordonné par importance (premier = display_name ou
 *     équivalent "titre affiché"). Les champs en tête ont un poids supérieur.
 *   - chaque token contribue à la note finale ; un token sans aucun match
 *     remet le score à 0 (AND multi-token strict).
 *
 * @param {string}   query
 * @param {string[]} fields    — ordonnés par importance (display_name d'abord)
 * @param {number}   threshold — seuil fuzzy
 * @returns {{ score: number, matchedFieldIndices: number[] }}
 *          score 0..1000+ ; matchedFieldIndices = index des champs qui ont
 *          permis le match (utile pour décider quel titre afficher)
 */
export function smartScore(query, fields, threshold = 0.55) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { score: 1, matchedFieldIndices: [] };

  // Boost décroissant : champ 0 = display_name × 3, champ 1 = × 2, autres × 1
  const fieldBoost = fields.map((_, i) => (i === 0 ? 3 : i === 1 ? 2 : 1));
  let total = 0;
  const matchedIdx = new Set();

  for (const token of tokens) {
    let bestForToken = 0;
    let bestIdx = -1;
    for (let i = 0; i < fields.length; i++) {
      const f = String(fields[i] || "");
      const s = tokenScoreOnField(token, f, threshold) * fieldBoost[i];
      if (s > bestForToken) { bestForToken = s; bestIdx = i; }
    }
    if (bestForToken === 0) return { score: 0, matchedFieldIndices: [] };
    total += bestForToken;
    if (bestIdx >= 0) matchedIdx.add(bestIdx);
  }
  return { score: total, matchedFieldIndices: Array.from(matchedIdx) };
}

// ─── Filter adaptatif (threshold durcit si trop de bruit) ─────────

/**
 * Filtre + trie par score décroissant. Si le seuil 0.55 produit > 100
 * résultats, ré-applique avec 0.7 pour éliminer le bruit fuzzy.
 *
 * @param {any[]}    items
 * @param {string}   query
 * @param {function} getFields — (item) => string[] champs ordonnés par importance
 * @returns {Array<{ item: any, score: number, matchedFieldIndices: number[] }>}
 *          trié par score décroissant
 */
export function smartFilterAdaptive(items, query, getFields) {
  if (!query || !query.trim()) return items.map(item => ({ item, score: 0, matchedFieldIndices: [] }));

  const scoreAll = (threshold) =>
    items
      .map(item => {
        const r = smartScore(query, getFields(item), threshold);
        return { item, score: r.score, matchedFieldIndices: r.matchedFieldIndices };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);

  let results = scoreAll(0.55);
  if (results.length > 100) results = scoreAll(0.7);
  return results;
}
