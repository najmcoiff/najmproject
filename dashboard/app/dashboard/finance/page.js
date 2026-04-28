"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { getRawSession, getRawToken } from "@/lib/auth";

// ── Constantes ────────────────────────────────────────────────────

const TYPES = ["ENTRÉE", "SORTIE", "APPROVISIONNEMENT", "DECLARATION DETTE"];

const CATEGORIES = [
  "déposer une recette",
  "Encaissement client (vente directe)",
  "Dépôt d'argent en caisse (responsable / employé)",
  "Paiement société de livraison",
  "Remboursement reçu (fournisseur, erreur)",
  "Paiement fournisseur",
  "Dépense opérationnelle (carburant, internet, fournitures)",
  "Retrait de caisse (responsable)",
  "Remboursement client",
  "Charges salariales",
  "Régularisation positive (surplus constaté)",
  "Régularisation négative (manque, perte, erreur)",
];

// ENTRÉE = positif, tout le reste = négatif pour le calcul du solde
function isCreditType(type) {
  const t = (type || "").toUpperCase().trim();
  return t === "ENTRÉE" || t === "ENTREE" || t === "APPROVISIONNEMENT";
}

function fmtDA(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("fr-DZ") + " DA";
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateShort(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" });
}

function typeBadge(type) {
  const t = (type || "").toUpperCase().trim();
  if (t === "ENTRÉE" || t === "ENTREE")       return { bg: "bg-emerald-100 text-emerald-700", label: type };
  if (t === "SORTIE")                          return { bg: "bg-red-100 text-red-700",         label: type };
  if (t === "APPROVISIONNEMENT")               return { bg: "bg-blue-100 text-blue-700",       label: type };
  if (t === "DECLARATION DETTE")               return { bg: "bg-orange-100 text-orange-700",   label: type };
  return { bg: "bg-gray-100 text-gray-600", label: type };
}

const FINANCE_ROLES = ["owner", "chef d'equipe", "responsable", "acheteur"];
function hasFinanceAccess(role) {
  const r = (role || "").toLowerCase();
  return FINANCE_ROLES.some(fr => r === fr || r.includes(fr));
}

const VERIFY_ROLES = ["owner", "chef d'equipe", "drh", "acheteur", "responsable"];
function canVerify(role) {
  const r = (role || "").toLowerCase();
  return VERIFY_ROLES.some(vr => r === vr || r.includes(vr));
}

function dateToAlgeria(date) {
  return date.toLocaleDateString("fr-CA", { timeZone: "Africa/Algiers" });
}

function todayAlgeria() {
  return dateToAlgeria(new Date());
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return dateToAlgeria(d);
}

function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("fr-DZ", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

// ── Composant principal ───────────────────────────────────────────

export default function FinancePage() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("fond"); // "fond" | "recettes"

  // Gestion de fond
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Recettes v2
  const [recDate, setRecDate]         = useState(todayAlgeria());
  const [recData, setRecData]         = useState(null);
  const [loadingRec, setLoadingRec]   = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);
  const [expandedRec, setExpandedRec] = useState(null);

  // Filtres gestion de fond
  const [filterType, setFilterType]   = useState("tous");
  const [filterAgent, setFilterAgent] = useState("tous");
  const [filterCat, setFilterCat]     = useState("tous");
  const [search, setSearch]           = useState("");

  // Modal ajout transaction
  const [showForm, setShowForm] = useState(false);

  // Modal reset
  const [showReset, setShowReset]   = useState(false);
  const [resetting, setResetting]   = useState(false);

  // Modal suppression
  const [confirmDel, setConfirmDel] = useState(null); // { _row, label }

  useEffect(() => {
    const s = getRawSession();
    setSession(s?.user || null);
    loadFond();
  }, []);

  useEffect(() => {
    if (tab === "recettes") loadRecettes(recDate);
  }, [tab, recDate]);

  const loadRecettes = useCallback(async (date) => {
    setLoadingRec(true);
    try {
      const token = getRawToken() || "";
      const res = await fetch(`/api/recettes?token=${encodeURIComponent(token)}&date=${encodeURIComponent(date || recDate)}`);
      const data = await res.json();
      if (data.ok) setRecData(data);
    } catch {}
    finally { setLoadingRec(false); }
  }, [recDate]);

  async function loadFond() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getGestionFond();
      if (res.ok) setRows(res.rows || []);
      else setError(res.error || "Erreur chargement");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let solde = 0, totalEntree = 0, totalSortie = 0;
    const now = new Date();
    const moisDebut = new Date(now.getFullYear(), now.getMonth(), 1);
    let entreeMois = 0, sortieMois = 0;

    rows.forEach(r => {
      const montant = Number(r.montant) || 0;
      const credit  = isCreditType(r.type);
      if (credit) { solde += montant; totalEntree += montant; }
      else         { solde -= montant; totalSortie += montant; }

      const d = new Date(r.timestamp);
      if (!isNaN(d) && d >= moisDebut) {
        if (credit) entreeMois += montant;
        else        sortieMois += montant;
      }
    });

    return { solde, totalEntree, totalSortie, entreeMois, sortieMois };
  }, [rows]);

  // ── Filtres ───────────────────────────────────────────────────────
  const agents = useMemo(() => {
    const set = new Set(rows.map(r => r.agent).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filterType !== "tous") list = list.filter(r => (r.type || "").toLowerCase() === filterType.toLowerCase());
    if (filterAgent !== "tous") list = list.filter(r => r.agent === filterAgent);
    if (filterCat !== "tous")   list = list.filter(r => r.categorie === filterCat);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.description || "").toLowerCase().includes(q) ||
        (r.agent || "").toLowerCase().includes(q) ||
        (r.fournisseur || "").toLowerCase().includes(q) ||
        (r.order_id || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filterType, filterAgent, filterCat, search]);

  async function handleDelete(row) {
    setConfirmDel(null);
    try {
      const res = await api.deleteTransaction(row._row);
      if (res.ok) setRows(prev => prev.filter(r => r._row !== row._row));
    } catch (e) { alert("Erreur : " + e.message); }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await api.resetFond();
      if (res.ok) {
        setRows([]);
        setShowReset(false);
      } else {
        alert(res.error || "Erreur reset");
      }
    } catch (e) { alert("Erreur : " + e.message); }
    finally { setResetting(false); }
  }

  if (!session) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Chargement...</div>
  );
  if (!hasFinanceAccess(session.role)) return (
    <div className="flex items-center justify-center h-64 text-red-500 text-sm font-medium">
      Accès réservé aux responsables et acheteurs.
    </div>
  );

  const isOwner = (session.role || "").toLowerCase() === "owner";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Finance</h1>
          <p className="text-xs text-gray-400 mt-0.5">Gestion de fond · Recettes</p>
        </div>
        {tab === "fond" && (
          <div className="flex items-center gap-2 flex-wrap">
            {isOwner && (
              <button onClick={() => setShowReset(true)}
                className="flex items-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 text-sm font-medium px-3 py-2 rounded-xl transition-colors">
                <span className="text-base leading-none">↺</span> Reset
              </button>
            )}
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm">
              <span className="text-base leading-none">+</span> <span className="hidden xs:inline">Nouvelle </span>transaction
            </button>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard
          label="Solde actuel"
          value={fmtDA(kpis.solde)}
          color={kpis.solde >= 0 ? "emerald" : "red"}
          big
          className="col-span-2 sm:col-span-2"
        />
        <KpiCard label="Total entrées" value={fmtDA(kpis.totalEntree)} color="emerald" sub="cumulé" />
        <KpiCard label="Total sorties"  value={fmtDA(kpis.totalSortie)} color="red"     sub="cumulé" />
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ce mois-ci</p>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-600 font-semibold text-sm">↑ {fmtDA(kpis.entreeMois)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-red-500 font-semibold text-sm">↓ {fmtDA(kpis.sortieMois)}</span>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-gray-200 gap-1">
        {[["fond", "💰 Gestion de fond"], ["recettes", "📈 Recettes"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === key
                ? "border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ONGLET GESTION DE FOND ── */}
      {tab === "fond" && (
        <div className="space-y-4">
          {/* Filtres */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full sm:w-48"
            />
            <Select value={filterType} onChange={setFilterType} label="Type">
              <option value="tous">Tous les types</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select value={filterAgent} onChange={setFilterAgent} label="Agent">
              <option value="tous">Tous les agents</option>
              {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
            <Select value={filterCat} onChange={setFilterCat} label="Catégorie">
              <option value="tous">Toutes catégories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            {(filterType !== "tous" || filterAgent !== "tous" || filterCat !== "tous" || search) && (
              <button onClick={() => { setFilterType("tous"); setFilterAgent("tous"); setFilterCat("tous"); setSearch(""); }}
                className="text-xs text-indigo-600 hover:underline px-2">Réinitialiser</button>
            )}
          </div>

          {/* Stats filtrés */}
          {filtered.length > 0 && (
            <div className="flex gap-4 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2 border border-gray-100">
              <span>{filtered.length} transaction{filtered.length > 1 ? "s" : ""}</span>
              <span className="text-emerald-600 font-medium">
                Entrées : {fmtDA(filtered.filter(r => isCreditType(r.type)).reduce((s, r) => s + (Number(r.montant) || 0), 0))}
              </span>
              <span className="text-red-500 font-medium">
                Sorties : {fmtDA(filtered.filter(r => !isCreditType(r.type)).reduce((s, r) => s + (Number(r.montant) || 0), 0))}
              </span>
            </div>
          )}

          {/* Liste */}
          {loading && (
            <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">Aucune transaction trouvée</div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map((row, i) => (
                <TransactionRow
                  key={row._row || i}
                  row={row}
                  isOwner={isOwner}
                  onDelete={() => setConfirmDel(row)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ONGLET RECETTES v2 ── */}
      {tab === "recettes" && (
        <RecettesTab
          session={session}
          recDate={recDate}
          setRecDate={setRecDate}
          recData={recData}
          loadingRec={loadingRec}
          verifyingId={verifyingId}
          setVerifyingId={setVerifyingId}
          expandedRec={expandedRec}
          setExpandedRec={setExpandedRec}
          onRefresh={() => loadRecettes(recDate)}
        />
      )}

      {/* Modal ajout transaction */}
      {showForm && (
        <TransactionModal
          session={session}
          onClose={() => setShowForm(false)}
          onAdded={newRow => {
            setRows(prev => [{ ...newRow, _row: 9999 + prev.length }, ...prev]);
            setShowForm(false);
          }}
        />
      )}

      {/* Modal confirmation suppression */}
      {confirmDel && (
        <ConfirmDeleteModal
          row={confirmDel}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => handleDelete(confirmDel)}
        />
      )}

      {/* Modal reset fond */}
      {showReset && (
        <ResetFondModal
          count={rows.length}
          resetting={resetting}
          onCancel={() => setShowReset(false)}
          onConfirm={handleReset}
        />
      )}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub, big, className = "" }) {
  const colors = {
    emerald: "text-emerald-600",
    red:     "text-red-500",
    blue:    "text-blue-600",
  };
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-col gap-1 ${className}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`font-bold leading-tight ${colors[color] || "text-gray-900"} ${big ? "text-2xl" : "text-lg"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Select helper ─────────────────────────────────────────────────

function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 max-w-[200px]">
      {children}
    </select>
  );
}

// ── Transaction Row ───────────────────────────────────────────────

function TransactionRow({ row, isOwner, onDelete }) {
  const badge   = typeBadge(row.type);
  const credit  = isCreditType(row.type);
  const montant = Number(row.montant) || 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-3 sm:px-4 py-3 shadow-sm flex items-start sm:items-center gap-3 group hover:border-gray-200 transition-colors">
      {/* Icône type */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg mt-0.5 sm:mt-0 ${
        credit ? "bg-emerald-50" : "bg-red-50"
      }`}>
        {credit ? "↑" : "↓"}
      </div>

      {/* Infos principales */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900 truncate">{row.categorie || "—"}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.bg}`}>{badge.label}</span>
          {row.source === "appsheet" && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">AppSheet</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 flex-wrap">
          <span>{row.agent || "—"}</span>
          <span>·</span>
          <span>{fmtDate(row.timestamp)}</span>
          {row.fournisseur && <><span>·</span><span className="text-gray-500">{row.fournisseur}</span></>}
          {row.description && <><span>·</span><span className="text-gray-500 truncate max-w-[160px] sm:max-w-[200px]">{row.description}</span></>}
        </div>
        {/* Montant mobile — affiché inline sous les infos */}
        <div className={`sm:hidden mt-1 font-bold text-sm ${credit ? "text-emerald-600" : "text-red-500"}`}>
          {credit ? "+" : "−"}{fmtDA(montant)}
        </div>
      </div>

      {/* Montant desktop */}
      <div className={`hidden sm:block text-right flex-shrink-0 font-bold text-base ${credit ? "text-emerald-600" : "text-red-500"}`}>
        {credit ? "+" : "−"}{fmtDA(montant)}
      </div>

      {/* Supprimer (owner seulement) */}
      {isOwner && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 text-lg leading-none ml-1 flex-shrink-0"
          title="Marquer annulée">
          ✕
        </button>
      )}
    </div>
  );
}

// ── Recettes Tab (v2) ─────────────────────────────────────────────

function RecettesTab({
  session, recDate, setRecDate, recData, loadingRec,
  verifyingId, setVerifyingId, expandedRec, setExpandedRec, onRefresh
}) {
  const isToday    = recDate === todayAlgeria();
  const canVerifyRole = canVerify(session?.role);

  // Modal déclaration
  const [showDeclare, setShowDeclare]   = useState(false);
  const [prefilledAgent, setPrefilledAgent] = useState("");
  const [prefilledMontant, setPrefilledMontant] = useState("");
  const [declareError, setDeclareError]  = useState("");

  async function handleVerify(recette) {
    if (!window.confirm(`Vérifier la recette de ${recette.agent} — ${fmtDA(recette.montant_declare)} ?\n\nCela ajoutera cette somme à la gestion de fond.`)) return;
    setVerifyingId(recette.id);
    try {
      const token = getRawToken() || "";
      const res = await fetch("/api/recettes/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, recette_id: recette.id }),
      });
      const data = await res.json();
      if (data.ok) onRefresh();
      else alert(data.error || "Erreur");
    } catch (e) { alert("Erreur : " + e.message); }
    finally { setVerifyingId(null); }
  }

  function openDeclare(agentName = "", montant = "") {
    setPrefilledAgent(agentName || session?.nom || "");
    setPrefilledMontant(montant ? String(montant) : "");
    setDeclareError("");
    setShowDeclare(true);
  }

  async function handleDeclare(agent, montant, notes) {
    setDeclareError("");
    try {
      const token = getRawToken() || "";
      const res = await fetch("/api/recettes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, agent, date_recette: recDate, montant_declare: Number(montant), notes }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowDeclare(false);
        onRefresh();
      } else {
        setDeclareError(data.error || "Erreur serveur");
      }
    } catch (e) { setDeclareError(e.message); }
  }

  const recettes  = recData?.recettes  || [];
  const agentsPos = recData?.agentsPos  || [];
  const posTotal  = recData?.posTotal   || 0;
  const totalDeclare = recettes.reduce((s, r) => s + Number(r.montant_declare), 0);
  const anomalies = recettes.filter(r => r.ecart !== 0 && !r.verified);

  return (
    <div className="space-y-4">
      {/* Navigation date + bouton déclarer */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setRecDate(addDays(recDate, -1))}
            className="w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-lg">
            ‹
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900 capitalize">{fmtDateLabel(recDate)}</p>
            {isToday && <p className="text-[10px] text-emerald-600 font-medium">Aujourd'hui</p>}
          </div>
          <button onClick={() => setRecDate(addDays(recDate, 1))} disabled={isToday}
            className="w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-lg disabled:opacity-30">
            ›
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <button onClick={() => setRecDate(todayAlgeria())}
              className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl font-medium hover:bg-indigo-100 transition-colors">
              Aujourd'hui
            </button>
          )}
          <button onClick={onRefresh}
            className="w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
            ↺
          </button>
          <button
            onClick={() => openDeclare()}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors shadow-sm">
            <span className="text-base leading-none">+</span> Déclarer
          </button>
        </div>
      </div>

      {loadingRec && <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>}

      {!loadingRec && (
        <>
          {/* KPIs du jour */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Total POS réel</p>
              <p className="font-bold text-lg text-gray-900 mt-0.5">{fmtDA(posTotal)}</p>
              <p className="text-[10px] text-gray-400">{(recData?.posOrders || []).length} vente{(recData?.posOrders || []).length !== 1 ? "s" : ""}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Total déclaré</p>
              <p className={`font-bold text-lg mt-0.5 ${recettes.length ? "text-emerald-600" : "text-gray-400"}`}>{fmtDA(totalDeclare)}</p>
              <p className="text-[10px] text-gray-400">{recettes.length} déclaration{recettes.length !== 1 ? "s" : ""}</p>
            </div>
            <div className={`rounded-2xl border p-3 shadow-sm ${anomalies.length ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"}`}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Écart global</p>
              <p className={`font-bold text-lg mt-0.5 ${totalDeclare - posTotal < 0 ? "text-red-500" : totalDeclare - posTotal > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                {totalDeclare - posTotal === 0 ? "—" : `${totalDeclare - posTotal > 0 ? "+" : ""}${fmtDA(totalDeclare - posTotal)}`}
              </p>
              {anomalies.length > 0 && <p className="text-[10px] text-amber-600 font-medium">{anomalies.length} anomalie{anomalies.length > 1 ? "s" : ""}</p>}
            </div>
          </div>

          {/* Recettes déclarées par agent */}
          {recettes.length === 0 && agentsPos.length === 0 && (
            <div className="text-center py-10 space-y-3">
              <p className="text-gray-400 text-sm">Aucune activité POS ni déclaration pour cette date.</p>
              <button
                onClick={() => openDeclare()}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm">
                <span className="text-base leading-none">+</span> Déclarer une recette
              </button>
            </div>
          )}

          {recettes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recettes déclarées</p>
              {recettes.map(rec => (
                <RecetteCardV2
                  key={rec.id}
                  rec={rec}
                  expanded={expandedRec === rec.id}
                  onToggle={() => setExpandedRec(expandedRec === rec.id ? null : rec.id)}
                  canVerify={canVerifyRole && !rec.verified}
                  verifying={verifyingId === rec.id}
                  onVerify={() => handleVerify(rec)}
                />
              ))}
            </div>
          )}

          {/* Agents POS sans déclaration */}
          {agentsPos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Agents avec ventes POS — pas encore déclaré
              </p>
              {agentsPos.map(ag => (
                <AgentPosCard
                  key={ag.agent}
                  ag={ag}
                  expanded={expandedRec === `pos-${ag.agent}`}
                  onToggle={() => setExpandedRec(expandedRec === `pos-${ag.agent}` ? null : `pos-${ag.agent}`)}
                  onDeclare={() => openDeclare(ag.agent, ag.total)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal déclaration recette */}
      {showDeclare && (
        <DeclareRecetteModal
          session={session}
          recDate={recDate}
          initialAgent={prefilledAgent}
          initialMontant={prefilledMontant}
          error={declareError}
          onClose={() => setShowDeclare(false)}
          onSubmit={handleDeclare}
        />
      )}
    </div>
  );
}

// ── RecetteCardV2 ─────────────────────────────────────────────────

function RecetteCardV2({ rec, expanded, onToggle, canVerify, verifying, onVerify }) {
  const ecart   = Number(rec.ecart) || 0;
  const hasGap  = ecart !== 0;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      hasGap && !rec.verified ? "border-amber-200" : rec.verified ? "border-emerald-200" : "border-gray-100"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icône statut */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base ${
          rec.verified ? "bg-emerald-50" : hasGap ? "bg-amber-50" : "bg-gray-50"
        }`}>
          {rec.verified ? "✅" : hasGap ? "⚠️" : "🕐"}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900">{rec.agent}</span>
            {rec.verified && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                ✓ Vérifié par {rec.verified_by}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
            <span>Déclaré : <span className="text-gray-700 font-medium">{fmtDA(rec.montant_declare)}</span></span>
            <span>·</span>
            <span>POS réel : <span className="text-gray-700 font-medium">{fmtDA(rec.total_pos_reel)}</span></span>
            {hasGap && (
              <>
                <span>·</span>
                <span className={`font-semibold ${ecart < 0 ? "text-red-500" : "text-emerald-600"}`}>
                  Écart : {ecart > 0 ? "+" : ""}{fmtDA(ecart)}
                </span>
              </>
            )}
            <span>·</span>
            <span>{rec.nb_commandes || 0} cmd POS</span>
          </div>
          {rec.notes && <p className="text-[11px] text-gray-400 mt-0.5 truncate">Note : {rec.notes}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canVerify && (
            <button
              onClick={onVerify}
              disabled={verifying}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 shadow-sm">
              {verifying ? "…" : "✓ Vérifier"}
            </button>
          )}
          <button onClick={onToggle}
            className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors text-xs">
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Détail commandes POS */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50">
          {(rec.commandes || []).length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-3">Aucune commande POS trouvée pour cet agent.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {rec.commandes.map(cmd => (
                <div key={cmd.order_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-semibold text-gray-700">{cmd.order_name || cmd.order_id}</p>
                    {cmd.order_items_summary && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{cmd.order_items_summary}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-emerald-600">{fmtDA(cmd.order_total)}</p>
                    {cmd.pos_discount > 0 && (
                      <p className="text-[10px] text-red-400">remise −{fmtDA(cmd.pos_discount)}</p>
                    )}
                    <p className="text-[10px] text-gray-400">
                      {new Date(cmd.order_date).toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2.5 bg-white flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">Total POS réel</span>
                <span className="text-sm font-bold text-gray-900">{fmtDA(rec.total_pos_reel)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AgentPosCard — agent sans déclaration ─────────────────────────

function AgentPosCard({ ag, expanded, onToggle, onDeclare }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 text-base cursor-pointer" onClick={onToggle}>
          🕐
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900">{ag.agent}</span>
            <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">Non déclaré</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
            <span>POS encaissé : <span className="font-semibold text-gray-800">{fmtDA(ag.total)}</span></span>
            <span>·</span>
            <span>{ag.nb_commandes} commande{ag.nb_commandes !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onDeclare && (
            <button
              onClick={onDeclare}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-xl transition-colors shadow-sm">
              + Déclarer
            </button>
          )}
          <button onClick={onToggle} className="w-7 h-7 rounded-lg border border-amber-300 flex items-center justify-center text-amber-600 hover:bg-amber-100 transition-colors text-xs">
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-amber-200">
          <div className="divide-y divide-amber-100">
            {(ag.commandes || []).map(cmd => (
              <div key={cmd.order_id} className="px-4 py-2.5 flex items-center justify-between gap-3 bg-amber-50">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono font-semibold text-gray-700">{cmd.order_name || cmd.order_id}</p>
                  {cmd.order_items_summary && (
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{cmd.order_items_summary}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-emerald-600">{fmtDA(cmd.order_total)}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(cmd.order_date).toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            <div className="px-4 py-2.5 bg-amber-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">Total encaissé POS</span>
              <span className="text-sm font-bold text-gray-900">{fmtDA(ag.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal Ajout Transaction ───────────────────────────────────────

function TransactionModal({ session, onClose, onAdded }) {
  const [form, setForm]       = useState({ categorie: "", type: "", montant: "", description: "", fournisseur: "" });
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Auto-détecter le type selon la catégorie
  function handleCategorie(cat) {
    set("categorie", cat);
    if (cat.includes("déposer") || cat.includes("Encaissement") || cat.includes("Dépôt") || cat.includes("Remboursement reçu") || cat.includes("positive")) {
      set("type", "ENTRÉE");
    } else if (cat.includes("Paiement") || cat.includes("Retrait") || cat.includes("Dépense") || cat.includes("Remboursement client") || cat.includes("Charges") || cat.includes("négative")) {
      set("type", "SORTIE");
    }
  }

  const needsFournisseur = form.categorie.toLowerCase().includes("fournisseur") ||
                           form.categorie.toLowerCase().includes("société de livraison");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!form.categorie) return setErr("Catégorie requise");
    if (!form.type)       return setErr("Type requis");
    if (!form.montant || isNaN(Number(form.montant)) || Number(form.montant) <= 0) return setErr("Montant invalide");

    setSaving(true);
    try {
      const res = await api.addTransaction({
        categorie:   form.categorie,
        type:        form.type,
        montant:     Number(form.montant),
        description: form.description,
        fournisseur: form.fournisseur,
      });
      if (res.ok) {
        onAdded({ ...form, montant: Number(form.montant), timestamp: res.timestamp || new Date().toISOString(), agent: session.nom, source: "dashboard" });
      } else {
        setErr(res.error || "Erreur serveur");
      }
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Nouvelle transaction</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Catégorie */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catégorie *</label>
            <select
              value={form.categorie}
              onChange={e => handleCategorie(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">Sélectionner...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type *</label>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => set("type", t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    form.type === t
                      ? t === "ENTRÉE" || t === "APPROVISIONNEMENT" ? "bg-emerald-600 text-white border-emerald-600"
                        : t === "SORTIE" ? "bg-red-500 text-white border-red-500"
                        : "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Montant */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Montant (DA) *</label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.montant}
              onChange={e => set("montant", e.target.value)}
              placeholder="ex: 45000"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Fournisseur (conditionnel) */}
          {needsFournisseur && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Fournisseur / Société</label>
              <input
                type="text"
                value={form.fournisseur}
                onChange={e => set("fournisseur", e.target.value)}
                placeholder="ex: Bandido DZ"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Détails optionnels..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          {err && <p className="text-red-500 text-xs font-medium">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal Déclarer une Recette ────────────────────────────────────

function DeclareRecetteModal({ session, recDate, initialAgent, initialMontant, error, onClose, onSubmit }) {
  const [agent, setAgent]   = useState(initialAgent || "");
  const [montant, setMontant] = useState(initialMontant || "");
  const [notes, setNotes]   = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(error || "");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!agent.trim())   return setErr("Nom de l'agent requis");
    if (!montant || isNaN(Number(montant)) || Number(montant) < 0) return setErr("Montant invalide");
    setSaving(true);
    await onSubmit(agent.trim(), montant, notes);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Déclarer une recette</h2>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">{fmtDateLabel(recDate)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Agent */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nom de l'agent *</label>
            <input
              type="text"
              value={agent}
              onChange={e => setAgent(e.target.value)}
              placeholder="ex: farouk"
              required
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Montant déclaré */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Montant déclaré (DA) *</label>
            <input
              type="number"
              min="0"
              step="1"
              value={montant}
              onChange={e => setMontant(e.target.value)}
              placeholder="ex: 15000"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Remarques, explications d'écart..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          {(err || error) && <p className="text-red-500 text-xs font-medium">{err || error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {saving ? "Enregistrement..." : "Déclarer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal Reset Fond ──────────────────────────────────────────────

function ResetFondModal({ count, resetting, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-2xl mx-auto">↺</div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Remettre le solde à zéro ?</h2>
            <p className="text-sm text-gray-500 mt-2">
              Cette action va archiver <span className="font-semibold text-gray-800">{count} transaction{count > 1 ? "s" : ""}</span>{" "}
              et remettre le solde actuel à <span className="font-semibold text-gray-800">0 DA</span>.
            </p>
            <p className="text-xs text-gray-400 mt-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Les transactions sont conservées dans Google Sheet, elles ne seront pas supprimées.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} disabled={resetting}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50">
              Annuler
            </button>
            <button onClick={onConfirm} disabled={resetting}
              className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {resetting ? "En cours..." : "Confirmer le reset"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Confirmation Suppression ───────────────────────────────

function ConfirmDeleteModal({ row, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-2xl mx-auto">🗑️</div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Marquer comme annulée ?</h2>
            <p className="text-sm text-gray-500 mt-1">
              La transaction <span className="font-semibold text-gray-700">{row.categorie}</span> de{" "}
              <span className="font-semibold text-gray-700">{fmtDA(row.montant)}</span> sera marquée annulée.
            </p>
            <p className="text-xs text-gray-400 mt-1">Cette action ne peut pas être annulée.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium">
              Annuler
            </button>
            <button onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
