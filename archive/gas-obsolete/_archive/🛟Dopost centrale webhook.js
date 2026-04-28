// ============================================================
// 🔥🔥🔥🔥 DOPOST CENTRALE WEBHOOK
// Point d'entrée HTTP unique — route tous les webhooks entrants
// Sources : Shopify · ZRExpress · AppSheet Actions · Stock Audit
// ============================================================

// ── Configuration ────────────────────────────────────────────

const WEBHOOK_LOG_SOURCE = "APPSHEET_WEBHOOK";
const WEBHOOK_AGENT_ID   = "APPSHEET";
const WEBHOOK_TABLE      = "OPS_ACTIONS";
const WEBHOOK_COLUMN     = "action";

// ── Point d'entrée principal ──────────────────────────────────

function doPost(e) {
  Logger.log("DOPOST_ENTERED");

  const body   = _getBody_(e);
  const parsed = _parseBody_(body);

  Logger.log("DOPOST_META type=%s bodyHead=%s",
    e?.postData?.type ?? "",
    body.slice(0, 200)
  );
  Logger.log("FULL_WEBHOOK_BODY=%s", body);

  // 0. Requête dashboard web — identifiée par source:"DASHBOARD"
  //    Totalement isolée du flux AppSheet/Shopify/ZR — aucun risque de collision
  if (parsed?.source === "DASHBOARD") {
    Logger.log("DASHBOARD_REQUEST_DETECTED action=%s", parsed?.action ?? "?");
    return doPost_dashboard(parsed);
  }

  // 1. Stock Shopify (inventory_levels/update)
  if (_isInventoryWebhook_(parsed)) {
    Logger.log("INVENTORY_WEBHOOK_DETECTED");
    return STOCK_AUDIT_handleInventoryWebhook_(e);
  }

  // 2. Action déclenchée depuis AppSheet
  if (parsed?.action) {
    return _dispatchAction_(parsed);
  }

  // 3. Route vers Shopify ou ZRExpress
  return _routeExternalWebhook_(e, parsed, body);
}

// ── Parsing du corps de la requête ───────────────────────────

function _getBody_(e) {
  return e?.postData?.contents ? String(e.postData.contents) : "";
}

function _parseBody_(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch (err) {
    Logger.log("JSON_PARSE_ERROR: %s", String(err?.message ?? err));
    Logger.log("RAW_BODY: %s", body);
    return null;
  }
}

// ── Détection webhook stock Shopify ──────────────────────────

function _isInventoryWebhook_(parsed) {
  return !!(
    parsed?.inventory_item_id &&
    (parsed.available !== undefined || parsed.available_adjustment !== undefined)
  );
}

// ── Dispatch actions — AppSheet supprimé (S6) ────────────────
// Toutes les actions sont maintenant dans le dashboard Vercel.
// Seule l'action INJECTER_BON_DE_COMMANDE reste utilisable (via dashboard).
function _dispatchAction_(parsed) {
  const runId  = Utilities.getUuid().slice(0, 8);
  const action = String(parsed.action ?? "").trim().toUpperCase();
  Logger.log("ACTION_RECEIVED=%s runId=%s", action, runId);

  if (action === "PING") {
    return _jsonResponse_({ ok: true, ts: Date.now(), runId });
  }

  if (action === "INJECTER_BON_DE_COMMANDE") {
    return _actionInjecterBonDeCommande_(runId, action);
  }

  Logger.log("ACTION_DEPRECATED=%s — AppSheet supprimé, utiliser le dashboard web", action);
  return _jsonResponse_({ ok: false, runId, note: "APPSHEET_REMOVED",
    action, message: "AppSheet supprimé. Utiliser le dashboard Vercel." });
}

// ── Action : INJECTER_BON_DE_COMMANDE ────────────────────────

function _actionInjecterBonDeCommande_(runId, action) {
  Logger.log("[INJECTER_BON_DE_COMMANDE] début runId=%s", runId);

  return _withScriptLock_(45000, runId, action, WEBHOOK_AGENT_ID, null, () => {
    const poResult = RUN_applyPO_toShopify();
    const ok       = !!(poResult?.ok);

    const errMsg = ok ? null : String(poResult?.message_fr ?? poResult?.reason_code ?? "ECHEC_INJECTION_PO");
    _logAction_(action, ok ? "SUCCESS" : "FAILED", null, errMsg);
    Logger.log("[INJECTER_BON_DE_COMMANDE] fin runId=%s ok=%s", runId, ok);

    return _jsonResponse_({
      ok,
      runId,
      note:                ok ? "APPSHEET_INJECTER_BON_DE_COMMANDE_DONE" : "APPSHEET_INJECTER_BON_DE_COMMANDE_ECHEC",
      action,
      reason_code:         poResult?.reason_code          ?? null,
      message_fr:          poResult?.message_fr           ?? null,
      pos_traites:         poResult?.pos_traites          ?? null,
      pos_ignores_deja_ok: poResult?.pos_ignores_deja_ok  ?? null,
      lignes_ok:           poResult?.lignes_ok            ?? null,
      lignes_ko:           poResult?.lignes_ko            ?? null
    });
  }, "VERROU_OCCUPE — une autre injection PO est déjà en cours.");
}

// ── Routage externe Shopify / ZRExpress ──────────────────────

function _routeExternalWebhook_(e, parsed, body) {
  const n = _normalizeZrPayload_(parsed);

  const isShopify = !!(parsed &&
    ((parsed.id     != null && String(parsed.id).trim()       !== "") ||
     (parsed.order_id != null && String(parsed.order_id).trim() !== "")));

  const zrTracking  = _firstDefined_(n.tracking_number, n.trackingNumber, n.data?.trackingNumber);
  const zrParcelId  = _firstDefined_(n.parcel_id,       n.parcelId,       n.data?.id);
  const zrEventType = _firstDefined_(n.event_type,      n.eventType,      n.type);
  const isZr        = !isShopify && (
    zrTracking || zrParcelId ||
    (zrEventType && String(zrEventType).startsWith("parcel."))
  );

  Logger.log("EXTERNAL_ROUTE=%s bodyHead=%s", isZr ? "ZR" : "SHOPIFY", body.slice(0, 100));
  return isZr ? doPostZrExpress_WRAPPER_(e) : doPostShopify_WRAPPER_(e);
}

// ── Normalisation payload ZRExpress (PascalCase → camelCase) ─

function _normalizeZrPayload_(parsed) {
  if (!parsed || typeof parsed !== "object") return {};
  const n = Object.assign({}, parsed);

  if (n.Data       && !n.data)       n.data       = n.Data;
  if (n.EventType  && !n.eventType)  n.eventType  = n.EventType;
  if (n.OccurredAt && !n.occurredAt) n.occurredAt = n.OccurredAt;

  if (n.data) {
    if (n.data.TrackingNumber && !n.data.trackingNumber) n.data.trackingNumber = n.data.TrackingNumber;
    if (n.data.Id             && !n.data.id)             n.data.id             = n.data.Id;
    if (n.data.State          && !n.data.state)          n.data.state          = n.data.State;
    if (n.data.Situation      && !n.data.situation)      n.data.situation      = n.data.Situation;
  }

  if (n.data?.trackingNumber && !n.trackingNumber)  n.trackingNumber  = n.data.trackingNumber;
  if (n.data?.trackingNumber && !n.tracking_number) n.tracking_number = n.data.trackingNumber;
  if (n.data?.id             && !n.parcelId)         n.parcelId        = n.data.id;
  if (n.data?.id             && !n.parcel_id)        n.parcel_id       = n.data.id;
  if (n.eventType            && !n.event_type)       n.event_type      = n.eventType;

  return n;
}

// ── Verrou script avec gestion d'erreur centralisée ──────────

function _withScriptLock_(timeoutMs, runId, action, agentId, orderId, fn, lockBusyMsg) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs)) {
    Logger.log("LOCK_BUSY action=%s runId=%s", action, runId);
    _logAction_(action, "FAILED", orderId, lockBusyMsg ?? "LOCK_BUSY", agentId);
    return _jsonResponse_({
      ok:         false,
      runId,
      note:       "LOCK_BUSY",
      message_fr: lockBusyMsg ?? "Script occupé, réessayez dans quelques secondes."
    });
  }
  try {
    return fn();
  } catch (err) {
    const errMsg = String(err?.stack ?? err);
    Logger.log("LOCK_ACTION_ERROR action=%s err=%s", action, errMsg);
    _logAction_(action, "FAILED", orderId, errMsg, agentId);
    return _jsonResponse_({
      ok: false, runId, note: "APPSHEET_ACTION_FAILED", action,
      error: String(err?.message ?? err)
    });
  } finally {
    lock.releaseLock();
  }
}

// ── Logging centralisé ───────────────────────────────────────

function _logAction_(action, status, orderId, errorMessage, agentId) {
  logLocalV2_safe_({
    event_type:    "APPSHEET_ACTION",
    agent_id:      agentId      ?? WEBHOOK_AGENT_ID,
    target_table:  WEBHOOK_TABLE,
    target_column: WEBHOOK_COLUMN,
    new_value:     action,
    source:        WEBHOOK_LOG_SOURCE,
    status,
    order_id:      orderId      ?? undefined,
    error_message: errorMessage ?? null
  });
}

// ── Réponses HTTP ─────────────────────────────────────────────

function _okResponse_(runId, action, note) {
  _logAction_(action, "SUCCESS");
  return _jsonResponse_({ ok: true, runId, note, action });
}

function _jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Utilitaire : première valeur définie et non vide ─────────

function _firstDefined_(...values) {
  return values.find(v => v !== undefined && v !== null && String(v).trim() !== "") ?? null;
}

// ── OPS : Save & Refresh (writeback + rebuild) ───────────────

function OPS_Agent_Save_And_Refresh() {
  Logger.log("SAVE_AND_REFRESH_ENTERED");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log("SAVE_AND_REFRESH_LOCK_BUSY");
    return;
  }
  try {
    Logger.log("WRITEBACK_CALLED");
    if (typeof OPS_Writeback_AllRows_STATUTS_FAST === "function") OPS_Writeback_AllRows_STATUTS_FAST();
    Logger.log("WRITEBACK_DONE");

    Logger.log("REBUILD_CALLED");
    if (typeof rebuildOpsControlV2 === "function") rebuildOpsControlV2();
    Logger.log("REBUILD_DONE");
  } finally {
    lock.releaseLock();
  }
}
