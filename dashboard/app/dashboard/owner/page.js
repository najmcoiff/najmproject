"use client";
import { useEffect, useState, useCallback } from "react";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const OWNER_CARDS = [
  {
    href:  "/dashboard/owner/catalogue",
    icon:  "📦",
    title: "Catalogue articles",
    desc:  "Créer, modifier, désactiver les articles sans Shopify",
    color: "bg-indigo-50 border-indigo-200",
  },
  {
    href:  "/dashboard/owner/collections",
    icon:  "📂",
    title: "Collections",
    desc:  "Gérer les collections Coiffure et Onglerie",
    color: "bg-violet-50 border-violet-200",
  },
  {
    href:  "/dashboard/owner/boutique",
    icon:  "⚙️",
    title: "Config boutique",
    desc:  "WhatsApp, barre promo, pixels Facebook, réseaux sociaux",
    color: "bg-blue-50 border-blue-200",
  },
  {
    href:  "/dashboard/owner/livraison",
    icon:  "🚚",
    title: "Prix livraison",
    desc:  "58 wilayas — prix domicile et bureau par zone",
    color: "bg-green-50 border-green-200",
  },
  {
    href:  "/dashboard/owner/banners",
    icon:  "🖼️",
    title: "Bannières",
    desc:  "Sliders de la page d'accueil boutique",
    color: "bg-purple-50 border-purple-200",
  },
  {
    href:  "/dashboard/owner/analytics",
    icon:  "📊",
    title: "Analytics",
    desc:  "KPIs boutique, taux de conversion, événements",
    color: "bg-rose-50 border-rose-200",
  },
  {
    href:  "/dashboard/owner/marketing",
    icon:  "🎯",
    title: "War Room",
    desc:  "KPIs marketing globaux, campagnes Meta & WhatsApp, journal IA",
    color: "bg-orange-50 border-orange-200",
  },
  {
    href:  "/dashboard/utilisateurs",
    icon:  "👥",
    title: "Utilisateurs",
    desc:  "Gérer les comptes agents et leurs accès",
    color: "bg-teal-50 border-teal-200",
  },
];

// ── Modal détail event ──────────────────────────────────────────────────
function EventModal({ event, onClose }) {
  if (!event) return null;
  const fmt = (ts) => ts ? new Date(ts).toLocaleString("fr-FR", { timeZone: "Africa/Algiers" }) : "—";
  const fields = [
    { label: "event_id",   val: event.event_id },
    { label: "ts",         val: fmt(event.ts) },
    { label: "log_type",   val: event.log_type },
    { label: "actor",      val: event.actor },
    { label: "order_id",   val: event.order_id },
    { label: "variant_id", val: event.variant_id },
    { label: "tracking",   val: event.tracking },
    { label: "qty",        val: event.qty },
    { label: "montant",    val: event.montant != null ? Number(event.montant).toLocaleString("fr-FR") + " DA" : null },
    { label: "label",      val: event.label },
    { label: "note",       val: event.note },
  ].filter(f => f.val != null && f.val !== "" && f.val !== "—");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${getEventColor(event.log_type)}`}>
              {event.log_type}
            </span>
            <p className="text-xs text-gray-400 mt-1">{fmt(event.ts)}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 text-sm transition-colors">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-2.5 max-h-96 overflow-y-auto">
          {fields.map(f => (
            <div key={f.label} className="flex gap-3 items-start">
              <span className="text-xs text-gray-500 w-24 flex-shrink-0 pt-0.5 font-mono">{f.label}</span>
              <span className="text-sm text-gray-200 break-all">{String(f.val)}</span>
            </div>
          ))}
          {event.extra && Object.keys(event.extra).length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-500 mb-2 font-mono">extra (JSON)</p>
              <pre className="text-xs bg-gray-900 rounded-lg p-3 overflow-x-auto text-gray-300">
                {JSON.stringify(event.extra, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PAGE ESPACE OWNER — Gestion & Monitoring
// ══════════════════════════════════════════════════════════════════

export default function OwnerPage() {
  const [user, setUser]               = useState(null);
  const [health, setHealth]           = useState(null);
  const [stats, setStats]             = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingStats,  setLoadingStats]  = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    const s = getSession();
    if (s?.user) {
      setUser(s.user);
      loadHealth();
      loadStats();
    }
  }, []);

  // ── Santé système ──────────────────────────────────────────────
  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const checks = await Promise.all([
        supabase.from("nc_orders").select("count", { count: "exact", head: true })
          .then(r => ({ name: "nc_orders", ok: !r.error, count: r.count, detail: r.error?.message })),
        supabase.from("nc_variants").select("count", { count: "exact", head: true })
          .then(r => ({ name: "nc_variants", ok: !r.error, count: r.count, detail: r.error?.message })),
        supabase.from("nc_events").select("count", { count: "exact", head: true })
          .then(r => ({ name: "nc_events", ok: !r.error, count: r.count, detail: r.error?.message })),
        supabase.from("nc_users").select("count", { count: "exact", head: true })
          .then(r => ({ name: "nc_users", ok: !r.error, count: r.count, detail: r.error?.message })),
        supabase.from("nc_kpi_stock_view").select("count", { count: "exact", head: true })
          .then(r => ({ name: "Vue KPI Stock", ok: !r.error, count: r.count, detail: r.error?.message })),
        supabase.from("nc_kpi_jamais_vendus_view").select("count", { count: "exact", head: true })
          .then(r => ({ name: "Vue Jamais Vendus", ok: !r.error, count: r.count, detail: r.error?.message })),
      ]);
      setHealth({ checks, ts: new Date().toLocaleTimeString("fr-FR") });
    } catch (e) {
      setHealth({ error: e.message, ts: new Date().toLocaleTimeString("fr-FR") });
    }
    setLoadingHealth(false);
  }, []);

  // ── Stats nc_events ────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: eventsRaw } = await supabase
        .from("nc_events")
        .select("log_type")
        .gte("ts", since7);

      const typeCounts = {};
      (eventsRaw || []).forEach(r => { typeCounts[r.log_type] = (typeCounts[r.log_type] || 0) + 1; });
      const topTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([type, count]) => ({ type, count }));

      const { data: lastEvents } = await supabase
        .from("nc_events")
        .select("event_id, ts, log_type, actor, order_id, variant_id, tracking, qty, montant, label, note, extra")
        .order("ts", { ascending: false })
        .limit(20);

      setStats({ topTypes, lastEvents });
    } catch (e) {
      setStats({ error: e.message });
    }
    setLoadingStats(false);
  }, []);

  if (!user) return <div className="p-6 text-gray-400">Chargement…</div>;

  return (
    <div className="space-y-8">
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />

      {/* ── En-tête ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Espace Owner</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bienvenue {user?.nom || "…"} — Gestion complète de NajmCoiff
          </p>
        </div>
        <button
          onClick={() => { loadHealth(); loadStats(); }}
          className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          🔄 Rafraîchir
        </button>
      </div>

      {/* ── Raccourcis gestion ───────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Accès rapides</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {OWNER_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`block rounded-2xl border p-5 hover:shadow-md transition-shadow ${card.color}`}
            >
              <span className="text-3xl">{card.icon}</span>
              <h2 className="font-bold text-gray-900 mt-3 mb-1">{card.title}</h2>
              <p className="text-sm text-gray-500">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Santé Système ───────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          🔍 Santé Système
          {health?.ts && <span className="text-xs text-gray-400">— {health.ts}</span>}
        </h2>
        {loadingHealth ? (
          <div className="text-gray-400 text-sm animate-pulse">Vérification en cours…</div>
        ) : health?.checks ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {health.checks.map((c, i) => (
              <div key={i} className={`rounded-lg p-3 border ${c.ok ? "bg-green-900/30 border-green-700" : "bg-red-900/30 border-red-700"}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <span>{c.ok ? "✅" : "❌"}</span>
                  <span className="truncate">{c.name}</span>
                </div>
                {c.count != null && (
                  <div className="text-xs text-gray-300 mt-1">{c.count.toLocaleString("fr-FR")} lignes</div>
                )}
                {c.detail && <div className="text-xs text-red-400 mt-1 truncate">{c.detail}</div>}
              </div>
            ))}
          </div>
        ) : health?.error ? (
          <div className="text-red-400 text-sm">❌ {health.error}</div>
        ) : null}
      </div>

      {/* ── Stats nc_events ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top types */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">📊 Top événements (7 derniers jours)</h2>
          {loadingStats ? (
            <div className="text-gray-400 text-sm animate-pulse">Chargement…</div>
          ) : stats?.topTypes ? (
            <div className="space-y-2">
              {stats.topTypes.map((t, i) => {
                const max = stats.topTypes[0]?.count || 1;
                const pct = Math.round((t.count / max) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300 font-mono">{t.type}</span>
                      <span className="text-white font-bold">{t.count.toLocaleString("fr-FR")}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: pct + "%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : stats?.error ? (
            <div className="text-red-400 text-sm">❌ {stats.error}</div>
          ) : null}
        </div>

        {/* Derniers événements */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-1">🕐 Derniers événements</h2>
          <p className="text-xs text-gray-500 mb-3">Cliquez sur une ligne pour voir les détails</p>
          {loadingStats ? (
            <div className="text-gray-400 text-sm animate-pulse">Chargement…</div>
          ) : stats?.lastEvents ? (
            <div className="space-y-0.5 max-h-80 overflow-y-auto">
              {stats.lastEvents.map((ev, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedEvent(ev)}
                  className="w-full flex items-start gap-2 text-xs py-1.5 px-2 rounded-lg border-b border-gray-700/30 hover:bg-gray-700/50 transition-colors text-left cursor-pointer"
                >
                  <span className="text-gray-500 shrink-0 w-14 truncate pt-0.5">
                    {new Date(ev.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded font-mono ${getEventColor(ev.log_type)}`}>
                    {ev.log_type}
                  </span>
                  <span className="text-gray-300 truncate">
                    {ev.label || ev.order_id || ev.variant_id || ev.actor || "–"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Infos système ────────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-3">ℹ️ Informations système</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <InfoItem label="Projet Supabase"   value="alyxejkdtkdmluvgfnqk" />
          <InfoItem label="Dashboard"         value="najmcoiffdashboard.vercel.app" />
          <InfoItem label="Boutique"          value="nc-boutique.vercel.app" />
          <InfoItem label="Environnement"     value={process.env.NODE_ENV || "production"} />
        </div>
      </div>
    </div>
  );
}

// ── Composants helpers ─────────────────────────────────────────────────

function InfoItem({ label, value }) {
  return (
    <div className="bg-gray-700/50 rounded-lg p-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-white font-mono text-xs mt-1 break-all">{value}</div>
    </div>
  );
}

function getEventColor(logType) {
  const map = {
    COMMANDE_RECU_SHOPIFY: "bg-blue-900/60 text-blue-300",
    ORDERS_ITEMS:          "bg-blue-900/40 text-blue-200",
    ZR_WEBHOOK_EVENT:      "bg-yellow-900/60 text-yellow-300",
    COLIS_INJECTER_ZR:     "bg-orange-900/60 text-orange-300",
    STOCK_SNAPSHOT:        "bg-gray-700 text-gray-300",
    STOCK_AUDIT_EVENT:     "bg-purple-900/60 text-purple-300",
    BARRAGE:               "bg-red-900/60 text-red-300",
    EXIT_BARRAGE:          "bg-green-900/60 text-green-300",
    MODIFY_V2:             "bg-indigo-900/60 text-indigo-300",
  };
  return map[logType] || "bg-gray-600/60 text-gray-300";
}
