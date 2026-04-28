"use client";
import { useState, useEffect, useCallback } from "react";
import { api, invalidateCache } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { sendPushNotification } from "@/lib/push";
import { logPreparationStatus } from "@/lib/logsv2";

// ════════════════════════════════════════════════════════════
//  MODAL — Détail produit (lecture seule depuis nc_variants)
// ════════════════════════════════════════════════════════════
function ProductDetailModal({ variant, onClose }) {
  if (!variant) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm truncate pr-4">
            {variant.product_title || variant.title || "—"}
          </h3>
          <button
            onClick={onClose}
            data-testid="modal-produit-close"
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Grande image */}
        <div className="bg-gray-50 flex items-center justify-center" style={{ height: 220 }}>
          {variant.image_url ? (
            <img
              src={variant.image_url}
              alt={variant.product_title || ""}
              className="w-full h-full object-contain p-3"
              onError={e => { e.target.style.display = "none"; }}
            />
          ) : (
            <span className="text-6xl">📦</span>
          )}
        </div>

        {/* Détails */}
        <div className="px-5 py-4 space-y-3">
          {/* Stock + Prix */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div
                data-testid="modal-produit-stock"
                className={`text-2xl font-bold ${Number(variant.inventory_quantity) <= 0 ? "text-red-600" : Number(variant.inventory_quantity) <= 3 ? "text-orange-500" : "text-blue-700"}`}
              >
                {variant.inventory_quantity ?? "—"}
              </div>
              <div className="text-xs text-blue-600 font-medium mt-0.5">Stock</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-700">
                {variant.price ? Number(variant.price).toLocaleString("fr-DZ") : "—"}
              </div>
              <div className="text-xs text-green-600 font-medium mt-0.5">DA</div>
            </div>
          </div>

          {/* Infos techniques */}
          <div className="space-y-2 text-sm">
            {variant.sku && (
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">SKU</span>
                <span
                  data-testid="modal-produit-sku"
                  className="font-mono text-gray-800 bg-gray-100 px-2 py-0.5 rounded text-xs"
                >
                  {variant.sku}
                </span>
              </div>
            )}
            {variant.barcode && (
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Barcode</span>
                <span
                  data-testid="modal-produit-barcode"
                  className="font-mono text-gray-800 bg-gray-100 px-2 py-0.5 rounded text-xs"
                >
                  {variant.barcode}
                </span>
              </div>
            )}
            {variant.world && (
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Monde</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${variant.world === "onglerie" ? "bg-pink-100 text-pink-700" : "bg-red-50 text-red-700"}`}>
                  {variant.world === "onglerie" ? "💅 Onglerie" : "✂️ Coiffure"}
                </span>
              </div>
            )}
            {variant.vendor && (
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500 font-medium">Fournisseur</span>
                <span className="text-gray-800 text-xs">{variant.vendor}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  MODAL — Lancer la quota
// ════════════════════════════════════════════════════════════
function ModalLancerQuota({ orders, onClose, onLaunch, launching }) {
  const [premierId, setPremierId] = useState("");
  const [nbCmd,     setNbCmd]     = useState("20");
  const [search,    setSearch]    = useState("");

  // Commandes actives triées par date pour choisir le premier order_id
  const candidates = orders
    .filter(o => {
      if (!search.trim()) return true;
      return (
        (o.customer_name  || "").toLowerCase().includes(search.toLowerCase()) ||
        (o.order_id       || "").includes(search)
      );
    })
    .slice(0, 50);

  const canLaunch = premierId && Number(nbCmd) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header modal */}
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">⚡ Lancer la quota</h2>
            <p className="text-gray-400 text-xs mt-0.5">Configuration avant génération</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Avertissement durée */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">⏳</span>
            <div className="text-sm text-amber-800">
              <span className="font-semibold">La génération peut prendre quelques minutes.</span>
              <br/>Ne fermez pas la page pendant l'exécution. Les articles Shopify sont récupérés commande par commande.
            </div>
          </div>

          {/* Nombre de commandes */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              Nombre de commandes à préparer
            </label>
            <input
              type="number"
              min="1"
              max="400"
              value={nbCmd}
              onChange={e => setNbCmd(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="ex: 20"
            />
          </div>

          {/* Premier order_id */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              Premier order_id (commande de départ)
            </label>
            <input
              type="text"
              placeholder="Rechercher par nom ou order_id…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPremierId(""); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 mb-2"
            />
            {premierId ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                <span className="text-green-600 font-mono font-bold">{premierId}</span>
                <button onClick={() => { setPremierId(""); setSearch(""); }} className="ml-auto text-gray-400 hover:text-red-500 text-xs">× Changer</button>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {candidates.length === 0 ? (
                  <div className="text-xs text-gray-400 px-3 py-3 text-center">Aucune commande trouvée</div>
                ) : candidates.map(o => (
                  <button
                    key={o.order_id}
                    onClick={() => { setPremierId(o.order_id); setSearch(""); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{o.customer_name}</div>
                      <div className="text-gray-400 font-mono">{o.order_id}</div>
                    </div>
                    <div className="text-gray-400 flex-shrink-0">{o.wilaya}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Boutons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => canLaunch && onLaunch(premierId, Number(nbCmd))}
              disabled={!canLaunch || launching}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {launching ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Génération…
                </>
              ) : "⚡ Lancer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  PAGE PRINCIPALE
// ════════════════════════════════════════════════════════════
export default function PreparationPage() {
  const [activeTab, setActiveTab] = useState("commandes"); // "commandes" | "quota"
  const [session,   setSession]   = useState(null);

  // ── État commandes ─────────────────────────────────────
  const [orders,    setOrders]    = useState([]);
  const [ordLoading, setOrdLoading] = useState(true);
  const [ordSearch,  setOrdSearch]  = useState("");
  const [ordTab,     setOrdTab]     = useState("tous");
  const [selected,   setSelected]   = useState(null);
  const [detail,     setDetail]     = useState(null);
  const [items,      setItems]      = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [variantMap, setVariantMap] = useState({}); // variant_id → objet complet nc_variants
  const [productModal, setProductModal] = useState(null); // variant sélectionné pour modal

  // ── État quota ─────────────────────────────────────────
  const [quotaRows,    setQuotaRows]    = useState([]);
  const [quotaOrders,  setQuotaOrders]  = useState([]); // commandes incluses
  const [quotaConfig,  setQuotaConfig]  = useState({});
  const [totalQty,     setTotalQty]     = useState(0);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [checked,      setChecked]      = useState({}); // {variant_id: true}
  const [showModal,    setShowModal]    = useState(false);
  const [launching,    setLaunching]    = useState(false);
  const [showOrders,   setShowOrders]   = useState(false); // accordion commandes

  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Chargement commandes ───────────────────────────────
  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setOrdLoading(true);
    try {
      const res = await api.getOrders();
      if (res.ok) setOrders(res.rows || []);
    } catch (e) { showToast("Erreur chargement commandes", "error"); }
    finally { setOrdLoading(false); }
  }, [showToast]);

  // ── Persistance coches localStorage ───────────────────
  function loadCheckedFromStorage(quotaId) {
    if (!quotaId) return {};
    try {
      const raw = localStorage.getItem("quota_checked_" + quotaId);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveCheckedToStorage(quotaId, data) {
    if (!quotaId) return;
    try { localStorage.setItem("quota_checked_" + quotaId, JSON.stringify(data)); } catch {}
  }

  // ── Chargement quota ───────────────────────────────────
  const loadQuota = useCallback(async () => {
    setQuotaLoading(true);
    try {
      const res = await api.getQuota();
      if (res.ok) {
        setQuotaRows(res.rows || []);
        setTotalQty(res.total_qty || 0);
        setQuotaConfig(res.config || {});
        setQuotaOrders(res.orders || []);
        // Restaurer les coches sauvegardées pour cette quota
        const qid = res.config?.quota_id;
        setChecked(loadCheckedFromStorage(qid));
      }
    } catch (_) {}
    finally { setQuotaLoading(false); }
  }, []);

  useEffect(() => {
    const s = getSession();
    setSession(s?.user || null);
    loadOrders();
    loadQuota();
    const t = setInterval(() => loadOrders(true), 30000);
    return () => clearInterval(t);
  }, [loadOrders, loadQuota]);

  // ── Sélection commande ─────────────────────────────────
  const selectOrder = useCallback(async (order) => {
    setSelected(order.order_id);
    setDetail(order);
    setItems([]);
    setItemsLoading(true);
    try {
      const [itemsRes, varRes] = await Promise.all([
        api.getOrderItems(order.order_id),
        api.getVariantsCache(),
      ]);
      if (itemsRes.ok) {
        // Construire un map variant_id → objet complet depuis le cache variantes
        const vMap = {};
        (varRes?.rows || []).forEach(v => {
          if (v.variant_id) vMap[String(v.variant_id)] = v;
        });
        setVariantMap(vMap);
        const enriched = (itemsRes.rows || []).map(it => ({
          ...it,
          image_url: it.image_url || vMap[String(it.variant_id)]?.image_url || null,
        }));
        setItems(enriched);
      }
    } catch (_) {}
    finally { setItemsLoading(false); }
  }, []);

  // ── Toggle préparation ─────────────────────────────────
  const handleTogglePrep = async () => {
    if (!detail || saving) return;
    const ancienStatut = detail.statut_preparation || "en attente";
    const next = ancienStatut === "préparée" ? "en attente" : "préparée";
    setSaving(true);
    try {
      const res = await api.updatePreparation(detail.order_id, next);
      if (res.ok) {
        showToast(next === "préparée" ? "Marquée préparée ✓" : "Remise en attente");
        logPreparationStatus(session?.nom || session?.user?.nom || "agent", detail.order_id, ancienStatut, next);
        setOrders(prev => prev.map(o => o.order_id === detail.order_id ? { ...o, statut_preparation: next } : o));
        setDetail(prev => ({ ...prev, statut_preparation: next }));
      } else showToast(res.error || "Erreur", "error");
    } catch (_) { showToast("Erreur réseau", "error"); }
    finally { setSaving(false); }
  };

  // ── Lancer quota ───────────────────────────────────────
  const handleLaunch = async (premierId, nbCmd) => {
    setLaunching(true);
    try {
      const res = await api.lancerQuota(premierId, nbCmd);
      if (res.ok) {
        showToast("Quota généré avec succès ✓");
        setShowModal(false);
        await loadQuota();
        setActiveTab("quota");
        // Notifier toute l'équipe
        sendPushNotification({
          title: "📦 Quota lancée !",
          body: `${session?.nom || "Un responsable"} a lancé une nouvelle quota de préparation.`,
          url: "/dashboard/preparation",
          tag: "quota-launch",
        });
      } else {
        showToast(res.error || "Erreur lors du lancement", "error");
      }
    } catch (e) { showToast("Erreur réseau", "error"); }
    finally { setLaunching(false); }
  };

  const isManager = session && ["owner", "chef d'equipe", "responsable", "admin", "preparateur", "agent digital"]
    .some(r => (session.role || "").toLowerCase().includes(r));

  // Filtres commandes
  const enAttente = orders.filter(o => (o.statut_preparation || "") !== "préparée").length;
  const preparees = orders.filter(o => o.statut_preparation === "préparée").length;

  const ordFiltered = orders.filter(o => {
    if (ordTab === "en_attente" && o.statut_preparation === "préparée") return false;
    if (ordTab === "preparee"   && o.statut_preparation !== "préparée") return false;
    if (ordSearch.trim()) {
      const q = ordSearch.toLowerCase();
      return (o.customer_name || "").toLowerCase().includes(q) ||
             (o.customer_phone || "").includes(q) ||
             (o.wilaya || "").toLowerCase().includes(q);
    }
    return true;
  });

  // Compteur cochés quota
  const nbChecked = Object.values(checked).filter(Boolean).length;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm
          ${toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Modal lancer quota */}
      {showModal && (
        <ModalLancerQuota
          orders={orders}
          onClose={() => setShowModal(false)}
          onLaunch={handleLaunch}
          launching={launching}
        />
      )}

      {/* Modal détail produit */}
      {productModal && (
        <ProductDetailModal
          variant={productModal}
          onClose={() => setProductModal(null)}
        />
      )}

      {/* ── Onglets principaux ───────────────────────────── */}
      <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={() => setActiveTab("commandes")}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors
            ${activeTab === "commandes" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          📋 Préparation commandes
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${enAttente > 0 ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}>
            {enAttente} en attente
          </span>
        </button>
        <button
          onClick={() => setActiveTab("quota")}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors
            ${activeTab === "quota" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          📦 Préparation quota
          {quotaRows.length > 0 && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {quotaRows.length} produits
            </span>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════
           SECTION 1 — PRÉPARATION COMMANDES
          ════════════════════════════════════════════════════ */}
      {activeTab === "commandes" && (
        <div className="flex flex-1 overflow-hidden">

          {/* Liste gauche — masquée sur mobile quand un détail est ouvert */}
          <div className={`flex-shrink-0 flex-col border-r border-gray-200 bg-white w-full md:w-96
            ${detail ? "hidden md:flex" : "flex"}`}>
            <div className="p-3 border-b border-gray-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800 text-sm">Commandes actives</span>
                <button onClick={() => { invalidateCache("orders"); loadOrders(); }} className="text-xs text-gray-400 hover:text-gray-800 px-2 py-1 rounded border border-gray-200">↻</button>
              </div>
              <input type="text" placeholder="Rechercher…" value={ordSearch}
                onChange={e => setOrdSearch(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>

            {/* Sous-onglets */}
            <div className="flex gap-1 px-2 py-1.5 flex-shrink-0">
              {[
                { key: "tous",       label: "Tous",       count: orders.length },
                { key: "en_attente", label: "À préparer", count: enAttente },
                { key: "preparee",   label: "Préparées",  count: preparees },
              ].map(t => (
                <button key={t.key} onClick={() => setOrdTab(t.key)}
                  className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                    ${ordTab === t.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {t.label} <span className="opacity-70">{t.count}</span>
                </button>
              ))}
            </div>

            {/* Barre progression */}
            {orders.length > 0 && (
              <div className="px-3 pb-2 flex-shrink-0">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <span>{preparees}/{orders.length} préparées</span>
                  <span className="ml-auto">{Math.round(preparees/orders.length*100)}%</span>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5">
                  <div className="bg-green-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.round(preparees/orders.length*100)}%` }} />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {ordLoading ? (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Chargement…</div>
              ) : ordFiltered.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Aucune commande</div>
              ) : ordFiltered.map(order => {
                const isPrepared  = order.statut_preparation === "préparée";
                const isAnnule    = (order.decision_status || "").toLowerCase() === "annuler";
                const isModifie   = (order.decision_status || "").toLowerCase() === "modifier";
                const isSel       = selected === order.order_id;
                return (
                  <div key={order.order_id} onClick={() => selectOrder(order)}
                    className={`px-3 py-2.5 border-b cursor-pointer transition-colors
                      ${isSel
                        ? "bg-gray-900 border-gray-800"
                        : isAnnule
                          ? "bg-red-50 border-red-100 hover:bg-red-100"
                          : isModifie
                            ? "bg-blue-50 border-blue-100 hover:bg-blue-100"
                            : "border-gray-100 hover:bg-gray-50"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className={`font-medium text-sm truncate ${isSel ? "text-white" : isAnnule ? "text-red-800 line-through" : "text-gray-900"}`}>
                          {order.customer_name || "—"}
                        </div>
                        <div className={`text-xs truncate ${isSel ? "text-gray-300" : "text-gray-500"}`}>
                          {order.wilaya} · {Number(order.order_total || 0).toLocaleString("fr-FR")} DA
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {order.doublon && String(order.doublon).startsWith("doublon") && (
                          <span className="text-xs font-bold text-red-500">⚠️</span>
                        )}
                        {isAnnule && !isSel && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                            ✕ ANNULÉ
                          </span>
                        )}
                        {isModifie && !isSel && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                            ♻️ MODIFIÉ
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full
                          ${isSel ? "bg-white/20 text-white" : isPrepared ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                          {isPrepared ? "✅" : "⏳"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panneau détail — masqué sur mobile tant que rien n'est sélectionné */}
          <div className={`overflow-y-auto bg-gray-50 flex-col flex-1
            ${detail ? "flex" : "hidden md:flex"}`}>
            {!detail ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">Sélectionnez une commande</div>
            ) : (
              <>
              {/* Bouton retour mobile */}
              <div className="md:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() => { setSelected(null); setDetail(null); }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 active:opacity-60"
                >
                  ← Retour
                </button>
                <span className="text-sm text-gray-500 truncate">{detail.customer_name}</span>
              </div>
              <div className="max-w-xl mx-auto p-4 space-y-4 w-full">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-lg font-bold text-gray-900">{detail.customer_name}</div>
                        {detail.doublon && String(detail.doublon).startsWith("doublon") && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                            ⚠️ DOUBLON
                          </span>
                        )}
                      </div>
                      <div className="text-gray-600 font-semibold mt-0.5">{detail.customer_phone}</div>
                      <div className="flex flex-wrap gap-1 mt-2 text-xs">
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{detail.wilaya}</span>
                        {(detail.shopify_delivery_mode || detail.delivery_mode) && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{detail.shopify_delivery_mode || detail.delivery_mode}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">{Number(detail.order_total||0).toLocaleString("fr-FR")} DA</div>
                      {detail.shopify_order_name && (
                        <a href={detail.shopify_order_url} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline">{detail.shopify_order_name} ↗</a>
                      )}
                    </div>
                  </div>
                  {detail.doublon && String(detail.doublon).startsWith("doublon") && (
                    <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-300 text-red-700 px-3 py-2.5 rounded-lg">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <div className="font-bold text-sm">Commande potentiellement en doublon</div>
                        <div className="text-xs mt-0.5 opacity-80">Vérifiez avant de préparer</div>
                      </div>
                    </div>
                  )}
                  {(detail.decision_status || "").toLowerCase() === "annuler" && (
                    <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-300 text-red-700 px-3 py-2.5 rounded-lg">
                      <span className="text-lg">🚫</span>
                      <div>
                        <div className="font-bold text-sm">Commande ANNULÉE — Ne pas préparer</div>
                        {detail.cancellation_reason && (
                          <div className="text-xs mt-0.5 opacity-80">Motif : {detail.cancellation_reason}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {(detail.decision_status || "").toLowerCase() === "modifier" && (
                    <div className="mt-3 flex items-center gap-2 bg-blue-50 border border-blue-300 text-blue-700 px-3 py-2.5 rounded-lg">
                      <span className="text-lg">♻️</span>
                      <div>
                        <div className="font-bold text-sm">Commande MODIFIÉE — Vérifiez les articles</div>
                        <div className="text-xs mt-0.5 opacity-80">Cette commande a été régénérée suite à une modification</div>
                      </div>
                    </div>
                  )}
                  {detail.note_manager && <div className="mt-3 text-xs bg-amber-50 text-amber-800 px-3 py-2 rounded-lg">📌 {detail.note_manager}</div>}
                </div>

                {/* Articles */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-sm text-gray-800 mb-3">Articles à préparer</h3>
                  {itemsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg> Chargement…
                    </div>
                  ) : items.length > 0 ? (
                    <div className="space-y-2">
                      {items.map((item, idx) => {
                        const varData = variantMap[String(item.variant_id)] || null;
                        return (
                        <div
                          key={idx}
                          data-testid="prep-item-card"
                          onClick={() => varData && setProductModal(varData)}
                          className={`flex items-center gap-3 bg-gray-50 rounded-xl p-3 transition-colors
                            ${varData ? "cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 border border-transparent" : "border border-transparent"}`}
                        >
                          {item.image_url
                            ? <img src={item.image_url} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0 border border-gray-200" onError={e => e.target.style.display="none"} />
                            : <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 text-2xl">📦</div>
                          }
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 leading-snug">{item.title}</div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                × {item.quantity}
                              </span>
                              {varData && (
                                <span className="text-xs text-indigo-400">Tap pour détails →</span>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">{detail.order_items_summary || "—"}</div>
                  )}
                </div>

                {/* Bouton préparation */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className={`flex items-center gap-3 p-3 rounded-lg mb-4
                    ${detail.statut_preparation === "préparée" ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"}`}>
                    <span className="text-2xl">{detail.statut_preparation === "préparée" ? "✅" : "⏳"}</span>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">
                        {detail.statut_preparation === "préparée" ? "Commande préparée" : "En attente de préparation"}
                      </div>
                      {detail.prepared_by && <div className="text-xs text-gray-500">Par : {detail.prepared_by}</div>}
                    </div>
                  </div>
                  <button onClick={handleTogglePrep} disabled={saving}
                    className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50
                      ${detail.statut_preparation === "préparée"
                        ? "bg-orange-500 hover:bg-orange-600 text-white"
                        : "bg-green-600 hover:bg-green-700 text-white"}`}>
                    {saving ? "…" : detail.statut_preparation === "préparée" ? "⏳ Remettre en attente" : "✅ Marquer préparée"}
                  </button>
                </div>
              </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
           SECTION 2 — PRÉPARATION QUOTA
          ════════════════════════════════════════════════════ */}
      {activeTab === "quota" && (
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">

            {/* Header quota */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Liste de quota à préparer</h2>
                {quotaConfig.premier_order_id && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    À partir de <span className="font-mono font-semibold">{quotaConfig.premier_order_id}</span>
                    {quotaConfig.nb_commandes && ` · ${quotaConfig.nb_commandes} commandes`}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { invalidateCache("quota"); invalidateCache("orders"); loadOrders(); loadQuota(); }}
                  className="text-sm px-3 py-2 border border-gray-200 bg-white rounded-lg text-gray-600 hover:border-gray-400 transition-colors">
                  ↻ Actualiser
                </button>
                {isManager && (
                  <button onClick={() => setShowModal(true)}
                    className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors">
                    ⚡ Nouvelle quota
                  </button>
                )}
              </div>
            </div>

            {/* Stats + progression cochés */}
            {!quotaLoading && quotaRows.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-gray-900">{quotaRows.length}</div>
                  <div className="text-xs text-gray-500">Variantes</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-gray-900">{totalQty}</div>
                  <div className="text-xs text-gray-500">Total articles</div>
                </div>
                <div className={`border rounded-xl p-3 text-center transition-colors
                  ${nbChecked === quotaRows.length && quotaRows.length > 0 ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
                  <div className={`text-xl font-bold ${nbChecked === quotaRows.length && quotaRows.length > 0 ? "text-green-600" : "text-gray-900"}`}>
                    {nbChecked}/{quotaRows.length}
                  </div>
                  <div className="text-xs text-gray-500">Cochés</div>
                </div>
              </div>
            )}

            {/* Accordéon commandes incluses */}
            {quotaOrders.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowOrders(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>📋 Commandes incluses ({quotaOrders.length})</span>
                  <span className="text-gray-400 text-lg leading-none">{showOrders ? "▲" : "▼"}</span>
                </button>
                {showOrders && (
                  <div className="border-t border-gray-100 max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">#</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Order ID</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Client</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Date</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Articles</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotaOrders.map((o, idx) => (
                          <tr key={o.order_id || idx} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-700">{o.order_id}</td>
                            <td className="px-3 py-1.5 text-gray-800 truncate max-w-[140px]">{o.customer_name || "—"}</td>
                            <td className="px-3 py-1.5 text-gray-500">
                              {o.order_date ? new Date(o.order_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold text-gray-900">{o.nb_articles || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Actions coches */}
            {quotaRows.length > 0 && (
              <div className="flex gap-2 text-xs">
                <button onClick={() => {
                  const all = {};
                  quotaRows.forEach(r => { all[r.variant_id || r.title] = true; });
                  saveCheckedToStorage(quotaConfig?.quota_id, all);
                  setChecked(all);
                }} className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-gray-600 hover:border-gray-400">
                  Tout cocher
                </button>
                <button onClick={() => {
                  saveCheckedToStorage(quotaConfig?.quota_id, {});
                  setChecked({});
                }} className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-gray-600 hover:border-gray-400">
                  Tout décocher
                </button>
              </div>
            )}

            {/* Liste quota */}
            {quotaLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg> Chargement…
              </div>
            ) : quotaRows.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="text-4xl mb-3">📦</div>
                <div className="text-sm">Aucun quota généré.</div>
                {isManager && <div className="text-xs mt-2">Cliquez sur "⚡ Nouvelle quota" pour démarrer.</div>}
              </div>
            ) : (
              <div className="space-y-2">
                {quotaRows
                  .slice().sort((a, b) => (Number(b.quantity)||0) - (Number(a.quantity)||0))
                  .map((row, idx) => {
                    const key = row.variant_id || row.title || idx;
                    const isDone = !!checked[key];
                    return (
                      <div
                        key={idx}
                        onClick={() => setChecked(prev => {
                          const next = { ...prev, [key]: !prev[key] };
                          saveCheckedToStorage(quotaConfig?.quota_id, next);
                          return next;
                        })}
                        className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all
                          ${isDone ? "bg-green-50 border-green-200 opacity-60" : "bg-white border-gray-200 hover:border-gray-300"}`}
                      >
                        {/* Checkbox */}
                        <div className={`w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors
                          ${isDone ? "bg-green-500 border-green-500" : "border-gray-300"}`}>
                          {isDone && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                          </svg>}
                        </div>

                        {/* Image */}
                        <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                          {row.image_url ? (
                            <img src={row.image_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display="none"} />
                          ) : <span className="text-gray-300 text-xl">📦</span>}
                        </div>

                        {/* Infos */}
                        <div className="flex-1 min-w-0">
                          <div className={`font-semibold text-sm ${isDone ? "line-through text-gray-400" : "text-gray-900"}`}>
                            {row.title || "—"}
                          </div>
                          {row.client && <div className="text-xs text-gray-400 truncate mt-0.5">👤 {row.client}</div>}
                        </div>

                        {/* Quantité */}
                        <div className="flex-shrink-0 text-right">
                          <div className={`text-2xl font-bold ${isDone ? "text-gray-300" : Number(row.quantity) >= 5 ? "text-red-600" : "text-gray-900"}`}>
                            {row.quantity}
                          </div>
                          <div className="text-xs text-gray-400">unités</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
