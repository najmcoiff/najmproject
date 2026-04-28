"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// ── Helpers temps ─────────────────────────────────────────────────
function timeAgo(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 60000);
  if (diff < 1)    return "à l'instant";
  if (diff < 60)   return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.floor(diff / 60)}h`;
  if (diff < 2880) return "hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) +
         " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(ts) {
  const d   = new Date(ts);
  const now = new Date();
  const hier = new Date(); hier.setDate(hier.getDate() - 1);
  if (d.toDateString() === now.toDateString())  return "Aujourd'hui";
  if (d.toDateString() === hier.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

const TYPE_META = {
  mention:    { icon: "💬", label: "Mention",    color: "bg-blue-100 text-blue-700" },
  discussion: { icon: "💬", label: "Discussion", color: "bg-blue-100 text-blue-700" },
  rapport:    { icon: "📊", label: "Rapport",    color: "bg-purple-100 text-purple-700" },
  note:       { icon: "📌", label: "Note",       color: "bg-amber-100 text-amber-700" },
  quota:      { icon: "📦", label: "Quota",      color: "bg-orange-100 text-orange-700" },
  retour:     { icon: "📦", label: "Retour",     color: "bg-red-100 text-red-700" },
  shooting:   { icon: "📸", label: "Shooting",   color: "bg-pink-100 text-pink-700" },
  cloture:    { icon: "🌅", label: "Clôture",    color: "bg-orange-100 text-orange-700" },
  general:    { icon: "🔔", label: "Général",    color: "bg-gray-100 text-gray-600" },
};

function getMeta(type) {
  return TYPE_META[type] || TYPE_META.general;
}

const FILTERS = [
  { key: "tous",       label: "Tout" },
  { key: "mention",    label: "Mentions" },
  { key: "discussion", label: "Discussions" },
  { key: "rapport",    label: "Rapports" },
  { key: "quota",      label: "Quota" },
  { key: "cloture",   label: "Clôtures" },
  { key: "general",    label: "Général" },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [notifs,   setNotifs]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("tous");
  const [page,     setPage]     = useState(0);
  const [hasMore,  setHasMore]  = useState(true);
  const myNameRef = useRef("");
  const PAGE_SIZE = 50;

  const load = useCallback(async (reset = false, myName = "") => {
    setLoading(true);
    const from = reset ? 0 : page * PAGE_SIZE;
    // Filtre : (target_user IS NULL OR target_user = moi) AND (excluded_user IS NULL OR excluded_user != moi)
    const { data } = await supabase
      .from("notifications_log")
      .select("*")
      .or(
        `and(target_user.is.null,excluded_user.is.null),` +
        `and(target_user.is.null,excluded_user.neq.${myName}),` +
        `and(target_user.eq.${myName},excluded_user.is.null),` +
        `and(target_user.eq.${myName},excluded_user.neq.${myName})`
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (data) {
      // Double vérification côté client
      const filtered = data.filter(n => {
        const isForMe = !n.target_user || n.target_user === myName;
        const notExcluded = !n.excluded_user || n.excluded_user !== myName;
        return isForMe && notExcluded;
      });
      setNotifs(reset ? filtered : prev => [...prev, ...filtered]);
      setHasMore(data.length === PAGE_SIZE);
      if (!reset) setPage(p => p + 1);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    const s = getSession();
    if (!s?.token) { router.replace("/"); return; }
    const myName = s.user?.nom || "";
    myNameRef.current = myName;

    load(true, myName);

    // Realtime canal 1 : notifications ciblées (target_user = moi) — filtre SERVEUR
    const chTargeted = supabase
      .channel("notifs-page-targeted")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications_log",
        filter: `target_user=eq.${myName}`,
      }, payload => {
        setNotifs(prev => [payload.new, ...prev]);
      })
      .subscribe();

    // Realtime canal 2 : notifications broadcast (target_user IS NULL) — filtre SERVEUR
    const chBroadcast = supabase
      .channel("notifs-page-broadcast")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications_log",
        filter: `target_user=is.null`,
      }, payload => {
        const notif = payload.new;
        const me = myNameRef.current;
        if (notif.excluded_user && notif.excluded_user === me) return;
        setNotifs(prev => [notif, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chTargeted);
      supabase.removeChannel(chBroadcast);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtrage local
  const filtered = notifs.filter(n => {
    if (filter === "tous") return true;
    return (n.type || "general") === filter;
  });

  // Grouper par date
  const grouped = [];
  let lastLabel = null;
  filtered.forEach(n => {
    const lbl = dateLabel(n.created_at);
    if (lbl !== lastLabel) {
      grouped.push({ type: "sep", label: lbl, key: "sep_" + n.id });
      lastLabel = lbl;
    }
    grouped.push({ type: "notif", data: n, key: n.id });
  });

  const counts = {};
  notifs.forEach(n => {
    const t = n.type || "general";
    counts[t] = (counts[t] || 0) + 1;
  });

  return (
    <div className="max-w-2xl mx-auto pb-16">

      {/* Header */}
      <div className="flex items-center justify-between pt-2 pb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🔔 Journal des notifications</h1>
          <p className="text-sm text-gray-400 mt-0.5">{notifs.length} notification{notifs.length !== 1 ? "s" : ""} enregistrée{notifs.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {FILTERS.map(f => {
          const cnt = f.key === "tous"
            ? notifs.length
            : (counts[f.key] || 0);
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors
                ${filter === f.key
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-200 text-gray-600 bg-white hover:border-gray-400"}`}>
              {f.label}
              {cnt > 0 && (
                <span className={`ml-1.5 text-[10px] ${filter === f.key ? "text-white/70" : "text-gray-400"}`}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Liste */}
      {loading && notifs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-sm">Chargement…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <span className="text-5xl">🔔</span>
          <p className="text-sm font-medium">Aucune notification</p>
          <p className="text-xs">Les notifications apparaîtront ici dès qu&apos;elles sont envoyées.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {grouped.map(item => {
            if (item.type === "sep") {
              return (
                <div key={item.key} className="flex items-center gap-3 py-2 pt-4 first:pt-0">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{item.label}</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              );
            }

            const n    = item.data;
            const meta = getMeta(n.type);
            const card = (
              <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group">
                <div className="flex items-start gap-3">
                  {/* Icône type */}
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-lg flex-shrink-0 group-hover:border-gray-200 transition-colors">
                    {meta.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Titre + badge type */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">{n.title || "—"}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>

                    {/* Corps */}
                    {n.body && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                    )}

                    {/* Méta : from + time */}
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
                      {n.from_user && (
                        <>
                          <span className="font-medium text-gray-500">👤 {n.from_user}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>{timeAgo(n.created_at)}</span>
                      {n.url && (
                        <>
                          <span>·</span>
                          <span className="text-indigo-500 font-medium">Voir ›</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );

            return n.url ? (
              <Link key={item.key} href={n.url}>{card}</Link>
            ) : (
              <div key={item.key}>{card}</div>
            );
          })}

          {/* Charger plus */}
          {hasMore && (
            <div className="pt-4 text-center">
              <button
                onClick={() => load(false, myNameRef.current)}
                disabled={loading}
                className="text-sm px-5 py-2.5 border border-gray-200 bg-white rounded-xl text-gray-600 hover:border-gray-400 transition-colors disabled:opacity-50"
              >
                {loading ? "Chargement…" : "Charger plus"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
