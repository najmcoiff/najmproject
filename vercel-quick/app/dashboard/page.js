"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// ── KPI cards config ─────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
      <div className="text-2xl">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-900 leading-none">{value ?? "—"}</div>
        <div className="text-xs font-medium text-gray-600 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Modules ───────────────────────────────────────────────────────
const MODULES = [
  { href: "/dashboard/confirmation", label: "Confirmation colis",     desc: "Confirmer les commandes par téléphone",         emoji: "📞", color: "bg-blue-50 border-blue-100",   iconBg: "bg-blue-100 text-blue-700"   },
  { href: "/dashboard/preparation",  label: "Préparation de quota",   desc: "Gérer la préparation des commandes",            emoji: "📦", color: "bg-orange-50 border-orange-100", iconBg: "bg-orange-100 text-orange-700" },
  { href: "/dashboard/suivi-zr",     label: "Suivi ZR",               desc: "Suivi des colis ZRExpress en livraison",        emoji: "🚚", color: "bg-purple-50 border-purple-100", iconBg: "bg-purple-100 text-purple-700" },
  { href: "/dashboard/barrage",      label: "Barrage produits",        desc: "Alertes et corrections de stock critique",      emoji: "🚧", color: "bg-red-50 border-red-100",     iconBg: "bg-red-100 text-red-700"     },
  { href: "/dashboard/stock",        label: "Stock & Inventaire",      desc: "Consulter et gérer le stock physique",          emoji: "📋", color: "bg-teal-50 border-teal-100",   iconBg: "bg-teal-100 text-teal-700"   },
  { href: "/dashboard/achats",       label: "Achats & Restock",        desc: "Articles à réapprovisionner",                   emoji: "🛒", color: "bg-amber-50 border-amber-100", iconBg: "bg-amber-100 text-amber-700" },
  { href: "/dashboard/finance",      label: "Finance",                  desc: "Recettes, dépenses, flux de trésorerie",       emoji: "💰", color: "bg-green-50 border-green-100", iconBg: "bg-green-100 text-green-700" },
  { href: "/dashboard/rapport",      label: "Rapport",                  desc: "Rapport opérationnel et tableau de bord",      emoji: "📊", color: "bg-indigo-50 border-indigo-100", iconBg: "bg-indigo-100 text-indigo-700" },
  { href: "/dashboard/retours",      label: "Traiter retours",          desc: "Gestion des retours et bons de retour",        emoji: "↩️", color: "bg-gray-50 border-gray-200",   iconBg: "bg-gray-200 text-gray-600"   },
  { href: "/dashboard/discussions",  label: "Discussions",               desc: "Chat en temps réel avec l'équipe",              emoji: "💬", color: "bg-sky-50 border-sky-100",     iconBg: "bg-sky-100 text-sky-700"     },
  { href: "/dashboard/organisation", label: "Organisation",              desc: "Notes sticky, board équipe et agenda",          emoji: "📌", color: "bg-yellow-50 border-yellow-100", iconBg: "bg-yellow-100 text-yellow-700" },
];

export default function DashboardHome() {
  const [user,    setUser]    = useState(null);
  const [time,    setTime]    = useState(new Date());
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifs,  setNotifs]  = useState([]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.getCompteurs();
      if (res.ok && res.stats) setStats(res.stats);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const s = getSession();
    if (s?.user) setUser(s.user);
    const tick = setInterval(() => setTime(new Date()), 60000);
    loadStats();
    const refresh = setInterval(loadStats, 60000);

    // ── Notifications récentes ──
    supabase
      .from("notifications_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setNotifs(data); });

    const sub = supabase
      .channel("home-notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications_log" }, payload => {
        setNotifs(p => [payload.new, ...p].slice(0, 10));
      })
      .subscribe();

    return () => { clearInterval(tick); clearInterval(refresh); supabase.removeChannel(sub); };
  }, [loadStats]);

  const hour = time.getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-8">

      {/* ── Entête ────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}{user?.nom ? `, ${user.nom}` : ""} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {time.toLocaleDateString("fr-FR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric"
            })}
            {" · "}
            {time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          onClick={loadStats}
          className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
        >
          ↻ Actualiser
        </button>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Tableau de bord — commandes actives
        </h2>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : !stats ? (
          <div className="text-sm text-gray-400">Impossible de charger les statistiques.</div>
        ) : (
          <>
            {/* Ligne 1 : vue globale */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <KpiCard
                icon="📋" label="Total actives"
                value={stats.total}
                color="bg-white border-gray-200"
              />
              <KpiCard
                icon="⏳" label="À traiter"
                value={stats.a_traiter}
                sub={stats.total > 0 ? `${Math.round(stats.a_traiter/stats.total*100)}%` : ""}
                color="bg-white border-gray-200"
              />
              <KpiCard
                icon="✅" label="Confirmées"
                value={stats.confirmes}
                sub={`${stats.taux_confirmation}% taux`}
                color="bg-green-50 border-green-100"
              />
              <KpiCard
                icon="❌" label="Annulées"
                value={stats.annules}
                color="bg-red-50 border-red-100"
              />
            </div>

            {/* Ligne 2 : détails */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                icon="✎" label="À modifier"
                value={stats.a_modifier}
                color="bg-blue-50 border-blue-100"
              />
              <KpiCard
                icon="📞" label="Rappel"
                value={stats.rappels}
                color="bg-yellow-50 border-yellow-100"
              />
              <KpiCard
                icon="📵" label="Injoignables"
                value={stats.injoignables ?? 0}
                sub="Ne répond pas"
                color="bg-amber-50 border-amber-100"
              />
              <KpiCard
                icon="📦" label="Préparées"
                value={stats.prepares}
                color="bg-orange-50 border-orange-100"
              />
            </div>
          </>
        )}
      </div>

      {/* ── Accès rapide ────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Accès rapide
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/discussions"
            className="group flex items-center gap-3 p-4 rounded-2xl border bg-sky-50 border-sky-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center text-xl flex-shrink-0">💬</div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Discussions</p>
              <p className="text-xs text-gray-500">Chat équipe en temps réel</p>
            </div>
            <span className="ml-auto text-gray-300 group-hover:text-gray-500 transition text-lg">›</span>
          </Link>
          <Link href="/dashboard/organisation"
            className="group flex items-center gap-3 p-4 rounded-2xl border bg-yellow-50 border-yellow-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center text-xl flex-shrink-0">📌</div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Organisation</p>
              <p className="text-xs text-gray-500">Notes & agenda équipe</p>
            </div>
            <span className="ml-auto text-gray-300 group-hover:text-gray-500 transition text-lg">›</span>
          </Link>
        </div>
      </div>

      {/* ── Notifications récentes ──────────────────────────────── */}
      {notifs.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Notifications récentes
          </h2>
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
            {notifs.map(n => {
              const ts = new Date(n.created_at);
              const now = new Date();
              const diffMin = Math.floor((now - ts) / 60000);
              const timeLabel = diffMin < 1 ? "à l'instant"
                : diffMin < 60 ? `il y a ${diffMin} min`
                : diffMin < 1440 ? `il y a ${Math.floor(diffMin/60)}h`
                : ts.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
              const typeIcon = n.type === "mention" ? "💬" : n.type === "rapport" ? "📊" : n.type === "note" ? "📌" : "🔔";
              return (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <span className="text-lg flex-shrink-0 mt-0.5">{typeIcon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {n.from_user && <span className="font-medium">{n.from_user} · </span>}
                      {timeLabel}
                    </p>
                  </div>
                  {n.url && (
                    <Link href={n.url} className="text-xs text-indigo-500 hover:text-indigo-700 flex-shrink-0 mt-1 font-medium">
                      Voir ›
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modules ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Modules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.filter(m => m.href !== "/dashboard/discussions" && m.href !== "/dashboard/organisation").map(({ href, label, desc, emoji, color, iconBg }) => (
            <Link
              key={href}
              href={href}
              className={`group flex items-start gap-4 p-5 rounded-2xl border ${color}
                hover:shadow-md hover:-translate-y-0.5 transition-all duration-150`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${iconBg}`}>
                {emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm leading-tight mb-1">{label}</p>
                <p className="text-xs text-gray-500 leading-snug">{desc}</p>
              </div>
              <span className="text-gray-300 group-hover:text-gray-500 transition text-lg self-center">›</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
