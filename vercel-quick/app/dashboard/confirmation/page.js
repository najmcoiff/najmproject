"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api, invalidateCache } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { logConfirmationStatus } from "@/lib/logsv2";
import { smartMatch } from "@/lib/smart-search";

// ── Constantes métier ────────────────────────────────────────────
const DECISION_STATUS    = ["confirmer", "annuler", "modifier"];
const CONTACT_STATUS     = ["joignable", "injoignable 1er tentative", "injoignable 2eme tentative", "rappel"];
const CANCELLATION_REASONS = ["refus_client", "injoignable", "doublon", "mauvaise_adresse", "faux numéro", "produit_indisponible", "autre"];
const ORDER_CHANGE_STATUS  = ["adresse", "prix", "produit", "numéro de téléphone"];
const CONFIRMATION_STATUS  = ["confirmé", "annulé", "colis gros", "modifier", "echange ou remboursement", "colis guepex"];
const CUSTOMER_TYPE        = ["autres", "coiffeur_homme", "ongleriste", "toppik"];

const REFRESH_MS = 30000; // rafraîchissement auto toutes les 30s

// ── Coupon : extrait le code promo depuis la note ─────────────────
function getCouponCode(note) {
  if (!note) return null;
  const m = String(note).match(/code\s*[:(]\s*([A-Z0-9_-]{3,30})\)/i)
         || String(note).match(/code\s+([A-Z0-9_-]{3,30})/i);
  return m ? m[1].toUpperCase() : null;
}

// ── Badge dynamique (logique AppSheet reproduite côté front) ─────
function getBadge(o) {
  if (!o) return { label: "", color: "bg-gray-100 text-gray-500" };
  const ds = (o.decision_status || "").toLowerCase();
  const cs = (o.contact_status  || "").toLowerCase();
  const db = (o.doublon         || "").toLowerCase();

  if (ds === "annuler")                      return { label: "ANNULÉ",         color: "bg-red-100 text-red-700" };
  if (ds === "confirmer")                    return { label: "CONFIRMÉ",        color: "bg-green-100 text-green-700" };
  if (ds === "modifier")                     return { label: "MODIFIÉ",         color: "bg-blue-100 text-blue-700" };
  if (cs === "rappel")                       return { label: "RAPPEL",          color: "bg-yellow-100 text-yellow-700" };
  if (cs.includes("2eme"))                   return { label: "INJOIGNABLE T2",  color: "bg-orange-100 text-orange-700" };
  if (cs.includes("1er"))                    return { label: "INJOIGNABLE T1",  color: "bg-orange-100 text-orange-700" };
  if (/^doublon\d+$/.test(db))               return { label: db.toUpperCase(),  color: "bg-purple-100 text-purple-700" };
  if (db.startsWith("doublon_"))             return { label: "DOUBLON",         color: "bg-purple-100 text-purple-700" };
  return { label: "", color: "" };
}

// ── Icônes alerte (Alert_Icons AppSheet) ─────────────────────────
function getIcons(o) {
  if (!o) return [];
  const icons = [];
  if ((o.decision_status     || "") === "modifier")    icons.push("♻️");
  if ((o.confirmation_status || "") === "colis gros")  icons.push("🤎");
  const db = (o.doublon || "");
  if (/^doublon\d+$/i.test(db) || db.startsWith("doublon_")) icons.push("⚠️");
  if ((o.statut_preparation  || "") === "préparée")    icons.push("✅");
  if ((o.last                || "") === "OUI")         icons.push("🗓️");
  if ((o.tracking            || "") !== "")            icons.push("🖨️");
  if ((o.synchroniser        || "") === "🔴")          icons.push("🔴");
  if ((o.synchroniser        || "") === "🟢")          icons.push("🟢");
  if (o.coupon_code || getCouponCode(o.note))          icons.push("🏷️");
  return icons;
}

// ── Filtre tabs ───────────────────────────────────────────────────
const TABS = [
  { key: "tous",      label: "Tous" },
  { key: "a_traiter", label: "À traiter" },
  { key: "confirmer", label: "Confirmés" },
  { key: "annuler",   label: "Annulés" },
  { key: "modifier",  label: "À modifier" },
  { key: "rappel",    label: "Rappel" },
  { key: "pos",       label: "🧾 POS",  isPOS: true },
];

function filterOrders(orders, tab, search) {
  // Les commandes POS ne doivent jamais apparaître dans les onglets online
  let list = orders.filter(o => (o.order_source || "") !== "pos");
  if (tab === "a_traiter") list = list.filter(o => !o.decision_status);
  else if (tab === "rappel") list = list.filter(o => (o.contact_status || "").includes("rappel"));
  else if (tab !== "tous") list = list.filter(o => o.decision_status === tab);

  if (search.trim()) {
    list = list.filter(o => smartMatch(search, [
      o.customer_name, o.customer_phone, o.order_id,
      o.shopify_order_name, o.wilaya, o.commune,
      o.customer_address, o.tracking,
    ]));
  }
  return list;
}

// ── Statut impression POS ─────────────────────────────────────────
function getPrintStatus(order) {
  if (!order) return { label: "", color: "", expired: false };
  const printedAt = order.printed_at;
  if (printedAt) {
    return {
      label: "Imprimé " + new Date(printedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      color: "bg-green-100 text-green-700",
      expired: false,
      done: true,
    };
  }
  const orderDate = order.order_date ? new Date(order.order_date).getTime() : 0;
  const expired   = orderDate > 0 && (Date.now() - orderDate) > 5 * 60 * 1000;
  if (expired) {
    return { label: "Non imprimé", color: "bg-red-100 text-red-700", expired: true, done: false };
  }
  return { label: "En attente…", color: "bg-yellow-100 text-yellow-700", expired: false, done: false };
}

// ── Historique client (customer_summary) ─────────────────────────
function CustomerSummary({ raw }) {
  if (!raw) return null;
  const s = String(raw).trim();

  if (!s || s.toLowerCase() === "nouveau client") {
    return (
      <div className="mt-3 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <span className="text-base">🆕</span>
        <span className="text-xs font-semibold text-blue-700">Nouveau client</span>
      </div>
    );
  }

  // Parser : "Nom | Cmd:2 | Flou:0 | Conf:2 | Livré:2 | Retour:0 | Ech:0 | Taux Conf:100% | Taux Livr:100% | Taux Ret:0% | Score:87"
  const parts = s.split("|").map(p => p.trim());
  const get = (key) => {
    const part = parts.find(p => p.startsWith(key + ":"));
    if (!part) return null;
    const val = part.slice(key.length + 1).trim().replace("%", "");
    const n = Number(val);
    return isNaN(n) ? val : n;
  };

  const cmd      = get("Cmd");
  const conf     = get("Conf");
  const livre    = get("Livré");
  const retour   = get("Retour");
  const ech      = get("Ech");
  const tauxConf = get("Taux Conf");
  const tauxLivr = get("Taux Livr");
  const tauxRet  = get("Taux Ret");
  const score    = get("Score");

  const scoreColor = score >= 80 ? "bg-green-100 text-green-700 border-green-200"
                   : score >= 60 ? "bg-orange-100 text-orange-700 border-orange-200"
                   :               "bg-red-100 text-red-700 border-red-200";

  const retColor = tauxRet > 30 ? "text-red-600 font-bold"
                 : tauxRet > 10 ? "text-orange-500 font-semibold"
                 :                "text-green-600";

  const confColor = tauxConf >= 80 ? "text-green-600"
                  : tauxConf >= 50 ? "text-orange-500"
                  :                  "text-red-600";

  return (
    <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
      {/* Barre score */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">📊 Historique client</span>
        {score !== null && (
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${scoreColor}`}>
            Score {score}
          </span>
        )}
      </div>
      {/* Compteurs */}
      <div className="grid grid-cols-4 divide-x divide-gray-100">
        {[
          { label: "Cmds",    val: cmd,    color: "text-gray-800" },
          { label: "Conf",    val: conf,   color: "text-green-600" },
          { label: "Livré",   val: livre,  color: "text-blue-600" },
          { label: "Retour",  val: retour, color: retour > 0 ? "text-red-600" : "text-gray-400" },
        ].map(({ label, val, color }) => (
          <div key={label} className="flex flex-col items-center py-2">
            <span className={`text-base font-bold ${color}`}>{val ?? "—"}</span>
            <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
          </div>
        ))}
      </div>
      {/* Taux */}
      <div className="grid grid-cols-3 gap-px bg-gray-100 border-t border-gray-100">
        {[
          { label: "Taux conf",  val: tauxConf, color: confColor },
          { label: "Taux livr",  val: tauxLivr, color: tauxLivr >= 70 ? "text-green-600" : tauxLivr >= 40 ? "text-orange-500" : "text-red-600" },
          { label: "Taux ret",   val: tauxRet,  color: retColor },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white flex flex-col items-center py-1.5">
            <span className={`text-xs font-bold ${color}`}>{val !== null ? `${val}%` : "—"}</span>
            <span className="text-[10px] text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Liste des wilayas (statique) ─────────────────────────────────
const WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar",
  "Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger",
  "Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma",
  "Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh",
  "Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued",
  "Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent",
  "Ghardaïa","Relizane","Timimoun","Bordj Badji Mokhtar","Ouled Djellal","Béni Abbès",
  "In Salah","In Guezzam","Touggourt","Djanet","El M'Ghair","El Ménia",
];

// ── Composant principal ───────────────────────────────────────────
export default function ConfirmationPage() {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [tab,      setTab]      = useState("tous");
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null); // order_id sélectionné
  const [detail,   setDetail]   = useState(null); // objet commande sélectionnée
  const [items,       setItems]       = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [toast,    setToast]    = useState(null);
  const [modifyModal,     setModifyModal]     = useState(null); // Shopify modal
  const [nativeEditModal, setNativeEditModal] = useState(null); // nc_boutique/pos modal
  const timerRef    = useRef(null);
  const printingRef = useRef(false); // garde synchrone contre double-clic
  const selectedRef = useRef(null); // toujours à jour même dans les callbacks
  const [agentName, setAgentName] = useState("");

  // ── Suppression commande (owner) ────────────────────────────────
  const [deleteModal,   setDeleteModal]   = useState(null); // order à supprimer
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isOwner,       setIsOwner]       = useState(false);

  // ── Édition info client (tel + wilaya + commune + adresse + livraison) ─
  const [editOpen,       setEditOpen]       = useState(false);
  const [editForm,       setEditForm]       = useState({ customer_phone: "", wilaya: "", commune: "", adresse: "", delivery_type: "home", delivery_price: "", order_total: "" });
  const [editSaving,     setEditSaving]     = useState(false);
  const [editCommunes,   setEditCommunes]   = useState([]);
  const [editCommunesLoading, setEditCommunesLoading] = useState(false);

  // ── POS ─────────────────────────────────────────────────────────
  const [posOrders,   setPosOrders]   = useState([]);
  const [posLoading,  setPosLoading]  = useState(false);
  const [posLoaded,   setPosLoaded]   = useState(false); // lazy load
  const [posSearch,   setPosSearch]   = useState("");
  const [printing,    setPrinting]    = useState(null); // order_id en cours

  // Garder selectedRef synchronisé pour l'utiliser dans loadOrders (closure stable)
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    const s = getSession();
    setAgentName(s?.user?.nom || "agent");
    setIsOwner(s?.user?.role === "owner");
  }, []);

  // ── Formulaire décision ─────────────────────────────────────────
  const [form, setForm] = useState({
    decision_status:     "",
    cancellation_reason: "",
    order_change_status: "",
    contact_status:      "",
    confirmation_status: "",
    customer_type:       "",
    note:                "",
    synchroniser:        "",
  });

  const showToast = useCallback((msg, type = "success", durationMs = 4000) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), durationMs);
  }, []);

  // ── Chargement communes quand wilaya change dans editForm ──────────
  const loadEditCommunes = useCallback(async (wilayaName) => {
    if (!wilayaName) { setEditCommunes([]); return; }
    // Trouver le code de la wilaya
    const SB_URL_PUB = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://alyxejkdtkdmluvgfnqk.supabase.co";
    const SB_ANON    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const wilayaMatch = WILAYAS.findIndex(w => w.toLowerCase() === wilayaName.toLowerCase());
    if (wilayaMatch < 0) { setEditCommunes([]); return; }
    const wilayaCode = wilayaMatch + 1;
    setEditCommunesLoading(true);
    try {
      const res = await fetch(
        `${SB_URL_PUB}/rest/v1/nc_communes?wilaya_code=eq.${wilayaCode}&select=commune_name&order=commune_name.asc`,
        { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }
      );
      const data = await res.json();
      setEditCommunes(Array.isArray(data) ? data.map(r => r.commune_name) : []);
    } catch { setEditCommunes([]); }
    finally { setEditCommunesLoading(false); }
  }, []);

  // ── Handler save infos client ─────────────────────────────────────
  const handleSaveCustomerInfo = useCallback(async () => {
    if (!detail || editSaving) return;
    const fields = {};
    if (editForm.customer_phone.trim()) fields.customer_phone = editForm.customer_phone.trim();
    if (editForm.wilaya.trim())         fields.wilaya         = editForm.wilaya.trim();
    if (editForm.commune.trim())        fields.commune        = editForm.commune.trim();
    if (editForm.adresse.trim())        fields.adresse        = editForm.adresse.trim();
    if (editForm.delivery_type)         fields.delivery_type  = editForm.delivery_type;
    const dp = Number(editForm.delivery_price);
    if (!isNaN(dp) && editForm.delivery_price !== "") fields.delivery_price = dp;
    const ot = Number(editForm.order_total);
    if (!isNaN(ot) && editForm.order_total !== "") fields.order_total = ot;
    if (!Object.keys(fields).length) { setEditOpen(false); return; }
    setEditSaving(true);
    try {
      const res = await api.updateCustomerInfo(detail.order_id, fields);
      if (res.ok) {
        setDetail(d => ({ ...d, ...fields }));
        setEditOpen(false);
        showToast("✅ Infos client mises à jour");
      } else {
        showToast(res.error || "Erreur mise à jour", "error");
      }
    } catch (e) {
      showToast("Erreur réseau : " + e.message, "error");
    } finally {
      setEditSaving(false);
    }
  }, [detail, editForm, editSaving, showToast]);

  // ── Chargement commandes POS ────────────────────────────────────
  const loadPosOrders = useCallback(async () => {
    setPosLoading(true);
    try {
      const res = await api.getPosOrders("", 200);
      if (res.ok) { setPosOrders(res.rows || []); setPosLoaded(true); }
    } catch (_) {}
    finally { setPosLoading(false); }
  }, []);

  // Déclencher le chargement POS quand l'onglet POS est sélectionné
  useEffect(() => {
    if (tab === "pos" && !posLoaded) loadPosOrders();
  }, [tab, posLoaded, loadPosOrders]);

  // ── Impression ticket POS ────────────────────────────────────────
  const handlePrint = useCallback(async (order, force = true) => {
    if (!order?.order_id) {
      showToast("Erreur : commande invalide", "error");
      return;
    }
    // Garde synchrone : bloque les doubles clics rapides avant re-render React
    if (printingRef.current) return;
    printingRef.current = true;
    setPrinting(order.order_id);
    try {
      const res = await api.printPosTicket(order.order_id, true); // force=true toujours pour impression manuelle
      console.log("[PRINT] response:", res);
      if (res.ok) {
        showToast("🖨️ Ticket envoyé à l'imprimante ✓ (job #" + (res.print_job_id || "?") + ")", "success");
        const printedAt = res.printed_at || new Date().toISOString();
        setPosOrders(prev => prev.map(o =>
          o.order_id === order.order_id ? { ...o, printed_at: printedAt } : o
        ));
        if (detail?.order_id === order.order_id) {
          setDetail(prev => ({ ...prev, printed_at: printedAt }));
        }
      } else {
        console.error("[PRINT] error:", res);
        showToast("Erreur impression : " + (res.error || "réponse inattendue"), "error");
      }
    } catch (e) {
      console.error("[PRINT] exception:", e);
      showToast("Erreur réseau impression : " + (e?.message || String(e)), "error");
    } finally {
      setPrinting(null);
      printingRef.current = false;
    }
  }, [detail, showToast]);

  // ── Chargement commandes ────────────────────────────────────────
  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getOrders();
      if (res.ok) {
        const rows = res.rows || [];
        setOrders(rows);
        setError(null);
        // Mettre à jour le panneau détail si une commande est sélectionnée
        const curId = selectedRef.current;
        if (curId) {
          const fresh = rows.find(o => o.order_id === curId);
          if (fresh) setDetail(prev => prev ? { ...prev, ...fresh } : fresh);
        }
      } else {
        setError(res.error || "Erreur chargement");
      }
    } catch (e) {
      setError("Erreur réseau : " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Forcer fetch frais à l'ouverture (purge cache potentiellement périmé avec POS)
    invalidateCache("orders");
    loadOrders();
    timerRef.current = setInterval(() => loadOrders(true), REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [loadOrders]);

  // ── Handler suppression commande (owner) — défini APRÈS loadOrders pour éviter TDZ ──
  const handleDeleteOrder = useCallback(async (order, restock) => {
    if (!order || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const res = await api.deleteOrder(order.order_id, restock);
      if (res.ok) {
        setDeleteModal(null);
        setDetail(null);
        setSelected(null);
        showToast(`🗑️ Commande supprimée${restock ? ` — ${res.restocked_items} article(s) restitué(s)` : " — sans restock"}`, "success");
        await loadOrders();
      } else {
        showToast(res.error || "Erreur suppression", "error");
      }
    } catch (e) {
      showToast("Erreur réseau : " + e.message, "error");
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteLoading, showToast, loadOrders]);

  // ── Sélection d'une commande ────────────────────────────────────
  const selectOrder = useCallback(async (order) => {
    setSelected(order.order_id);
    setDetail(order);
    setItems([]);
    setItemsLoading(true);
    setForm({
      decision_status:     order.decision_status     || "",
      cancellation_reason: order.cancellation_reason || "",
      order_change_status: order.order_change_status || "",
      contact_status:      order.contact_status      || "",
      confirmation_status: order.confirmation_status || "",
      customer_type:       order.customer_type       || "",
      note:                order.note                || "",
      synchroniser:        order.synchroniser        || "",
    });
    // Charger les articles
    try {
      const res = await api.getOrderItems(order.order_id);
      if (res.ok) setItems(res.rows || []);
    } catch (_) {
    } finally {
      setItemsLoading(false);
    }
  }, []);

  // ── Sauvegarde décision ─────────────────────────────────────────
  const handleSave = async () => {
    if (!detail) return;

    if (form.decision_status === "annuler" && !form.cancellation_reason) {
      showToast("Motif d'annulation requis avant d'enregistrer", "error");
      return;
    }
    if (form.decision_status && !form.confirmation_status) {
      showToast("Confirmation client requise avant d'enregistrer", "error");
      return;
    }

    setSaving(true);
    try {
      const fields = { ...form };
      // Nettoyer les champs conditionnels
      if (fields.decision_status !== "annuler") fields.cancellation_reason = "";
      if (fields.decision_status !== "modifier") fields.order_change_status = "";

      const ancienStatut = detail.decision_status || "";
      const res = await api.updateConfirmation(detail.order_id, fields);
      if (res.ok) {
        showToast("Commande mise à jour ✓");
        logConfirmationStatus(
          agentName,
          detail.order_id,
          ancienStatut,
          fields.decision_status    || "",
          fields.contact_status     || "",
          fields.cancellation_reason || null
        );
        // Mettre à jour localement
        setOrders(prev => prev.map(o =>
          o.order_id === detail.order_id ? { ...o, ...fields } : o
        ));
        setDetail(prev => ({ ...prev, ...fields }));
      } else {
        showToast(res.error || "Erreur lors de la sauvegarde", "error");
      }
    } catch (e) {
      showToast("Erreur réseau", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Compteurs par statut ─────────────────────────────────────────
  const onlineOrders = orders.filter(o => (o.order_source || "") !== "pos");
  const counts = {
    tous:      onlineOrders.length,
    a_traiter: onlineOrders.filter(o => !o.decision_status).length,
    confirmer: onlineOrders.filter(o => o.decision_status === "confirmer").length,
    annuler:   onlineOrders.filter(o => o.decision_status === "annuler").length,
    modifier:  onlineOrders.filter(o => o.decision_status === "modifier").length,
    rappel:    onlineOrders.filter(o => (o.contact_status || "").includes("rappel")).length,
    pos:       posOrders.length,
  };

  const filtered    = filterOrders(orders, tab, search);
  const filteredPos = posOrders.filter(o => {
    if (!posSearch.trim()) return true;
    return smartMatch(posSearch, [
      o.customer_name, o.shopify_order_name, o.order_id,
      o.customer_phone, o.wilaya,
    ]);
  });

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ height: "calc(100vh - 64px)" }}>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2
          ${toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
          {toast.type === "error" ? "✕" : "✓"} {toast.msg}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Panneau gauche : liste ────────────────────────────── */}
        <div className={`flex-shrink-0 flex flex-col border-r border-gray-200 bg-white w-full md:w-96 ${detail ? "hidden md:flex" : "flex"}`}>

          {/* Header liste */}
          <div className="p-3 border-b border-gray-200 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Confirmation colis</h2>
              <button onClick={() => { invalidateCache("orders"); loadOrders(); }} className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded border border-gray-200 hover:border-gray-400">
                ↻ Actualiser
              </button>
            </div>
            <input
              type="text"
              placeholder="Rechercher nom, tél, wilaya…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto flex-shrink-0">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium transition-colors
                  ${tab === t.key
                    ? t.isPOS ? "bg-orange-600 text-white" : "bg-gray-900 text-white"
                    : t.isPOS ? "bg-orange-50 text-orange-700 hover:bg-orange-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                {t.label}
                {counts[t.key] > 0 && (
                  <span className="ml-1 opacity-70">{counts[t.key]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto">
            {tab === "pos" ? (
              /* ── Liste POS ── */
              <>
                {/* Barre recherche + sync POS */}
                <div className="px-3 py-2 border-b border-orange-100 bg-orange-50 flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Rechercher bon, nom…"
                    value={posSearch}
                    onChange={e => setPosSearch(e.target.value)}
                    className="flex-1 text-xs border border-orange-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                  />
                  <button
                    onClick={loadPosOrders}
                    disabled={posLoading}
                    className="text-xs px-2 py-1.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-100 disabled:opacity-50 flex-shrink-0"
                  >
                    {posLoading ? "…" : "↻"}
                  </button>
                </div>
                {posLoading ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Chargement POS…</div>
                ) : filteredPos.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Aucune commande POS</div>
                ) : (
                  filteredPos.map(order => {
                    const ps         = getPrintStatus(order);
                    const isSelected = selected === order.order_id;
                    const isPrinting = printing === order.order_id;
                    return (
                      <div
                        key={order.order_id}
                        onClick={() => selectOrder(order)}
                        className={`px-3 py-3 border-b border-orange-50 cursor-pointer hover:bg-orange-50/50 transition-colors
                          ${isSelected ? "bg-orange-600 hover:bg-orange-600" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium text-sm truncate ${isSelected ? "text-white" : "text-gray-900"}`}>
                              {order.shopify_order_name || order.order_id}
                            </div>
                            <div className={`text-xs mt-0.5 truncate ${isSelected ? "text-orange-100" : "text-gray-500"}`}>
                              {order.order_items_summary || "—"}
                            </div>
                            <div className={`text-xs mt-0.5 ${isSelected ? "text-orange-200" : "text-gray-400"}`}>
                              {Number(order.order_total || 0).toLocaleString("fr-DZ")} DA ·{" "}
                              {order.order_date ? new Date(order.order_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}
                            </div>
                          </div>
                          {/* Bouton impression */}
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isSelected ? "bg-white/20 text-white" : ps.color}`}>
                              {ps.done ? "✓ " : ps.expired ? "⚠ " : "⏳ "}{ps.label}
                            </span>
                            <button
                              onClick={e => { e.stopPropagation(); handlePrint(order, true); }}
                              disabled={isPrinting}
                              className={`text-xs px-2 py-1 rounded font-semibold transition-colors flex items-center gap-1
                                ${isSelected
                                  ? "bg-white/20 text-white hover:bg-white/30"
                                  : "bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200"
                                } disabled:opacity-50`}
                            >
                              {isPrinting ? "…" : "🖨️"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            ) : (
              /* ── Liste normale ── */
              <>
                {loading ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Chargement…</div>
                ) : error ? (
                  <div className="p-4 text-red-600 text-sm">{error}</div>
                ) : filtered.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Aucune commande</div>
                ) : (
                  filtered.map(order => {
                    const badge = getBadge(order);
                    const icons = getIcons(order);
                    const isSelected = selected === order.order_id;
                    return (
                      <div
                        key={order.order_id}
                        onClick={() => selectOrder(order)}
                        className={`px-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors
                          ${isSelected ? "bg-gray-900 hover:bg-gray-900" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium text-sm truncate ${isSelected ? "text-white" : "text-gray-900"}`}>
                              {order.customer_name || "—"}
                            </div>
                            <div className={`text-xs mt-0.5 ${isSelected ? "text-gray-300" : "text-gray-500"}`}>
                              {order.customer_phone}
                            </div>
                            <div className={`text-xs mt-0.5 ${isSelected ? "text-gray-400" : "text-gray-400"}`}>
                              {order.wilaya} · {Number(order.order_total || 0).toLocaleString("fr-DZ")} DA
                            </div>
                            {order.order_date && (
                              <div className={`text-xs mt-0.5 ${isSelected ? "text-gray-400" : "text-gray-400"}`}>
                                {new Date(order.order_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                {" "}{new Date(order.order_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {badge.label && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isSelected ? "bg-white/20 text-white" : badge.color}`}>
                                {badge.label}
                              </span>
                            )}
                            {icons.length > 0 && (
                              <div className="text-xs flex gap-0.5">{icons.join(" ")}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Panneau droit : détail ────────────────────────────── */}
        <div className={`flex-1 overflow-y-auto bg-gray-50 flex flex-col ${!detail ? "hidden md:flex" : "flex"}`}>
          {!detail ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Sélectionnez une commande
            </div>
          ) : (
            <>
            {/* Bouton retour mobile */}
            <div className="md:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => { setSelected(null); setDetail(null); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 active:opacity-60">
                ← Retour
              </button>
              <span className="font-semibold text-gray-900 truncate flex-1">{detail.customer_name}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-4 space-y-4">

              {/* En-tête commande */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-gray-900">{detail.customer_name}</div>
                    <a href={`tel:${detail.customer_phone}`}
                      className="text-2xl font-bold text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1.5 transition-colors w-fit">
                      📞 {detail.customer_phone}
                    </a>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-1 rounded">{detail.wilaya}</span>
                      {detail.commune && <span className="bg-gray-100 px-2 py-1 rounded">{detail.commune}</span>}
                      {(detail.shopify_delivery_mode || detail.delivery_mode) && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">{detail.shopify_delivery_mode || detail.delivery_mode}</span>}
                      {detail.customer_type && <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded">{detail.customer_type}</span>}
                      <button
                        onClick={() => {
                          const newForm = {
                            customer_phone: detail.customer_phone || "",
                            wilaya:         detail.wilaya         || "",
                            commune:        detail.commune        || "",
                            adresse:        detail.adresse        || "",
                            delivery_type:  detail.delivery_type  || "home",
                            delivery_price: detail.delivery_price != null ? String(detail.delivery_price) : "",
                            order_total:    detail.order_total    != null ? String(detail.order_total)    : "",
                          };
                          setEditForm(newForm);
                          setEditCommunes([]);
                          setEditOpen(v => !v);
                          // Charger les communes pour la wilaya actuelle
                          if (newForm.wilaya) loadEditCommunes(newForm.wilaya);
                        }}
                        className="bg-orange-50 text-orange-600 border border-orange-200 px-2 py-1 rounded hover:bg-orange-100 transition-colors font-medium"
                      >
                        ✏️ Modifier infos
                      </button>
                    </div>

                    {/* ── Formulaire inline édition client ── */}
                    {editOpen && (
                      <div className="mt-3 border border-orange-200 rounded-xl bg-orange-50 p-3 space-y-2">
                        <p className="text-xs font-semibold text-orange-700 mb-2">✏️ Modifier les infos client</p>
                        <div className="grid grid-cols-2 gap-2">

                          {/* Téléphone */}
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                            <input
                              type="tel" value={editForm.customer_phone}
                              onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))}
                              placeholder="05XXXXXXXX"
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                          </div>

                          {/* Wilaya */}
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Wilaya</label>
                            <select
                              value={editForm.wilaya}
                              onChange={e => {
                                const w = e.target.value;
                                setEditForm(f => ({ ...f, wilaya: w, commune: "" }));
                                setEditCommunes([]);
                                if (w) loadEditCommunes(w);
                              }}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                            >
                              <option value="">— Choisir —</option>
                              {WILAYAS.map(w => (
                                <option key={w} value={w}>{w}</option>
                              ))}
                            </select>
                          </div>

                          {/* Commune — menu déroulant ZR si disponible */}
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                              Commune {editCommunesLoading && <span className="text-orange-400">…</span>}
                            </label>
                            {editCommunes.length > 0 ? (
                              <select
                                value={editForm.commune}
                                onChange={e => setEditForm(f => ({ ...f, commune: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                                data-testid="edit-commune-select"
                              >
                                <option value="">— Choisir —</option>
                                {editCommunes.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text" value={editForm.commune}
                                onChange={e => setEditForm(f => ({ ...f, commune: e.target.value }))}
                                placeholder={editForm.wilaya ? "Saisir la commune" : "Choisir la wilaya d'abord"}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                                data-testid="edit-commune-input"
                              />
                            )}
                          </div>

                          {/* Adresse */}
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Adresse</label>
                            <input
                              type="text" value={editForm.adresse}
                              onChange={e => setEditForm(f => ({ ...f, adresse: e.target.value }))}
                              placeholder="Rue, n°…"
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                          </div>
                        </div>

                        {/* Type de livraison */}
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Type de livraison</label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { value: "home",   label: "🏠 Domicile" },
                              { value: "office", label: "🏢 Bureau / Stop-desk" },
                            ].map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setEditForm(f => ({ ...f, delivery_type: opt.value }))}
                                data-testid={`edit-delivery-${opt.value}`}
                                className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors
                                  ${editForm.delivery_type === opt.value
                                    ? "bg-orange-500 text-white border-orange-500"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Prix de livraison */}
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prix livraison (DA)</label>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={editForm.delivery_price}
                            onChange={e => setEditForm(f => ({ ...f, delivery_price: e.target.value }))}
                            placeholder="ex: 400"
                            data-testid="edit-delivery-price"
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                        </div>

                        {/* Prix total commande — contrôle libre */}
                        <div className="border-t border-orange-100 pt-2">
                          <label className="text-[10px] font-semibold text-orange-700 uppercase tracking-wide block mb-1">
                            💰 Prix total commande (DA) — remboursement / ajustement
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={editForm.order_total}
                            onChange={e => setEditForm(f => ({ ...f, order_total: e.target.value }))}
                            placeholder={`Actuel : ${Number(detail?.order_total || 0).toLocaleString("fr-DZ")} DA`}
                            data-testid="edit-order-total"
                            className="w-full border border-orange-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 font-semibold"
                          />
                          <p className="text-[10px] text-gray-400 mt-1">
                            Laisser vide pour ne pas changer · Mettre 0 pour solde offert
                          </p>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setEditOpen(false)}
                            className="flex-1 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={handleSaveCustomerInfo}
                            disabled={editSaving}
                            className="flex-[2] py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors"
                          >
                            {editSaving ? "Enregistrement…" : "✅ Sauvegarder"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xl font-bold text-gray-900">{Number(detail.order_total || 0).toLocaleString("fr-DZ")} DA</div>
                    {detail.shipping_fee > 0 && (
                      <div className="text-xs text-gray-500">{Number(detail.shipping_fee).toLocaleString("fr-DZ")} DA livraison</div>
                    )}
                    {detail.shopify_order_name && (
                      <a href={detail.shopify_order_url} target="_blank" rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline block mt-1">
                        {detail.shopify_order_name} ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Résumé client */}
                <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                  {detail.Adresse && (
                    <div className="col-span-2"><span className="font-medium text-gray-700">📍</span> {detail.Adresse}</div>
                  )}
                  {(detail.shopify_delivery_mode || detail.delivery_mode) && (
                    <div><span className="font-medium text-gray-700">🚚</span> {detail.shopify_delivery_mode || detail.delivery_mode}</div>
                  )}
                  {detail.order_date && (
                    <div>
                      <span className="font-medium text-gray-700">📅</span>{" "}
                      {new Date(detail.order_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      {" "}{new Date(detail.order_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                  {detail.tracking && (
                    <div className="col-span-2"><span className="font-medium text-gray-700">📦</span> {detail.tracking}</div>
                  )}
                  {detail.prepared_by && (
                    <div className="col-span-2"><span className="font-medium text-gray-700">✅ Préparé par :</span> {detail.prepared_by}</div>
                  )}
                </div>

                {/* Historique client */}
                <CustomerSummary raw={detail.customer_summary} />

                {/* Articles de la commande */}
                <div className="mt-3">
                  {itemsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                      <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Chargement des articles…
                    </div>
                  ) : items.length > 0 ? (
                    <div className="space-y-2">
                      {items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2">
                          {item.image_url && (
                            <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded" onError={e => e.target.style.display="none"} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                            <div className="text-xs text-gray-500">
                              Qté : {item.quantity} · {Math.abs(Number(item.price || 0)).toLocaleString("fr-FR")} DA/u
                            </div>
                          </div>
                          <div className="text-sm font-bold text-gray-800 flex-shrink-0">
                            {(() => {
                              const total = Number(item.total_products) || (Number(item.price) * Number(item.quantity));
                              return Math.abs(total).toLocaleString("fr-FR") + " DA";
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Bouton تعديل الطلب — nc_boutique/pos (T202: Shopify supprimé) */}
                  {["nc_boutique", "pos"].includes(detail?.order_source) && (
                    <button
                      onClick={() => setNativeEditModal(detail)}
                      data-testid="modify-items-btn"
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      تعديل الطلب
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-bold">
                        {detail?.order_source === "pos" ? "POS" : "Boutique"}
                      </span>
                    </button>
                  )}

                  {/* Bouton Supprimer — owner uniquement */}
                  {isOwner && (
                    <button
                      onClick={() => setDeleteModal(detail)}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                      Supprimer définitivement
                    </button>
                  )}
                </div>

                {/* Alertes */}
                {(detail.doublon || detail.adress_error || detail.note_manager || detail.coupon_code || getCouponCode(detail.note)) && (
                  <div className="mt-3 space-y-1">
                    {(detail.coupon_code || getCouponCode(detail.note)) && (
                      <div className="text-xs bg-emerald-50 text-emerald-800 px-3 py-2 rounded-lg font-semibold flex items-center justify-between gap-2">
                        <span>🏷️ Code promo : <span className="font-bold tracking-wider">{detail.coupon_code || getCouponCode(detail.note)}</span></span>
                        {Number(detail.coupon_discount) > 0 && (
                          <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full text-[11px] font-bold">
                            -{Number(detail.coupon_discount).toLocaleString("fr-DZ")} DA
                          </span>
                        )}
                      </div>
                    )}
                    {detail.doublon && (/^doublon\d+$/i.test(detail.doublon) || detail.doublon.startsWith("doublon_")) && (
                      <div className="text-xs bg-purple-50 text-purple-700 px-3 py-2 rounded-lg">⚠️ {detail.doublon.toUpperCase()} — même numéro de téléphone</div>
                    )}
                    {detail["adress error"] && (
                      <div className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg">📍 Erreur adresse signalée</div>
                    )}
                    {detail.note_manager && (
                      <div className="text-xs bg-amber-50 text-amber-800 px-3 py-2 rounded-lg">📌 Manager : {detail.note_manager}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Formulaire décision */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Décision agent</h3>

                {/* Boutons décision principale */}
                <div className="grid grid-cols-3 gap-2">
                  {DECISION_STATUS.map(d => (
                    <button
                      key={d}
                      onClick={() => setForm(f => ({ ...f, decision_status: f.decision_status === d ? "" : d }))}
                      className={`py-2 rounded-lg text-sm font-semibold transition-colors border
                        ${form.decision_status === d
                          ? d === "confirmer" ? "bg-green-600 text-white border-green-600"
                          : d === "annuler"   ? "bg-red-600 text-white border-red-600"
                          :                    "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}
                    >
                      {d === "confirmer" ? "✓ Confirmer" : d === "annuler" ? "✕ Annuler" : "✎ Modifier"}
                    </button>
                  ))}
                </div>

                {/* Motif annulation */}
                {form.decision_status === "annuler" && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Motif annulation *</label>
                    <div className="grid grid-cols-2 gap-1">
                      {CANCELLATION_REASONS.map(r => (
                        <button key={r}
                          onClick={() => setForm(f => ({ ...f, cancellation_reason: f.cancellation_reason === r ? "" : r }))}
                          className={`text-xs py-1.5 px-2 rounded border text-left transition-colors
                            ${form.cancellation_reason === r ? "bg-red-50 border-red-400 text-red-700 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Type de modification */}
                {form.decision_status === "modifier" && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Ce qui doit être modifié *</label>
                    <div className="grid grid-cols-2 gap-1">
                      {ORDER_CHANGE_STATUS.map(r => (
                        <button key={r}
                          onClick={() => setForm(f => ({ ...f, order_change_status: f.order_change_status === r ? "" : r }))}
                          className={`text-xs py-1.5 px-2 rounded border text-left transition-colors
                            ${form.order_change_status === r ? "bg-blue-50 border-blue-400 text-blue-700 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact status */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Statut de contact</label>
                  <div className="flex flex-wrap gap-1">
                    {CONTACT_STATUS.map(c => (
                      <button key={c}
                        onClick={() => setForm(f => ({ ...f, contact_status: f.contact_status === c ? "" : c }))}
                        className={`text-xs py-1 px-2 rounded-full border transition-colors
                          ${form.contact_status === c ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note agent */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Note agent</label>
                  <textarea
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    rows={2}
                    placeholder="Ajouter une note…"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  />
                </div>

                {/* Confirmation client */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Confirmation client
                    {form.decision_status && !form.confirmation_status && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </label>
                  <select
                    value={form.confirmation_status}
                    onChange={e => setForm(f => ({ ...f, confirmation_status: e.target.value }))}
                    className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900
                      ${form.decision_status && !form.confirmation_status ? "border-red-400 bg-red-50" : "border-gray-200"}`}
                  >
                    <option value="" disabled>Choisir…</option>
                    {CONFIRMATION_STATUS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                {/* Type client */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Type client</label>
                  <div className="flex flex-wrap gap-1">
                    {CUSTOMER_TYPE.map(t => (
                      <button key={t}
                        onClick={() => setForm(f => ({ ...f, customer_type: f.customer_type === t ? "" : t }))}
                        className={`text-xs py-1 px-2 rounded-full border transition-colors
                          ${form.customer_type === t ? "bg-purple-600 text-white border-purple-600" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bouton sauvegarder */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>

              {/* ── Section Ticket POS (visible si order_source = pos) ── */}
              {detail.order_source === "pos" && (
                <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-orange-800 text-sm uppercase tracking-wide flex items-center gap-2">
                      🧾 Commande POS
                    </h3>
                    {(() => {
                      const ps = getPrintStatus(detail);
                      return (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ps.color}`}>
                          {ps.done ? "✓ " : ps.expired ? "⚠ " : "⏳ "}{ps.label}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Résumé articles */}
                  {detail.order_items_summary && (
                    <div className="bg-white rounded-lg border border-orange-100 p-3">
                      <div className="text-xs font-semibold text-gray-500 mb-1.5">Articles vendus</div>
                      <div className="space-y-1">
                        {String(detail.order_items_summary).split(" | ").map((item, i) => (
                          <div key={i} className="text-sm text-gray-800">{item.trim()}</div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-orange-100 flex justify-between items-center">
                        <span className="text-xs text-gray-500">Total</span>
                        <span className="text-base font-bold text-orange-700">
                          {Number(detail.order_total || 0).toLocaleString("fr-DZ")} DA
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Boutons impression */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePrint(detail, true)}
                      disabled={printing === detail.order_id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors"
                    >
                      {printing === detail.order_id ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          Impression…
                        </>
                      ) : (
                        <>🖨️ {detail.printed_at ? "Réimprimer" : "Imprimer le bon"}</>
                      )}
                    </button>
                  </div>

                  {/* Info date impression */}
                  {detail.printed_at && (
                    <div className="text-xs text-orange-600 text-center">
                      Dernière impression :{" "}
                      {new Date(detail.printed_at).toLocaleString("fr-FR", {
                        day: "2-digit", month: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  )}
                  {!detail.printed_at && (() => {
                    const ps = getPrintStatus(detail);
                    return ps.expired ? (
                      <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">
                        ⚠️ Auto-print annulé (délai 5min dépassé). Utiliser le bouton ci-dessus.
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Section secondaire */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Informations complémentaires</h3>

                {/* Synchroniser */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Synchroniser</label>
                  <div className="flex gap-2">
                    {["🔴", "🟢", ""].map((v, i) => (
                      <button key={i}
                        onClick={() => setForm(f => ({ ...f, synchroniser: v }))}
                        className={`text-sm py-1 px-3 rounded border transition-colors
                          ${form.synchroniser === v ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                      >
                        {v || "Vider"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Infos lecture seule */}
                {detail.order_date && (
                  <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <span className="font-medium text-gray-700">Date commande :</span>{" "}
                    {new Date(detail.order_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    {" "}
                    {new Date(detail.order_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>

            </div>
            </div>{/* end scroll wrapper */}
            </>
          )}
        </div>
      </div>

      {/* Modal suppression commande — owner uniquement */}
      {deleteModal && (
        <DeleteOrderModal
          order={deleteModal}
          loading={deleteLoading}
          onClose={() => setDeleteModal(null)}
          onConfirm={(restock) => handleDeleteOrder(deleteModal, restock)}
        />
      )}

      {/* Modal modification native nc_boutique / pos */}
      {nativeEditModal && (
        <NativeEditModal
          order={nativeEditModal}
          onClose={() => setNativeEditModal(null)}
          onSuccess={(newTotal, newItems) => {
            setNativeEditModal(null);
            showToast(`✓ Commande modifiée — nouveau total ${newTotal} DA`);
            // Mise à jour locale immédiate
            setOrders(prev => prev.map(o =>
              o.order_id === nativeEditModal.order_id
                ? { ...o, order_total: newTotal, items_json: newItems }
                : o
            ));
            if (detail?.order_id === nativeEditModal.order_id) {
              setDetail(prev => ({ ...prev, order_total: newTotal, items_json: newItems }));
            }
            invalidateCache("orders");
            invalidateCache("variants");
          }}
        />
      )}
    </div>
  );
}


// ── Modal Modification Native (nc_boutique / POS) ─────────────────
// T202 : ModifyOrderModal (GAS/Shopify) supprimé — seul NativeEditModal subsiste

function NativeEditModal({ order, onClose, onSuccess }) {
  const [step,      setStep]      = useState("edit");  // edit | saving | done | error
  const [items,     setItems]     = useState([]);       // articles en cours d'édition
  const [varCache,  setVarCache]  = useState([]);       // cache catalogue
  const [search,    setSearch]    = useState("");
  const [errMsg,    setErrMsg]    = useState("");
  const searchRef = useRef(null);

  // Charger articles existants + cache catalogue
  useEffect(() => {
    // Pré-remplir depuis items_json de la commande
    const existing = Array.isArray(order.items_json) ? order.items_json : [];
    setItems(existing.map(it => ({
      variant_id: String(it.variant_id || ""),
      title:      it.title || it.product_title || it.variant_id,
      price:      Number(it.price || 0),
      qty:        Number(it.qty || it.quantity || 1),
      image_url:  it.image_url || "",
    })));

    // Charger le cache variantes pour la recherche
    api.getVariantsCache().then(res => {
      if (res.ok) setVarCache(res.rows || []);
    }).catch(() => {});
  }, [order.order_id]);

  // Résultats de recherche
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return varCache
      .filter(v => smartMatch(q, [
        v.product_title, v.display_name, v.variant_title,
        v.vendor, v.sku, v.barcode,
      ]))
      .slice(0, 8);
  }, [search, varCache]);

  // Calcul du nouveau total
  const newTotal = items.reduce((sum, it) => sum + it.price * it.qty, 0)
    + Number(order.delivery_price || 0)
    - Number(order.coupon_discount || 0);

  function setQty(idx, val) {
    const n = Math.max(0, parseInt(val) || 0);
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: n } : it));
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function addVariant(v) {
    const varId = String(v.variant_id || "").trim();
    if (!varId) return;
    const exists = items.findIndex(it => String(it.variant_id) === varId);
    if (exists >= 0) {
      setItems(prev => prev.map((it, i) => i === exists ? { ...it, qty: it.qty + 1 } : it));
    } else {
      setItems(prev => [...prev, {
        variant_id: varId,
        title:      v.product_title || v.display_name || varId,
        price:      Number(v.price || 0),
        qty:        1,
        image_url:  v.image_url || "",
      }]);
    }
    setSearch("");
    if (searchRef.current) searchRef.current.focus();
  }

  async function handleSave() {
    const toSend = items.filter(it => it.qty > 0);
    if (toSend.length === 0) return;
    setStep("saving");
    try {
      const res = await api.modifyItemsNative(order.order_id, toSend);
      if (res.ok) {
        setStep("done");
        onSuccess(res.new_total, toSend);
      } else {
        setErrMsg(res.error || "Erreur lors de la modification");
        setStep("error");
      }
    } catch (e) {
      setErrMsg(e.message);
      setStep("error");
    }
  }

  const activeItems = items.filter(it => it.qty > 0);
  const sourceLabel = order.order_source === "pos" ? "POS"
    : order.order_source === "nc_boutique" ? "Boutique"
    : "Online";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-3">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" style={{ maxHeight: "92vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900">تعديل الطلب</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{sourceLabel}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.order_name || order.order_id} · {order.customer_name || order.full_name}
            </p>
          </div>
          {step !== "saving" && (
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
              ✕
            </button>
          )}
        </div>

        {/* ── Saving ── */}
        {step === "saving" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
            <svg className="animate-spin w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p className="text-sm text-gray-500">Modification en cours…</p>
            <p className="text-xs text-gray-400">Ajustement du stock en temps réel</p>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-4 px-6">
            <span className="text-5xl">✅</span>
            <div className="text-center">
              <p className="font-bold text-gray-900">Commande modifiée avec succès</p>
              <p className="text-sm text-emerald-600 mt-1 font-semibold">
                Nouveau total : {Number(newTotal).toLocaleString("fr-DZ")} DA
              </p>
              <p className="text-xs text-gray-400 mt-1">Stock ajusté automatiquement</p>
            </div>
            <button onClick={onClose}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
              Fermer
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {step === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-4 px-6">
            <span className="text-4xl">❌</span>
            <div className="text-center">
              <p className="font-semibold text-gray-900">Échec de la modification</p>
              <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-left break-words">{errMsg}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStep("edit"); setErrMsg(""); }}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
                Réessayer
              </button>
              <button onClick={onClose}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── Edit ── */}
        {step === "edit" && (
          <>
            <div className="flex-1 overflow-y-auto">

              {/* Articles actuels */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Articles ({activeItems.length})
                </p>
                {items.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Aucun article</p>
                )}
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors
                      ${item.qty === 0 ? "bg-red-50 border-red-100 opacity-60" : "bg-gray-50 border-gray-100"}`}>
                      {item.image_url && (
                        <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
                          onError={e => e.target.style.display = "none"} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                        <p className="text-xs text-gray-400">{Number(item.price).toLocaleString("fr-DZ")} DA × {item.qty}</p>
                        {item.qty === 0 && <p className="text-xs text-red-500 font-medium">Sera supprimé</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => setQty(idx, item.qty - 1)}
                          className="w-7 h-7 rounded-lg bg-white border border-gray-200 hover:border-gray-400 text-gray-700 font-bold flex items-center justify-center transition-colors">
                          −
                        </button>
                        <input
                          type="number" min="0" value={item.qty}
                          onChange={e => setQty(idx, e.target.value)}
                          className="w-10 text-center text-sm font-bold border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                        <button onClick={() => setQty(idx, item.qty + 1)}
                          className="w-7 h-7 rounded-lg bg-white border border-gray-200 hover:border-gray-400 text-gray-700 font-bold flex items-center justify-center transition-colors">
                          +
                        </button>
                        <button onClick={() => removeItem(idx)}
                          className="w-7 h-7 ml-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors text-xs font-bold">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recherche produit */}
              <div className="px-5 pb-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Ajouter un article</p>
                <div className="relative">
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher dans le catalogue…"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  {search && (
                    <button onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                      ✕
                    </button>
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-50 shadow-sm">
                    {searchResults.map((v, i) => (
                      <button key={i} onClick={() => addVariant(v)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 transition-colors text-left">
                        {v.image_url && (
                          <img src={v.image_url} alt="" className="w-9 h-9 object-cover rounded-lg flex-shrink-0"
                            onError={e => e.target.style.display = "none"} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{v.product_title || v.display_name}</p>
                          {v.variant_title && v.variant_title !== "Default Title" && (
                            <p className="text-xs text-gray-500">{v.variant_title}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-gray-800">{Number(v.price || 0).toLocaleString("fr-DZ")} DA</p>
                          {v.inventory_quantity != null && (
                            <p className="text-[10px] text-gray-400">Stock: {v.inventory_quantity}</p>
                          )}
                        </div>
                        <span className="text-emerald-400 text-lg ml-1">+</span>
                      </button>
                    ))}
                  </div>
                )}
                {search.length >= 2 && searchResults.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2 px-1">Aucun produit trouvé pour "{search}"</p>
                )}
              </div>
            </div>

            {/* Footer : total + bouton */}
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 shrink-0 flex gap-3 items-center">
              <div className="flex-1">
                <p className="text-xs text-gray-400">Nouveau total</p>
                <p className="text-lg font-bold text-emerald-700">{Math.max(0, newTotal).toLocaleString("fr-DZ")} DA</p>
              </div>
              <button onClick={onClose}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={activeItems.length === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                Enregistrer ({activeItems.length})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal Suppression Commande (owner) ───────────────────────────

function DeleteOrderModal({ order, loading, onClose, onConfirm }) {
  const orderName = order?.shopify_order_name || order?.order_id?.slice(0, 8);
  const hasItems  = Array.isArray(order?.items_json) && order.items_json.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Supprimer la commande</h3>
            <p className="text-xs text-red-600 font-semibold">{orderName} — Action irréversible</p>
          </div>
        </div>

        {/* Corps */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-700">
            La commande de <span className="font-semibold">{order?.customer_name || "ce client"}</span> sera supprimée définitivement de la base de données.
          </p>

          {hasItems && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-800 mb-1">Voulez-vous restituer le stock ?</p>
              <p className="text-xs text-amber-700">
                {order.items_json.length} article(s) · les quantités seront rendues au stock si vous choisissez "Avec restock".
              </p>
            </div>
          )}
        </div>

        {/* Boutons */}
        <div className="px-5 pb-5 space-y-2">
          {hasItems && (
            <button
              onClick={() => onConfirm(true)}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>🗑️ Supprimer + Restock stock</>
              )}
            </button>
          )}
          <button
            onClick={() => onConfirm(false)}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gray-800 text-white text-sm font-bold hover:bg-gray-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>🗑️ Supprimer sans restock</>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
