// ═══════════════════════════════════════════════════════════════════════════════
//  🌎 MODIFIER LES ARTICLES D'UNE COMMANDE SHOPIFY (S7 — 0 Sheets)
//  Stratégie : Recréation via Draft Order
//  Appelé par _modifyOrder_() dans 🌐DASHBOARD API.js
// ═══════════════════════════════════════════════════════════════════════════════

const MODIFY_V2_STORE_SLUG = '8fc262';

// ── Utilitaires purs ─────────────────────────────────────────────

function toOrderGid_(id) {
  const s = String(id || '').trim();
  if (s.startsWith('gid://shopify/Order/')) return s;
  if (/^\d+$/.test(s)) return 'gid://shopify/Order/' + s;
  return s;
}

function toVariantGid_(id) {
  const s = String(id || '').trim();
  if (s.startsWith('gid://shopify/ProductVariant/')) return s;
  if (/^\d+$/.test(s)) return 'gid://shopify/ProductVariant/' + s;
  return '';
}

function normalizeOrderId_(id) {
  const m = String(id || '').match(/gid:\/\/shopify\/Order\/(\d+)/);
  return m ? m[1] : String(id || '');
}

function normalizeVariantId_(id) {
  const m = String(id || '').match(/gid:\/\/shopify\/ProductVariant\/(\d+)/);
  return m ? m[1] : String(id || '');
}

function extractImageUrl_(variant) {
  if (!variant) return '';
  if (variant.image && variant.image.url) return variant.image.url;
  if (variant.product && variant.product.featuredImage && variant.product.featuredImage.url) return variant.product.featuredImage.url;
  if (variant.product && variant.product.images && variant.product.images.edges && variant.product.images.edges[0]) {
    return variant.product.images.edges[0].node.url || '';
  }
  return '';
}

function buildShopifyAdminUrl_(orderId) {
  return 'https://admin.shopify.com/store/' + MODIFY_V2_STORE_SLUG + '/orders/' + normalizeOrderId_(orderId);
}

// ── Shopify GraphQL ───────────────────────────────────────────────

function callShopifyGraphQL_(query, variables) {
  var domain  = '8fc262.myshopify.com';
  var version = '2025-01';
  var token   = 'REDACTED_LEGACY_TOKEN';
  var url = 'https://' + domain + '/admin/api/' + version + '/graphql.json';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Shopify-Access-Token': token },
    payload: JSON.stringify({ query: query, variables: variables }),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var raw  = res.getContentText();
  var json;
  try { json = JSON.parse(raw); } catch (e) {
    throw new Error('Réponse Shopify non-JSON (HTTP ' + code + ')');
  }
  var errors = json.errors || [];
  var data   = json.data || null;
  return {
    ok: code >= 200 && code < 300 && errors.length === 0,
    data: data,
    errors: errors,
    userErrors: (data && data.userErrors) || [],
    raw: raw,
  };
}

// ── Vérification éditabilité ─────────────────────────────────────

function MODIFY_V2_CAN_ORDER_EDIT(orderGid) {
  var id = toOrderGid_(orderGid);
  if (!id) throw new Error('Identifiant de commande requis');
  var query = '\
    query ($id: ID!) {\
      order(id: $id) {\
        merchantEditable\
        merchantEditableErrors\
        app { id name }\
        tags\
      }\
    }';
  var res = callShopifyGraphQL_(query, { id: id });
  var ord = (res && res.data && res.data.order) || {};
  var canEdit = true;
  var reason  = '';
  if (ord.merchantEditable === false) { canEdit = false; reason = 'VERROUILLAGE_APPLICATION'; }
  return { canEdit: canEdit, reason: reason, appName: (ord.app && ord.app.name) || '', errors: ord.merchantEditableErrors || [] };
}

// ── Récupération commande originale ──────────────────────────────

function fetchOriginalOrder_(orderId, runId) {
  var orderNum = normalizeOrderId_(orderId);
  var fetchQuery = '\
    query ($id: ID!) {\
      order(id: $id) {\
        customer { id }\
        shippingAddress {\
          firstName lastName address1 address2 city country\
          province zip phone company provinceCode countryCodeV2\
        }\
        billingAddress {\
          firstName lastName address1 address2 city country\
          province zip phone company\
        }\
        note\
        tags\
        shippingLines(first: 10) {\
          edges { node { title code price } }\
        }\
        lineItems(first: 250) {\
          edges {\
            node {\
              variant {\
                id\
                image { url }\
                product {\
                  featuredImage { url }\
                  images(first: 1) { edges { node { url } } }\
                }\
              }\
              quantity\
            }\
          }\
        }\
      }\
    }';
  var t0  = Date.now();
  var res = callShopifyGraphQL_(fetchQuery, { id: orderId });
  var durationMs = Date.now() - t0;
  if (res.errors && res.errors.length) {
    logModify_({ action: 'RECUPERATION_COMMANDE_ORIGINALE', objet_id: orderId, result: 'ECHEC', severity: 'CRITICAL',
      valeur_txt: 'Impossible de récupérer la commande ' + orderNum + ' après ' + durationMs + 'ms', duration_ms: durationMs, correlation_id: runId, session_id: runId });
    throw new Error('Erreur lors de la récupération de la commande ' + orderNum);
  }
  var ord = (res.data && res.data.order) || {};
  logModify_({ action: 'RECUPERATION_COMMANDE_ORIGINALE', objet_id: orderId, result: 'SUCCES', severity: 'INFO',
    valeur_txt: 'Commande ' + orderNum + ' récupérée en ' + durationMs + 'ms', duration_ms: durationMs, correlation_id: runId, session_id: runId });
  return ord;
}

// ── Création Draft Order ──────────────────────────────────────────

function createDraftOrder_(ord, lineItemsInput, orderId, runId) {
  var orderNum = normalizeOrderId_(orderId);
  var shippingEdges = (ord.shippingLines && ord.shippingLines.edges) || [];
  var shippingLineInput = null;
  if (shippingEdges.length) {
    var s = shippingEdges[0].node || {};
    shippingLineInput = { title: s.title || '', price: typeof s.price !== 'undefined' ? Number(s.price) : 0 };
  }
  var draftInput = {
    customerId: (ord.customer && ord.customer.id) || null,
    shippingAddress: ord.shippingAddress ? {
      firstName:   ord.shippingAddress.firstName || '',
      lastName:    ord.shippingAddress.lastName || '',
      address1:    ord.shippingAddress.address1 || '',
      address2:    'WILAYA:' + (ord.shippingAddress.province || ''),
      city:        ord.shippingAddress.city || '',
      countryCode: ord.shippingAddress.countryCodeV2 || 'DZ',
      zip:         ord.shippingAddress.zip || '',
      phone:       ord.shippingAddress.phone || '',
    } : null,
    billingAddress: ord.billingAddress || null,
    email: null,
    note: ord.note || null,
    tags: ord.tags || null,
    shippingLine: shippingLineInput || undefined,
    lineItems: lineItemsInput,
  };
  var draftCreateMutation = '\
    mutation ($input: DraftOrderInput!) {\
      draftOrderCreate(input: $input) {\
        draftOrder { id }\
        userErrors { field message }\
      }\
    }';
  var t0  = Date.now();
  var res = callShopifyGraphQL_(draftCreateMutation, { input: draftInput });
  var durationMs = Date.now() - t0;
  var draftData = (res.data && res.data.draftOrderCreate) || {};
  if (draftData.userErrors && draftData.userErrors.length) {
    var errs = draftData.userErrors;
    logModify_({ action: 'CREATION_BROUILLON', objet_id: orderId, result: 'ECHEC', severity: 'CRITICAL',
      valeur_txt: 'Échec brouillon ' + orderNum + ': ' + errs.map(function(e) { return e.message; }).join(' | '),
      duration_ms: durationMs, correlation_id: runId, session_id: runId });
    throw new Error('Erreur draftOrderCreate : ' + JSON.stringify(errs));
  }
  var draftId = (draftData.draftOrder && draftData.draftOrder.id) || '';
  if (!draftId) throw new Error('Identifiant du brouillon manquant dans la réponse');
  logModify_({ action: 'CREATION_BROUILLON', objet_id: draftId, result: 'SUCCES', severity: 'INFO',
    valeur_txt: 'Brouillon ' + draftId + ' créé en ' + durationMs + 'ms (' + lineItemsInput.length + ' articles)',
    duration_ms: durationMs, correlation_id: runId, session_id: runId });
  return draftId;
}

// ── Finalisation Draft Order → Commande réelle ───────────────────

function completeDraftOrder_(draftId, orderId, runId) {
  var orderNum = normalizeOrderId_(orderId);
  var draftCompleteMutation = '\
    mutation ($id: ID!) {\
      draftOrderComplete(id: $id, paymentPending: true) {\
        draftOrder { order { id } }\
        userErrors { field message }\
      }\
    }';
  var t0  = Date.now();
  var res = callShopifyGraphQL_(draftCompleteMutation, { id: draftId });
  var durationMs = Date.now() - t0;
  var completeData = (res.data && res.data.draftOrderComplete) || {};
  if (completeData.userErrors && completeData.userErrors.length) {
    var errs = completeData.userErrors;
    logModify_({ action: 'FINALISATION_BROUILLON', objet_id: draftId, result: 'ECHEC', severity: 'CRITICAL',
      valeur_txt: 'Échec finalisation ' + draftId + ': ' + errs.map(function(e) { return e.message; }).join(' | '),
      duration_ms: durationMs, correlation_id: runId, session_id: runId });
    throw new Error('Erreur draftOrderComplete : ' + JSON.stringify(errs));
  }
  var newOrderId = (completeData.draftOrder && completeData.draftOrder.order && completeData.draftOrder.order.id) || '';
  if (!newOrderId) throw new Error('Identifiant de la nouvelle commande manquant après finalisation');
  logModify_({ action: 'FINALISATION_BROUILLON', objet_id: newOrderId, result: 'SUCCES', severity: 'INFO',
    valeur_txt: 'Nouvelle commande ' + normalizeOrderId_(newOrderId) + ' créée en ' + durationMs + 'ms (remplace ' + orderNum + ')',
    duration_ms: durationMs, meta_1: 'newOrderId=' + normalizeOrderId_(newOrderId),
    meta_2: buildShopifyAdminUrl_(newOrderId), correlation_id: runId, session_id: runId });
  return newOrderId;
}

// ── Annulation ancienne commande ─────────────────────────────────

function cancelOldOrder_(oldOrderId, runId) {
  var orderNum = normalizeOrderId_(oldOrderId);
  var gid = toOrderGid_(oldOrderId);
  var cancelMutation = '\
    mutation ($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!, $notifyCustomer: Boolean!) {\
      orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock, notifyCustomer: $notifyCustomer) {\
        userErrors { field message }\
      }\
    }';
  var t0  = Date.now();
  var res = callShopifyGraphQL_(cancelMutation, { orderId: gid, reason: 'OTHER', refund: false, restock: true, notifyCustomer: false });
  var durationMs = Date.now() - t0;
  if (res.errors && res.errors.length) throw new Error('Erreur GraphQL annulation ' + orderNum);
  var cancelErrors = (res.data && res.data.orderCancel && res.data.orderCancel.userErrors) || [];
  if (cancelErrors.length) {
    var alreadyCanceled = cancelErrors.some(function(e) { return e && e.message === 'Cannot cancel an order that has already been canceled'; });
    var hasFulfillments = cancelErrors.some(function(e) { return e && e.message && e.message.indexOf('outstanding fulfillments') >= 0; });
    if (alreadyCanceled) {
      logModify_({ action: 'ANNULATION_ANCIENNE_COMMANDE', objet_id: oldOrderId, result: 'DEJA_FAIT', severity: 'WARNING',
        valeur_txt: 'Commande ' + orderNum + ' était déjà annulée', duration_ms: durationMs, correlation_id: runId, session_id: runId });
    } else if (hasFulfillments) {
      logModify_({ action: 'ANNULATION_ANCIENNE_COMMANDE', objet_id: oldOrderId, result: 'FULFILLMENT_ACTIF', severity: 'WARNING',
        valeur_txt: 'Commande ' + orderNum + ' a des expéditions actives — annulation manuelle requise dans Shopify', duration_ms: durationMs, correlation_id: runId, session_id: runId });
    } else {
      throw new Error('Erreur annulation ' + orderNum + ': ' + cancelErrors.map(function(e) { return e.message; }).join(' | '));
    }
  } else {
    logModify_({ action: 'ANNULATION_ANCIENNE_COMMANDE', objet_id: oldOrderId, result: 'SUCCES', severity: 'INFO',
      valeur_txt: 'Commande ' + orderNum + ' annulée en ' + durationMs + 'ms (restock activé)',
      duration_ms: durationMs, correlation_id: runId, session_id: runId });
  }
}

// ── Vérification livraison nouvelle commande ─────────────────────

function verifyNewOrderShipping_(newOrderId, runId) {
  if (!newOrderId) return;
  var orderNum = normalizeOrderId_(newOrderId);
  var query = '\
    query ($id: ID!) {\
      order(id: $id) {\
        shippingLines(first: 10) { edges { node { title code price } } }\
        totalShippingPriceSet { shopMoney { amount currencyCode } }\
      }\
    }';
  var t0  = Date.now();
  var res = callShopifyGraphQL_(query, { id: newOrderId });
  var durationMs = Date.now() - t0;
  var order = (res.data && res.data.order) || {};
  var shippingLines = (order.shippingLines && order.shippingLines.edges) || [];
  var totalShipping = (order.totalShippingPriceSet && order.totalShippingPriceSet.shopMoney) || {};
  logModify_({ action: 'VERIFICATION_LIVRAISON', objet_id: newOrderId, result: 'SUCCES', severity: 'INFO',
    valeur_txt: 'Commande ' + orderNum + ' — ' + shippingLines.length + ' ligne(s) livraison — total: ' + (totalShipping.amount || '0') + ' ' + (totalShipping.currencyCode || 'DZD'),
    duration_ms: durationMs, correlation_id: runId, session_id: runId });
}

// ── Mise à jour nc_orders après modification ─────────────────────

function updateOrdersV2Statuses_afterModify_(oldOrderId, newOrderId) {
  var oldNum = (String(oldOrderId || '').match(/(\d{6,})$/) || [])[1] || String(oldOrderId || '').trim();
  if (!oldNum) return;
  try {
    UrlFetchApp.fetch(SB_URL_ + '/rest/v1/nc_orders?order_id=eq.' + encodeURIComponent(oldNum), {
      method: 'PATCH',
      contentType: 'application/json',
      headers: { 'apikey': SB_KEY_, 'Authorization': 'Bearer ' + SB_KEY_, 'Prefer': 'return=minimal' },
      payload: JSON.stringify({ confirmation_status: 'annulé', cancellation_reason: 'doublon',
                                 decision_status: 'annuler', contact_status: 'joignable' }),
      muteHttpExceptions: true,
    });
    Logger.log('updateOrdersV2Statuses_afterModify_ OK order=%s', oldNum);
  } catch (e) {
    Logger.log('updateOrdersV2Statuses_afterModify_ ERROR: %s', String(e && e.message ? e.message : e));
  }
}

// ── Log → nc_events ──────────────────────────────────────────────

function logModify_(obj) {
  try {
    var now = new Date().toISOString();
    var merged = { event_id: Utilities.getUuid(), log_type: 'MODIFY_V2', actor_type: 'user', objet_type: 'order', ts: now, source: 'GAS' };
    if (obj) Object.keys(obj).forEach(function(k) { merged[k] = obj[k]; });
    var eventRow = {
      ts: now, log_type: 'MODIFY_V2', source: 'GAS',
      actor:    merged.actor_type || 'GAS',
      order_id: merged.objet_id   || null,
      action:   merged.action     || null,
      note:     merged.valeur_txt || null,
      extra:    JSON.stringify({ result: merged.result, severity: merged.severity, duration_ms: merged.duration_ms }),
      nouveau_statut: merged.result || null,
    };
    UrlFetchApp.fetch(SB_URL_ + '/rest/v1/nc_events', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'apikey': SB_KEY_, 'Authorization': 'Bearer ' + SB_KEY_, 'Prefer': 'return=minimal' },
      payload: JSON.stringify(eventRow),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('logModify_ ERROR: %s', String(e && e.message ? e.message : e));
  }
  if (obj && (obj.action === 'BTN_APPLY_TERMINEE' || obj.action === 'MODIFY_SUCCESS' || obj.action === 'DASHBOARD_MODIFY_SUCCES')) {
    try {
      var newIdExtra = obj.meta_1 ? String(obj.meta_1).replace('newOrderId=', '') : null;
      _logModifyV2_(obj.objet_id || null, newIdExtra, obj.actor_type || null);
    } catch (_) {}
  }
}
