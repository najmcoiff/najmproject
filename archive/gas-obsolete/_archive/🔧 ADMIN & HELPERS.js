// ╔══════════════════════════════════════════════════════════════════╗
// ║  🔧 ADMIN & HELPERS — Outils owner, sync Shopify, triggers     ║
// ║  Fusion : 🛟helpers.js + 🔧ADMIN OUTILS.js                     ║
// ╚══════════════════════════════════════════════════════════════════╝

// ──────────────────────────────────────────────────────────────────
//  🗄 CONFIG SUPABASE (partagée dans tous les scripts GAS)
// ──────────────────────────────────────────────────────────────────

var SB_URL_ = "https://alyxejkdtkdmluvgfnqk.supabase.co";
var SB_KEY_ = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";

/**
 * Compatibilité avec l'ancien système de logs (logLocalV2).
 * Écrit les événements AppSheet/Webhook dans nc_events via _supabaseUpsert_.
 * @param {Object} params - event_type, agent_id, action/new_value, status, order_id, error_message
 */
function logLocalV2_safe_(params) {
  try {
    var p = params || {};
    _supabaseUpsert_("nc_events", [{
      event_id:       Utilities.getUuid(),
      ts:             new Date().toISOString(),
      log_type:       String(p.event_type || "APPSHEET_ACTION"),
      source:         String(p.source     || "APPSHEET"),
      actor:          String(p.agent_id   || "APPSHEET"),
      order_id:       p.order_id          || null,
      nouveau_statut: String(p.status     || ""),
      label:          String(p.new_value  || p.action || ""),
      note:           p.error_message     ? String(p.error_message) : null,
      extra:          { target_table: p.target_table, target_column: p.target_column }
    }]);
  } catch (e) {
    Logger.log("logLocalV2_safe_ ERROR: %s", String(e));
  }
}

/**
 * Écrit un log d'exécution GAS dans nc_gas_logs (Supabase).
 * Utilisation : _gasLog_("_runBarrageGlobal_", "RUN_BARRAGE_GLOBAL", "success", 1234, {input}, {output});
 * @param {string} function_   Nom de la fonction GAS
 * @param {string} action      Action/étape en cours
 * @param {string} status      "info" | "success" | "error" | "warning"
 * @param {number} duration_ms Durée d'exécution en ms
 * @param {Object} input       Données d'entrée (optionnel)
 * @param {Object} output      Données de sortie / résultat (optionnel)
 * @param {string} error       Message d'erreur si status="error"
 */
function _gasLog_(function_, action, status, duration_ms, input, output, error) {
  try {
    var payload = {
      ts:          new Date().toISOString(),
      function_:   String(function_ || "unknown"),
      action:      String(action || ""),
      status:      String(status || "info"),
      duration_ms: Number(duration_ms) || 0,
      input:       input  ? JSON.parse(JSON.stringify(input))  : null,
      output:      output ? JSON.parse(JSON.stringify(output)) : null,
      error:       error  ? String(error).slice(0, 1000)       : null
    };
    UrlFetchApp.fetch(SB_URL_ + "/rest/v1/nc_gas_logs", {
      method:      "POST",
      contentType: "application/json",
      headers: {
        "apikey":        SB_KEY_,
        "Authorization": "Bearer " + SB_KEY_,
        "Prefer":        "return=minimal"
      },
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("_gasLog_ EXCEPTION: %s", String(e));
  }
}

/**
 * Upsert générique vers une table Supabase.
 * @param {string} table  Nom de la table (ex: "nc_events")
 * @param {Array}  rows   Tableau d'objets à upsert
 * @returns {{ ok: boolean, code: number, body: string }}
 */
function _supabaseUpsert_(table, rows) {
  try {
    var url  = SB_URL_ + "/rest/v1/" + table;
    var resp = UrlFetchApp.fetch(url, {
      method:      "POST",
      contentType: "application/json",
      headers: {
        "apikey":        SB_KEY_,
        "Authorization": "Bearer " + SB_KEY_,
        "Prefer":        "resolution=merge-duplicates,return=minimal"
      },
      payload:            JSON.stringify(rows),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code >= 200 && code < 300) return { ok: true, code: code, body: body };
    Logger.log("_supabaseUpsert_ ERROR table=%s code=%s body=%s", table, code, body.slice(0, 300));
    return { ok: false, code: code, body: body };
  } catch (e) {
    Logger.log("_supabaseUpsert_ EXCEPTION table=%s err=%s", table, String(e));
    return { ok: false, code: 0, body: String(e) };
  }
}

// ──────────────────────────────────────────────────────────────────
//  🔑 CONFIG SHOPIFY (partagée dans tout ce fichier)
// ──────────────────────────────────────────────────────────────────

var _SHOP_DOMAIN_  = "8fc262.myshopify.com";
var _SHOP_TOKEN_   = "REDACTED_LEGACY_TOKEN";
var _SHOP_API_VER_ = "2025-01";
var _SHOP_LOC_ID_  = "82996658472";

// onOpen supprimé (S7) — plus de Google Sheets, plus de menu Sheets

// ══════════════════════════════════════════════════════════════════
//  🛒 SHOPIFY — COMMANDE TEST
// ══════════════════════════════════════════════════════════════════

function ADMIN_creerCommandeTest() {
  var url = "https://" + _SHOP_DOMAIN_ + "/admin/api/" + _SHOP_API_VER_ + "/orders.json";
  var payload = {
    order: {
      line_items: [{ variant_id: 50187090264360, quantity: 1, title: "Papier blanc VIP" }],
      customer:   { first_name: "TEST", last_name: "TEST", phone: "+213550099999" },
      phone:      "+213550099999",
      shipping_address: {
        first_name: "TEST", last_name: "TEST", phone: "+213550099999",
        address1: "Bir Touta", city: "Bir Touta",
        province: "Alger", country: "Algeria", country_code: "DZ"
      },
      note:              "توصيل للمنزل",
      financial_status:  "pending",
      send_receipt:      false,
      send_fulfillment_receipt: false,
      tags:              "TEST, COMMANDE_TEST"
    }
  };
  var resp = UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json",
    headers: { "X-Shopify-Access-Token": _SHOP_TOKEN_ },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var body = JSON.parse(resp.getContentText() || "{}");
  if (code === 201 && body.order) {
    Logger.log("✅ Commande TEST créée | ID=%s | Name=%s", body.order.id, body.order.name);
    return {
      ok: true,
      message: "✅ Commande TEST créée",
      order_id: String(body.order.id),
      order_name: body.order.name,
      admin_url: "https://" + _SHOP_DOMAIN_ + "/admin/orders/" + body.order.id
    };
  } else {
    var errMsg = (body.errors ? JSON.stringify(body.errors) : (body.error || "Erreur inconnue"));
    Logger.log("❌ Erreur commande TEST | HTTP=%s | %s", code, errMsg);
    return { ok: false, error: "HTTP " + code + " — " + errMsg };
  }
}

// ══════════════════════════════════════════════════════════════════
//  🔄 SHOPIFY — RÉCUPÉRER COMMANDES MANQUÉES (4 JOURS)
// ══════════════════════════════════════════════════════════════════

function ADMIN_recoverMissedOrders() {
  var props    = PropertiesService.getScriptProperties();
  var existing = props.getProperties();
  var since    = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  var url      = "https://" + _SHOP_DOMAIN_ + "/admin/api/" + _SHOP_API_VER_ + "/orders.json"
               + "?status=any&limit=250&created_at_min=" + encodeURIComponent(since);

  var totalProcessed = 0, totalSkipped = 0;
  var newKeys = {};

  while (url) {
    var res    = UrlFetchApp.fetch(url, { method: "get", headers: { "X-Shopify-Access-Token": _SHOP_TOKEN_ } });
    var orders = (JSON.parse(res.getContentText()).orders || []);

    for (var i = 0; i < orders.length; i++) {
      var key = "ORDER_" + orders[i].id;
      if (existing[key] || newKeys[key]) { totalSkipped++; continue; }
      try {
        doPostShopify_WRAPPER_({ postData: { contents: JSON.stringify(orders[i]) } });
        newKeys[key] = "1";
        totalProcessed++;
        Logger.log("🔄 Recovered order: %s", orders[i].id);
      } catch (e) { Logger.log("❌ Error order %s : %s", orders[i].id, e); }
    }

    var link = res.getHeaders()["Link"];
    if (link && link.includes('rel="next"')) {
      var next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    } else { url = null; }
  }

  if (Object.keys(newKeys).length > 0) props.setProperties(newKeys);
  Logger.log("✅ DONE → Processed: %s | Skipped: %s", totalProcessed, totalSkipped);
}

// ══════════════════════════════════════════════════════════════════
//  📦 SYNC VARIANTES SHOPIFY → nc_variants (Supabase)
// ══════════════════════════════════════════════════════════════════

function ADMIN_syncVariantesFull() {
  var startTs     = Date.now();
  var allVariants = [];
  var pageInfo    = null;
  var pageCount   = 0;
  var limit       = 250;

  do {
    var url = "https://" + _SHOP_DOMAIN_ + "/admin/api/" + _SHOP_API_VER_
            + "/products.json?limit=" + limit + "&status=active"
            + "&fields=id,title,status,vendor,product_type,images,variants,published_at,updated_at";
    if (pageInfo) url += "&page_info=" + pageInfo;

    var resp = UrlFetchApp.fetch(url, {
      headers: { "X-Shopify-Access-Token": _SHOP_TOKEN_ },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 429) { Utilities.sleep(20000); continue; }
    if (resp.getResponseCode() !== 200) { Logger.log("❌ HTTP=%s", resp.getResponseCode()); break; }

    var products = (JSON.parse(resp.getContentText() || "{}").products || []);
    pageCount++;

    products.forEach(function(p) {
      var imageUrl = (p.images && p.images[0]) ? p.images[0].src : "";
      (p.variants || []).forEach(function(v) {
        var displayName = p.title;
        if (v.title && v.title !== "Default Title") displayName += " — " + v.title;
        allVariants.push({
          variant_id:         String(v.id),
          product_id:         String(p.id),
          inventory_item_id:  v.inventory_item_id ? String(v.inventory_item_id) : null,
          product_title:      String(p.title || ""),
          variant_title:      v.title || "Default Title",
          display_name:       displayName,
          sku:                v.sku       || null,
          barcode:            v.barcode   || null,
          price:              v.price     || "0",
          cost_price:         null,
          inventory_quantity: v.inventory_quantity != null ? Number(v.inventory_quantity) : 0,
          image_url:          v.image_id && p.images
                                ? (p.images.find(function(i) { return i.id == v.image_id; }) || { src: imageUrl }).src
                                : imageUrl,
          status:             p.status === "active" ? "active" : "archived",
          vendor:             p.vendor || null,
          collections_titles: null,
          admin_product_url:  "https://" + _SHOP_DOMAIN_ + "/admin/products/" + p.id,
          updated_at_shopify: p.updated_at || null,
          synced_at:          new Date().toISOString()
        });
      });
    });

    Logger.log("📦 page=%s products=%s total_vars=%s", pageCount, products.length, allVariants.length);

    var linkHeader = resp.getHeaders()["Link"] || resp.getHeaders()["link"] || "";
    if (linkHeader && linkHeader.includes('rel="next"')) {
      var match = linkHeader.match(/page_info=([^>&"]+)[^>]*rel="next"/);
      pageInfo = match ? match[1] : null;
    } else { pageInfo = null; }
    if (products.length < limit) pageInfo = null;
    Utilities.sleep(400);
  } while (pageInfo);

  Logger.log("📦 Total: %s variantes récupérées", allVariants.length);
  if (allVariants.length === 0) return;

  var CHUNK = 100, ok = 0;
  for (var i = 0; i < allVariants.length; i += CHUNK) {
    var chunk  = allVariants.slice(i, i + CHUNK);
    var result = _supabaseUpsert_("nc_variants", chunk);
    if (result.ok) ok += chunk.length;
    else Logger.log("❌ chunk err: %s", JSON.stringify(result).slice(0, 200));
  }

  Logger.log("✅ SYNC_VARIANTS done: %s/%s en %ss", ok, allVariants.length,
    Math.round((Date.now() - startTs) / 1000));
}

// ══════════════════════════════════════════════════════════════════
//  📊 SYNC STOCKS SEULEMENT (rapide — 30 min cycle)
// ══════════════════════════════════════════════════════════════════

function ADMIN_syncStocksOnly() {
  Logger.log("📊 SYNC_STOCKS_ONLY start");
  var url  = "https://" + _SHOP_DOMAIN_ + "/admin/api/" + _SHOP_API_VER_
           + "/inventory_levels.json?location_ids=" + _SHOP_LOC_ID_ + "&limit=250";
  var all  = [], page = null;

  do {
    var resp = UrlFetchApp.fetch(url + (page ? "&page_info=" + page : ""), {
      headers: { "X-Shopify-Access-Token": _SHOP_TOKEN_ }, muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) break;
    (JSON.parse(resp.getContentText() || "{}").inventory_levels || []).forEach(function(il) {
      if (il.inventory_item_id) all.push({ inventory_item_id: String(il.inventory_item_id), available: il.available || 0 });
    });
    var lh = resp.getHeaders()["Link"] || "";
    page = (lh && lh.includes('rel="next"')) ? (lh.match(/page_info=([^>&"]+)[^>]*rel="next"/) || [null,null])[1] : null;
    Utilities.sleep(300);
  } while (page);

  Logger.log("📊 %s inventory_levels récupérés", all.length);

  var now = new Date().toISOString();
  all.forEach(function(il) {
    try {
      UrlFetchApp.fetch(SB_URL_ + "/rest/v1/nc_variants?inventory_item_id=eq." + il.inventory_item_id, {
        method: "PATCH",
        headers: { "apikey": SB_KEY_, "Authorization": "Bearer " + SB_KEY_,
                   "Content-Type": "application/json", "Prefer": "return=minimal" },
        payload: JSON.stringify({ inventory_quantity: il.available, synced_at: now }),
        muteHttpExceptions: true
      });
    } catch (_e) {}
  });

  Logger.log("✅ SYNC_STOCKS done: %s stocks mis à jour", all.length);
}

// ══════════════════════════════════════════════════════════════════
//  ⏰ SETUP TRIGGERS AUTOMATIQUES
// ══════════════════════════════════════════════════════════════════

var _TRIGGERS_CONFIG_ = [
  { fn: "ADMIN_syncStocksOnly",       type: "everyMinutes", val: 30 },
  { fn: "ADMIN_syncVariantesFull",    type: "everyDays",    val: 1, heure: 3 },
  { fn: "ADMIN_nettoyerScriptProperties", type: "everyHours", val: 1 },
  { fn: "SNAPSHOT_STOCK_DAILY",    type: "everyHours",   val: 1 },
  { fn: "ZR_updateShippingStatus_fromTracking", type: "everyHours", val: 1 },
  { fn: "syncSuiviZR_FromZR_thenApplyV2",       type: "everyHours", val: 1 },
];

function ADMIN_setupSyncTriggers() {
  // Supprimer les anciens triggers pour les fonctions gérées ici
  var managed = _TRIGGERS_CONFIG_.map(function(c) { return c.fn; });
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (managed.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });

  _TRIGGERS_CONFIG_.forEach(function(cfg) {
    var b = ScriptApp.newTrigger(cfg.fn).timeBased();
    if (cfg.type === "everyMinutes") b.everyMinutes(cfg.val);
    else if (cfg.type === "everyHours") b.everyHours(cfg.val);
    else if (cfg.type === "everyDays") { b.everyDays(cfg.val); if (cfg.heure != null) b.atHour(cfg.heure); }
    b.create();
    Logger.log("⏰ Trigger créé : %s → %s(%s)", cfg.fn, cfg.type, cfg.val);
  });

  Logger.log("✅ %s triggers configurés", _TRIGGERS_CONFIG_.length);
}

// ADMIN_migrateUsersToSupabase supprimé (S7) — migration déjà faite, plus de feuille UTILISATEURS

// ══════════════════════════════════════════════════════════════════
//  🧹 MAINTENANCE SCRIPT PROPERTIES
// ══════════════════════════════════════════════════════════════════

function ADMIN_nettoyerScriptProperties() {
  var MAX = 1000;
  var props    = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var keys     = Object.keys(allProps);

  Logger.log("🧹 Script Properties — avant: %s", keys.length);
  if (keys.length <= MAX) { Logger.log("Pas de nettoyage nécessaire"); return; }

  var keep = {};
  keys.slice(-MAX).forEach(function(k) { keep[k] = allProps[k]; });
  props.deleteAllProperties();
  props.setProperties(keep);
  Logger.log("✅ Nettoyage : %s gardées sur %s", MAX, keys.length);
}

// ══════════════════════════════════════════════════════════════════
//  🔍 GESTION DES DÉCLENCHEURS
// ══════════════════════════════════════════════════════════════════

function ADMIN_listerDeclencheurs() {
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log("═══════════ DÉCLENCHEURS (%s) ═══════════", triggers.length);
  triggers.forEach(function(t, i) {
    Logger.log("%s. %s | source=%s | type=%s | id=%s",
      i + 1, t.getHandlerFunction(), t.getTriggerSource(), t.getEventType(), t.getUniqueId());
  });
}

function ADMIN_resetDeclencheurs() {
  var old = ScriptApp.getProjectTriggers();
  Logger.log("♻️ Suppression de %s triggers...", old.length);
  old.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  Logger.log("✅ Tous les triggers supprimés. Relancer ADMIN_setupSyncTriggers pour les recréer.");
}

// ADMIN_embellir* + ADMIN_compterCellules supprimés (S7) — plus de Google Sheets

// ══════════════════════════════════════════════════════════════════
//  🔗 COMPAT STUB — appendLogToLOGSV2_ (redirect → nc_events)
//  Laissé en place pour compatibilité avec anciens appels résiduels.
// ══════════════════════════════════════════════════════════════════

function appendLogToLOGSV2_(fields) {
  try {
    if (typeof _logEvent_ === "function" && fields && fields.log_type) {
      _logEvent_({
        log_type:       fields.log_type      || "UNKNOWN",
        actor:          fields.actor         || fields.source || "gas",
        order_id:       fields.objet_id      || fields.order_id || null,
        ancien_statut:  fields.meta_ancien   || null,
        nouveau_statut: fields.statut        || null,
        extra:          { meta_1: fields.meta_1||null, meta_2: fields.meta_2||null,
                          meta_3: fields.meta_3||null, meta_4: fields.meta_4||null,
                          resume: fields.resume||null }
      });
    }
  } catch (_e) {}
}
