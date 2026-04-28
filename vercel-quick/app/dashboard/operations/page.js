"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getSession } from "@/lib/auth";
import { sendPushNotification } from "@/lib/push";
import { api } from "@/lib/api";
import { logAgentButton } from "@/lib/logsv2";

// ── Wilaya codes (Algérie) ────────────────────────────────────────
const WILAYA_MAP = {
  'adrar':'01','chlef':'02','laghouat':'03','oum el bouaghi':'04','batna':'05',
  'bejaia':'06','biskra':'07','bechar':'08','blida':'09','bouira':'10',
  'tamanrasset':'11','tebessa':'12','tebes':'12','tlemcen':'13','tiaret':'14',
  'tizi ouzou':'15','alger':'16','djelfa':'17','jijel':'18','setif':'19',
  'saida':'20','skikda':'21','sidi bel abbes':'22','annaba':'23','guelma':'24',
  'constantine':'25','medea':'26','mostaganem':'27','msila':'28','m sila':'28',
  'mascara':'29','ouargla':'30','oran':'31','el bayadh':'32','illizi':'33',
  'bordj bou arreridj':'34','boumerdes':'35','boumerdess':'35','el tarf':'36',
  'tindouf':'37','tissemsilt':'38','el oued':'39','khenchela':'40',
  'souk ahras':'41','tipaza':'42','mila':'43','ain defla':'44','naama':'45',
  'ain temouchent':'46','ghardaia':'47','relizane':'48','timimoun':'49',
  'bordj badji mokhtar':'50','ouled djellal':'51','beni abbes':'52','in salah':'53',
  'in guezzam':'54','touggourt':'55','djanet':'56','el mghair':'57','el menia':'58',
};

function getWilayaCode(wilaya) {
  if (!wilaya) return "??";
  const key = wilaya.trim().toLowerCase()
    .replace(/[-']/g, " ")
    .replace(/\s+/g, " ");
  if (WILAYA_MAP[key]) return WILAYA_MAP[key];
  for (const k in WILAYA_MAP) {
    if (key.includes(k) || k.includes(key)) return WILAYA_MAP[k];
  }
  return "??";
}

// ── Rôles ────────────────────────────────────────────────────────
const MANAGER_ROLES = ["owner", "chef d'equipe", "responsable"];
function isManager(role) { return MANAGER_ROLES.includes((role || "").toLowerCase()); }

// ── Helpers localStorage ─────────────────────────────────────────
function getLastRun(key) {
  try { return localStorage.getItem("op_lastrun_" + key) || null; } catch { return null; }
}
function setLastRun(key) {
  try { localStorage.setItem("op_lastrun_" + key, new Date().toISOString()); } catch {}
}
function fmtLastRun(iso) {
  if (!iso) return null;
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now - d) / 60000);
  if (diff < 1)    return "à l'instant";
  if (diff < 60)   return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.floor(diff / 60)}h`;
  return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit" }) + " " +
         d.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
}

// ── Toast ────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  const bg = type === "error" ? "bg-red-600" : "bg-gray-900";
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold ${bg} max-w-sm text-center`}>
      {msg}
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </h2>
  );
}

// ── Order search shared component ────────────────────────────────
function OrderSearchPicker({ orders, loading, search, onSearch, onSelect, selected, multi = false, placeholder = "Rechercher une commande…" }) {
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders.slice(0, 30);
    return orders.filter(o =>
      (o.customer_name  || "").toLowerCase().includes(q) ||
      (o.order_id       || "").includes(q) ||
      (o.customer_phone || "").includes(q) ||
      (o.wilaya         || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [search, orders]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text" value={search} onChange={e => onSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        />
        {search && (
          <button onClick={() => onSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 justify-center text-gray-400 text-xs">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Chargement des commandes…
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-50 max-h-56 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Aucune commande trouvée</p>
          ) : results.map(o => {
            const isSelected = multi
              ? (selected || []).some(s => s.order_id === o.order_id)
              : selected?.order_id === o.order_id;
            const code = getWilayaCode(o.wilaya);
            return (
              <button key={o.order_id} onClick={() => onSelect(o)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  isSelected ? "bg-indigo-50 border-l-2 border-indigo-500" : "hover:bg-gray-50"
                }`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{o.customer_name || o.order_id}</p>
                  <p className="text-xs text-gray-500 truncate">#{o.order_id} · {o.wilaya} ({code}) · {o.customer_phone}</p>
                </div>
                {isSelected ? (
                  <span className="text-indigo-600 text-base flex-shrink-0">✓</span>
                ) : (
                  <span className="text-gray-300 text-base flex-shrink-0">{multi ? "+" : "›"}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Op card wrapper (défini au niveau module pour éviter le remontage à chaque render) ──
function OpCard({ icon, label, description, color, open, onToggle, lastRunValue, badge, children, actions }) {
  const colors = {
    orange: { wrap: "border-orange-200 bg-orange-50", icon: "bg-orange-100 text-orange-600", toggle: "bg-orange-500 hover:bg-orange-600 text-white" },
    blue:   { wrap: "border-blue-200 bg-blue-50",     icon: "bg-blue-100 text-blue-600",     toggle: "bg-blue-600 hover:bg-blue-700 text-white" },
    teal:   { wrap: "border-teal-200 bg-teal-50",     icon: "bg-teal-100 text-teal-600",     toggle: "bg-teal-600 hover:bg-teal-700 text-white" },
  };
  const c = colors[color] || colors.teal;
  return (
    <div className={`rounded-2xl border ${c.wrap} overflow-hidden`}>
      <div className="flex items-start gap-3 p-4">
        <div className={`w-11 h-11 rounded-xl ${c.icon} flex items-center justify-center text-xl flex-shrink-0`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 text-sm">{label}</p>
            {badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-800 text-white">{badge}</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{description}</p>
          {lastRunValue && (
            <p className="text-[10px] text-gray-400 mt-1">↻ {lastRunValue}</p>
          )}
        </div>
        <button onClick={onToggle}
          className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${c.toggle}`}>
          {open ? "Fermer" : "Ouvrir"}
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-black/5 space-y-3 bg-white/60">
          {children}
          {actions}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  PAGE PRINCIPALE
// ════════════════════════════════════════════════════════════════

export default function OperationsPage() {
  const [user,      setUser]      = useState(null);
  const [toast,     setToast]     = useState(null);
  const [lastRuns,  setLastRuns]  = useState({});

  // ── Shared: online orders cache ──
  const [onlineOrders,      setOnlineOrders]      = useState([]);
  const [onlineOrdersLoaded, setOnlineOrdersLoaded] = useState(false);
  const [onlineOrdersLoading, setOnlineOrdersLoading] = useState(false);

  // ── Clôture state ──
  const [clotureOpen,    setClotureOpen]    = useState(false);
  const [clotureRunning, setClotureRunning] = useState(false);
  const [clotureDone,    setClotureDone]    = useState(null);

  // ── Étiquettes state ──
  const [etiqOpen,     setEtiqOpen]     = useState(false);
  const [etiqSearch,   setEtiqSearch]   = useState("");
  const [etiqSelected, setEtiqSelected] = useState([]);

  // ── Code partenaire state ──
  const [partOpen,   setPartOpen]   = useState(false);
  const [partForm,   setPartForm]   = useState({ code: "", nom: "", percentage: 50 });
  const [partSaving, setPartSaving] = useState(false);

  // ── Étiquettes codes-barres state ──
  const [bcOpen,    setBcOpen]    = useState(false);
  const [bcPoId,    setBcPoId]    = useState("");
  const [bcPoIds,   setBcPoIds]   = useState([]); // liste des po_id dispo
  const [bcItems,   setBcItems]   = useState(null); // null = non chargé
  const [bcLoading, setBcLoading] = useState(false);

  // ── Notifications state ──
  const [notifLoading, setNotifLoading] = useState({});

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const s = getSession();
    if (s?.user) setUser(s.user);
    const keys = ["cloture", "etiquettes", "partenaire", "shooting_start", "shooting_end", "retour_lance", "retour", "sync_prep", "quota_prepare"];
    const runs = {};
    keys.forEach(k => { const v = getLastRun(k); if (v) runs[k] = fmtLastRun(v); });
    setLastRuns(runs);
  }, []);

  // Charger les commandes online une seule fois quand une section s'ouvre
  async function loadOnlineOrders() {
    if (onlineOrdersLoaded) return;
    setOnlineOrdersLoading(true);
    try {
      const res = await api.getOnlineOrders(300);
      if (res?.ok) { setOnlineOrders(res.rows || []); setOnlineOrdersLoaded(true); }
      else showToast(res?.error || "Erreur chargement commandes", "error");
    } catch (e) {
      showToast("Erreur réseau : " + e.message, "error");
    } finally {
      setOnlineOrdersLoading(false);
    }
  }

  function openCloture() {
    setClotureOpen(v => !v);
    setEtiqOpen(false); setPartOpen(false); setBcOpen(false);
    setClotureDone(null);
  }
  function openEtiq() {
    setEtiqOpen(v => !v);
    setClotureOpen(false); setPartOpen(false); setBcOpen(false);
    if (!onlineOrdersLoaded) loadOnlineOrders();
  }
  function openPart() {
    setPartOpen(v => !v);
    setClotureOpen(false); setEtiqOpen(false); setBcOpen(false);
  }
  function openBc() {
    setBcOpen(v => !v);
    setClotureOpen(false); setEtiqOpen(false); setPartOpen(false);
  }

  // ── Étiquettes codes-barres articles ─────────────────────────
  async function loadBcItems(poId) {
    setBcLoading(true);
    setBcItems(null);
    try {
      const res = await api.getPOLabels(poId || "");
      if (res?.ok) {
        setBcItems(res.rows || []);
        if (res.po_ids?.length) setBcPoIds(res.po_ids);
      } else {
        showToast(res?.error || "Erreur chargement PO_LINES_V2", "error");
      }
    } catch (e) {
      showToast("Erreur réseau : " + e.message, "error");
    } finally {
      setBcLoading(false);
    }
  }

  function handlePrintBarcodes() {
    if (!bcItems?.length) return;
    setLastRun("bc_labels");
    setLastRuns(p => ({ ...p, bc_labels: "à l'instant" }));

    // Expand par qty (max 50 copies par article pour sécurité)
    const expanded = [];
    bcItems.forEach((item, idx) => {
      const qty = Math.min(item.qty_add || 1, 50);
      for (let i = 0; i < qty; i++) {
        expanded.push({ ...item, _idx: expanded.length });
      }
    });

    const totalLabels = expanded.length;

    // Données JSON pour JsBarcode (injection via JSON.stringify, sûr)
    const labelsData = JSON.stringify(expanded.map(item => ({
      id:    "bc" + item._idx,
      value: String(item.barcode || "").replace(/[^a-zA-Z0-9\- \.\/\+%\$]/g, ""),
      title: String(item.product_title || "").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      price: item.sell_price || 0,
    })));

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  @page { size: 40mm 20mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .label {
    width: 40mm; height: 20mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 1.5mm;
    page-break-after: always;
    overflow: hidden;
  }
  .title { font-size: 5.5pt; font-weight: 600; max-height: 6pt; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; width: 100%; }
  .bc { height: 9mm; width: 100%; }
  .price { font-size: 8pt; font-weight: bold; margin-top: 0.5mm; }
  @media screen {
    body { background: #f5f5f5; display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 10px 70px; }
    .label { box-shadow: 0 1px 4px rgba(0,0,0,.15); background: #fff; border-radius: 3px; }
    .print-btn {
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: #1a1a1a; color: #fff; border: none;
      padding: 12px 28px; border-radius: 10px; cursor: pointer;
      font-size: 14px; font-weight: bold; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,.3);
    }
  }
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimer — ${totalLabels} étiquette${totalLabels > 1 ? "s" : ""}</button>
<div id="labels"></div>
<script>
(function() {
  var data = ${labelsData};
  var container = document.getElementById("labels");
  container.style.display = "flex";
  container.style.flexWrap = "wrap";
  container.style.gap = "6px";
  data.forEach(function(item) {
    var div = document.createElement("div");
    div.className = "label";
    var titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = item.title;
    var svgEl = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svgEl.id = item.id;
    svgEl.className = "bc";
    var priceEl = document.createElement("div");
    priceEl.className = "price";
    priceEl.textContent = item.price + " DA";
    div.appendChild(titleEl);
    div.appendChild(svgEl);
    div.appendChild(priceEl);
    container.appendChild(div);
    try {
      JsBarcode("#" + item.id, item.value, {
        format: "CODE128", width: 1.4, height: 30,
        displayValue: true, fontSize: 7, margin: 1,
        lineColor: "#000", background: "#fff"
      });
    } catch(e) {
      svgEl.textContent = item.value;
    }
  });
})();
<\/script>
</body></html>`;

    const win = window.open("", "_blank", "width=800,height=700");
    if (!win) { showToast("Popup bloquée — autorisez les popups", "error"); return; }
    win.document.write(html);
    win.document.close();
  }

  const bcTotalLabels = useMemo(() =>
    (bcItems || []).reduce((sum, item) => sum + Math.min(item.qty_add || 0, 50), 0),
  [bcItems]);

  // ── Lancer la clôture ─────────────────────────────────────────
  async function handleCloture() {
    setClotureRunning(true);
    try {
      const res = await api.runCloture();
      if (res?.ok) {
        setLastRun("cloture");
        setLastRuns(p => ({ ...p, cloture: "à l'instant" }));
        setClotureDone({ ok: true, msg: res.message || "Clôture effectuée avec succès" });
        logAgentButton(user || "agent", "CLOTURE_JOURNEE", "all");
        // Notifier toute l'équipe que la clôture journée est effectuée
        try {
          await sendPushNotification({
            title: "🌅 Clôture journée effectuée",
            body: res.message || `${res.total_archived || 0} commandes archivées`,
            url: "/dashboard/operations",
            tag: "cloture-" + Date.now(),
            fromUser: user?.nom,
            type: "cloture",
          });
        } catch { /* fire-and-forget */ }
      } else {
        setClotureDone({ ok: false, msg: res?.error || "Erreur lors de la clôture" });
      }
    } catch (e) {
      setClotureDone({ ok: false, msg: "Erreur réseau : " + e.message });
    } finally {
      setClotureRunning(false);
    }
  }

  // ── Imprimer étiquettes ───────────────────────────────────────
  function handlePrintEtiquettes() {
    if (!etiqSelected.length) return;
    setLastRun("etiquettes");
    setLastRuns(p => ({ ...p, etiquettes: "à l'instant" }));
    logAgentButton(user || "agent", "IMPRESSION_ETIQUETTES", `${etiqSelected.length} étiquettes`);

    const labelsHtml = etiqSelected.map(o => {
      const code = getWilayaCode(o.wilaya);
      const name = (o.customer_name || o.order_id).replace(/</g, "&lt;");
      return `<div class="label"><div class="name">${name}</div><div class="code">${code}</div></div>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: 40mm 25mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .label {
    width: 40mm; height: 25mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 2mm;
    page-break-after: always;
    overflow: hidden;
  }
  .name { font-size: 9pt; font-weight: bold; line-height: 1.3; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; width: 100%; }
  .code { font-size: 22pt; font-weight: bold; margin-top: 1mm; color: #000; line-height: 1; }
  @media print {
    .print-btn { display: none !important; }
    body { background: #fff; display: block; padding: 0; margin: 0; }
  }
  @media screen {
    body { background: #f5f5f5; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 8px 70px; }
    .label { box-shadow: 0 1px 4px rgba(0,0,0,.2); border-radius: 3px; background: #fff; border: 1px solid #e5e7eb; }
    .print-btn {
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: #1a1a1a; color: #fff; border: none;
      padding: 12px 28px; border-radius: 10px; cursor: pointer;
      font-size: 14px; font-weight: bold; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,.3);
    }
  }
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimer (${etiqSelected.length} étiquette${etiqSelected.length > 1 ? "s" : ""})</button>
${labelsHtml}
</body></html>`;

    const win = window.open("", "_blank", "width=700,height=600");
    win.document.write(html);
    win.document.close();
  }

  function toggleEtiqOrder(order) {
    setEtiqSelected(prev => {
      const exists = prev.some(o => o.order_id === order.order_id);
      return exists ? prev.filter(o => o.order_id !== order.order_id) : [...prev, order];
    });
  }

  // ── Code partenaire ───────────────────────────────────────────
  async function handlePartenaire(e) {
    e.preventDefault();
    if (!partForm.code.trim()) return;
    setPartSaving(true);
    try {
      const res = await api.addCodePartenaire(
        partForm.code.trim(),
        partForm.nom.trim(),
        partForm.percentage
      );
      if (res?.ok) {
        setLastRun("partenaire");
        setLastRuns(p => ({ ...p, partenaire: "à l'instant" }));
        logAgentButton(user || "agent", "AJOUT_CODE_PARTENAIRE", `${res.code} (${res.percentage}%)`);
        showToast(`✅ Code "${res.code}" (${res.percentage}%) ajouté`);
        setPartForm({ code: "", nom: "", percentage: 50 });
        setPartOpen(false);
      } else {
        showToast(res?.error || "Erreur ajout code", "error");
      }
    } catch (e) {
      showToast("Erreur : " + e.message, "error");
    } finally {
      setPartSaving(false);
    }
  }

  // ── Notifications ─────────────────────────────────────────────
  async function sendTeamNotif(key, title, body, type) {
    setNotifLoading(p => ({ ...p, [key]: true }));
    try {
      await sendPushNotification({
        title, body, url: "/dashboard",
        tag: key + "-" + Date.now(),
        excludeUser: user?.nom, fromUser: user?.nom, type,
      });
      setLastRun(key);
      setLastRuns(p => ({ ...p, [key]: "à l'instant" }));
      showToast(`📢 "${title}" envoyée à l'équipe`);
    } catch {
      showToast("Erreur envoi notification", "error");
    } finally {
      setNotifLoading(p => ({ ...p, [key]: false }));
    }
  }

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-gray-400 text-sm">Chargement…</div>
    </div>
  );

  const manager = isManager(user.role);

    return (
    <div className="max-w-2xl mx-auto space-y-8 pb-10">

      {/* En-tête */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Centre d&apos;opérations</h1>
        <p className="text-sm text-gray-500 mt-1">Actions opérationnelles et notifications équipe</p>
      </div>

      {/* ── Opérations journalières ── */}
      <section>
        <SectionTitle>Opérations journalières</SectionTitle>
        <div className="space-y-3">

            {/* ── CLÔTURE JOURNÉE ── */}
            <OpCard
              icon="🌅" label="Clôture journée"
              description="Archive les commandes expédiées (avec tracking) et restitue le stock des annulées"
              color="orange" open={clotureOpen} onToggle={openCloture} lastRunValue={lastRuns["cloture"]}
            >
              {clotureDone ? (
                <div className={`rounded-xl p-4 text-sm font-medium ${
                  clotureDone.ok ? "bg-green-50 border border-green-200 text-green-800"
                                 : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                  <p>{clotureDone.ok ? "✅" : "❌"} {clotureDone.msg}</p>
                  <button onClick={() => setClotureDone(null)}
                    className="mt-2 text-xs underline opacity-70">Nouvelle clôture</button>
                </div>
              ) : clotureRunning ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <svg className="animate-spin w-10 h-10 text-orange-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <div className="text-center">
                    <p className="font-semibold text-gray-800 text-sm">Clôture en cours…</p>
                    <p className="text-xs text-gray-500 mt-0.5">Archivage et restock des annulées en cours</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-xs text-orange-800 space-y-1">
                    <p className="font-semibold">Ce que fait la clôture :</p>
                    <p>• Archive les commandes avec tracking (expédiées)</p>
                    <p>• Archive + restitue le stock des commandes annulées</p>
                    <p>• La page Confirmation n&apos;affiche que les commandes actives</p>
                  </div>
                  <button
                    onClick={handleCloture}
                    className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors"
                  >
                    🌅 Lancer la clôture journée
                  </button>
                </div>
              )}
            </OpCard>

            {/* ── ÉTIQUETTES ── */}
            <OpCard
              icon="🏷️" label="Imprimer étiquettes"
              description="Sélectionner les commandes et générer les étiquettes 20×40mm (nom + code wilaya)"
              color="blue" open={etiqOpen} onToggle={openEtiq} lastRunValue={lastRuns["etiquettes"]}
              badge={etiqSelected.length > 0 ? `${etiqSelected.length} sélectionnée${etiqSelected.length > 1 ? "s" : ""}` : null}
            >
              <OrderSearchPicker
                orders={onlineOrders}
                loading={onlineOrdersLoading}
                search={etiqSearch}
                onSearch={setEtiqSearch}
                onSelect={toggleEtiqOrder}
                selected={etiqSelected}
                multi
                placeholder="Rechercher des commandes à imprimer…"
              />

              {etiqSelected.length > 0 && (
                <div className="space-y-2">
                  {/* Aperçu des étiquettes sélectionnées */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {etiqSelected.map(o => (
                      <span key={o.order_id}
                        className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-lg font-medium">
                        {o.customer_name?.split(" ")[0] || o.order_id} · {getWilayaCode(o.wilaya)}
                        <button onClick={() => toggleEtiqOrder(o)} className="text-blue-500 hover:text-blue-800 ml-0.5">✕</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEtiqSelected([])}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                      Vider la sélection
                    </button>
                    <button onClick={handlePrintEtiquettes}
                      className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors">
                      🖨️ Générer PDF — {etiqSelected.length} étiquette{etiqSelected.length > 1 ? "s" : ""}
                    </button>
                  </div>
                </div>
              )}
            </OpCard>

            {/* ── CODE PARTENAIRE ── */}
            <OpCard
              icon="🤝" label="Code partenaire"
              description="Ajouter un nouveau code promo dans CODE_PROMO"
              color="teal" open={partOpen} onToggle={openPart} lastRunValue={lastRuns["partenaire"]}
            >
              <form onSubmit={handlePartenaire} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Code *</label>
                    <input type="text" value={partForm.code}
                      onChange={e => setPartForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="PROMO2026" required
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Nom partenaire</label>
                    <input type="text" value={partForm.nom}
                      onChange={e => setPartForm(f => ({ ...f, nom: e.target.value }))}
                      placeholder="Salon Karima"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                    />
                  </div>
                </div>

                {/* Pourcentage */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-2">
                    Réduction : <span className="text-teal-700 font-bold">{partForm.percentage}%</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setPartForm(f => ({ ...f, percentage: Math.max(0, f.percentage - 5) }))}
                      className="w-8 h-8 rounded-lg border border-gray-200 hover:border-gray-400 font-bold text-gray-600 flex items-center justify-center transition-colors">−</button>
                    <input type="range" min="0" max="100" step="5" value={partForm.percentage}
                      onChange={e => setPartForm(f => ({ ...f, percentage: Number(e.target.value) }))}
                      className="flex-1 accent-teal-600"
                    />
                    <button type="button" onClick={() => setPartForm(f => ({ ...f, percentage: Math.min(100, f.percentage + 5) }))}
                      className="w-8 h-8 rounded-lg border border-gray-200 hover:border-gray-400 font-bold text-gray-600 flex items-center justify-center transition-colors">+</button>
                    <input type="number" min="0" max="100" value={partForm.percentage}
                      onChange={e => setPartForm(f => ({ ...f, percentage: Math.min(100, Math.max(0, Number(e.target.value))) }))}
                      className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-300"
                    />
                    <span className="text-sm text-gray-500 font-medium">%</span>
                  </div>
                </div>

                <button type="submit" disabled={!partForm.code.trim() || partSaving}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
                  {partSaving ? "Enregistrement…" : "✅ Enregistrer le code"}
                </button>
              </form>
            </OpCard>

            {/* ── ÉTIQUETTES CODES-BARRES ── */}
            <OpCard
              icon="📦" label="Étiquettes codes-barres articles"
              description="Générer les étiquettes 40×20mm avec code-barres depuis PO_LINES_V2"
              color="blue" open={bcOpen} onToggle={openBc} lastRunValue={lastRuns["bc_labels"]}
              badge={bcItems !== null ? `${bcTotalLabels} étiquette${bcTotalLabels !== 1 ? "s" : ""}` : null}
            >
              {/* Filtre par PO */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    {bcPoIds.length > 0 ? (
                      <select
                        value={bcPoId}
                        onChange={e => setBcPoId(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      >
                        <option value="">Tous les bons de commande</option>
                        {bcPoIds.map(id => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text" value={bcPoId}
                        onChange={e => setBcPoId(e.target.value)}
                        placeholder="Filtrer par PO ID (optionnel)"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      />
                    )}
                  </div>
                  <button
                    onClick={() => loadBcItems(bcPoId)}
                    disabled={bcLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {bcLoading ? "…" : "Charger"}
                  </button>
                </div>

                {/* Résultats */}
                {bcLoading && (
                  <div className="flex items-center gap-2 py-3 text-gray-400 text-xs justify-center">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Lecture de PO_LINES_V2…
                  </div>
                )}

                {!bcLoading && bcItems !== null && (
                  <>
                    {bcItems.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">
                        Aucun article avec code-barres{bcPoId ? ` pour le PO "${bcPoId}"` : ""}
                      </p>
                    ) : (
                      <>
                        {/* Aperçu articles */}
                        <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-50 max-h-52 overflow-y-auto">
                          {bcItems.slice(0, 100).map((item, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{item.product_title || "—"}</p>
                                <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-bold text-gray-700">{item.qty_add} ×</p>
                                <p className="text-[10px] text-gray-400">{item.sell_price} DA</p>
                              </div>
                            </div>
                          ))}
                          {bcItems.length > 100 && (
                            <p className="text-xs text-center text-gray-400 py-2">… et {bcItems.length - 100} autres articles</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                          <span>{bcItems.length} article{bcItems.length > 1 ? "s" : ""}</span>
                          <span className="font-semibold">{bcTotalLabels} étiquette{bcTotalLabels > 1 ? "s" : ""} au total</span>
                        </div>

                        <button
                          onClick={handlePrintBarcodes}
                          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors"
                        >
                          🖨️ Générer &amp; imprimer {bcTotalLabels} étiquette{bcTotalLabels > 1 ? "s" : ""}
                        </button>
                      </>
                    )}
                  </>
                )}

                {!bcLoading && bcItems === null && (
                  <p className="text-xs text-gray-400 text-center py-2">
                    Cliquez sur &quot;Charger&quot; pour lire PO_LINES_V2
                  </p>
                )}
              </div>
            </OpCard>

          </div>
      </section>

      {/* ── Notifications équipe ── */}
      <section>
        <SectionTitle>Notifications équipe</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: "shooting_start",  icon: "📸", label: "Shooting lancé",    color: "bg-pink-50 border-pink-200",     btn: "bg-pink-600 hover:bg-pink-700",    title: "📸 Shooting lancé",         body: `${user.nom} a lancé le shooting produits`, type: "shooting" },
            { key: "shooting_end",    icon: "✅", label: "Shooting terminé",  color: "bg-green-50 border-green-200",   btn: "bg-green-600 hover:bg-green-700",  title: "✅ Shooting terminé",        body: `${user.nom} — shooting terminé, photos bientôt disponibles`, type: "shooting" },
            { key: "retour_lance",    icon: "📬", label: "Retour lancé",      color: "bg-yellow-50 border-yellow-200", btn: "bg-yellow-500 hover:bg-yellow-600",title: "📬 Retour lancé",            body: `${user.nom} — traitement des retours colis lancé`, type: "retour" },
            { key: "retour",          icon: "📦", label: "Retour traité",     color: "bg-purple-50 border-purple-200", btn: "bg-purple-600 hover:bg-purple-700",title: "📦 Retours traités",         body: `${user.nom} — retours colis traités et stock mis à jour`, type: "retour" },
            { key: "quota_prepare",   icon: "🎯", label: "Quota préparé",     color: "bg-teal-50 border-teal-200",     btn: "bg-teal-600 hover:bg-teal-700",    title: "🎯 Quota préparé",          body: `${user.nom} — quota de commandes prêt pour expédition`, type: "quota" },
            { key: "sync_prep",       icon: "🔄", label: "Synchroniser",      color: "bg-blue-50 border-blue-200",     btn: "bg-blue-600 hover:bg-blue-700",    title: "🔄 Synchronisation lancée", body: `${user.nom} — début de période de préparation manuelle (sans quota)`, type: "sync" },
          ].map(({ key, icon, label, color, btn, title, body, type }) => (
            <div key={key} className={`rounded-2xl border ${color} p-4 flex flex-col gap-3`}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{icon}</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{label}</p>
                  {lastRuns[key] && <p className="text-[10px] text-gray-400">↻ {lastRuns[key]}</p>}
                </div>
              </div>
              <button
                onClick={() => sendTeamNotif(key, title, body, type)}
                disabled={notifLoading[key]}
                className={`w-full py-2 rounded-xl text-white text-xs font-bold transition-colors disabled:opacity-40 ${btn}`}
              >
                {notifLoading[key] ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Envoi…
                  </span>
                ) : "Notifier l'équipe"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
