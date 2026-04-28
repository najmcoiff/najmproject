"use client";

import { useState, useEffect, useCallback } from "react";

export default function AIMarketingDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("nc_token");
      const res = await fetch(`/api/ai/dashboard?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Accès refusé");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement AI Dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;
  if (!data) return null;

  const { kpi, funnel, segments, campaigns, whatsapp, content, alerts, top_products, recent_decisions, history } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🤖 AI Marketing Machine</h1>
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded text-sm ${days === d ? "bg-red-600 text-white" : "bg-zinc-800 text-gray-400"}`}
            >
              {d}j
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="CA période" value={kpi.revenue_formatted} />
        <KPICard label="Commandes" value={kpi.orders_count} />
        <KPICard label="Panier moyen" value={`${kpi.avg_order_value} DA`} />
        <KPICard label="Conversion" value={`${kpi.conversion_rate}%`} />
        <KPICard label="Aujourd'hui" value={`${kpi.today_orders} cmd — ${kpi.today_revenue_da} DA`} />
        <KPICard label="Score santé" value={`${kpi.health_score}/100`} accent />
        <KPICard label="WA envoyés" value={whatsapp.sent} />
        <KPICard label="Alertes stock" value={alerts.critical} alert={alerts.critical > 0} />
      </div>

      {/* Funnel */}
      <div className="bg-zinc-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">📊 Entonnoir de conversion</h2>
        <div className="space-y-2">
          {funnel.map((step, i) => {
            const maxSessions = funnel[0]?.sessions || 1;
            const pct = Math.round((step.sessions / maxSessions) * 100);
            const labels = {
              PAGE_VIEW: "Pages vues",
              PRODUCT_VIEW: "Produits vus",
              CART_ADD: "Ajouts panier",
              CHECKOUT_START: "Début checkout",
              ORDER_PLACED: "Commandes",
            };
            return (
              <div key={step.step} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-400">{labels[step.step] || step.step}</span>
                <div className="flex-1 bg-zinc-800 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center px-2 text-xs font-bold"
                    style={{
                      width: `${Math.max(pct, 5)}%`,
                      background: `hsl(${120 - i * 25}, 70%, 45%)`,
                    }}
                  >
                    {step.sessions}
                  </div>
                </div>
                <span className="text-sm text-gray-500 w-12 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Segments */}
        <div className="bg-zinc-900 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-3">👥 Segments clients</h2>
          <div className="space-y-2">
            {Object.entries(segments || {}).map(([seg, count]) => (
              <div key={seg} className="flex justify-between text-sm">
                <span className="text-gray-400">{segmentLabel(seg)}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
            {Object.keys(segments || {}).length === 0 && (
              <p className="text-gray-500 text-sm">Aucun segment — lancer Agent 3</p>
            )}
          </div>
        </div>

        {/* Campaigns */}
        <div className="bg-zinc-900 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-3">🎯 Campagnes Meta</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Actives</span>
              <span>{campaigns.active}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">ROAS moyen</span>
              <span>{campaigns.avg_roas}x</span>
            </div>
            {campaigns.list?.map((c) => (
              <div key={c.id} className="text-xs bg-zinc-800 rounded p-2 flex justify-between">
                <span>{c.campaign_type} ({c.world})</span>
                <span className="text-green-400">{c.roas}x</span>
              </div>
            ))}
            {campaigns.active === 0 && (
              <p className="text-gray-500 text-sm">Aucune campagne active</p>
            )}
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-zinc-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">🏆 Top produits (score IA)</h2>
        <div className="space-y-1">
          {(top_products || []).map((p, i) => (
            <div key={p.variant_id} className="flex items-center gap-3 text-sm py-1">
              <span className="text-gray-500 w-6">#{i + 1}</span>
              <span className="flex-1 truncate">{p.variant_id}</span>
              <span className={`px-2 py-0.5 rounded text-xs ${velocityColor(p.velocity)}`}>
                {p.velocity}
              </span>
              <span className="font-mono w-16 text-right">{p.health_score}</span>
              <span className="text-gray-500 w-20 text-right">{p.sales_30d} ventes</span>
            </div>
          ))}
          {(!top_products || top_products.length === 0) && (
            <p className="text-gray-500 text-sm">Aucun score — lancer Agent 1</p>
          )}
        </div>
      </div>

      {/* Recent decisions */}
      <div className="bg-zinc-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">🧠 Dernières décisions IA</h2>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {(recent_decisions || []).map((d, i) => (
            <div key={i} className="text-xs bg-zinc-800 rounded p-2 flex gap-2">
              <span className={`shrink-0 ${d.success ? "text-green-400" : "text-red-400"}`}>
                {d.success ? "✓" : "✗"}
              </span>
              <span className="text-gray-500">[{d.agent}]</span>
              <span className="flex-1">{d.description}</span>
              <span className="text-gray-600 shrink-0">
                {new Date(d.created_at).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
          {(!recent_decisions || recent_decisions.length === 0) && (
            <p className="text-gray-500 text-sm">Aucune décision enregistrée</p>
          )}
        </div>
      </div>

      {/* Content + WhatsApp summary */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-3">📝 Contenu IA</h2>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Publié</span>
            <span>{content.published}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">En attente</span>
            <span>{content.total - content.published}</span>
          </div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-3">📱 WhatsApp</h2>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Messages envoyés ({days}j)</span>
            <span>{whatsapp.sent}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, accent, alert }) {
  return (
    <div className={`rounded-xl p-3 ${alert ? "bg-red-900/30 border border-red-700" : accent ? "bg-emerald-900/30 border border-emerald-700" : "bg-zinc-900"}`}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${alert ? "text-red-400" : accent ? "text-emerald-400" : ""}`}>{value}</div>
    </div>
  );
}

function velocityColor(v) {
  if (v === "fast") return "bg-green-900 text-green-400";
  if (v === "dead") return "bg-red-900 text-red-400";
  if (v === "slow") return "bg-yellow-900 text-yellow-400";
  return "bg-zinc-700 text-gray-300";
}

function segmentLabel(seg) {
  const labels = {
    vip: "👑 VIP",
    active: "🟢 Actifs",
    dormant_30: "💤 Dormants 30j",
    dormant_60: "😴 Dormants 60j",
    dormant_90: "🔴 Dormants 90j",
    new: "🆕 Nouveaux",
    one_time: "1️⃣ Achat unique",
    cart_abandoner: "🛒 Abandon panier",
  };
  return labels[seg] || seg;
}
