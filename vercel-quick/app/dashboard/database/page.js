"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getRawSession, getRawToken } from "@/lib/auth";

// ── Helpers ───────────────────────────────────────────────────────
function getToken() {
  return getRawToken();
}

function fmtDate(val) {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function isDateCol(col) { return /^(ts|created_at|updated_at|date|order_date|date_injection)$/i.test(col); }
function isJsonCol(col)  { return /^(details|items_json|extra|options|data)$/i.test(col); }
function isLongCol(col)  { return /^(message|note|order_items_summary|stack|journal_resume|customer_summary)$/i.test(col); }

const LEVEL_COLORS = {
  ERROR: "bg-red-100 text-red-700 font-bold",
  WARN:  "bg-orange-100 text-orange-700 font-semibold",
  INFO:  "bg-green-100 text-green-700",
  DEBUG: "bg-gray-100 text-gray-500",
};

function CellValue({ col, val }) {
  const [expanded, setExpanded] = useState(false);

  if (val === null || val === undefined || val === "") {
    return <span className="text-gray-300 text-xs">—</span>;
  }

  if (col === "level") {
    return <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${LEVEL_COLORS[val] || "bg-gray-100 text-gray-600"}`}>{val}</span>;
  }

  if (isDateCol(col)) {
    return <span className="text-[11px] text-gray-500 whitespace-nowrap font-mono">{fmtDate(val)}</span>;
  }

  if (isJsonCol(col) || typeof val === "object") {
    const str = typeof val === "string" ? val : JSON.stringify(val);
    const preview = str.slice(0, 60) + (str.length > 60 ? "…" : "");
    return (
      <span className="cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {expanded ? (
          <pre className="text-[10px] bg-gray-50 border border-gray-200 rounded p-1.5 max-w-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
            {typeof val === "string" ? (() => { try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; } })() : JSON.stringify(val, null, 2)}
          </pre>
        ) : (
          <span className="text-[10px] font-mono text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-1 py-0.5 rounded">
            {preview}
          </span>
        )}
      </span>
    );
  }

  if (isLongCol(col)) {
    const str = String(val);
    const short = str.slice(0, 80);
    return (
      <span className="cursor-pointer text-xs text-gray-700" onClick={() => setExpanded(e => !e)}>
        {expanded ? str : (str.length > 80 ? short + "…" : str)}
      </span>
    );
  }

  const str = String(val);
  return <span className="text-xs text-gray-800">{str.length > 100 ? str.slice(0, 100) + "…" : str}</span>;
}

// ── Composant principal ───────────────────────────────────────────
export default function DatabasePage() {
  const [user,         setUser]         = useState(null);
  const [tables,       setTables]       = useState([]);
  const [activeTable,  setActiveTable]  = useState(null);
  const [columns,      setColumns]      = useState([]);
  const [rows,         setRows]         = useState([]);
  const [total,        setTotal]        = useState(0);
  const [totalPages,   setTotalPages]   = useState(1);
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError,   setTableError]   = useState(null);
  const [error,        setError]        = useState(null);
  const [autoRefresh,  setAutoRefresh]  = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [quickFilters, setQuickFilters] = useState({
    show_archived: false,
    hide_pos:      false,
    hide_cloture:  false,
    hide_last:     false,
    hide_zr_locked: false,
    tracking_vide: false,
  });
  const searchRef  = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const s = getRawSession();
    setUser(s?.user || null);
  }, []);

  // ── Charger la liste des tables ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const token = getToken();
    fetch(`/api/admin/tables?list=1&token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setTables(d.tables || []);
          if (d.tables?.length > 0) setActiveTable(d.tables[0].name);
        } else {
          setTableError(d.error || "Erreur lors du chargement des tables");
        }
      })
      .catch(e => setTableError("Erreur réseau : " + e.message))
      .finally(() => setTableLoading(false));
  }, [user]);

  // ── Charger les données de la table active ────────────────────
  const loadData = useCallback(async (tbl, pg, q, dFrom, dTo, qf) => {
    if (!tbl) return;
    setLoading(true);
    setError(null);
    const token = getToken();
    try {
      let url = `/api/admin/tables?token=${token}&table=${tbl}&page=${pg}&q=${encodeURIComponent(q)}`;
      if (dFrom) url += `&date_from=${encodeURIComponent(dFrom)}`;
      if (dTo)   url += `&date_to=${encodeURIComponent(dTo)}`;
      // Filtres rapides nc_orders
      if (tbl === "nc_orders" && qf) {
        if (qf.show_archived)  url += "&show_archived=1";
        if (qf.hide_pos)       url += "&hide_pos=1";
        if (qf.hide_cloture)   url += "&hide_cloture=1";
        if (qf.hide_last)      url += "&hide_last=1";
        if (qf.hide_zr_locked) url += "&hide_zr_locked=1";
        if (qf.tracking_vide)  url += "&tracking_vide=1";
      }
      const res = await fetch(url);
      const d   = await res.json();
      if (d.ok) {
        setColumns(d.columns || []);
        setRows(d.rows || []);
        setTotal(d.total || 0);
        setTotalPages(d.total_pages || 1);
      } else {
        setError(d.error || "Erreur");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTable) loadData(activeTable, page, search, dateFrom, dateTo, quickFilters);
  }, [activeTable, page, search, dateFrom, dateTo, quickFilters, loadData]);

  // Auto-refresh toutes les 5s
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => loadData(activeTable, page, search, dateFrom, dateTo, quickFilters), 5000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, activeTable, page, search, dateFrom, dateTo, quickFilters, loadData]);

  const selectTable = (name) => {
    setActiveTable(name);
    setPage(1);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setColumns([]);
    setRows([]);
    setQuickFilters({ show_archived: false, hide_pos: false, hide_cloture: false, hide_last: false, hide_zr_locked: false, tracking_vide: false });
    setSidebarOpen(false); // fermer sidebar mobile après sélection
  };

  const toggleChip = (key) => {
    setQuickFilters(prev => ({ ...prev, [key]: !prev[key] }));
    setPage(1);
  };

  // Raccourci "Aujourd'hui"
  const setToday = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    setDateFrom(today);
    setDateTo(today);
    setPage(1);
  };

  if (!user) return <div className="p-6 text-gray-400 text-sm">Chargement…</div>;
  if (user.role !== "owner") return (
    <div className="p-6 text-center">
      <div className="text-5xl mb-3">🔒</div>
      <p className="text-gray-400 text-sm">Accès réservé au Owner</p>
    </div>
  );

  const activeConf = tables.find(t => t.name === activeTable);

  return (
    <div className="flex h-full relative" style={{ height: "calc(100vh - 64px)" }}>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar tables ───────────────────────────────────────── */}
      <div className={`
        fixed md:relative z-40 md:z-auto
        w-64 md:w-52 flex-shrink-0 bg-gray-900 text-white flex flex-col overflow-hidden
        h-full transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="px-3 py-3 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Base de données</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">{tables.length} tables</p>
          </div>
          <button className="md:hidden text-gray-400 hover:text-white text-xl px-1" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {tableLoading ? (
            <div className="px-3 py-4 text-xs text-gray-500 animate-pulse">Chargement…</div>
          ) : tableError ? (
            <div className="px-3 py-4 text-xs text-red-400 leading-snug">
              <p className="font-bold mb-1">❌ Erreur</p>
              <p>{tableError}</p>
            </div>
          ) : tables.map(t => (
            <button
              key={t.name}
              onClick={() => selectTable(t.name)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2
                ${activeTable === t.name ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}
            >
              <span className="truncate">{t.label}</span>
              <span className={`flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded
                ${activeTable === t.name ? "bg-indigo-400/40 text-white" : "bg-gray-700 text-gray-400"}`}>
                {t.count >= 0 ? t.count.toLocaleString("fr-FR") : "?"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Zone principale ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">

        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 flex-shrink-0">
          {/* Ligne 1 : titre + boutons */}
          <div className="flex items-center gap-2 px-3 py-2">
            {/* Hamburger mobile */}
            <button
              data-testid="db-menu-toggle"
              className="md:hidden p-1.5 rounded-lg bg-gray-800 text-white"
              onClick={() => setSidebarOpen(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>

            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="font-semibold text-gray-800 text-sm truncate">{activeConf?.label || activeTable}</span>
              {total > 0 && <span className="text-xs text-gray-400 shrink-0">{total.toLocaleString("fr-FR")} lignes</span>}
            </div>

            {/* Barre de recherche */}
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher…"
              className="w-28 sm:w-40 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />

            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(a => !a)}
              className={`text-xs px-2 py-1.5 rounded-lg border font-medium transition-colors shrink-0
                ${autoRefresh ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
              title="Auto-refresh 5s"
            >
              {autoRefresh ? "⏸" : "▶"} <span className="hidden sm:inline">Live</span>
            </button>

            {/* Refresh manual */}
            <button
              onClick={() => loadData(activeTable, page, search, dateFrom, dateTo, quickFilters)}
              disabled={loading}
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-400 transition-colors disabled:opacity-40 shrink-0"
            >
              ↻
            </button>
          </div>

          {/* Ligne 2 : filtres date (collapsibles sur mobile) */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
            <span className="text-[10px] text-gray-400 font-medium">Du</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white w-32 sm:w-36"
            />
            <span className="text-[10px] text-gray-400 font-medium">Au</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white w-32 sm:w-36"
            />
            <button
              onClick={setToday}
              title="Aujourd'hui"
              className="text-xs px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium transition-colors"
            >
              Auj.
            </button>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
                title="Effacer filtre date"
                className="text-xs px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── Chips filtres rapides (nc_orders seulement) ─────────── */}
        {activeTable === "nc_orders" && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
            {[
              { key: "show_archived",  label: "🗄 Afficher archivés",  activeColor: "bg-indigo-600 text-white border-indigo-600" },
              { key: "hide_pos",       label: "🧾 Masquer POS",         activeColor: "bg-orange-500 text-white border-orange-500" },
              { key: "hide_cloture",   label: "🔒 Masquer clôturés",    activeColor: "bg-red-600 text-white border-red-600" },
              { key: "hide_last",      label: "🗓️ Masquer last",         activeColor: "bg-yellow-500 text-white border-yellow-500" },
              { key: "hide_zr_locked", label: "🚚 Masquer ZR lockés",   activeColor: "bg-blue-600 text-white border-blue-600" },
              { key: "tracking_vide",  label: "📭 Sans tracking seul",  activeColor: "bg-purple-600 text-white border-purple-600" },
            ].map(({ key, label, activeColor }) => (
              <button
                key={key}
                onClick={() => toggleChip(key)}
                className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors whitespace-nowrap
                  ${quickFilters[key]
                    ? activeColor
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                  }`}
              >
                {label}
              </button>
            ))}
            <span className="text-[10px] text-gray-400 self-center ml-1">
              Actif par défaut : commandes non-archivées uniquement
            </span>
          </div>
        )}

        {/* Grille */}
        <div className="flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              <span className="animate-pulse">Chargement…</span>
            </div>
          ) : error ? (
            <div className="p-4 text-red-600 text-sm bg-red-50 border border-red-100 m-4 rounded-xl">❌ {error}</div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Aucune donnée</div>
          ) : (
            <table className="w-full text-xs border-collapse" style={{ minWidth: "max-content" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <th className="px-2 py-2 text-left text-[10px] font-bold text-gray-400 border-r border-gray-100 w-8">#</th>
                  {columns.map(col => (
                    <th key={col} className="px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wide border-r border-gray-100 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => {
                  const rowN = (page - 1) * 50 + i + 1;
                  const isError = row.level === "ERROR";
                  const isWarn  = row.level === "WARN";
                  return (
                    <tr key={i} className={`hover:bg-indigo-50/30 transition-colors
                      ${isError ? "bg-red-50/40" : isWarn ? "bg-orange-50/30" : ""}`}>
                      <td className="px-2 py-1.5 text-[10px] text-gray-300 font-mono border-r border-gray-100 select-none">{rowN}</td>
                      {columns.map(col => (
                        <td key={col} className="px-3 py-1.5 border-r border-gray-100 max-w-xs align-top">
                          <CellValue col={col} val={row[col]} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <span className="text-xs text-gray-500">
              Page {page}/{totalPages} · {total.toLocaleString("fr-FR")} lignes
            </span>
            <div className="flex gap-1.5">
              <button disabled={page <= 1} onClick={() => setPage(1)}
                className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:border-gray-400 bg-white">«</button>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-2.5 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:border-gray-400 bg-white">‹</button>
              {/* Pages autour de l'actuelle */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                return start + i;
              }).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-7 py-1 text-xs border rounded transition-colors
                    ${page === p ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 hover:border-gray-400 bg-white"}`}>
                  {p}
                </button>
              ))}
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-2.5 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:border-gray-400 bg-white">›</button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}
                className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:border-gray-400 bg-white">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
