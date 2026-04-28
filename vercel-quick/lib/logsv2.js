/**
 * lib/logsv2.js
 * Écriture vers nc_events (Supabase) — nouvelle table d'analyse sur mesure.
 * Toutes les fonctions sont fire-and-forget (non-bloquantes pour l'UX).
 *
 * Mapping colonnes nc_events :
 *   event_id, ts, log_type, source, actor,
 *   order_id, variant_id, tracking,
 *   ancien_statut, nouveau_statut,
 *   qty, montant, label, note, extra, created_at
 */

// ── Écriture brute vers /api/log (route serveur — bypasse RLS Supabase) ───────
async function _write(row) {
  try {
    await fetch('/api/log', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(row),
    });
  } catch (_) {
    // fire-and-forget — ne jamais bloquer l'UI
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LOG TYPES — une fonction par type métier
// ════════════════════════════════════════════════════════════════════════════

/**
 * UPDATE_CONFIRMATION_STATUS
 * Agent change le statut de confirmation d'une commande.
 * @param {string} agent
 * @param {string} orderId
 * @param {string} ancienStatut
 * @param {string} nouveauStatut
 * @param {string} contactStatus  "joignable" / "injoignable..." (optionnel)
 * @param {string} cancelReason   motif annulation si nouveauStatut='annuler' (optionnel)
 */
export function logConfirmationStatus(agent, orderId, ancienStatut, nouveauStatut, contactStatus, cancelReason) {
  const extra = {};
  if (contactStatus) extra.contact_status = contactStatus;
  if (cancelReason)  extra.cancel_reason  = cancelReason;
  _write({
    log_type:       'UPDATE_CONFIRMATION_STATUS',
    actor:          agent,
    order_id:       orderId,
    ancien_statut:  ancienStatut  || null,
    nouveau_statut: nouveauStatut || null,
    extra:          Object.keys(extra).length ? extra : null,
  });
}

/**
 * UPDATE_PREPARATION_STATUS
 * Agent change le statut de préparation d'une commande.
 */
export function logPreparationStatus(agent, orderId, ancienStatut, nouveauStatut) {
  _write({
    log_type:       'UPDATE_PREPARATION_STATUS',
    actor:          agent,
    order_id:       orderId,
    ancien_statut:  ancienStatut  || null,
    nouveau_statut: nouveauStatut || null,
  });
}

/**
 * BARRAGE
 * Article entré en zone barrage (stock critique ≤ 4 unités).
 * Loggé par le moteur barrage GAS — cette fonction sert de fallback Next.js.
 */
export function logEnterBarrage(variantId, nomArticle, qty) {
  _write({
    log_type:       'BARRAGE',
    actor:          'BARRAGE_ENGINE',
    variant_id:     variantId,
    nouveau_statut: 'IN_BARRAGE',
    qty:            qty != null ? Number(qty) : null,
    label:          nomArticle,
  });
}

/**
 * EXIT_BARRAGE  (nouveau)
 * Article sorti du barrage après validation de la correction de stock.
 * Déclenché quand l'agent valide les corrections → Shopify.
 */
export function logExitBarrage(agent, variantId, nomArticle, nouveauStock) {
  _write({
    log_type:       'EXIT_BARRAGE',
    actor:          agent,
    variant_id:     variantId,
    ancien_statut:  'IN_BARRAGE',
    nouveau_statut: 'OUT_BARRAGE',
    qty:            nouveauStock != null ? Number(nouveauStock) : null,
    label:          nomArticle,
  });
}

/**
 * CORRECTION_BARRAGE
 * Agent définit un stock cible pour un article en barrage (draft avant validation).
 */
export function logCorrectionBarrage(agent, variantId, nomArticle, ancienStock, nouveauStock) {
  _write({
    log_type:       'CORRECTION_BARRAGE',
    actor:          agent,
    variant_id:     variantId,
    ancien_statut:  ancienStock  != null ? String(ancienStock)  : null,
    nouveau_statut: nouveauStock != null ? String(nouveauStock) : null,
    qty:            nouveauStock != null ? Number(nouveauStock) : null,
    label:          nomArticle,
  });
}

/**
 * NOTE_BARRAGE
 * Agent ajoute ou modifie une note sur un article en barrage.
 */
export function logNoteBarrage(agent, variantId, nomArticle, note) {
  _write({
    log_type:   'NOTE_BARRAGE',
    actor:      agent,
    variant_id: variantId,
    label:      nomArticle,
    note:       note || null,
  });
}

/**
 * ACTION_SUIVI
 * Agent ajoute une note de suivi sur un colis ZRExpress.
 */
export function logActionSuivi(agent, orderId, tracking, action, note) {
  _write({
    log_type:       'ACTION_SUIVI',
    actor:          agent,
    order_id:       orderId  || null,
    tracking:       tracking || null,
    nouveau_statut: action   || null,
    note:           note     || null,
  });
}

/**
 * AGENT_CLICK_BUTTON
 * Agent clique un bouton d'action métier important.
 */
export function logAgentButton(agent, actionName, context) {
  _write({
    log_type: 'AGENT_CLICK_BUTTON',
    actor:    agent,
    note:     actionName,
    extra:    context ? { context } : null,
  });
}

/**
 * MODIFY_ORDER
 * Agent modifie les articles d'une commande (recréation Shopify).
 * @param {string} agent
 * @param {string} oldOrderId   Ancienne commande annulée
 * @param {string} newOrderId   Nouvelle commande créée
 */
export function logModifyOrder(agent, oldOrderId, newOrderId) {
  _write({
    log_type:       'MODIFY_ORDER',
    actor:          agent,
    order_id:       oldOrderId  || null,
    ancien_statut:  oldOrderId  || null,
    nouveau_statut: newOrderId  || null,
    note:           newOrderId ? `Nouvelle commande : ${newOrderId}` : null,
  });
}

/**
 * ENTER RAPPORT
 * Agent crée un rapport (problème produit, caisse, incident, suggestion...).
 * @param {number|null} montant  Montant DZD pour les rapports caisse (CAISSE_OPERATION)
 */
export function logRapport(agent, produit, typeRapport, note, orderId, montant) {
  _write({
    log_type:  'ENTER RAPPORT',
    actor:     agent,
    order_id:  orderId  || null,
    montant:   montant != null ? Number(montant) : null,
    label:     produit  || null,
    note:      note     || null,
    extra:     typeRapport ? { category: typeRapport } : null,
  });
}
