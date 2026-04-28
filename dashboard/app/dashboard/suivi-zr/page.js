"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { getSession, getRawToken } from "@/lib/auth";
import { logActionSuivi } from "@/lib/logsv2";
import { smartMatch } from "@/lib/smart-search";

// ════════════════════════════════════════════════════════════════
//  ONGLET RECHERCHE ZR — snapshot live depuis ZR Express
// ════════════════════════════════════════════════════════════════

function statusColor(label) {
  const l = String(label || "").toLowerCase();
  if (/livr|encaiss|recouvert/.test(l)) return { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" };
  if (/livraison|bureau/.test(l))       return { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" };
  if (/transit|wilaya|collect|expéd|reçu|créé|assigné|prêt/.test(l)) return { bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" };
  if (/tentative|échou/.test(l))        return { bg: "bg-orange-100", text: "text-orange-800", dot: "bg-orange-500" };
  if (/retour|annul/.test(l))           return { bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" };
  return { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
}

function fmtDateZR(val) {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ParcelCard({ snapshot, history }) {
  const { bg, text, dot } = statusColor(snapshot.stateLabel);
  const zrLink = `https://zrexpress.app/track/${snapshot.trackingNumber}`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header coloré */}
      <div className="bg-gray-900 px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-white font-bold text-base">{snapshot.customerName}</div>
          <div className="text-gray-300 font-mono text-sm mt-0.5">{snapshot.trackingNumber}</div>
          {snapshot.externalId && (
            <div className="text-gray-400 text-xs mt-0.5">Réf : {snapshot.externalId}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${bg} ${text}`}>
            {snapshot.stateLabel}
          </span>
          {snapshot.stateIsFinal && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">Terminé</span>
          )}
        </div>
      </div>

      {/* Infos client */}
      <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs border-b border-gray-100">
        <div>
          <span className="text-gray-400 block mb-0.5">Téléphone 1</span>
          <span className="font-semibold text-gray-900">{snapshot.phone1 || "—"}</span>
        </div>
        {snapshot.phone2 && (
          <div>
            <span className="text-gray-400 block mb-0.5">Téléphone 2</span>
            <span className="font-semibold text-gray-900">{snapshot.phone2}</span>
          </div>
        )}
        <div>
          <span className="text-gray-400 block mb-0.5">Wilaya</span>
          <span className="font-semibold text-gray-900">{snapshot.city}</span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">Commune</span>
          <span className="font-semibold text-gray-900">{snapshot.district}</span>
        </div>
        {snapshot.street && (
          <div className="col-span-2">
            <span className="text-gray-400 block mb-0.5">Adresse</span>
            <span className="font-semibold text-gray-900">{snapshot.street}</span>
          </div>
        )}
        <div>
          <span className="text-gray-400 block mb-0.5">Mode livraison</span>
          <span className="font-semibold text-gray-900">{snapshot.deliveryType === "pickup-point" ? "Bureau / Relais" : "Domicile"}</span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">Tentatives</span>
          <span className={`font-bold ${snapshot.attempts > 0 ? "text-orange-600" : "text-gray-900"}`}>{snapshot.attempts}</span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">Montant COD</span>
          <span className="font-bold text-gray-900">{snapshot.amount ? snapshot.amount.toLocaleString("fr-FR") + " DA" : "—"}</span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">Frais livraison</span>
          <span className="font-semibold text-gray-900">{snapshot.deliveryPrice ? snapshot.deliveryPrice.toLocaleString("fr-FR") + " DA" : "—"}</span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">Dernière MAJ</span>
          <span className="font-semibold text-gray-900">{fmtDateZR(snapshot.lastUpdate)}</span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">Créé le</span>
          <span className="font-semibold text-gray-900">{fmtDateZR(snapshot.createdAt)}</span>
        </div>
      </div>

      {/* Timeline historique */}
      {history && history.length > 0 && (
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Historique des statuts</div>
          <div className="relative">
            {/* Ligne verticale */}
            <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-200" />
            <div className="space-y-3">
              {history.map((h, idx) => {
                const c = statusColor(h.label);
                const isFirst = idx === 0;
                return (
                  <div key={idx} className="flex items-start gap-3 relative">
                    <div className={`w-4 h-4 rounded-full border-2 border-white flex-shrink-0 mt-0.5 ${isFirst ? c.dot : "bg-gray-300"} shadow-sm`} style={{ zIndex: 1 }} />
                    <div className={`flex-1 rounded-lg px-3 py-2 ${isFirst ? "bg-blue-50 border border-blue-100" : "bg-gray-50"}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${isFirst ? "text-blue-800" : "text-gray-700"}`}>{h.label}</span>
                        <span className="text-xs text-gray-400 font-mono">{fmtDateZR(h.date)}</span>
                      </div>
                      {h.location && (
                        <div className="text-xs text-gray-500 mt-0.5">📍 {h.location}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer lien ZR */}
      <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-400">Source : ZR Express API (temps réel)</span>
        <a href={zrLink} target="_blank" rel="noreferrer"
          className="text-xs text-blue-600 hover:underline font-medium">
          Voir sur ZRExpress ↗
        </a>
      </div>
    </div>
  );
}

function SearchZRTab() {
  const [mode,      setMode]      = useState("tracking"); // "tracking" | "phone"
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);

  const handleSearch = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      let token = "";
      token = getRawToken() || "";

      const body = { token };
      if (mode === "tracking") body.tracking = input.trim().toUpperCase();
      else                     body.phone    = input.trim();

      const res = await fetch("/api/suivi-zr/search", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error || "Erreur inconnue");
      } else {
        setResult(data);
      }
    } catch (e) {
      setError("Erreur réseau — réessayer");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const placeholder = mode === "tracking"
    ? "ex: ZR-123456"
    : "ex: 0661234567";

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-5 max-w-3xl mx-auto w-full space-y-5">

      {/* Barre de recherche */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
          🔍 Recherche en temps réel depuis ZR Express
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Récupère les informations directement depuis l&apos;API ZR. Aucune connexion à la plateforme requise.
        </p>

        {/* Toggle mode */}
        <div className="flex gap-2 mb-4">
          {[
            { key: "tracking", label: "📦 Par numéro de tracking" },
            { key: "phone",    label: "📞 Par numéro de téléphone" },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setInput(""); setResult(null); setError(null); }}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all
                ${mode === m.key
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Input + bouton */}
        <div className="flex gap-2">
          <input
            data-testid="zr-search-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 bg-gray-50"
            autoComplete="off"
          />
          <button
            data-testid="zr-search-btn"
            type="button"
            onClick={handleSearch}
            disabled={loading || !input.trim()}
            className="px-5 py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 disabled:opacity-40 flex items-center gap-2 transition-colors flex-shrink-0"
          >
            {loading
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Recherche…</>
              : "Rechercher"}
          </button>
        </div>

        {mode === "phone" && (
          <p className="text-xs text-gray-400 mt-2">
            Format accepté : 0661234567 ou +213661234567. Peut prendre quelques secondes (pagination ZR).
          </p>
        )}
      </div>

      {/* Erreur avec fallback Supabase */}
      {error && (
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <span className="text-lg leading-none flex-shrink-0">⚠️</span>
            <div>
              <div className="text-sm font-semibold text-red-700">Colis introuvable sur ZR Express</div>
              <div className="text-xs text-red-600 mt-0.5">{error}</div>
            </div>
          </div>

          {/* Fallback : données Supabase si ZR ne répond pas */}
          {result?.supabase && !Array.isArray(result.supabase) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Données locales (nc_suivi_zr)</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Tracking</span><br/><span className="font-mono font-bold text-gray-900">{result.supabase.tracking}</span></div>
                <div><span className="text-gray-400">Client</span><br/><span className="font-semibold text-gray-900">{result.supabase.customer_name}</span></div>
              </div>
            </div>
          )}

          {/* Fallback phone : liste depuis Supabase */}
          {result?.supabase && Array.isArray(result.supabase) && result.supabase.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                {result.supabase.length} commande(s) trouvée(s) en base locale
              </div>
              {result.supabase.map((r, i) => (
                <div key={i} className="bg-white rounded-lg border border-amber-100 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono font-bold text-gray-800">{r.tracking || "Sans tracking"}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${statusColor(r.statut || "").bg} ${statusColor(r.statut || "").text}`}>
                      {r.statut || "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
                    <div><span className="text-gray-400">Client : </span>{r.customerName}</div>
                    <div><span className="text-gray-400">Wilaya : </span>{r.wilaya || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Résultat — tracking unique */}
      {!error && result?.mode === "tracking" && result.snapshot && (
        <div data-testid="zr-snapshot-card">
          <ParcelCard snapshot={result.snapshot} history={result.history || []} />
        </div>
      )}

      {/* Résultats — téléphone (plusieurs colis possibles) */}
      {!error && result?.mode === "phone" && result.parcels?.length > 0 && (
        <div className="space-y-4">
          <div className="text-sm font-semibold text-gray-700">
            {result.count} colis trouvé{result.count > 1 ? "s" : ""} pour ce numéro
          </div>
          {result.parcels.map((snap, i) => (
            <ParcelCard key={snap.trackingNumber || i} snapshot={snap} history={[]} />
          ))}
        </div>
      )}

      {/* État vide après recherche */}
      {result?.ok && !result.snapshot && !result.parcels?.length && (
        <div className="text-center py-12 text-gray-400 text-sm">Aucun résultat</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  ONGLET INJECTION ZR
// ════════════════════════════════════════════════════════════════
function InjectionTab({ showToast }) {
  // Charger les commandes ORDERS_V2 indépendamment
  const [orders, setOrders]         = useState([]);
  const [ordersLoading, setOrdLoad] = useState(true);

  useEffect(() => {
    api.getOrders().then(res => {
      if (res.ok) setOrders(res.rows || []);
    }).catch(() => {}).finally(() => setOrdLoad(false));
  }, []);

  // ── Section 1 : Injection globale ──
  const [runningAll, setRunningAll] = useState(false);

  // ── Section 2 : Injection d'une commande ──
  const [searchSingle, setSearchSingle]     = useState("");
  const [selectedOrder, setSelectedOrder]   = useState(null);
  const [runningSingle, setRunningSingle]   = useState(false);
  const [singleResult, setSingleResult]     = useState(null);

  // ── Section 3 : Tracking manuel ──
  const [manualOrderId, setManualOrderId]   = useState("");
  const [manualTracking, setManualTracking] = useState("");
  const [manualCarrier,  setManualCarrier]  = useState("Manuel");
  const [runningManuel,  setRunningManuel]  = useState(false);
  const [manuelSearch,   setManuelSearch]   = useState("");

  // Commandes sans tracking (éligibles pour injection ZR individuelle)
  const noTracking = orders.filter(o => !String(o.tracking || "").trim());

  // Commandes confirmées ou modifiées sans tracking (compteur injection globale)
  const confirmedNoTracking = orders.filter(o => {
    if (String(o.tracking || "").trim()) return false;
    const d = String(o.decision_status || "").trim().toLowerCase();
    return d === "confirmer" || d === "modifier";
  });

  const candidatesSingle = noTracking.filter(o => {
    if (!searchSingle.trim()) return true;
    return smartMatch(searchSingle, [
      o.customer_name, o.order_id, o.customer_phone,
      o.shopify_order_name, o.wilaya,
    ]);
  }).slice(0, 30);

  const candidatesManuel = orders.filter(o => {
    if (!manuelSearch.trim()) return true;
    return smartMatch(manuelSearch, [
      o.customer_name, o.order_id, o.shopify_order_name, o.customer_phone,
    ]);
  }).slice(0, 30);

  const handleInjectAll = async () => {
    if (!confirm(`Injecter toutes les commandes confirmées sans tracking vers ZRExpress ?\nCette opération peut prendre 1-2 minutes.`)) return;
    setRunningAll(true);
    try {
      const res = await api.injectAllZR();
      if (res.ok) showToast("Injection ZR terminée ✓");
      else        showToast(res.error || "Erreur injection", "error");
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setRunningAll(false); }
  };

  const handleInjectSingle = async () => {
    if (!selectedOrder) return;
    setRunningSingle(true);
    setSingleResult(null);
    try {
      const res = await api.injectSingleZR(selectedOrder.order_id);
      setSingleResult(res);
      if (res.ok) showToast(`Tracking reçu : ${res.tracking} ✓`);
      else        showToast(res.error || "Erreur injection", "error");
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setRunningSingle(false); }
  };

  const handleInjectManuel = async () => {
    if (!manualOrderId || !manualTracking) return;
    setRunningManuel(true);
    try {
      const res = await api.injectManuel(manualOrderId, manualTracking, manualCarrier);
      if (res.ok) {
        showToast(`Tracking ${manualTracking} enregistré ✓`);
        setManualOrderId(""); setManualTracking(""); setManualCarrier("Manuel"); setManuelSearch("");
      } else showToast(res.error || "Erreur", "error");
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setRunningManuel(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-5 space-y-6 max-w-3xl mx-auto w-full">

      {/* ── 1. Injection globale ─────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-bold text-gray-900 mb-1">🚀 Injecter toutes les commandes confirmées</h3>
        <p className="text-xs text-gray-500 mb-4">
          Envoie toutes les commandes confirmées sans tracking vers ZRExpress.
          <span className="ml-1 text-orange-600 font-medium">Peut prendre 30-60 sec.</span>
        </p>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-orange-700">{confirmedNoTracking.length}</span> commande(s) à injecter
          </div>
          <button
            onClick={handleInjectAll}
            disabled={runningAll}
            className="ml-auto px-5 py-2.5 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-gray-700 disabled:opacity-40 flex items-center gap-2 transition-colors"
          >
            {runningAll ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Injection…</>
            ) : "⚡ Lancer injection globale"}
          </button>
        </div>
      </div>

      {/* ── 2. Injection commande unique ─────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-bold text-gray-900 mb-1">🎯 Injecter une commande précise</h3>
        <p className="text-xs text-gray-500 mb-4">Recherche une commande sans tracking et l'injecte individuellement vers ZRExpress.</p>

        {ordersLoading ? (
          <div className="text-xs text-gray-400 py-2 flex items-center gap-2">
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            Chargement des commandes…
          </div>
        ) : null}
        <input type="text" placeholder="Rechercher par nom, order_id, téléphone…"
          value={searchSingle} onChange={e => { setSearchSingle(e.target.value); setSelectedOrder(null); setSingleResult(null); }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 mb-2"
        />

        {/* Liste de sélection */}
        {!selectedOrder && searchSingle && (
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-3 max-h-48 overflow-y-auto">
            {candidatesSingle.length === 0 ? (
              <div className="text-xs text-gray-400 p-3 text-center">
                {ordersLoading ? "Chargement…" : "Aucune commande sans tracking"}
              </div>
            ) : candidatesSingle.map((o, i) => {
              const oid  = String(o.order_id        || "");
              const name = String(o.customer_name   || "—");
              const wil  = String(o.wilaya          || "");
              const tot  = Number(o.order_total     || 0);
              return (
                <button key={oid || i} onClick={() => { setSelectedOrder(o); setSearchSingle(""); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800 truncate">{name}</div>
                    <div className="text-xs text-gray-400 font-mono">{oid} · {wil}</div>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{tot.toLocaleString("fr-FR")} DA</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Commande sélectionnée */}
        {selectedOrder && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm text-gray-900">{selectedOrder.customer_name}</div>
              <div className="text-xs text-gray-500 font-mono">{selectedOrder.order_id} · {selectedOrder.wilaya}</div>
            </div>
            <button onClick={() => { setSelectedOrder(null); setSingleResult(null); }} className="text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
          </div>
        )}

        {/* Résultat */}
        {singleResult && (
          <div className={`rounded-lg px-4 py-3 text-sm mb-3
            ${singleResult.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
            {singleResult.ok
              ? <>✅ Tracking reçu : <span className="font-mono font-bold">{singleResult.tracking}</span></>
              : <>❌ {singleResult.error}</>}
          </div>
        )}

        <button
          onClick={handleInjectSingle}
          disabled={!selectedOrder || runningSingle}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
        >
          {runningSingle ? (
            <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Injection…</>
          ) : "📦 Injecter cette commande"}
        </button>
      </div>

      {/* ── 3. Tracking manuel ───────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-bold text-gray-900 mb-1">✏️ Tracking manuel</h3>
        <p className="text-xs text-gray-500 mb-4">Saisir un numéro de tracking d'une autre plateforme (Yalidine, Guepex, etc.) et l'associer à une commande.</p>

        <div className="space-y-3">
          {/* Sélection commande */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Commande</label>
            <input type="text" placeholder="Rechercher par nom ou order_id…"
              value={manuelSearch} onChange={e => { setManuelSearch(e.target.value); setManualOrderId(""); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {manualOrderId ? (
              <div className="mt-1.5 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs">
                <span className="font-mono font-semibold text-green-700">{manualOrderId}</span>
                <button onClick={() => { setManualOrderId(""); setManuelSearch(""); }} className="ml-auto text-gray-400 hover:text-red-500">× Changer</button>
              </div>
            ) : manuelSearch && (
              <div className="border border-gray-200 rounded-lg overflow-hidden mt-1.5 max-h-36 overflow-y-auto">
                {candidatesManuel.length === 0
                  ? <div className="text-xs text-gray-400 p-3 text-center">Aucune commande trouvée</div>
                  : candidatesManuel.map((o, i) => {
                    const oid  = String(o.order_id      || "");
                    const name = String(o.customer_name || "—");
                    const trk  = String(o.tracking      || "");
                    return (
                      <button key={oid || i} onClick={() => { setManualOrderId(oid); setManuelSearch(""); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-800">{name}</span>
                          <span className="text-gray-400 ml-2 font-mono">{oid}</span>
                        </div>
                        {trk && <span className="text-orange-600 text-xs">a déjà: {trk}</span>}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Tracking */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Numéro de tracking</label>
            <input type="text" value={manualTracking} onChange={e => setManualTracking(e.target.value)}
              placeholder="ex: YLD-12345, GX-98765…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Transporteur */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Transporteur</label>
            <div className="flex gap-2 flex-wrap">
              {["ZRExpress", "Yalidine", "Guepex", "Ecotrack", "Manuel"].map(c => (
                <button key={c} onClick={() => setManualCarrier(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                    ${manualCarrier === c ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleInjectManuel}
            disabled={!manualOrderId || !manualTracking || runningManuel}
            className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-gray-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
          >
            {runningManuel ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Enregistrement…</>
            ) : "✏️ Enregistrer le tracking"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Couleurs badge statut_livraison (états ZR confirmés) ──────────
function statusBadgeClass(statut, finalStatus) {
  const s = String(statut || finalStatus || "").toLowerCase();
  // Terminaux positifs (livré, encaissé)
  if (/livr|encaiss/.test(s))                    return "bg-green-100 text-green-800";
  // En livraison / bureau
  if (/livraison|bureau|bureau/.test(s))          return "bg-purple-100 text-purple-800";
  // En transit / vers wilaya / collecté / reçue
  if (/transit|wilaya|collect|recue|expedier|commande/.test(s)) return "bg-blue-100 text-blue-800";
  // Tentative échouée
  if (/chou|tentative/.test(s))                   return "bg-orange-100 text-orange-800";
  // Retourné / annulé
  if (/retour|annul/.test(s))                     return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

// ── Formatage date DD/MM/YYYY HH:MM ───────────────────────────────
function fmtDate(val) {
  if (!val) return "—";
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d)) return String(val);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── Modal "Fin de suivi" ───────────────────────────────────────────
function ModalFinSuivi({ tracking, onClose, onConfirm, saving }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-red-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">🔒 Fin de suivi</h2>
            <p className="text-red-200 text-xs mt-0.5 font-mono">{tracking}</p>
          </div>
          <button onClick={onClose} className="text-red-200 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            ⚠️ Cette action clôture définitivement le colis. Il n'apparaîtra plus dans le suivi actif.
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Motif de clôture <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="ex: Livré, Retour accepté, Perdu..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400">
              Annuler
            </button>
            <button onClick={() => onConfirm(reason)} disabled={saving}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>…</> : "🔒 Clôturer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  ONGLET RECHERCHE ARCHIVE
// ════════════════════════════════════════════════════════════════

// Composant image robuste : affiche un placeholder 📦 si image manquante ou cassée
function ItemImage({ src }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div
        data-testid="item-placeholder"
        className="w-10 h-10 rounded-lg bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-400 text-xl select-none"
      >
        📦
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
      onError={() => setBroken(true)}
    />
  );
}

function fmtDateArchive(val) {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
}

function decisionBadge(ds) {
  const s = String(ds || "").toLowerCase();
  if (s === "confirmer") return { bg: "bg-green-100", text: "text-green-700", label: "CONFIRMÉ" };
  if (s === "annuler")   return { bg: "bg-red-100",   text: "text-red-700",   label: "ANNULÉ" };
  if (s === "modifier")  return { bg: "bg-blue-100",  text: "text-blue-700",  label: "MODIFIÉ" };
  return { bg: "bg-gray-100", text: "text-gray-500", label: ds || "—" };
}

function sourceBadge(src) {
  if (src === "archive") return { bg: "bg-amber-100", text: "text-amber-700", label: "Archive" };
  return { bg: "bg-blue-50", text: "text-blue-600", label: "Actif" };
}

function ArchiveOrderDetail({ order, onClose }) {
  const items = Array.isArray(order.items_json) ? order.items_json : [];
  const ds    = decisionBadge(order.decision_status);
  const ss    = sourceBadge(order._source);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-3">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" style={{ maxHeight: "92vh" }}>
        <div className="bg-gray-900 px-5 py-4 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="text-white font-bold text-base">{order.customer_name || "—"}</div>
            <div className="text-gray-300 text-sm mt-0.5">{order.customer_phone || "—"}</div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {order.tracking && <span className="font-mono text-xs text-blue-300">{order.tracking}</span>}
              {order.shopify_order_name && <span className="text-xs text-gray-400">{order.shopify_order_name}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ds.bg} ${ds.text}`}>{ds.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ss.bg} ${ss.text}`}>{ss.label}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs bg-gray-50 rounded-xl px-4 py-3">
              <div><span className="text-gray-400 block mb-0.5">Date commande</span><span className="font-semibold text-gray-800">{fmtDateArchive(order.order_date)}</span></div>
              <div><span className="text-gray-400 block mb-0.5">Montant</span><span className="font-bold text-gray-900">{Number(order.order_total || 0).toLocaleString("fr-FR")} DA</span></div>
              <div><span className="text-gray-400 block mb-0.5">Wilaya</span><span className="font-semibold text-gray-800">{order.wilaya || "—"}</span></div>
              <div><span className="text-gray-400 block mb-0.5">Commune</span><span className="font-semibold text-gray-800">{order.commune || "—"}</span></div>
              {order.adresse && <div className="col-span-2"><span className="text-gray-400 block mb-0.5">Adresse</span><span className="font-semibold text-gray-800">{order.adresse}</span></div>}
              <div><span className="text-gray-400 block mb-0.5">Mode livraison</span><span className="font-semibold text-gray-800">{order.delivery_mode || order.delivery_type || "—"}</span></div>
              {order.delivery_price > 0 && <div><span className="text-gray-400 block mb-0.5">Frais livraison</span><span className="font-semibold text-gray-800">{Number(order.delivery_price).toLocaleString("fr-FR")} DA</span></div>}
              {order.prepared_by && <div className="col-span-2"><span className="text-gray-400 block mb-0.5">Préparé par</span><span className="font-semibold text-gray-800">{order.prepared_by}</span></div>}
              {order.note && <div className="col-span-2"><span className="text-gray-400 block mb-0.5">Note</span><span className="text-gray-700 italic">"{order.note}"</span></div>}
              {order.note_manager && <div className="col-span-2"><span className="text-gray-400 block mb-0.5">Note manager</span><span className="text-amber-700 font-medium">📌 {order.note_manager}</span></div>}
              {order.coupon_code && <div className="col-span-2"><span className="text-gray-400 block mb-0.5">Code promo</span><span className="text-emerald-700 font-bold">🏷️ {order.coupon_code}{Number(order.coupon_discount) > 0 && ` (-${Number(order.coupon_discount).toLocaleString("fr-FR")} DA)`}</span></div>}
              {order.cancellation_reason && <div className="col-span-2"><span className="text-gray-400 block mb-0.5">Motif annulation</span><span className="text-red-600 font-medium">{order.cancellation_reason}</span></div>}
            </div>

            {items.length > 0 ? (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Articles ({items.length})</div>
                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const qty   = Number(item.qty || item.quantity || 1);
                    const price = Number(item.price || 0);
                    return (
                      <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                        <ItemImage src={item.image_url} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                          <div className="text-xs text-gray-500">Qté : {qty} · {price.toLocaleString("fr-FR")} DA/u</div>
                        </div>
                        <div className="text-sm font-bold text-gray-800 flex-shrink-0">
                          {(price * qty).toLocaleString("fr-FR")} DA
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 bg-gray-900 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Total commande</span>
                  <span className="text-white font-bold text-base">{Number(order.order_total || 0).toLocaleString("fr-FR")} DA</span>
                </div>
              </div>
            ) : order.order_items_summary ? (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Articles</div>
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700">{order.order_items_summary}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">Fermer</button>
        </div>
      </div>
    </div>
  );
}

function CustomerCard({ customer, onSelect, isSelected }) {
  const hasArchive = customer.orders.some(o => o._source === "archive");
  const hasActive  = customer.orders.some(o => o._source === "actif");
  return (
    <div onClick={onSelect}
      className={`px-4 py-3.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors
        ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-gray-900 truncate">{customer.name}</div>
          <div className="text-xs text-gray-500 mt-0.5 font-mono">{customer.phone || "—"}</div>
          <div className="text-xs text-gray-400 mt-0.5">{customer.wilaya || "—"}</div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-xs font-bold text-gray-900">{Number(customer.total_spent).toLocaleString("fr-FR")} DA</span>
          <div className="flex gap-1">
            {hasActive  && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Actif</span>}
            {hasArchive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Archive</span>}
          </div>
          <span className="text-[10px] text-gray-400">{customer.orders_count} commande{customer.orders_count > 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}

function ArchiveTab() {
  const [mode,        setMode]        = useState("phone");
  const [input,       setInput]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState(null);
  const [error,       setError]       = useState(null);
  const [selCustomer, setSelCustomer] = useState(null);
  const [selOrder,    setSelOrder]    = useState(null);

  const handleSearch = async () => {
    if (!input.trim()) return;
    setLoading(true); setResult(null); setError(null); setSelCustomer(null);
    try {
      const token = getRawToken() || "";
      const body  = { token };
      if (mode === "tracking") body.tracking = input.trim().toUpperCase();
      else if (mode === "name") body.name    = input.trim();
      else                      body.phone   = input.trim();

      const res  = await fetch("/api/archive/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error || "Aucun résultat");
      else {
        setResult(data);
        if (data.customers?.length === 1) setSelCustomer(data.customers[0]);
      }
    } catch { setError("Erreur réseau — réessayer"); }
    finally { setLoading(false); }
  };

  const placeholder = mode === "tracking" ? "ex: 42-LBQFXVLANR-ZR"
    : mode === "name" ? "ex: Ahmed Mohamed" : "ex: 0661234567";

  const customerOrders = selCustomer
    ? [...selCustomer.orders].sort((a, b) => new Date(b.order_date || 0) - new Date(a.order_date || 0))
    : [];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-5 max-w-3xl mx-auto w-full space-y-5">

      {/* Barre de recherche */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">🗂️ Recherche Archive Client</h3>
        <p className="text-xs text-gray-500 mb-4">Consultez l'historique complet d'un client (actif + archive). Idéal en cas de réclamation.</p>

        <div className="flex gap-1.5 mb-4 flex-wrap">
          {[
            { key: "phone",    label: "📞 Téléphone" },
            { key: "tracking", label: "📦 Tracking" },
            { key: "name",     label: "👤 Nom" },
          ].map(m => (
            <button key={m.key}
              onClick={() => { setMode(m.key); setInput(""); setResult(null); setError(null); setSelCustomer(null); }}
              className={`flex-1 min-w-fit py-2 rounded-xl text-sm font-semibold border transition-all
                ${mode === m.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
            placeholder={placeholder}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 bg-gray-50"
            autoComplete="off" />
          <button type="button" onClick={handleSearch} disabled={loading || !input.trim()}
            className="px-5 py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 disabled:opacity-40 flex items-center gap-2 transition-colors flex-shrink-0">
            {loading
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>…</>
              : "Rechercher"}
          </button>
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <span className="text-lg leading-none flex-shrink-0">⚠️</span>
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Résultats */}
      {result && !error && (
        <div className={`flex gap-4 ${selCustomer ? "flex-col md:flex-row" : "flex-col"}`}>

          {/* Liste clients */}
          <div className={`bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm ${selCustomer ? "md:w-72 flex-shrink-0" : "w-full"}`}>
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {result.customers.length} client{result.customers.length > 1 ? "s" : ""}
              </span>
              <span className="text-xs text-gray-400">{result.total} commande{result.total > 1 ? "s" : ""}</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {result.customers.map((c, i) => (
                <CustomerCard key={i} customer={c} isSelected={selCustomer === c}
                  onSelect={() => setSelCustomer(selCustomer === c ? null : c)} />
              ))}
            </div>
          </div>

          {/* Commandes du client sélectionné */}
          {selCustomer && (
            <div className="flex-1 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-gray-900 flex items-start justify-between gap-3">
                <div>
                  <div className="text-white font-bold">{selCustomer.name}</div>
                  <div className="text-gray-300 text-sm font-mono mt-0.5">{selCustomer.phone}</div>
                  <div className="text-gray-400 text-xs mt-0.5">{selCustomer.wilaya}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-white font-bold text-sm">{selCustomer.orders_count} commande{selCustomer.orders_count > 1 ? "s" : ""}</div>
                  <div className="text-gray-300 text-xs mt-0.5">{Number(selCustomer.total_spent).toLocaleString("fr-FR")} DA total</div>
                </div>
              </div>

              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {customerOrders.map((order, i) => {
                  const ds = decisionBadge(order.decision_status);
                  const ss = sourceBadge(order._source);
                  const itemCount = Array.isArray(order.items_json)
                    ? order.items_json.length
                    : (order.order_items_summary ? order.order_items_summary.split(",").length : "?");
                  return (
                    <button key={i} onClick={() => setSelOrder(order)}
                      className="w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-gray-600">{fmtDateArchive(order.order_date)}</span>
                            {order.tracking && (
                              <span className="text-xs font-mono text-blue-600 truncate max-w-[140px]">{order.tracking}</span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-gray-800 mt-0.5">
                            {Number(order.order_total || 0).toLocaleString("fr-FR")} DA
                            <span className="text-xs font-normal text-gray-400 ml-1">· {itemCount} art.</span>
                          </div>
                          {order.order_items_summary && (
                            <div className="text-xs text-gray-400 truncate mt-0.5">{order.order_items_summary}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ds.bg} ${ds.text}`}>{ds.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ss.bg} ${ss.text}`}>{ss.label}</span>
                          <span className="text-[10px] text-blue-500 font-medium mt-0.5">Voir →</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {selOrder && <ArchiveOrderDetail order={selOrder} onClose={() => setSelOrder(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  PAGE SUIVI ZR
// ═══════════════════════════════════════════════════════════════════
export default function SuiviZRPage() {
  const [session,    setSession]    = useState(null);
  const [colis,      setColis]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [filter,     setFilter]     = useState("tous");   // tous (en cours) | suivi (terminés)
  const [search,     setSearch]     = useState("");

  // Formulaire action
  const [nextAction, setNextAction] = useState("Appel");
  const [opsNote,    setOpsNote]    = useState("");
  const [saving,     setSaving]     = useState(false);

  // Modal fin de suivi
  const [showModal,  setShowModal]  = useState(false);
  const [finishing,  setFinishing]  = useState(false);

  const [toast,      setToast]      = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Ref pour éviter que loadColis recrée une nouvelle closure à chaque sélection
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const [refreshing, setRefreshing] = useState(false);

  const loadColis = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getSuiviZR();
      if (res.ok) {
        setColis(res.rows || []);
        const cur = selectedRef.current;
        if (cur) {
          const updated = (res.rows || []).find(r => r.tracking === cur.tracking);
          if (updated) setSelected(updated);
        }
      }
    } catch (_) { showToast("Erreur chargement", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  const handleRefreshZR = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.refreshSuiviZR();
      if (res.ok) {
        showToast(`${res.updated || 0} colis mis à jour depuis ZR ✓`);
        await loadColis(true);
      } else {
        showToast(res.error || "Erreur actualisation", "error");
      }
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setRefreshing(false); }
  }, [showToast, loadColis]);

  useEffect(() => {
    const s = getSession();
    setSession(s?.user || null);
    loadColis();
    const t = setInterval(() => loadColis(true), 30000);
    return () => clearInterval(t);
  }, [loadColis]);

  // ── Action : ajouter au journal ───────────────────────────────
  const handleSubmitAction = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const actorName = session?.nom || session?.name || "agent";
      const res = await api.updateSuiviZR(
        selected.tracking,
        nextAction,
        opsNote,
        actorName,
        selected.journal_resume
      );
      if (res.ok) {
        showToast("Action enregistrée ✓");
        logActionSuivi(
          actorName,
          selected.order_id || "",
          selected.tracking,
          nextAction,
          opsNote
        );
        setOpsNote("");
        await loadColis(true);
      } else {
        showToast(res.error || "Erreur", "error");
      }
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setSaving(false); }
  };

  // ── Action : fin de suivi ─────────────────────────────────────
  const handleFinSuivi = async (reason) => {
    setFinishing(true);
    try {
      const res = await api.finSuiviZR(selected.tracking, reason);
      if (res.ok) {
        showToast("Colis clôturé ✓");
        setShowModal(false);
        setSelected(null);
        await loadColis(true);
      } else {
        showToast(res.error || "Erreur", "error");
      }
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setFinishing(false); }
  };

  // ── Filtrage ──────────────────────────────────────────────────
  // "tous"  = colis actifs (final_status vide → en cours de livraison)
  // "suivi" = colis terminés (final_status rempli → livré, retourné, annulé)
  const filtered = colis.filter(c => {
    if (filter === "tous"  &&  c.final_status) return false;
    if (filter === "suivi" && !c.final_status) return false;
    if (search.trim()) {
      return smartMatch(search, [
        c.customer_name, c.tracking, c.customer_phone, c.wilaya,
        c.order_id, c.shopify_order_name || "",
      ]);
    }
    return true;
  });

  const nbTous  = colis.filter(c => !c.final_status).length;
  const nbSuivi = colis.filter(c =>  c.final_status).length;

  // Journal : séparer en lignes individuelles (format "agent : date action ; note : …")
  const journalLines = selected?.journal_resume
    ? String(selected.journal_resume).split(/\n/).map(l => l.trim()).filter(Boolean).reverse()
    : [];

  const [mainTab, setMainTab] = useState("suivi"); // "suivi" | "injection" | "search" | "archive"

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm
          ${toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Onglets principaux */}
      <div className="flex border-b border-gray-200 bg-white flex-shrink-0 overflow-x-auto">
        <button onClick={() => setMainTab("suivi")}
          className={`px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors
            ${mainTab === "suivi" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          📋 Suivi colis
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{colis.length}</span>
        </button>
        <button onClick={() => setMainTab("search")}
          className={`px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors
            ${mainTab === "search" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          🔍 Recherche ZR
        </button>
        <button onClick={() => setMainTab("injection")}
          className={`px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors
            ${mainTab === "injection" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          🚀 Injection ZR
        </button>
        <button onClick={() => setMainTab("archive")}
          className={`px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors
            ${mainTab === "archive" ? "border-amber-600 text-amber-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          🗂️ Recherche Archive
        </button>
      </div>

      {/* Modal fin de suivi */}
      {showModal && selected && (
        <ModalFinSuivi
          tracking={selected.tracking}
          onClose={() => setShowModal(false)}
          onConfirm={handleFinSuivi}
          saving={finishing}
        />
      )}

      {/* ── ONGLET RECHERCHE ZR ──────────────────────────────── */}
      {mainTab === "search" && (
        <SearchZRTab />
      )}

      {/* ── ONGLET INJECTION ─────────────────────────────────── */}
      {mainTab === "injection" && (
        <InjectionTab showToast={showToast} />
      )}

      {/* ── ONGLET RECHERCHE ARCHIVE ──────────────────────────── */}
      {mainTab === "archive" && (
        <ArchiveTab />
      )}

      {mainTab === "suivi" && <div className="flex flex-1 overflow-hidden">

        {/* ── LISTE GAUCHE ─────────────────────────────────── */}
        <div className={`flex-shrink-0 flex flex-col border-r border-gray-200 bg-white w-full md:w-96 ${selected ? "hidden md:flex" : "flex"}`}>

          {/* Header */}
          <div className="p-3 border-b border-gray-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-800 text-sm">Colis actifs</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRefreshZR}
                  disabled={refreshing}
                  title="Actualiser les statuts depuis ZR Express"
                  className="text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium transition-colors"
                >
                  {refreshing
                    ? <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>…</>
                    : <>🔄 ZR</>
                  }
                </button>
                <button onClick={() => loadColis()} className="text-xs text-gray-400 hover:text-gray-800 px-2 py-1 rounded border border-gray-200" title="Recharger la liste">↻</button>
              </div>
            </div>
            <input type="text" placeholder="Rechercher tracking, client, wilaya…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          {/* Onglets filtres */}
          <div className="flex gap-1 px-2 py-1.5 flex-shrink-0">
            {[
              { key: "tous",  label: "En cours", count: nbTous  },
              { key: "suivi", label: "Terminés",  count: nbSuivi },
            ].map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                  ${filter === t.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t.label} <span className="opacity-70">{t.count}</span>
              </button>
            ))}
          </div>

          {/* Cartes colis */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Aucun colis</div>
            ) : filtered.map(c => {
              const isSel = selected?.tracking === c.tracking;
              return (
                <div key={c.tracking} onClick={() => { setSelected(c); setOpsNote(""); setNextAction("Appel"); }}
                  className={`px-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors
                    ${isSel ? "bg-gray-900" : ""}`}>

                  {/* Ligne 1 : nom client */}
                  <div className={`font-semibold text-sm truncate mb-1.5 ${isSel ? "text-white" : "text-gray-900"}`}>
                    {c.customer_name || "—"}
                  </div>

                  {/* Ligne 2 : tracking + wilaya */}
                  <div className={`flex items-center gap-2 text-xs mb-1.5 ${isSel ? "text-gray-300" : "text-gray-500"}`}>
                    <span className="font-mono">{c.tracking}</span>
                    <span>·</span>
                    <span>{c.wilaya}</span>
                  </div>

                  {/* Badge statut carrier (statut_livraison depuis ZR) */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block
                    ${isSel ? "bg-white/20 text-white" : statusBadgeClass(c.statut_livraison, c.final_status)}`}>
                    {c.statut_livraison || (c.final_status ? c.final_status : "—")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── PANNEAU DÉTAIL ───────────────────────────────── */}
        <div className={`flex-1 overflow-y-auto bg-gray-50 flex flex-col ${!selected ? "hidden md:flex" : "flex"}`}>
          {!selected ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Sélectionnez un colis</div>
          ) : (
            <>
            {/* Bouton retour mobile */}
            <div className="md:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => { setSelected(null); setOpsNote(""); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 active:opacity-60">
                ← Retour
              </button>
              <span className="font-semibold text-gray-900 truncate flex-1">{selected.customer_name}</span>
              <span className="font-mono text-xs text-blue-600 flex-shrink-0">{selected.tracking}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-4 space-y-4">

              {/* En-tête colis */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-lg font-bold text-gray-900">{selected.customer_name}</div>
                    <div className="font-mono text-sm text-blue-700 mt-0.5">{selected.tracking}</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {/* Statut carrier ZR */}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold
                      ${statusBadgeClass(selected.statut_livraison, selected.final_status)}`}>
                      {selected.statut_livraison || selected.final_status || "—"}
                    </span>
                    {/* Badge "Terminé" si final */}
                    {selected.final_status && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                        Terminé
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><span className="text-gray-400">Téléphone</span><br/><span className="font-semibold text-gray-800">{selected.customer_phone || "—"}</span></div>
                  <div><span className="text-gray-400">Wilaya</span><br/><span className="font-semibold text-gray-800">{selected.wilaya || "—"}</span></div>
                  <div><span className="text-gray-400">Mode livraison</span><br/><span className="font-semibold text-gray-800">{selected.delivery_mode || "—"}</span></div>
                  <div><span className="text-gray-400">Tentatives ZR</span><br/><span className="font-semibold text-gray-800">{selected.attempts_count ?? 0}</span></div>
                  <div><span className="text-gray-400">Statut carrier</span><br/><span className="font-semibold text-gray-800">{selected.statut_livraison || "—"}</span></div>
                  <div><span className="text-gray-400">Dernière MAJ</span><br/><span className="font-semibold text-gray-800">{fmtDate(selected.updated_at)}</span></div>
                  <div><span className="text-gray-400">Date injection</span><br/><span className="font-semibold text-gray-800">{fmtDate(selected.date_injection)}</span></div>
                  <div><span className="text-gray-400">Montant</span><br/><span className="font-semibold text-gray-800">{selected.order_total ? Number(selected.order_total).toLocaleString("fr-FR") + " DA" : "—"}</span></div>
                  {selected.shopify_order_name && (
                    <div><span className="text-gray-400">Ref commande</span><br/><span className="font-mono text-gray-700">{selected.shopify_order_name}</span></div>
                  )}
                  {selected.order_id && (
                    <div><span className="text-gray-400">Order ID</span><br/><span className="font-mono text-gray-700 text-[10px]">{selected.order_id}</span></div>
                  )}
                  {selected.link_zr && (
                    <div className="col-span-2"><span className="text-gray-400">Suivi ZRExpress</span><br/>
                      <a href={selected.link_zr} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        Voir sur ZRExpress ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Journal d'historique */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-sm text-gray-800 mb-3 flex items-center gap-2">
                  📋 Historique des actions
                  {journalLines.length > 0 && (
                    <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">{journalLines.length}</span>
                  )}
                </h3>
                {journalLines.length === 0 ? (
                  <div className="text-xs text-gray-400 py-2">Aucune action enregistrée</div>
                ) : (
                  <div className="space-y-2">
                    {journalLines.map((line, idx) => {
                      // Parse : "agent : DD-MM-YYYY HH:MM action ; note : …"
                      const colonIdx = line.indexOf(" : ");
                      const agent    = colonIdx > 0 ? line.slice(0, colonIdx) : "";
                      const rest     = colonIdx > 0 ? line.slice(colonIdx + 3) : line;
                      const noteIdx  = rest.indexOf(" ; note : ");
                      const actionPart = noteIdx > 0 ? rest.slice(0, noteIdx) : rest;
                      const notePart   = noteIdx > 0 ? rest.slice(noteIdx + 10) : "";
                      return (
                        <div key={idx} className={`rounded-lg px-3 py-2.5 text-xs ${idx === 0 ? "bg-blue-50 border border-blue-100" : "bg-gray-50"}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-800">{agent || "—"}</span>
                            <span className="text-gray-400 font-mono">{actionPart}</span>
                          </div>
                          {notePart && (
                            <div className="text-gray-600 italic">"{notePart}"</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Formulaire : ajouter une action */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-sm text-gray-800 mb-3">➕ Ajouter une action</h3>
                <div className="space-y-3">
                  {/* next_action */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Type d'action</label>
                    <div className="flex flex-wrap gap-2">
                      {["Appel", "SMS", "Rappel 1", "Rappel 2"].map(a => (
                        <button key={a} onClick={() => setNextAction(a)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                            ${nextAction === a ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ops_note */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Note <span className="text-gray-400 font-normal">(optionnelle)</span></label>
                    <textarea value={opsNote} onChange={e => setOpsNote(e.target.value)}
                      rows={2} placeholder="ex: Ne répond pas, rappel prévu demain…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
                  </div>

                  <button onClick={handleSubmitAction} disabled={saving}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                    {saving ? (
                      <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Enregistrement…</>
                    ) : "✅ Enregistrer l'action"}
                  </button>
                </div>
              </div>

              {/* Bouton Fin de suivi */}
              <div className="bg-white rounded-xl border border-red-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">🔒 Fin de suivi</div>
                    <div className="text-xs text-gray-500 mt-0.5">Clôturer définitivement ce colis</div>
                  </div>
                  <button onClick={() => setShowModal(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
                    Clôturer
                  </button>
                </div>
              </div>

            </div>
            </div>{/* end scroll wrapper */}
            </>
          )}
        </div>
      </div>}
    </div>
  );
}
