"use client";

// ═══════════════════════════════════════════════════════════════════
//  supabase-direct.js — CRUD direct vers Supabase (0 GAS pour CRUD)
//  Toutes les opérations de lecture/écriture des pages dashboard
//  passent ici. GAS reste uniquement pour la logique métier complexe
//  (injection ZR, cloture, barrage global, etc.)
// ═══════════════════════════════════════════════════════════════════

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ── Helper write via /api/sb-write (service key, bypass RLS) ─────
// Utilisé pour INSERT/PATCH sur tables avec RLS strict (nc_rapports, nc_barrage)
async function _sbWrite(table, method, filter, data) {
  const res = await fetch("/api/sb-write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, method, filter, data }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sb-write ${table} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Helper fetch (lecture — anon key) ────────────────────────────

async function _sb(path, options = {}) {
  const url = SB_URL + "/rest/v1/" + path;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey:        SB_KEY,
      Authorization: "Bearer " + SB_KEY,
      "Content-Type":  "application/json",
      Prefer:         options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  if (options.raw) return res;
  if (res.status === 204 || res.headers.get("content-length") === "0") return {};
  return res.json();
}

// ── Helper pagination : contourne le plafond 1000 lignes de Supabase ─
// Utilise l'en-tête Range pour paginer automatiquement jusqu'à tout récupérer
async function _sbAll(basePath, pageSize = 1000) {
  let all = [];
  let from = 0;
  while (true) {
    const url = SB_URL + "/rest/v1/" + basePath;
    const res = await fetch(url, {
      headers: {
        apikey:        SB_KEY,
        Authorization: "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        Prefer:        "return=representation",
        "Range-Unit":  "items",
        Range:         `${from}-${from + pageSize - 1}`,
      },
    });
    // 206 Partial Content = encore des données, 200 = dernière page
    if (!res.ok && res.status !== 206) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase ${basePath} ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json().catch(() => []);
    if (!Array.isArray(data) || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break; // dernière page
    from += pageSize;
  }
  return all;
}

// ── Détection doublons (24h window, exclut last='OUI') ───────────
// Deux commandes = doublon uniquement si même téléphone ET moins de 24h d'écart.
// Les commandes clôturées (last='OUI') sont exclues de la détection.
function _computeDoublons(rows) {
  const MS_24H = 24 * 60 * 60 * 1000;

  // Exclure les commandes clôturées de la détection
  const active = rows.filter(o => (o.last || "") !== "OUI");

  // Regrouper par numéro de téléphone
  const byPhone = {};
  active.forEach(o => {
    const phone = String(o.customer_phone || "").trim();
    if (!phone) return;
    if (!byPhone[phone]) byPhone[phone] = [];
    byPhone[phone].push(o);
  });

  // Trouver les paires dans la fenêtre de 24h
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

  // Attribuer les labels doublon_N (par téléphone, newest-first)
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

// ── ORDERS ───────────────────────────────────────────────────────

export async function sbGetOrders() {
  // Filtre principal : POS exclus + commandes archivées exclues (archived=true)
  const rows = await _sbAll(
    "nc_orders?order_source=neq.pos&archived=neq.true&order=order_date.desc.nullslast"
    + "&select=order_id,order_date,customer_phone,customer_name,wilaya,commune,adresse,"
    + "decision_status,confirmation_status,contact_status,contact_attempts,cancellation_reason,"
    + "order_change_status,customer_type,order_total,shipping_fee,note,note_manager,"
    + "order_items_summary,shopify_order_url,shopify_order_name,shopify_delivery_mode,"
    + "tracking,shipping_status,statut_preparation,prepared_by,prepared_at,"
    + "order_source,items_json,doublon,customer_summary,last,cloture,archived,restocked,synchroniser,synced_at,"
    + "coupon_code,coupon_discount,delivery_price,delivery_type,delivery_mode"
  );

  // Filtre JS de sécurité : exclure les archivées (null = pas archivé, false = actif)
  const filtered = rows.filter(o => o.archived !== true);

  // Recalculer les doublons avec la logique 24h + exclusion last='OUI'
  _computeDoublons(filtered);

  // Garantir le tri newest-first côté client (sécurité : nulls en dernier)
  filtered.sort((a, b) => {
    const da = a.order_date ? new Date(a.order_date).getTime() : 0;
    const db = b.order_date ? new Date(b.order_date).getTime() : 0;
    return db - da;
  });

  return { ok: true, rows: filtered, count: filtered.length };
}

// Parse order_items_summary comme fallback quand items_json est null
// Format : "1x Titre produit (200.00 DA) | 2x Autre produit (500.00 DA)"
function _parseSummary(summary) {
  if (!summary) return [];
  return summary.split("|").map(s => s.trim()).filter(Boolean).map(seg => {
    // Essayer de parser "Nx Titre (Prix DA)" — le titre peut contenir des "x"
    const m = seg.match(/^(\d+)x\s+(.+?)\s+\(([0-9.]+)\s*DA\)$/i);
    if (m) {
      return { quantity: Number(m[1]), title: m[2].replace(/\s+x\s*$/, "").trim(), price: parseFloat(m[3]) };
    }
    // Fallback sans prix : "Nx Titre"
    const m2 = seg.match(/^(\d+)x\s+(.+)$/i);
    if (m2) return { quantity: Number(m2[1]), title: m2[2].trim(), price: 0 };
    return { quantity: 1, title: seg, price: 0 };
  }).filter(it => it.title);
}

// Lit items_json depuis nc_orders + enrichit avec images nc_variants
// Remplace l'appel GAS GET_ORDER_ITEMS (0 latence réseau supplémentaire car items_json est déjà en base)
export async function sbGetOrderItems(orderId) {
  const rows = await _sb(
    `nc_orders?order_id=eq.${encodeURIComponent(orderId)}&select=items_json,order_items_summary&limit=1`
  );
  const row = rows[0];
  if (!row) return { ok: true, rows: [] };

  // items_json peut être un tableau ou un objet unique (legacy)
  let items = [];
  if (row.items_json) {
    items = Array.isArray(row.items_json) ? row.items_json : [row.items_json];
    items = items.filter(Boolean);
  }

  // Fallback : parser order_items_summary si items_json est vide/null
  if (items.length === 0 && row.order_items_summary) {
    const parsed = _parseSummary(row.order_items_summary);
    if (parsed.length === 0) return { ok: true, rows: [] };

    // Chercher les images par titre — lire depuis le cache localStorage (0 requête réseau)
    let imgByTitle = {};
    try {
      const titles = parsed.map(it => it.title.toLowerCase());

      // 1. Essayer le cache localStorage (nc_lc_variants) — déjà chargé par la page
      let varRows = null;
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem("nc_lc_variants");
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.data?.rows) varRows = cached.data.rows;
        }
      }

      // 2. Fallback : requête Supabase ciblée uniquement si cache absent
      if (!varRows) {
        varRows = await _sb(
          `nc_variants?select=display_name,product_title,image_url&limit=3000`
        );
      }

      // 3. Matcher par titre (inclusion partielle)
      (varRows || []).forEach(v => {
        const name = (v.display_name || v.product_title || "").toLowerCase();
        if (!name || !v.image_url) return;
        titles.forEach(t => {
          if (!imgByTitle[t]) {
            // Match exact ou titre contient le nom du produit
            const words = t.split(" ").filter(w => w.length > 3);
            const score = words.filter(w => name.includes(w)).length;
            if (score >= Math.min(2, words.length)) imgByTitle[t] = v.image_url;
          }
        });
      });
    } catch (_) {}

    return {
      ok: true,
      rows: parsed.map(it => ({
        variant_id:     null,
        title:          it.title,
        quantity:       it.quantity,
        price:          it.price,
        sku:            null,
        total_products: it.price * it.quantity,
        image_url:      imgByTitle[it.title.toLowerCase()] || null,
        from_summary:   true,
      })),
    };
  }

  if (items.length === 0) return { ok: true, rows: [] };

  // Enrichir avec les images depuis nc_variants
  const variantIds = [...new Set(items.map(it => it.variant_id).filter(Boolean))];
  let varMap = {};
  if (variantIds.length > 0) {
    try {
      const varRows = await _sb(
        `nc_variants?variant_id=in.(${variantIds.map(encodeURIComponent).join(",")})&select=variant_id,image_url`
      );
      varRows.forEach(v => { if (v.variant_id) varMap[String(v.variant_id)] = v.image_url || null; });
    } catch (_) {}
  }

  const enriched = items.map(it => ({
    variant_id:     it.variant_id    || null,
    title:          it.title         || it.product_title || "",
    quantity:       Number(it.qty || it.quantity || 1),
    price:          parseFloat(it.price || "0"),
    sku:            it.sku           || null,
    total_products: parseFloat(it.price || "0") * Number(it.qty || it.quantity || 1),
    image_url:      varMap[String(it.variant_id)] || null,
  }));

  return { ok: true, rows: enriched };
}

export async function sbGetOrderById(orderId) {
  const rows = await _sb(`nc_orders?order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
  return rows[0] || null;
}

export async function sbUpdateConfirmation(orderId, fields) {
  await _sb(`nc_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify(fields),
  });
  return { ok: true };
}

export async function sbUpdatePreparation(orderId, statut, agent) {
  const patch = { statut_preparation: statut };
  if (agent)  patch.prepared_by = agent;
  if (statut) patch.prepared_at = statut !== "" ? new Date().toISOString() : null;
  await _sb(`nc_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify(patch),
  });
  return { ok: true };
}

// ── SUIVI ZR ─────────────────────────────────────────────────────

export async function sbGetSuiviZR() {
  // Retourne TOUS les colis (actifs + terminés) — le filtre actif/terminé se fait côté UI
  // Tri : date_injection DESC (plus récent en premier), nulls last
  const rows = await _sbAll(
    "nc_suivi_zr"
    + "?order=date_injection.desc.nullslast,updated_at.desc"
    + "&select=tracking,parcel_id,order_id,customer_name,customer_phone,wilaya,adresse,"
    + "carrier,statut_livraison,attempts_count,delivery_mode,shopify_order_name,"
    + "next_action,ops_note,ops_status,final_status,"
    + "order_total,date_injection,date_livraison,updated_at,journal_resume,link_zr"
  );
  return { ok: true, rows, count: rows.length };
}

export async function sbUpdateSuiviZR(tracking, fields) {
  await _sb(`nc_suivi_zr?tracking=eq.${encodeURIComponent(tracking)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  return { ok: true };
}

// ── BARRAGE ──────────────────────────────────────────────────────

export async function sbGetBarrage() {
  const rows = await _sbAll(
    "nc_barrage?order=synced_at.desc"
    + "&select=variant_id,product_title,variant_image_url,"
    + "balise,available,on_hand,committed,stock_cible,agent,note_agent,verifie,synced_at"
  );
  return { ok: true, rows, count: rows.length };
}

export async function sbUpdateBarrage(variantId, fields) {
  await _sbWrite(
    "nc_barrage",
    "PATCH",
    `variant_id=eq.${encodeURIComponent(variantId)}`,
    fields
  );
  return { ok: true };
}

// ── VARIANTS (catalogue) ─────────────────────────────────────────

export async function sbGetVariants() {
  // Exclure les variantes fantômes (product_title NULL = imports Shopify corrompus)
  // Tri par synced_at desc = articles les plus récemment ajoutés à la plateforme en premier
  const rows = await _sbAll(
    "nc_variants?order=synced_at.desc.nullslast"
    + "&product_title=not.is.null"
    + "&select=variant_id,display_name,product_title,variant_title,sku,barcode,"
    + "price,cost_price,inventory_quantity,image_url,status,vendor,collections_titles,"
    + "admin_product_url,updated_at_shopify,synced_at"
  );
  return { ok: true, rows, count: rows.length };
}

// ── RAPPORTS ─────────────────────────────────────────────────────

export async function sbGetRapports() {
  const rows = await _sbAll(
    "nc_rapports?order=created_at.desc"
    + "&select=report_id,categorie,cas,type,severity,agent,status,verified,manager_note,"
    + "description,action_taken,action_needed,order_id,tracking,product_name,"
    + "valeur,fournisseur,piece_jointe,created_at,updated_at"
  );
  return { ok: true, rows, count: rows.length };
}

export async function sbAddRapport(data) {
  // product_variant_id n'existe pas dans nc_rapports — on l'exclut
  // eslint-disable-next-line no-unused-vars
  const { product_variant_id, ...raw } = data;
  // Convertir les chaînes vides en null pour éviter les violations de contrainte Supabase
  const cleanData = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" ? null : v])
  );
  const result = await _sbWrite("nc_rapports", "POST", "", {
    report_id:  crypto.randomUUID(),
    ...cleanData,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const row = (result.rows || [])[0] || {};

  // ── Sync automatique CAISSE_OPERATION → nc_gestion_fond ──────────
  // Quand un agent dépose une recette (ou toute opération caisse) via rapport,
  // on crée automatiquement la transaction correspondante dans finance.
  if (data.categorie === "CAISSE_OPERATION" && result.rows?.length) {
    const montant = Number(data.valeur) || 0;
    if (montant > 0) {
      try {
        await sbAddTransaction({
          type:        data.cas,
          categorie:   data.type || data.cas,
          montant,
          agent:       data.agent || null,
          description: data.description || "",
          fournisseur: data.fournisseur || null,
          order_id:    data.order_id || null,
          source:      "rapport",
        });
      } catch (e) {
        console.warn("[sbAddRapport] sync nc_gestion_fond échoué:", e.message);
      }
    }
  }

  return { ok: !!(result.rows?.length), report_id: row.report_id, row };
}

export async function sbUpdateRapport(reportId, fields) {
  // product_variant_id n'existe pas dans nc_rapports — on l'exclut
  // eslint-disable-next-line no-unused-vars
  const { product_variant_id, ...cleanFields } = fields;
  await _sbWrite(
    "nc_rapports",
    "PATCH",
    `report_id=eq.${encodeURIComponent(reportId)}`,
    { ...cleanFields, updated_at: new Date().toISOString() }
  );
  return { ok: true };
}

// ── EVENTS ───────────────────────────────────────────────────────

export async function sbGetRecentEvents(limit = 300, logType = null) {
  let path = `nc_events?order=ts.desc&limit=${limit}`
    + "&select=event_id,ts,log_type,actor,order_id,variant_id,note,extra,label,nouveau_statut,ancien_statut";
  if (logType) path += `&log_type=eq.${encodeURIComponent(logType)}`;
  const rows = await _sb(path);
  return { ok: true, rows };
}

export async function sbGetCorrectionEvents(variantIds) {
  if (!variantIds || variantIds.length === 0) return { ok: true, rows: [] };
  const ids = variantIds.map(encodeURIComponent).join(",");
  const rows = await _sb(
    `nc_events?log_type=in.(CORRECTION_BARRAGE,EXIT_BARRAGE,NOTE_BARRAGE)&variant_id=in.(${ids})`
    + "&order=ts.desc&limit=200"
    + "&select=event_id,ts,log_type,actor,variant_id,ancien_statut,nouveau_statut,qty,label,note"
  );
  return { ok: true, rows };
}

export async function sbGetExitBarrageHistory() {
  const rows = await _sbAll(
    "nc_events?log_type=in.(EXIT_BARRAGE,CORRECTION_BARRAGE,NOTE_BARRAGE)"
    + "&order=ts.desc"
    + "&select=event_id,ts,log_type,actor,variant_id,ancien_statut,nouveau_statut,qty,label,note,extra"
  );
  return { ok: true, rows };
}

// ── PO LINES ─────────────────────────────────────────────────────

export async function sbGetPOLines() {
  const rows = await _sbAll(
    "nc_po_lines?order=created_at.desc"
    + "&select=po_line_id,po_id,variant_id,display_name,product_title,qty_add,sell_price,purchase_price,barcode,note,agent,synced_at,collections_titles_pick,created_at"
  );
  return { ok: true, rows, count: rows.length };
}

// sbAddPOLines remplacé par POST /api/po/lines (T204) — colonnes correctes + agent

// ── GESTION FOND ──────────────────────────────────────────────────

export async function sbGetGestionFond() {
  const rows = await _sbAll(
    "nc_gestion_fond?order=timestamp.desc"
    + "&select=id_fond,timestamp,agent,categorie,type,montant,description,order_id,fournisseur,source"
  );
  return { ok: true, rows, count: rows.length };
}

export async function sbAddTransaction(data) {
  const idFond = data.id_fond || ("fd_" + Math.random().toString(36).slice(2, 10));
  const rows = await _sb("nc_gestion_fond", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      ...data,
      id_fond:    idFond,
      source:     data.source || "dashboard",
      timestamp:  data.timestamp || new Date().toISOString(),
      synced_at:  new Date().toISOString(),
    }),
  });
  return { ok: true, row: rows[0] };
}

export async function sbDeleteTransaction(idFond) {
  await _sb(`nc_gestion_fond?id_fond=eq.${encodeURIComponent(idFond)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  return { ok: true };
}

// ── RECETTES ─────────────────────────────────────────────────────

export async function sbGetRecettes(limit = 100) {
  const rows = await _sb(
    `nc_recettes?order=depot_timestamp.desc&limit=${limit}`
    + "&select=recette_id,depot_timestamp,agent,total_calcule,total_declare,ecart,anomalie,verified,leader,nb_commandes,premier_order_id,dernier_order_id"
  );
  return { ok: true, rows, count: rows.length };
}

// ── KPI STOCK (via views PostgreSQL) ─────────────────────────────

export async function sbGetKpiStock() {
  const rows = await _sbAll(
    "nc_kpi_stock_view?order=score_urgence.desc"
    + "&select=variant_id,product_title,image_url,price,cost_price,stock_actuel,"
    + "vitesse_par_jour,jours_restants,score_urgence,quantite_a_commander,"
    + "benefice_60j,perte_estimee_rupture,vendor,sku,collections_titles,dispo,jamais_vendu,Achetee,"
    + "jours_disponibilite,quantite_vendue,nb_commandes"
  );
  return { ok: true, rows, count: rows.length };
}

export async function sbGetKpiJamaisVendus() {
  const rows = await _sbAll(
    "nc_kpi_jamais_vendus_view?"
    + "&select=variant_id,product_title,image_url,stock_actuel,dispo,price,cost_price,valeur_stock,type_produit,vendor,collections_titles"
    + "&order=stock_actuel.desc"
  );
  return { ok: true, rows, count: rows.length };
}

// ── USERS ─────────────────────────────────────────────────────────

export async function sbGetUsers() {
  const rows = await _sb(
    "nc_users?order=nom.asc"
    + "&select=id,nom,email,role,active,badge,created_at"
    + "&active=eq.true"
  );
  return { ok: true, users: rows, rows, count: rows.length };
}

export async function sbUpsertUser(nom, role, email, badge) {
  const rows = await _sb("nc_users", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    headers: { "on_conflict": "nom" },
    body: JSON.stringify({
      nom,
      role:       role || "agent",
      email:      email || nom.toLowerCase().replace(/\s+/g, ".") + "@najmcoiff.dz",
      badge:      badge || "",
      active:     true,
      updated_at: new Date().toISOString(),
    }),
  });
  return { ok: true, row: rows[0] };
}

export async function sbDeactivateUser(nom) {
  await _sb(`nc_users?nom=eq.${encodeURIComponent(nom)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
  });
  return { ok: true };
}

// ── PARTENAIRES ──────────────────────────────────────────────────

export async function sbGetPartenaires() {
  const rows = await _sb(
    "nc_partenaires?active=eq.true&order=code.asc&select=id,code,nom,percentage,active,created_at,created_by"
  );
  return { ok: true, rows, count: rows.length };
}

// ── COMPTEURS HOME (0 GAS — directs Supabase) ─────────────────────

export async function sbGetCompteurs() {
  // Filtre : POS exclus + commandes archivées exclues
  const rows = await _sb(
    "nc_orders?order_source=neq.pos&archived=neq.true"
    + "&select=decision_status,confirmation_status,contact_status,statut_preparation,archived,tracking"
    + "&limit=5000"
  );

  // Filtre JS de sécurité : exclure les archivées
  const activeRows = rows.filter(o => o.archived !== true);

  let total = 0, confirmes = 0, annules = 0, a_traiter = 0,
      a_modifier = 0, rappels = 0, injoignables = 0, prepares = 0;

  for (const r of activeRows) {
    const ds  = (r.decision_status     || "").toLowerCase();
    const cs  = (r.confirmation_status || "").toLowerCase();
    const ct  = (r.contact_status      || "").toLowerCase();
    const sp  = (r.statut_preparation  || "").toLowerCase();

    if (ds === "annule" || cs === "annule") { annules++; continue; }
    total++;
    if (cs === "confirme")      confirmes++;
    else if (cs === "a modifier" || cs === "amodifier") a_modifier++;
    else if (ct === "rappel")   rappels++;
    else if (ct === "injoignable" || ct === "ne repond pas") injoignables++;
    else                        a_traiter++;
    if (sp === "prepare" || sp === "préparé" || sp === "pret") prepares++;
  }

  const taux_confirmation = total > 0 ? Math.round(confirmes / total * 100) : 0;

  return {
    ok: true,
    stats: { total, confirmes, annules, a_traiter, a_modifier, rappels, injoignables, prepares, taux_confirmation },
  };
}
