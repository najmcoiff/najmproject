"use client";

// ═══════════════════════════════════════════════════════════════════
//  api.js — Couche d'accès données v5 (Phase M4 — 0 GAS, 0 Shopify)
//
//  Architecture :
//    LECTURE RAPIDE   → Supabase direct → localStorage cache
//    ÉCRITURE CRUD    → Supabase direct (< 300ms)
//    LOGIQUE MÉTIER   → Routes Vercel natives (/api/*)
//
//  GAS éliminé (T203-T207) — toutes les actions sont native Vercel :
//    MODIFY_ORDER   → /api/orders/modify-items
//    RUN_INJECT_PO  → /api/po/inject
//    ADD_PO_LINES   → /api/po/lines
// ═══════════════════════════════════════════════════════════════════

import {
  sbGetOrders, sbGetSuiviZR, sbGetVariants, sbGetBarrage,
  sbGetRapports, sbGetPOLines, sbGetGestionFond, sbGetRecettes,
  sbGetUsers, sbGetKpiStock, sbGetKpiJamaisVendus, sbGetCompteurs,
  sbGetOrderItems, sbGetCorrectionEvents, sbGetExitBarrageHistory,
  sbGetPartenaires,
  sbUpdateConfirmation, sbUpdatePreparation,
  sbUpdateSuiviZR, sbUpdateBarrage,
  sbAddRapport, sbUpdateRapport,
  sbAddTransaction, sbDeleteTransaction,
  sbUpsertUser, sbDeactivateUser,
} from "@/lib/supabase-direct";


function getToken() {
  try {
    // localStorage en priorité (nouveau), sessionStorage en fallback (legacy)
    const raw = localStorage.getItem("nc_session") || sessionStorage.getItem("nc_session");
    return raw ? JSON.parse(raw).token : null;
  } catch { return null; }
}

// Appelé quand le serveur renvoie 401/403 — session expirée ou invalide
// Émet un event DOM pour que le layout affiche la modale de reconnexion
// (évite la redirection brutale qui interrompt le travail en cours)
function _handleExpiredSession() {
  try {
    localStorage.removeItem("nc_session");
    sessionStorage.removeItem("nc_session");
  } catch { /* ignore */ }
  if (typeof window !== "undefined") {
    // Émettre l'event d'abord (capturé par DashboardLayout)
    window.dispatchEvent(new Event("session:expired"));
  }
}

// Wrapper fetch qui intercepte les 401/403 globalement
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    _handleExpiredSession();
    return { ok: false, error: "Session expirée" };
  }
  return res;
}

// ── Helpers localStorage ──────────────────────────────────────────

function _lsGet(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem("nc_lc_" + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function _lsSet(key, data, ttlMs) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("nc_lc_" + key, JSON.stringify({ data, expires: Date.now() + ttlMs }));
    }
  } catch (_) {}
}

export function invalidateCache(key) {
  try { if (typeof localStorage !== "undefined") localStorage.removeItem("nc_lc_" + key); } catch (_) {}
}

const SEC30 = 30  * 1000;
const MIN1  = 1   * 60 * 1000;
const MIN2  = 2   * 60 * 1000;
const MIN5  = 5   * 60 * 1000;
const MIN10 = 10  * 60 * 1000;

// ── Cache 2 niveaux : localStorage → Supabase direct ─────────────
// Tier 1 (0ms)      : localStorage si encore valide
// Tier 2 (< 300ms)  : Supabase direct
async function cached(sbFn, localKey, ttlMs) {
  const ls = _lsGet(localKey);
  if (ls && Date.now() < ls.expires) return ls.data;
  try {
    const result = await sbFn();
    if (result?.rows?.length > 0 || result?.count >= 0) {
      _lsSet(localKey, result, ttlMs);
    }
    return result;
  } catch (err) {
    if (ls) return ls.data; // dégradé : retourner le cache périmé
    throw err;
  }
}

// ── Cache localStorage → GAS (pour les endpoints sans Supabase table) ──
function withLocalCache(key, ttlMs, fn) {
  return async (...args) => {
    const ls = _lsGet(key);
    if (ls && Date.now() < ls.expires) return ls.data;
    let result;
    try {
      result = await fn(...args);
    } catch (e) {
      if (ls) return ls.data;
      throw e;
    }
    if (result?.ok) _lsSet(key, result, ttlMs);
    if (!result?.ok && ls) return ls.data;
    return result;
  };
}

export const api = {

  // ── Auth ──────────────────────────────────────────────────────
  login: async (username, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  },

  // ── LECTURES DIRECTES SUPABASE (0 GAS, < 300ms) ──────────────
  getOrders:          ()      => cached(() => sbGetOrders(),     "orders",   MIN2),
  getSuiviZR:         ()      => cached(() => sbGetSuiviZR(),    "suivi_zr", MIN2),
  getVariantsCache:   ()      => cached(() => sbGetVariants(),   "variants", MIN10),
  getBarrage:         ()      => cached(() => sbGetBarrage(),    "barrage",  MIN5),
  getRapports:        ()      => cached(() => sbGetRapports(),   "rapports", MIN5),
  getPOLines:         ()      => cached(() => sbGetPOLines(),    "po_lines", MIN5),
  getGestionFond:     ()      => cached(() => sbGetGestionFond(),"gestion_fond", MIN5),
  getRecettesFond:    ()      => cached(() => sbGetRecettes(),   "recettes_fond", MIN5),
  getUsers:           ()      => cached(() => sbGetUsers(),      "users", MIN10),

  // ── KPI STOCK : Supabase views directes (0 GAS) ──────────────
  getKpiStock:        () => cached(() => sbGetKpiStock(),        "kpi_stock_v2", MIN10),
  getKpiJamaisVendus: () => cached(() => sbGetKpiJamaisVendus(), "kpi_jv",    MIN10),

  // ── COMPTEURS : direct Supabase (0 GAS — ~100ms) ─────────────
  getCompteurs:     () => cached(() => sbGetCompteurs(), "compteurs", MIN2),

  // ── LECTURES VERCEL / SUPABASE DIRECT (0 GAS) ────────────────
  getQuota:         withLocalCache("quota",         MIN5,  () => fetch("/api/quota", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken() }) }).then(r => r.json())),
  getRecette:       () => cached(() => sbGetRecettes(), "recette", MIN5),
  getOnlineOrders:  withLocalCache("online_orders", MIN5,  (l) => fetch("/api/orders/online", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken(), limit: l || 300 }) }).then(r => r.json())),
  getOrderItems:        (order_id)    => sbGetOrderItems(order_id),
  getCorrectionEvents:  (variantIds)  => sbGetCorrectionEvents(variantIds),
  getExitBarrageHistory: ()           => sbGetExitBarrageHistory(),
  getPOLabels:      (po_id)      => fetch("/api/po/labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken(), po_id: po_id || "" }) }).then(r => r.json()),

  // ── ÉCRITURES DIRECTES SUPABASE (< 300ms) ────────────────────

  updateConfirmation: async (order_id, fields) => {
    const r = await sbUpdateConfirmation(order_id, fields);
    invalidateCache("orders");
    return r;
  },

  updatePreparation: async (order_id, statut) => {
    const session = (() => { try { return JSON.parse(sessionStorage.getItem("nc_session")); } catch { return null; } })();
    const r = await sbUpdatePreparation(order_id, statut, session?.user?.nom);
    invalidateCache("orders");
    return r;
  },

  updateSuiviZR: async (tracking, next_action, ops_note, actorName, currentJournal) => {
    // Construire la ligne journal : "agent : JJ-MM-AAAA HH:MM action ; note : xxx"
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const dateStr = `${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const actor = actorName || "agent";
    let newLine = `${actor} : ${dateStr} ${next_action}`;
    if (ops_note && ops_note.trim()) newLine += ` ; note : ${ops_note.trim()}`;

    // Prepend au journal existant (le plus récent en premier)
    const existingJournal = (currentJournal || "").trim();
    const updatedJournal = existingJournal ? `${newLine}\n${existingJournal}` : newLine;

    const r = await sbUpdateSuiviZR(tracking, {
      next_action,
      ops_note,
      journal_resume: updatedJournal,
    });
    invalidateCache("suivi_zr");
    return r;
  },

  finSuiviZR: async (tracking, closure_reason) => {
    const r = await sbUpdateSuiviZR(tracking, {
      final_status: closure_reason || "cloture",
      ops_status:   "cloture",
      updated_at:   new Date().toISOString(),
    });
    invalidateCache("suivi_zr");
    return r;
  },

  refreshSuiviZR: async () => {
    const r = await fetch("/api/suivi-zr/refresh", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: getToken() }),
    }).then(res => res.json());
    if (r.ok) invalidateCache("suivi_zr");
    return r;
  },

  updateBarrage: async (variant_id, fields) => {
    const r = await sbUpdateBarrage(variant_id, fields);
    invalidateCache("barrage");
    return r;
  },

  addRapport: async (data) => {
    const r = await sbAddRapport(data);
    invalidateCache("rapports");
    return r;
  },

  deleteRapport: async (report_id) => {
    const r = await fetch(`/api/rapports/${encodeURIComponent(report_id)}`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
    }).then(res => res.json());
    if (r.ok) invalidateCache("rapports");
    return r;
  },

  updateRapport: async (report_id, fields) => {
    const r = await sbUpdateRapport(report_id, fields);
    invalidateCache("rapports");
    return r;
  },

  addPOLines: async (po_id, lines) => {
    const r = await fetch("/api/po/lines", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: getToken(), po_id, lines }),
    }).then(res => res.json());
    if (r.ok) invalidateCache("po_lines");
    return r;
  },

  addTransaction: async (data) => {
    const r = await sbAddTransaction(data);
    invalidateCache("gestion_fond");
    invalidateCache("recettes_fond");
    return r;
  },

  deleteTransaction: async (id_fond) => {
    const r = await sbDeleteTransaction(id_fond);
    invalidateCache("gestion_fond");
    return r;
  },

  resetFond: async () => {
    const r = await fetch("/api/fond/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken() }) }).then(res => res.json());
    invalidateCache("gestion_fond");
    return r;
  },

  markAchete: async (variant_id, achete) => {
    const r = await fetch("/api/variants/mark-achete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken(), variant_id, achete }) }).then(res => res.json());
    invalidateCache("kpi_stock");
    invalidateCache("kpi_jv");
    return r;
  },

  // ── FOURNISSEURS ──────────────────────────────────────────────
  getFournisseurs: async () => {
    const r = await fetch(`/api/fournisseur/list?token=${getToken()}`).then(res => res.json());
    return r;
  },

  createFournisseur: async (data) => {
    const r = await fetch("/api/fournisseur/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken(), ...data }),
    }).then(res => res.json());
    return r;
  },

  updateFournisseur: async (data) => {
    const r = await fetch("/api/fournisseur/list", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken(), ...data }),
    }).then(res => res.json());
    return r;
  },

  sendBCToFournisseur: async (po_id, fournisseur_ids) => {
    const r = await fetch("/api/po/send-to-fournisseur", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken(), po_id, fournisseur_ids }),
    }).then(res => res.json());
    if (r.ok) invalidateCache("po_lines");
    return r;
  },

  getComparaison: async (po_id) => {
    const r = await fetch(`/api/fournisseur/comparaison?token=${getToken()}&po_id=${po_id}`).then(res => res.json());
    return r;
  },

  addUser: async (nom, role, password, email = "") => {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ nom, role, password, email }),
    });
    const r = await res.json();
    invalidateCache("users");
    return r;
  },

  deleteUser: async (nom) => {
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ nom }),
    });
    const r = await res.json();
    invalidateCache("users");
    return r;
  },

  updateUserPassword: async (nom, password) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ nom, password }),
    });
    return res.json();
  },

  updateUserRole: async (nom, role) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify({ nom, role }),
    });
    const r = await res.json();
    invalidateCache("users");
    return r;
  },

  // ── OPÉRATIONS COMPLEXES → VERCEL (0 GAS sauf Shopify modify + PO inject) ──
  lancerQuota:      async (premierId, nbCmd) => {
    const r = await fetch("/api/quota/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ premierId: premierId || null, nbCmd: nbCmd || null, token: getToken() }) }).then(res => res.json());
    invalidateCache("quota"); // forcer rechargement immédiat
    return r;
  },
  runBarrageGlobal: async () => {
    const r = await fetch("/api/barrage/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken() }),
    }).then(res => res.json());
    invalidateCache("barrage");
    if (r.ok) invalidateCache("variants"); // stock page voit les nouvelles valeurs immédiatement
    return r;
  },
  lancerAnalyseBarrage: async () => { const r = await fetch("/api/barrage/analyse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken() }) }).then(res => res.json()); invalidateCache("barrage"); return r; },
  injectAllZR: async () => {
    const r = await fetch("/api/inject/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken() }) }).then(res => res.json());
    invalidateCache("orders");
    invalidateCache("suivi_zr"); // nouvelles entrées nc_suivi_zr visibles immédiatement
    return r;
  },
  injectSingleZR: async (order_id) => {
    const r = await fetch("/api/inject/single", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id, token: getToken() }) }).then(res => res.json());
    if (r.ok) {
      invalidateCache("orders");
      invalidateCache("suivi_zr"); // nouvelle entrée nc_suivi_zr visible immédiatement
    }
    return r;
  },
  injectManuel: async (order_id, tracking, carrier) => {
    const r = await fetch("/api/inject/manuel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken(), order_id, tracking, carrier }) }).then(res => res.json());
    if (r.ok) {
      invalidateCache("orders");
      invalidateCache("suivi_zr");
    }
    return r;
  },
  runInjectPO: async (po_id) => {
    const body = { token: getToken() };
    if (po_id) body.po_id = po_id;
    const r = await fetch("/api/po/inject", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }).then(res => res.json());
    if (r.ok) { invalidateCache("po_lines"); invalidateCache("variants"); }
    return r;
  },
  runCloture: async () => {
    const r = await fetch("/api/cloture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken() }) }).then(res => res.json());
    if (r.ok) { invalidateCache("orders"); invalidateCache("compteurs"); }
    return r;
  },
  // Modification native Supabase pour commandes nc_boutique/pos
  modifyItemsNative: async (order_id, new_items) => {
    const r = await fetch("/api/orders/modify-items", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: getToken(), order_id, new_items }),
    }).then(res => res.json());
    if (r.ok) { invalidateCache("orders"); invalidateCache("variants"); }
    return r;
  },
  updateCustomerInfo: async (order_id, fields) => {
    const r = await fetch("/api/orders/update-customer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken(), order_id, ...fields }),
    }).then(res => res.json());
    if (r.ok) invalidateCache("orders");
    return r;
  },

  deleteOrder: async (order_id, restock) => {
    const r = await fetch(`/api/orders/${order_id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken(), restock }),
    }).then(res => res.json());
    if (r.ok) { invalidateCache("orders"); invalidateCache("compteurs"); }
    return r;
  },

  addCodePartenaire: (code, nom, percentage) => fetch("/api/partenaires", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken(), code, nom, percentage }) }).then(r => r.json()),
  getPartenaires:   () => fetch("/api/partenaires", { headers: { Authorization: "Bearer " + getToken() } }).then(r => r.json()),
  countNewRapports: (since) => fetch("/api/rapports/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken(), since }) }).then(r => r.json()),
  getPosOrders:     (q, limit) => fetch("/api/orders/pos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken(), q: q || "", limit: limit || 100 }) }).then(r => r.json()),
  printPosTicket:   (order_id, force = false) => fetch("/api/print/pos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken(), order_id, force }) }).then(r => r.json()),
  printBarcodes:    async () => { const r = await fetch("/api/barcodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getToken() }) }).then(res => res.json()); return r; },
};

