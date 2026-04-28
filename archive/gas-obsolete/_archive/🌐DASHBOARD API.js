// ═══════════════════════════════════════════════════════════════════
//  🌐 DASHBOARD API — Point d'entrée HTTP GAS (minimal S7)
//  Seules 3 actions actives : MODIFY_ORDER, RUN_INJECT_PO, ADD_PO_LINES
//  Tout le reste → Vercel : https://najmcoiffdashboard.vercel.app
//  0 Google Sheets — tout passe par Supabase (nc_*)
// ═══════════════════════════════════════════════════════════════════

var TOKEN_EXPIRY_H_ = 8; // S7

// ── CORS helper ──────────────────────────────────────────────────

function _corsResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Point d'entrée GET (health check) ───────────────────────────

function doGet_dashboard(e) {
  return _corsResponse_({ ok: true, service: "najmcoiff-dashboard", ts: new Date().toISOString() });
}

// ── Point d'entrée POST ──────────────────────────────────────────
// Appelé depuis 🛟Dopost centrale webhook.js quand parsed.source === "DASHBOARD"

function doPost_dashboard(parsed) {
  try {
    var action = String(parsed.action || "").trim().toUpperCase();
    Logger.log("DASHBOARD_ACTION=%s", action);

    if (action === "PING") return _corsResponse_({ ok: true, ts: Date.now() });

    // Routes protégées — vérification token
    var token = parsed.token || "";
    var session = _verifyToken_(token);
    if (!session) return _corsResponse_({ ok: false, error: "Token invalide ou expiré" });

    switch (action) {
      case "MODIFY_ORDER":  return _corsResponse_(_modifyOrder_(parsed, session));
      case "RUN_INJECT_PO": return _corsResponse_(_runInjectPO_(session));
      case "ADD_PO_LINES":  return _corsResponse_(_addPOLines_(parsed, session));
      default:
        return _corsResponse_({
          ok: false, migrated: true, action: action,
          error: "Action migrée vers Vercel. Utiliser : https://najmcoiffdashboard.vercel.app"
        });
    }

  } catch (err) {
    Logger.log("DASHBOARD_ERROR=%s", String(err));
    return _corsResponse_({ ok: false, error: "Erreur serveur : " + String(err.message || err) });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  AUTH — TOKEN (login via Vercel /api/auth/login + nc_users)
// ═══════════════════════════════════════════════════════════════════

function _generateToken_(user) {
  var secret  = PropertiesService.getScriptProperties().getProperty("DASHBOARD_SECRET") || "nc_secret_2026";
  var payload = { nom: user.nom, email: user.email, role: user.role, badge: user.badge,
                  exp: Date.now() + TOKEN_EXPIRY_H_ * 3600 * 1000 };
  var encoded = Utilities.base64Encode(JSON.stringify(payload));
  var sig = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, encoded + secret)
              .map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
              .join("").slice(0, 16);
  return encoded + "." + sig;
}

function _verifyToken_(token) {
  if (!token) return null;
  try {
    var parts = token.split(".");

    // Format 1 : token GAS signé base64.MD5sig (2 parties)
    if (parts.length === 2) {
      var encoded  = parts[0];
      var sig      = parts[1];
      var secret   = PropertiesService.getScriptProperties().getProperty("DASHBOARD_SECRET") || "nc_secret_2026";
      var expected = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, encoded + secret)
                      .map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
                      .join("").slice(0, 16);
      if (sig !== expected) return null;
      var payload  = JSON.parse(Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString());
      if (Date.now() > payload.exp) return null;
      return payload;
    }

    // Format 2 : JWT Supabase (3 parties header.payload.sig)
    if (parts.length === 3) {
      var jwtPayload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(
        parts[1].replace(/-/g, "+").replace(/_/g, "/")
      )).getDataAsString());
      if (!jwtPayload.sub) return null;
      if (jwtPayload.exp && Date.now() / 1000 > jwtPayload.exp) return null;
      return { nom: jwtPayload.username || jwtPayload.sub, role: jwtPayload.role || "agent",
               email: jwtPayload.email || "", badge: jwtPayload.badge || "" };
    }
  } catch (e) {
    Logger.log("_verifyToken_ ERROR: %s", String(e));
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  ADD_PO_LINES — Écrit dans nc_po_lines (Supabase)
// ═══════════════════════════════════════════════════════════════════

function _addPOLines_(parsed, session) {
  var poId  = String(parsed.po_id || "").trim();
  if (!poId) return { ok: false, error: "po_id requis" };
  var lines = parsed.lines;
  if (!lines || !lines.length) return { ok: false, error: "lines[] vide" };

  var now   = new Date().toISOString();
  var rows  = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var qty  = Number(line.qty_add || 0);
    var vid  = String(line.variant_id || "").trim();
    if (!vid || qty <= 0) continue;
    rows.push({
      po_id:          poId,
      variant_id:     vid,
      quantite:       qty,
      prix_unitaire:  Number(line.sell_price || line.purchase_price || 0),
      fournisseur:    String(line.note || "").trim() || null,
      statut:         "pending",
      created_at:     now,
      agent:          session.nom || "GAS"
    });
  }

  if (!rows.length) return { ok: false, error: "Aucune ligne valide (variant_id + qty > 0 requis)" };

  try {
    var resp = UrlFetchApp.fetch(SB_URL_ + "/rest/v1/nc_po_lines", {
      method: "post",
      contentType: "application/json",
      headers: { "apikey": SB_KEY_, "Authorization": "Bearer " + SB_KEY_, "Prefer": "return=minimal" },
      payload: JSON.stringify(rows),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code >= 400) throw new Error("Supabase " + code + ": " + resp.getContentText().slice(0, 200));
    _logOpsAction_({ agent: session.nom, action: "ADD_PO_LINES", order_id: poId, details: rows.length + " ligne(s)" });
    Logger.log("ADD_PO_LINES po_id=%s lines=%s agent=%s", poId, rows.length, session.nom);
    return { ok: true, po_id: poId, lines_added: rows.length };
  } catch (e) {
    Logger.log("ADD_PO_LINES_ERROR=%s", String(e));
    return { ok: false, error: String(e.message || e) };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MODIFY_ORDER — Récréation commande Shopify via Draft Order
//  Params : parsed.order_id (GID ou numéro), parsed.items [{variant_id, qty, title?}]
// ═══════════════════════════════════════════════════════════════════

function _modifyOrder_(parsed, session) {
  var orderId = toOrderGid_(String(parsed.order_id || "").trim());
  if (!orderId) return { ok: false, error: "order_id requis" };
  var items = parsed.items;
  if (!items || !items.length) return { ok: false, error: "items[] requis" };

  var runId = Utilities.getUuid().slice(0, 8);
  var t0 = Date.now();

  try {
    // 1. Récupérer la commande originale
    var ord = fetchOriginalOrder_(orderId, runId);

    // 2. Construire les lineItems depuis la requête (plus de Sheet)
    var lineItemsInput = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var qty  = Number(item.qty || item.quantity || 0);
      var vid  = String(item.variant_id || "").trim();
      if (!vid || qty <= 0) continue;
      // Normaliser vers GID Shopify
      if (!vid.startsWith("gid://")) vid = "gid://shopify/ProductVariant/" + vid.replace(/\D/g, "");
      lineItemsInput.push({ variantId: vid, quantity: qty });
    }
    if (!lineItemsInput.length) return { ok: false, error: "Aucun article valide (variant_id + qty > 0)" };

    // 3. Créer Draft Order → nouvelle commande
    var draftId    = createDraftOrder_(ord, lineItemsInput, orderId, runId);
    var newOrderId = completeDraftOrder_(draftId, orderId, runId);

    // 4. Mettre à jour nc_orders + annuler l'ancienne commande
    updateOrdersV2Statuses_afterModify_(orderId, newOrderId);
    var cancelWarning = null;
    try {
      cancelOldOrder_(orderId, runId);
    } catch (cancelErr) {
      cancelWarning = String(cancelErr.message || cancelErr);
      Logger.log("MODIFY_ORDER cancel warning old=%s warn=%s", orderId, cancelWarning);
    }

    // 5. Vérification finale
    verifyNewOrderShipping_(newOrderId, runId);

    var duration = Date.now() - t0;
    Logger.log("MODIFY_ORDER OK old=%s new=%s agent=%s dur=%sms", orderId, newOrderId, session.nom, duration);
    return {
      ok: true,
      old_order_id:   normalizeOrderId_(orderId),
      new_order_id:   normalizeOrderId_(newOrderId),
      duration_ms:    duration,
      cancel_warning: cancelWarning || null
    };

  } catch (err) {
    Logger.log("MODIFY_ORDER ERROR=%s", String(err.message || err));
    return { ok: false, error: String(err.message || err), runId: runId };
  }
}

// ─── RUN_INJECT_PO ───────────────────────────────────────────────

function _runInjectPO_(session) {
  try {
    var result = RUN_applyPO_toShopify();
    _logOpsAction_({ agent: session.nom, action: "RUN_INJECT_PO", order_id: "",
      details: JSON.stringify({ ok: result.lignes_ok, ko: result.lignes_ko }) });
    Logger.log("RUN_INJECT_PO agent=%s ok=%s ko=%s", session.nom, result.lignes_ok, result.lignes_ko);
    return { ok: result.ok, message: result.message_fr,
             pos_traites: result.pos_traites, lignes_ok: result.lignes_ok, lignes_ko: result.lignes_ko };
  } catch (err) {
    Logger.log("RUN_INJECT_PO_ERROR=%s", String(err));
    return { ok: false, error: String(err.message || err) };
  }
}

// ─── Log ops → nc_events ─────────────────────────────────────────

function _logOpsAction_(params) {
  try {
    UrlFetchApp.fetch(SB_URL_ + "/rest/v1/nc_events", {
      method: "post",
      contentType: "application/json",
      headers: { "apikey": SB_KEY_, "Authorization": "Bearer " + SB_KEY_, "Prefer": "return=minimal" },
      payload: JSON.stringify({
        ts:         new Date().toISOString(),
        log_type:   params.action || "OPS_ACTION",
        source:     "GAS",
        actor:      params.agent   || "GAS",
        order_id:   params.order_id || null,
        note:       params.details  || null
      }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("_logOpsAction_ ERROR: %s", String(e));
  }
}
