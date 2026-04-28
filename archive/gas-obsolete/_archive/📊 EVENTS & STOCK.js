// ╔══════════════════════════════════════════════════════════════════╗
// ║  📊 EVENTS & STOCK — Logging nc_events + Snapshots + Webhooks  ║
// ║  Fusion : 📊EVENTS.js + 📈snapshot + 📈webhook mouvement stock ║
// ╚══════════════════════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════════════════════
//  📝 _logEvent_ — Writer central vers nc_events (Supabase)
//  fire-and-forget : une erreur ne bloque jamais l'appelant
// ══════════════════════════════════════════════════════════════════

function _logEvent_(fields) {
  try {
    var payload = {
      event_id:       Utilities.getUuid(),
      ts:             new Date().toISOString(),
      source:         fields.source         || "GAS",
      log_type:       fields.log_type       || null,
      actor:          fields.actor          || null,
      order_id:       fields.order_id  != null ? String(fields.order_id)   : null,
      variant_id:     fields.variant_id!= null ? String(fields.variant_id) : null,
      tracking:       fields.tracking       || null,
      ancien_statut:  fields.ancien_statut  || null,
      nouveau_statut: fields.nouveau_statut || null,
      qty:            fields.qty    != null ? Number(fields.qty)    : null,
      montant:        fields.montant!= null ? Number(fields.montant): null,
      label:          fields.label          || null,
      note:           fields.note           || null,
      extra:          fields.extra          || null
    };

    // Supprimer les clés null pour alléger le payload
    Object.keys(payload).forEach(function(k) {
      if (payload[k] === null || payload[k] === undefined) delete payload[k];
    });

    UrlFetchApp.fetch(SB_URL_ + "/rest/v1/nc_events", {
      method:             "POST",
      contentType:        "application/json",
      headers:            { "apikey": SB_KEY_, "Authorization": "Bearer " + SB_KEY_, "Prefer": "return=minimal" },
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("_logEvent_ EXCEPTION log_type=%s err=%s", fields.log_type, String(e));
  }
}

// ══════════════════════════════════════════════════════════════════
//  📦 Helpers spécialisés (mapping métier → nc_events)
// ══════════════════════════════════════════════════════════════════

function _logCommandeRecu_(orderId, customerName, customerPhone, orderTotal, shopifyUrl, orderSource) {
  _logEvent_({
    log_type: "COMMANDE_RECU_SHOPIFY", source: "SHOPIFY", actor: "shopify",
    order_id: orderId,
    montant:  orderTotal ? Number(String(orderTotal).replace(/[^0-9.]/g, "")) : null,
    label:    customerName || null,
    extra:    { customer_phone: customerPhone||null, shopify_url: shopifyUrl||null,
                canal: orderSource === "pos" ? "POS" : "ONLINE" }
  });
}

function _logOrderItem_(orderId, variantId, productTitle, qty, price, orderSource) {
  _logEvent_({
    log_type:   "ORDERS_ITEMS", source: "SHOPIFY", actor: "shopify",
    order_id:   orderId, variant_id: variantId,
    qty:        qty   != null ? Number(qty)   : null,
    montant:    price != null ? Number(String(price).replace(/[^0-9.]/g, "")) : null,
    label:      productTitle || null,
    extra:      { canal: orderSource === "pos" ? "POS" : "ONLINE" }
  });
}

function _logColisInjecte_(orderId, trackingNumber) {
  _logEvent_({
    log_type: "COLIS_INJECTER_ZR", source: "GAS", actor: "ZR_ENGINE",
    order_id: orderId, tracking: trackingNumber, nouveau_statut: "CREATED"
  });
}

function _logZrWebhook_(trackingNumber, stateName, situationName, runId) {
  _logEvent_({
    log_type: "ZR_WEBHOOK_EVENT", source: "ZR", actor: "ZR_WEBHOOK",
    tracking: trackingNumber || null, nouveau_statut: stateName || null,
    note: situationName || null, extra: runId ? { run_id: runId } : null
  });
}

function _logBarrageEnter_(variantId, productTitle, onHand, available) {
  _logEvent_({
    log_type: "BARRAGE", source: "GAS", actor: "BARRAGE_ENGINE",
    variant_id: variantId, nouveau_statut: "IN_BARRAGE",
    qty: available != null ? Number(available) : null,
    label: productTitle || null,
    extra: onHand != null ? { on_hand: Number(onHand) } : null
  });
}

function _logBarrageExit_(variantId, productTitle, nouveauStock, agent) {
  _logEvent_({
    log_type: "EXIT_BARRAGE", source: "GAS", actor: agent || "BARRAGE_ENGINE",
    variant_id: variantId, ancien_statut: "IN_BARRAGE", nouveau_statut: "OUT_BARRAGE",
    qty: nouveauStock != null ? Number(nouveauStock) : null,
    label: productTitle || null
  });
}

function _logStockSnapshot_(variantId, qty, vendor, snapshotDate) {
  _logEvent_({
    log_type: "STOCK_SNAPSHOT", source: "SYSTEM", actor: "SNAPSHOT_ENGINE",
    variant_id: variantId, qty: qty != null ? Number(qty) : null,
    extra: { vendor: vendor||null, snapshot_date: snapshotDate||null }
  });
}

function _logStockAudit_(inventoryItemId, delta, oldAvailable, newAvailable, variantId) {
  _logEvent_({
    log_type: "STOCK_AUDIT_EVENT", source: "SHOPIFY", actor: "SHOPIFY_INVENTORY",
    variant_id:     variantId || inventoryItemId,
    qty:            delta != null ? Number(delta) : null,
    ancien_statut:  oldAvailable  != null ? String(oldAvailable)  : null,
    nouveau_statut: newAvailable  != null ? String(newAvailable)  : null,
    extra:          variantId ? null : { inventory_item_id: String(inventoryItemId) }
  });
}

function _logModifyV2_(orderId, newOrderId, agent) {
  _logEvent_({
    log_type: "MODIFY_V2", source: "GAS", actor: agent || "MODIFY_ENGINE",
    order_id: orderId, extra: newOrderId ? { new_order_id: String(newOrderId) } : null
  });
}

function _logQuotaPrep_(agent, nbCommandes, dateQuota) {
  _logEvent_({
    log_type: "QUOTA_PREPARATION", source: "GAS", actor: agent || "QUOTA_ENGINE",
    qty: nbCommandes != null ? Number(nbCommandes) : null,
    nouveau_statut: "GENERATED",
    extra: dateQuota ? { date_quota: dateQuota } : null
  });
}

// ══════════════════════════════════════════════════════════════════
//  📸 SNAPSHOT STOCK QUOTIDIEN (nc_variants → nc_events)
//  Remplace l'ancienne lecture depuis Google Sheet VARIANTE_CACHE
//  Source : nc_variants Supabase directement
// ══════════════════════════════════════════════════════════════════

function SNAPSHOT_STOCK_DAILY()      { _runSnapshotDirect_({ testMode: false }); }
function SNAPSHOT_STOCK_DAILY_TEST() { _runSnapshotDirect_({ testMode: true });  }

function _runSnapshotDirect_(opts) {
  var testMode   = opts && opts.testMode;
  var dateStr    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  // Dédup quotidien via ScriptProperties
  var props          = PropertiesService.getScriptProperties();
  var PROP_KEY       = "LAST_SNAPSHOT_DATE";
  var lastSnapDate   = props.getProperty(PROP_KEY);

  if (!testMode && lastSnapDate === dateStr) {
    Logger.log("📸 Snapshot déjà effectué aujourd'hui (%s) — abandon", dateStr);
    return;
  }

  Logger.log("📸 SNAPSHOT_STOCK_DAILY start | date=%s | testMode=%s", dateStr, testMode);

  // Lire nc_variants depuis Supabase (tous les actifs avec stock > 0)
  var variants = [];
  var offset   = 0;
  var limit    = 1000;

  do {
    var resp = UrlFetchApp.fetch(
      SB_URL_ + "/rest/v1/nc_variants?status=eq.active&inventory_quantity=gt.0&select=variant_id,inventory_quantity,vendor&limit=" + limit + "&offset=" + offset,
      { headers: { "apikey": SB_KEY_, "Authorization": "Bearer " + SB_KEY_,
                   "Accept": "application/json", "Range-Unit": "items" },
        muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) { Logger.log("❌ nc_variants HTTP=%s", resp.getResponseCode()); break; }
    var batch = JSON.parse(resp.getContentText() || "[]");
    if (!Array.isArray(batch) || batch.length === 0) break;
    variants = variants.concat(batch);
    offset += limit;
  } while (variants.length === offset); // continue si page pleine

  Logger.log("📸 nc_variants récupérées: %s", variants.length);

  if (testMode) {
    variants = variants.slice(0, 3); // dry-run : 3 lignes seulement
    Logger.log("📸 TEST MODE — limité à 3 variantes");
  }

  if (variants.length === 0) { Logger.log("📸 Aucune variante active avec stock > 0"); return; }

  // Construire les events nc_events en batch
  var events = variants.map(function(v) {
    var ev = {
      event_id:   Utilities.getUuid(),
      ts:         new Date().toISOString(),
      log_type:   "STOCK_SNAPSHOT",
      source:     "SYSTEM",
      actor:      "SNAPSHOT_ENGINE",
      variant_id: String(v.variant_id),
      qty:        Number(v.inventory_quantity || 0),
      extra:      { snapshot_date: dateStr, vendor: v.vendor || null }
    };
    return ev;
  });

  // Envoyer par batch de 200
  var ok = 0;
  for (var b = 0; b < events.length; b += 200) {
    var chunk  = events.slice(b, b + 200);
    var result = _supabaseUpsert_("nc_events", chunk);
    if (result.ok) ok += chunk.length;
    else Logger.log("❌ snapshot chunk err: %s", JSON.stringify(result).slice(0, 200));
  }

  Logger.log("📸 SNAPSHOT done: %s/%s events envoyés", ok, events.length);

  if (!testMode) {
    props.setProperty(PROP_KEY, dateStr);
    Logger.log("📸 Date mémorisée : %s", dateStr);
  }
}

// ══════════════════════════════════════════════════════════════════
//  📦 WEBHOOK MOUVEMENT STOCK (inventory_levels/update)
//  Reçoit les webhooks Shopify, calcule le delta, log nc_events
// ══════════════════════════════════════════════════════════════════

var _STOCK_AUDIT_DEDUP_TTL_MS_ = 10 * 60 * 1000; // 10 minutes

function STOCK_AUDIT_handleInventoryWebhook_(e) {
  var runId = Utilities.getUuid().slice(0, 8);

  if (!e || !e.postData || !e.postData.contents) {
    return _stockAuditJson_({ ok: false, note: "NO_BODY" });
  }

  var payload;
  try { payload = JSON.parse(e.postData.contents); }
  catch (_err) { return _stockAuditJson_({ ok: false, note: "BAD_JSON" }); }

  var inventoryItemId = String(payload.inventory_item_id || "").trim();
  var locationId      = String(payload.location_id       || "").trim();
  var newAvailable    = Number(payload.available);

  if (!inventoryItemId || isNaN(newAvailable)) {
    return _stockAuditJson_({ ok: false, note: "INVALID_PAYLOAD" });
  }

  // Lecture + mémorisation de la valeur précédente
  var props        = PropertiesService.getScriptProperties();
  var cacheKey     = "STOCK_AUDIT_LAST_" + inventoryItemId + "_" + locationId;
  var oldRaw       = props.getProperty(cacheKey);
  var oldAvailable = oldRaw !== null ? Number(oldRaw) : null;
  props.setProperty(cacheKey, String(newAvailable));

  var delta = oldAvailable !== null ? newAvailable - oldAvailable : null;

  // Ignorer les événements sans changement réel
  if (delta === 0) return _stockAuditJson_({ ok: true, ignored: true });

  // Idempotence : bloquer les doublons dans les 10 min
  var updatedAt       = payload.updated_at ? String(payload.updated_at) : String(Date.now());
  var fpSrc           = [inventoryItemId, locationId, newAvailable, updatedAt].join("|");
  var fingerprint     = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, fpSrc)
  ).slice(0, 32);

  var fpKey = "STOCK_AUDIT_FP_" + fingerprint;
  var nowTs = Date.now();
  var fpRaw = props.getProperty(fpKey);
  if (fpRaw && (nowTs - Number(fpRaw)) < _STOCK_AUDIT_DEDUP_TTL_MS_) {
    return _stockAuditJson_({ ok: true, duplicate: true });
  }
  props.setProperty(fpKey, String(nowTs));

  // Log vers nc_events (via _logStockAudit_ ci-dessus)
  _logStockAudit_(inventoryItemId, delta, oldAvailable, newAvailable, null);

  Logger.log("📦 STOCK_AUDIT done | item=%s delta=%s runId=%s", inventoryItemId, delta, runId);
  return _stockAuditJson_({ ok: true, runId: runId, inventory_item_id: inventoryItemId, delta: delta });
}

function _stockAuditJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
