"use client";
import { useState, useRef, useCallback } from "react";
import { getRawToken } from "@/lib/auth";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ── Helpers ──────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" });
}

function parseItems(order) {
  if (Array.isArray(order.items_json) && order.items_json.length > 0) return order.items_json;
  if (!order.order_items_summary) return [];
  return order.order_items_summary.split("|").map(s => s.trim()).filter(Boolean).map(seg => {
    const m = seg.match(/^(\d+)x\s+(.+?)\s+\(([0-9.]+)\s*DA\)$/i);
    if (m) return { quantity: Number(m[1]), title: m[2].trim(), price: parseFloat(m[3]) };
    const m2 = seg.match(/^(\d+)x\s+(.+)$/i);
    if (m2) return { quantity: Number(m2[1]), title: m2[2].trim(), price: 0 };
    return { quantity: 1, title: seg, price: 0 };
  });
}

function Toast({ msg, type }) {
  const bg = type === "error" ? "bg-red-600" : "bg-green-700";
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold ${bg} max-w-xs text-center pointer-events-none`}>
      {msg}
    </div>
  );
}

// ── États de la page ──────────────────────────────────────────────
// SCAN  : saisie des trackings
// BON   : aperçu bon de retour avant confirmation
// DONE  : résultat après traitement

export default function RetoursPage() {
  const [step,       setStep]       = useState("SCAN");   // SCAN | BON | DONE
  const [tracking,   setTracking]   = useState("");        // input courant
  const [scanned,    setScanned]    = useState([]);        // { tracking, order } résolus
  const [notFound,   setNotFound]   = useState([]);        // trackings introuvables
  const [looking,    setLooking]    = useState(false);     // recherche en cours
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState(null);
  const [toast,      setToast]      = useState(null);
  const inputRef = useRef(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Recherche un tracking dans nc_orders ───────────────────────
  const lookupTracking = useCallback(async (raw) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;

    // Vérifier doublon dans la liste
    if (scanned.some(s => s.tracking === t)) {
      showToast(`${t} déjà dans la liste`, "error");
      setTracking("");
      return;
    }

    setLooking(true);
    try {
      const url = SB_URL + "/rest/v1/nc_orders"
        + `?tracking=ilike.${encodeURIComponent(t)}`
        + "&select=order_id,order_date,customer_name,customer_phone,wilaya,order_total,tracking,shipping_status,items_json,order_items_summary"
        + "&limit=1";

      const res = await fetch(url, {
        headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
      });
      const data = await res.json();
      const order = Array.isArray(data) && data.length > 0 ? data[0] : null;

      if (order) {
        setScanned(prev => [...prev, { tracking: t, order }]);
        setTracking("");
        inputRef.current?.focus();
      } else {
        setNotFound(prev => [...prev, t]);
        showToast(`Tracking "${t}" introuvable`, "error");
        setTracking("");
      }
    } catch (e) {
      showToast("Erreur réseau : " + e.message, "error");
    } finally {
      setLooking(false);
    }
  }, [scanned]);

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupTracking(tracking);
    }
  }

  function removeScanned(trackingNum) {
    setScanned(prev => prev.filter(s => s.tracking !== trackingNum));
  }

  // ── Confirmation — appel API ───────────────────────────────────
  async function handleConfirm() {
    const token = getRawToken();
    if (!token) { showToast("Session expirée", "error"); return; }
    if (scanned.length === 0) return;

    setSubmitting(true);
    try {
      const order_ids = scanned.map(s => s.order.order_id);
      const res  = await fetch("/api/orders/traiter-retour", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, order_ids }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data);
        setStep("DONE");
      } else {
        showToast(data.error || "Erreur lors du traitement", "error");
      }
    } catch (e) {
      showToast("Erreur réseau : " + e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep("SCAN");
    setScanned([]);
    setNotFound([]);
    setTracking("");
    setResult(null);
  }

  // ─────────────────────────────────────────────────────────────────
  //  ÉTAPE 1 — SCAN
  // ─────────────────────────────────────────────────────────────────
  if (step === "SCAN") return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* En-tête */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">↩️ Traiter les retours</h1>
        <p className="text-sm text-gray-500 mt-1">
          Scannez les numéros de tracking des colis retournés
        </p>
      </div>

      {/* Saisie tracking */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          Saisie tracking
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={tracking}
            onChange={e => setTracking(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ex: 01-IEOZRDNP16-ZR"
            autoFocus
            data-testid="tracking-input"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
          />
          <button
            onClick={() => lookupTracking(tracking)}
            disabled={!tracking.trim() || looking}
            data-testid="add-tracking-btn"
            className="px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {looking ? "…" : "+ Ajouter"}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-xs">Entrée</kbd> ou cliquez "+ Ajouter" après chaque tracking
        </p>
      </div>

      {/* Liste des trackings scannés */}
      {scanned.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {scanned.length} colis ajouté{scanned.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {scanned.map(({ tracking: t, order }) => (
              <div key={t}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm"
                data-testid={`scanned-row-${t}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-semibold text-gray-800">{t}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {order.customer_name} · {order.wilaya} · {order.order_total ? Number(order.order_total).toLocaleString("fr-DZ") + " DA" : "—"}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0 ${
                  /retour/i.test(order.shipping_status || "") ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {order.shipping_status || "—"}
                </span>
                <button
                  onClick={() => removeScanned(t)}
                  className="text-gray-300 hover:text-red-500 transition-colors text-lg flex-shrink-0"
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trackings introuvables */}
      {notFound.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-xs font-semibold text-red-700 mb-1">Introuvables :</p>
          <div className="flex flex-wrap gap-1.5">
            {notFound.map(t => (
              <span key={t} className="text-xs font-mono bg-red-100 text-red-700 px-2 py-0.5 rounded-lg">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Bouton Générer le bon de retour */}
      {scanned.length > 0 && (
        <button
          onClick={() => setStep("BON")}
          data-testid="generer-bon-btn"
          className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold transition-colors shadow-md"
        >
          📋 Générer le bon de retour — {scanned.length} colis
        </button>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────
  //  ÉTAPE 2 — BON DE RETOUR
  // ─────────────────────────────────────────────────────────────────
  if (step === "BON") {
    const totalDA = scanned.reduce((sum, { order }) => sum + (Number(order.order_total) || 0), 0);

    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-10">

        {/* En-tête */}
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("SCAN")}
            className="text-gray-400 hover:text-gray-700 transition-colors text-xl">
            ‹
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">📋 Bon de retour</h1>
            <p className="text-sm text-gray-500 mt-0.5">Vérifiez avant de confirmer</p>
          </div>
        </div>

        {/* Bon de retour */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Header bon */}
          <div className="bg-gray-900 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-white font-bold">Bon de retour colis</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {new Date().toLocaleDateString("fr-DZ", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white font-bold text-lg">{scanned.length}</p>
              <p className="text-gray-400 text-xs">colis</p>
            </div>
          </div>

          {/* Liste colis */}
          <div className="divide-y divide-gray-50">
            {scanned.map(({ tracking: t, order }, idx) => {
              const items = parseItems(order);
              return (
                <div key={t} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{order.customer_name || "—"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {order.wilaya}{order.customer_phone ? ` · ${order.customer_phone}` : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono text-xs text-gray-500">{t}</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">
                        {order.order_total ? Number(order.order_total).toLocaleString("fr-DZ") + " DA" : "—"}
                      </p>
                    </div>
                  </div>
                  {/* Articles */}
                  {items.length > 0 && (
                    <div className="rounded-lg bg-gray-50 divide-y divide-gray-100 overflow-hidden mt-2">
                      {items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                          <span className="text-gray-600 truncate flex-1">{item.title || "—"}</span>
                          <span className="ml-2 text-gray-500 flex-shrink-0 font-mono">×{item.quantity || 1}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer total */}
          <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-t border-gray-100">
            <span className="text-sm text-gray-600 font-semibold">{scanned.length} colis retournés</span>
            <span className="text-sm font-bold text-gray-900">{totalDA.toLocaleString("fr-DZ")} DA</span>
          </div>
        </div>

        {/* Info action */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">Ce que fait cette action :</p>
          <p>• Restitue le stock de chaque article dans nc_variants</p>
          <p>• Met le statut expédition à <strong>"retour récupéré"</strong> dans nc_orders</p>
          <p>• Ne modifie pas la confirmation (decision_status inchangé)</p>
        </div>

        {/* Bouton confirmation */}
        <button
          onClick={handleConfirm}
          disabled={submitting}
          data-testid="confirmer-retours-btn"
          className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2 shadow-md"
        >
          {submitting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Traitement en cours…
            </>
          ) : `✅ Confirmer le retour de ${scanned.length} colis`}
        </button>

        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  //  ÉTAPE 3 — DONE
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* Succès */}
      <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
        <div className="bg-green-700 px-5 py-5 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-white font-bold text-lg">Retours traités avec succès</p>
          <p className="text-green-200 text-sm mt-1">{result?.message}</p>
        </div>

        {/* Détail résultats */}
        {result?.results?.length > 0 && (
          <div className="divide-y divide-gray-50">
            {result.results.map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-gray-800">{r.customer_name || "—"}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{r.tracking}</p>
                </div>
                <span className="text-xs text-green-700 font-semibold bg-green-50 border border-green-200 px-2.5 py-1 rounded-full flex-shrink-0">
                  +{r.restocked_items} articles restockés
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            Statut mis à jour : <strong className="text-gray-700">retour récupéré</strong>
          </p>
        </div>
      </div>

      <button
        onClick={reset}
        data-testid="nouveau-retour-btn"
        className="w-full py-3 rounded-2xl border border-gray-200 hover:border-gray-400 text-sm font-semibold text-gray-700 transition-colors"
      >
        ↩️ Nouveau traitement de retours
      </button>
    </div>
  );
}
