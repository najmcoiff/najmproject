"use client";
import { useState, useEffect } from "react";
import { getSession } from "@/lib/auth";

function getToken() { return getSession()?.token || ""; }

const EVENT_LABELS = {
  PAGE_VIEW:      { label: "Vues page",      icon: "👁",  color: "#6366f1" },
  PRODUCT_VIEW:   { label: "Vues produit",   icon: "📦",  color: "#f59e0b" },
  CART_ADD:       { label: "Ajouts panier",  icon: "🛒",  color: "#10b981" },
  CART_REMOVE:    { label: "Retraits panier",icon: "❌",  color: "#ef4444" },
  CHECKOUT_START: { label: "Débuts checkout",icon: "💳",  color: "#8b5cf6" },
  ORDER_PLACED:   { label: "Commandes",      icon: "✅",  color: "#059669" },
  SEARCH:         { label: "Recherches",     icon: "🔍",  color: "#0ea5e9" },
  FILTER_APPLIED: { label: "Filtres",        icon: "🎚",  color: "#64748b" },
};

const FUNNEL_LABELS = {
  PAGE_VIEW:      "Visites",
  PRODUCT_VIEW:   "Vues produit",
  CART_ADD:       "Panier",
  CHECKOUT_START: "Checkout",
  ORDER_PLACED:   "Commande",
};

export default function AnalyticsPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(7);
  const [error,   setError]   = useState("");

  useEffect(() => { load(days); }, [days]);

  async function load(d) {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/owner/analytics?days=${d}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await r.json();
      if (json.error) { setError(json.error); return; }
      setData(json);
    } catch { setError("Erreur de chargement"); }
    finally { setLoading(false); }
  }

  const maxDay = data ? Math.max(...data.byDay.map(d => d.events), 1) : 1;
  const funnelMax = data ? Math.max(...data.funnel.map(f => f.sessions), 1) : 1;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📊 Analytics boutique</h1>
          <p className="text-sm text-gray-500 mt-0.5">Données nc_page_events — comportement clients</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                days === d ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {d}j
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-5">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {Array(4).fill(null).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-8 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <KpiCard icon="📈" label="Événements" value={data.kpi.totalEvents} />
            <KpiCard icon="👥" label="Sessions" value={data.kpi.uniqueSessions} />
            <KpiCard icon="🌟" label="Aujourd'hui" value={data.kpi.todayEvents} />
            <KpiCard
              icon="💰"
              label="Commandes"
              value={data.byType?.ORDER_PLACED || 0}
              highlight
            />
          </div>

          {/* Ligne 2 : Graphe jours + Coiffure vs Onglerie */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Graphe par jour */}
            <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-4">Événements / jour ({days}j)</h2>
              <div className="flex items-end gap-1.5 h-28">
                {data.byDay.map(d => {
                  const pct = Math.round((d.events / maxDay) * 100);
                  const label = d.date.slice(5); // MM-DD
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 absolute -top-4 whitespace-nowrap">
                        {d.events}
                      </span>
                      <div
                        className="w-full rounded-t transition-all duration-300"
                        style={{
                          height: `${Math.max(pct, 2)}%`,
                          background: d.events > 0 ? "#6366f1" : "#f1f5f9",
                          minHeight: "4px",
                        }}
                      />
                      <span className="text-[8px] text-gray-400">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Coiffure vs Onglerie */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-4">Répartition monde</h2>
              <div className="space-y-3">
                {[
                  { label: "Coiffure", value: data.byWorld.coiffure, color: "#e63012" },
                  { label: "Onglerie", value: data.byWorld.onglerie, color: "#e8a0bf" },
                  { label: "Non défini", value: data.byWorld.unknown, color: "#94a3b8" },
                ].map(w => {
                  const total = data.kpi.totalEvents || 1;
                  const pct = Math.round((w.value / total) * 100);
                  return (
                    <div key={w.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">{w.label}</span>
                        <span className="text-gray-500">{w.value} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: w.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Ligne 3 : Funnel + Events par type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Funnel conversion */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-4">Entonnoir de conversion</h2>
              <div className="space-y-2">
                {data.funnel.map((f, i) => {
                  const pct = Math.round((f.sessions / funnelMax) * 100);
                  const convPct = i > 0 && data.funnel[0].sessions > 0
                    ? Math.round((f.sessions / data.funnel[0].sessions) * 100) : 100;
                  return (
                    <div key={f.step}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">
                          {i + 1}. {FUNNEL_LABELS[f.step]}
                        </span>
                        <span className="text-gray-500">
                          {f.sessions} sess. {i > 0 && <span className="text-gray-400">({convPct}%)</span>}
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            background: `hsl(${220 - i * 30}, 80%, 55%)`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Events par type */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-4">Événements par type</h2>
              <div className="space-y-2">
                {Object.entries(data.byType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const meta = EVENT_LABELS[type] || { label: type, icon: "•", color: "#94a3b8" };
                    const pct = Math.round((count / data.kpi.totalEvents) * 100);
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <span className="text-base w-6 shrink-0">{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-700 font-medium truncate">{meta.label}</span>
                            <span className="text-gray-500 shrink-0 ml-1">{count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Ligne 4 : Top pages + UTM */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top pages */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-3">Top pages visitées</h2>
              {data.topPages.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune donnée</p>
              ) : (
                <div className="space-y-1.5">
                  {data.topPages.map(({ page, count }) => (
                    <div key={page} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 truncate flex-1 mr-2 font-mono">{page || "/"}</span>
                      <span className="shrink-0 bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-full">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* UTM Sources */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-3">Sources marketing (UTM)</h2>
              {data.utmSources.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-2xl mb-1">🔗</p>
                  <p className="text-sm text-gray-400">Aucune source UTM tracée</p>
                  <p className="text-xs text-gray-300 mt-1">Ajoutez ?utm_source= à vos liens</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {data.utmSources.map(({ source, count }) => (
                    <div key={source} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 font-medium capitalize">{source}</span>
                      <span className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({ icon, label, value, highlight }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
      <p className={`text-xs font-medium mb-1 ${highlight ? "text-gray-400" : "text-gray-500"}`}>
        {icon} {label}
      </p>
      <p className={`text-3xl font-bold ${highlight ? "text-white" : "text-gray-900"}`}>
        {value.toLocaleString("fr-FR")}
      </p>
    </div>
  );
}
