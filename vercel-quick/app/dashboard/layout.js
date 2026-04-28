"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSession, clearSession, isTokenExpired, isTokenExpiringSoon } from "@/lib/auth";
import { registerServiceWorker, subscribeToPush, isPushSupported, getPushPermission } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

const NAV = [
  { href: "/dashboard",                      label: "Accueil",         icon: HomeIcon,      badgeKey: null },
  { href: "/dashboard/confirmation",         label: "Confirmation",    icon: PhoneIcon,     badgeKey: null },
  { href: "/dashboard/preparation",          label: "Préparation",     icon: BoxIcon,       badgeKey: null },
  { href: "/dashboard/suivi-zr",             label: "Suivi ZR",        icon: TruckIcon,     badgeKey: null },
  { href: "/dashboard/barrage",              label: "Barrage",         icon: AlertIcon,     badgeKey: null },
  { href: "/dashboard/stock",                label: "Bon de commande", icon: StockIcon,     badgeKey: null },
  { href: "/dashboard/owner/catalogue",      label: "Stock",           icon: CatalogIcon,   badgeKey: null },
  { href: "/dashboard/owner/collections",    label: "Collections",     icon: ColsIcon,      badgeKey: null },
  { href: "/dashboard/pos",                  label: "POS Comptoir",    icon: PosIcon,       badgeKey: null },
  { href: "/dashboard/achats",               label: "Achats",          icon: CartIcon,      badgeKey: null },
  { href: "/dashboard/finance",              label: "Finance",         icon: FinanceIcon,   badgeKey: null },
  { href: "/dashboard/rapport",              label: "Rapport",         icon: ChartIcon,     badgeKey: "rapport" },
  { href: "/dashboard/discussions",          label: "Discussions",     icon: ChatIcon,      badgeKey: "discussions" },
  { href: "/dashboard/notifications",        label: "Notifications",   icon: BellNavIcon,   badgeKey: "notifications" },
  { href: "/dashboard/organisation",         label: "Organisation",    icon: OrgIcon,       badgeKey: null },
  { href: "/dashboard/social-queue",         label: "Créatif 🎬",      icon: CreatifIcon,   badgeKey: null },
  { href: "/dashboard/operations",           label: "Opérations",      icon: OpsIcon,       badgeKey: null },
  { href: "/dashboard/formation",            label: "Formation",       icon: FormationIcon, badgeKey: null },
  { href: "/dashboard/utilisateurs",         label: "Utilisateurs",    icon: UsersIcon,     badgeKey: null, chefOnly: true },
  { href: "/dashboard/database",             label: "Base de données", icon: DatabaseIcon,  badgeKey: null, ownerOnly: true },
  { href: "/dashboard/owner",                label: "Espace Owner",    icon: OwnerIcon,     badgeKey: null, ownerOnly: true },
];

// ── B : Son ping double bip (Web Audio API, sans fichier externe) ─────
function playMentionPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.2;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t); osc.stop(t + 0.3);
    });
  } catch { /* AudioContext indisponible */ }
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState("idle"); // idle | asking | granted | denied
  const [badges, setBadges] = useState({ discussions: 0, rapport: 0, notifications: 0 });
  const userRef = useRef(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);

  // ── Session expiry ──
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionExpiringSoon, setSessionExpiringSoon] = useState(false);

  // ── A : Bannière mentions urgentes ──
  const [pendingMentions, setPendingMentions] = useState([]); // mentions non lues
  const titleIntervalRef = useRef(null);

  // ── Centre de notifications ──
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [notifs,      setNotifs]      = useState([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const notifRef = useRef(null);

  function getLastSeenNotifs() {
    try { return localStorage.getItem("last_seen_notifications") || "2020-01-01T00:00:00Z"; } catch { return "2020-01-01T00:00:00Z"; }
  }
  function markNotifsRead() {
    try { localStorage.setItem("last_seen_notifications", new Date().toISOString()); } catch {}
    setNotifUnread(0);
  }

  // ── A : gestion bannière mentions ──
  function dismissMention(mentionId) {
    setPendingMentions(prev => {
      const updated = prev.filter(m => m.id !== mentionId);
      try {
        const dismissed = JSON.parse(localStorage.getItem("dismissed_mentions") || "[]");
        localStorage.setItem("dismissed_mentions", JSON.stringify([...dismissed, mentionId]));
      } catch {}
      return updated;
    });
  }
  function dismissAllMentions() {
    setPendingMentions(prev => {
      const ids = prev.map(m => m.id);
      try {
        const dismissed = JSON.parse(localStorage.getItem("dismissed_mentions") || "[]");
        localStorage.setItem("dismissed_mentions", JSON.stringify([...dismissed, ...ids]));
      } catch {}
      // Marquer is_read = true dans la DB (fire & forget)
      if (ids.length > 0) {
        supabase.from("notifications_log")
          .update({ is_read: true })
          .in("id", ids)
          .then(() => {});
      }
      return [];
    });
  }

  // ── A : clignotement titre onglet ──
  function startTitleBlink(mentionCount) {
    if (titleIntervalRef.current) return; // déjà en cours
    const originalTitle = document.title;
    let toggle = false;
    titleIntervalRef.current = setInterval(() => {
      document.title = toggle
        ? `🔴 ${mentionCount} mention${mentionCount > 1 ? "s" : ""}!`
        : originalTitle;
      toggle = !toggle;
    }, 900);
  }
  function stopTitleBlink() {
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
      titleIntervalRef.current = null;
      document.title = "NajmCoiff Dashboard";
    }
  }

  // Stopper le clignotement quand plus de mentions en attente
  useEffect(() => {
    if (pendingMentions.length === 0) {
      stopTitleBlink();
    } else {
      startTitleBlink(pendingMentions.length);
    }
  }, [pendingMentions.length]); // eslint-disable-line

  // ── Helpers badge ──
  function getLastVisit(key) {
    try { return localStorage.getItem(key) || "2020-01-01T00:00:00Z"; } catch { return "2020-01-01T00:00:00Z"; }
  }
  function setLastVisit(key) {
    try { localStorage.setItem(key, new Date().toISOString()); } catch {}
  }

  // ── Reset badge quand on est sur la page ──
  useEffect(() => {
    if (pathname === "/dashboard/discussions" || pathname.startsWith("/dashboard/discussions")) {
      // Le badge se réinitialise quand on entre dans la page discussions
      // Les compteurs par salon sont gérés par salon_reads directement dans la page
      setBadges(b => ({ ...b, discussions: 0 }));
      setLastVisit("last_visit_discussions");
    }
    if (pathname === "/dashboard/rapport" || pathname.startsWith("/dashboard/rapport")) {
      setBadges(b => ({ ...b, rapport: 0 }));
      setLastVisit("last_visit_rapport");
    }
    if (pathname === "/dashboard/notifications") {
      setBadges(b => ({ ...b, notifications: 0 }));
      markNotifsRead();
    }
  }, [pathname]);

  // Capture l'event beforeinstallprompt (Chrome Android / Edge)
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    // Vérifier si déjà installée
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstallDismissed(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
      setInstallDismissed(true);
    }
  }

  useEffect(() => {
    const s = getSession();
    if (!s?.token) { router.replace("/"); return; }
    // Vérifier si le token est expiré (décodage du payload base64)
    try {
      const parts = s.token.split(".");
      if (parts.length >= 2) {
        const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        const exp = payload.exp || 0;
        if (exp && exp < Date.now()) {
          clearSession();
          router.replace("/?session_expired=1");
          return;
        }
      }
    } catch { /* token legacy — laisser passer, sera rejeté par l'API si nécessaire */ }
    setUser(s.user);
    userRef.current = s.user;

    // Enregistrement SW + push
    if (isPushSupported()) {
      registerServiceWorker().then(() => {
        const perm = getPushPermission();
        if (perm === "granted") {
          subscribeToPush(s.user?.nom);
          setPushStatus("granted");
        } else if (perm === "default") {
          setPushStatus("asking");
        } else {
          setPushStatus("denied");
        }
      });
    }

    // ── Badge Discussions : total messages non lus (via salon_reads) ──
    const userName = s.user?.nom || "";
    supabase.from("salon_reads").select("salon_id, last_read_at").eq("user_nom", userName)
      .then(async ({ data: reads }) => {
        const readsMap = {};
        (reads || []).forEach(r => { readsMap[r.salon_id] = r.last_read_at; });
        // Fetch all salons then sum unread counts
        const { data: salons } = await supabase.from("salons").select("id");
        if (!salons?.length) {
          // Fallback: count tous les messages récents non lus
          const lastDisc = getLastVisit("last_visit_discussions");
          const { count } = await supabase.from("messages")
            .select("id", { count: "exact", head: true })
            .gt("created_at", lastDisc)
            .neq("auteur_nom", userName);
          if (count > 0) setBadges(b => ({ ...b, discussions: count }));
          return;
        }
        // Pour les salons sans entrée salon_reads, utiliser "maintenant" comme
        // point de départ (pas "2020") pour éviter l'explosion du compteur
        const defaultCutoff = new Date().toISOString();
        let total = 0;
        await Promise.all(salons.map(async (salon) => {
          const lastRead = readsMap[salon.id] || defaultCutoff;
          const { count } = await supabase.from("messages")
            .select("id", { count: "exact", head: true })
            .eq("salon_id", salon.id)
            .gt("created_at", lastRead)
            .neq("auteur_nom", userName);
          total += (count || 0);
        }));
        if (total > 0) setBadges(b => ({ ...b, discussions: total }));
      });

    // ── Badge Rapport : count rapports non lus (depuis GAS) ──
    const lastRapp = getLastVisit("last_visit_rapport");
    api.countNewRapports(lastRapp)
      .then(d => { if (d?.count > 0) setBadges(b => ({ ...b, rapport: d.count })); })
      .catch(() => {});

    // ── Notifications center : initial load ──
    // Filtre : (target_user IS NULL OR target_user = moi) AND (excluded_user IS NULL OR excluded_user != moi)
    // IMPORTANT : deux appels .or() séparés créent ?or=...&or=... — PostgREST n'applique que le dernier.
    // Solution : un seul .or() avec les 4 combinaisons valides (forme canonique).
    const lastSeen = getLastSeenNotifs();
    const myName = s.user?.nom || "";
    supabase
      .from("notifications_log")
      .select("*")
      .or(
        `and(target_user.is.null,excluded_user.is.null),` +
        `and(target_user.is.null,excluded_user.neq.${myName}),` +
        `and(target_user.eq.${myName},excluded_user.is.null),` +
        `and(target_user.eq.${myName},excluded_user.neq.${myName})`
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) {
          // Filtrage client-side en filet de sécurité (double vérification)
          const filtered = data.filter(n => {
            const isForMe = !n.target_user || n.target_user === myName;
            const notExcluded = !n.excluded_user || n.excluded_user !== myName;
            return isForMe && notExcluded;
          });
          setNotifs(filtered);
          const unread = filtered.filter(n => new Date(n.created_at) > new Date(lastSeen)).length;
          // ── A : charger mentions non lues (moins de 24h) au démarrage ──
          try {
            const dismissed = JSON.parse(localStorage.getItem("dismissed_mentions") || "[]");
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const pendingOnLoad = filtered.filter(n =>
              n.target_user === myName &&
              n.title?.toLowerCase().includes("mention") &&
              !n.is_read &&
              !dismissed.includes(n.id) &&
              n.created_at > cutoff
            );
            if (pendingOnLoad.length > 0) setPendingMentions(pendingOnLoad);
          } catch {}
          setNotifUnread(unread);
          setBadges(b => ({ ...b, notifications: unread }));
        }
      });

    // ── Realtime : notifications ciblées (target_user = moi) — filtre SERVEUR ──
    // Filtre côté serveur : Supabase n'envoie que les lignes où target_user = myName
    // → najm ne reçoit JAMAIS une notif destinée à soheib ou quelqu'un d'autre
    const subNotifTargeted = supabase
      .channel("layout-notifs-targeted")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications_log",
        filter: `target_user=eq.${myName}`,
      }, payload => {
        const notif = payload.new;
        setNotifs(prev => [notif, ...prev].slice(0, 50));
        if (!notifRef.current) {
          setNotifUnread(n => n + 1);
          setBadges(b => ({ ...b, notifications: b.notifications + 1 }));
        }
        // ── mention directe → bannière rouge + ping sonore + vibration ──
        if (notif.title?.toLowerCase().includes("mention")) {
          try {
            const dismissed = JSON.parse(localStorage.getItem("dismissed_mentions") || "[]");
            if (!dismissed.includes(notif.id)) {
              setPendingMentions(prev => [...prev, notif]);
              playMentionPing();
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
          } catch { setPendingMentions(prev => [...prev, notif]); }
        }
      })
      .subscribe();

    // ── Realtime : notifications broadcast (target_user IS NULL) — filtre SERVEUR ──
    // Filtre côté serveur : Supabase n'envoie que les lignes sans target_user
    // → exclure uniquement si excluded_user = moi (vérification JS légère)
    const subNotifBroadcast = supabase
      .channel("layout-notifs-broadcast")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications_log",
        filter: `target_user=is.null`,
      }, payload => {
        const notif = payload.new;
        const me = userRef.current?.nom || "";
        // Exclure si cette notif est explicitement exclue pour moi
        if (notif.excluded_user && notif.excluded_user === me) return;
        setNotifs(prev => [notif, ...prev].slice(0, 50));
        if (!notifRef.current) {
          setNotifUnread(n => n + 1);
          setBadges(b => ({ ...b, notifications: b.notifications + 1 }));
        }
      })
      .subscribe();

    // ── Realtime : nouveaux messages discussions ──
    const subDisc = supabase
      .channel("badge-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
        const msg = payload.new;
        const u = userRef.current;
        const onDiscPage = window.location.pathname.startsWith("/dashboard/discussions");
        if (!onDiscPage && msg.auteur_nom !== u?.nom) {
          setBadges(b => ({ ...b, discussions: b.discussions + 1 }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subNotifTargeted);
      supabase.removeChannel(subNotifBroadcast);
      supabase.removeChannel(subDisc);
    };
  }, [router]);

  // ── Timer périodique : vérification expiration token (toutes les 60s) ──
  useEffect(() => {
    function checkExpiry() {
      if (isTokenExpired()) {
        clearSession();
        setSessionExpired(true);
        return;
      }
      // Avertissement 5 minutes avant expiration
      if (isTokenExpiringSoon(5 * 60 * 1000)) {
        setSessionExpiringSoon(true);
      }
    }
    checkExpiry(); // vérification immédiate au mount
    const interval = setInterval(checkExpiry, 60_000); // toutes les 60 secondes
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  // ── Écoute event session:expired émis par api.js ──
  useEffect(() => {
    function onSessionExpired() {
      clearSession();
      setSessionExpired(true);
    }
    window.addEventListener("session:expired", onSessionExpired);
    return () => window.removeEventListener("session:expired", onSessionExpired);
  }, []);

  function handleReconnect() {
    clearSession();
    router.replace("/");
  }

  async function activerNotifications() {
    setPushStatus("idle");
    const ok = await subscribeToPush(user?.nom);
    setPushStatus(ok ? "granted" : "denied");
  }

  function logout() {
    clearSession();
    router.replace("/");
  }

  // ── Modale session expirée (bloquante) ──
  if (sessionExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900/95 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Session expirée</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Votre session de 24h est terminée.<br/>
            Reconnectez-vous pour continuer.
          </p>
          <button
            onClick={handleReconnect}
            className="w-full bg-gray-900 text-white font-semibold py-3 px-4 rounded-xl hover:bg-gray-800 transition text-sm"
          >
            Se reconnecter →
          </button>
        </div>
      </div>
    );
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-pulse text-gray-400 text-sm">Chargement…</div>
    </div>
  );

  const roleColors = {
    admin: "bg-gray-900 text-white",
    responsable: "bg-amber-100 text-amber-800",
    agent: "bg-blue-100 text-blue-800",
  };
  const badge = roleColors[user.role] || "bg-gray-100 text-gray-700";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static z-30 h-full w-64 bg-white border-r border-gray-100
        flex flex-col transition-transform duration-200 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        {/* Logo + brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
          <div className="relative w-9 h-9 shrink-0">
            <Image src="/logo.png" alt="NC" fill className="object-contain" />
          </div>
          <span className="font-bold text-gray-900 text-base tracking-tight">NAJM COIFF</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.filter(({ ownerOnly, chefOnly }) => {
            const r = (user?.role || "").toLowerCase();
            if (ownerOnly) return r === "owner";
            if (chefOnly) return r === "owner" || r.includes("chef");
            return true;
          }).map(({ href, label, icon: Icon, badgeKey }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            const badgeCount = badgeKey ? (badges[badgeKey] || 0) : 0;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition
                  ${active
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
              >
                <Icon size={17} />
                <span className="flex-1">{label}</span>
                {badgeCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none
                    ${active ? "bg-white text-gray-900" : "bg-red-500 text-white"}`}>
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User card */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-700">
              {(user.nom || "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user.nom}</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${badge}`}>
                {user.role || "agent"}
              </span>
            </div>
          </div>
          {/* Bouton installer PWA */}
          {installPrompt && !installDismissed && (
            <button
              onClick={handleInstall}
              className="w-full text-xs font-semibold text-indigo-600 hover:text-white hover:bg-indigo-600
                py-2 px-2 rounded-lg transition text-left flex items-center gap-2 border border-indigo-200 hover:border-indigo-600 mb-1.5"
            >
              <span className="text-base">📲</span>
              <span>Installer l&apos;application</span>
            </button>
          )}
          <button
            onClick={logout}
            className="w-full text-xs text-gray-400 hover:text-red-600 hover:bg-red-50
              py-1.5 px-2 rounded-lg transition text-left"
          >
            ← Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-4 shrink-0 relative">
          <button
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 transition"
            onClick={() => setSidebarOpen(o => !o)}
          >
            <MenuIcon size={20} />
          </button>
          <h2 className="text-sm font-semibold text-gray-700 flex-1">
            {NAV.find(n => pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href)))?.label || "Dashboard"}
          </h2>
          <span className="text-xs text-gray-400 hidden sm:block">
            {new Date().toLocaleDateString("fr-DZ", { weekday: "short", day: "numeric", month: "short" })}
          </span>

          {/* ── Cloche de notifications ── */}
          <div className="relative">
            <button
              onClick={() => {
                const next = !notifOpen;
                setNotifOpen(next);
                notifRef.current = next;
                if (next) markNotifsRead();
              }}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-600"
              aria-label="Notifications"
            >
              <BellIcon size={19} />
              {notifUnread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center leading-none">
                  {notifUnread > 9 ? "9+" : notifUnread}
                </span>
              )}
            </button>

            {/* Panneau dropdown */}
            {notifOpen && (
              <>
                {/* Overlay pour fermer */}
                <div className="fixed inset-0 z-40" onClick={() => { setNotifOpen(false); notifRef.current = false; }} />
                <div className="absolute right-0 top-11 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                  {/* Header panneau */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900 text-sm">Notifications</h3>
                    <button
                      onClick={() => { setNotifOpen(false); notifRef.current = false; }}
                      className="text-gray-400 hover:text-gray-700 text-lg leading-none"
                    >✕</button>
                  </div>

                  {/* Liste */}
                  <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-50">
                    {notifs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <span className="text-3xl">🔔</span>
                        <p className="text-sm text-gray-400">Aucune notification</p>
                      </div>
                    ) : notifs.map(n => {
                      const ts  = new Date(n.created_at);
                      const now = new Date();
                      const diff = Math.floor((now - ts) / 60000);
                      const timeLabel =
                        diff < 1 ? "à l'instant"
                        : diff < 60 ? `il y a ${diff} min`
                        : diff < 1440 ? `il y a ${Math.floor(diff / 60)}h`
                        : ts.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) +
                          " · " + ts.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

                      const typeIcon =
                        n.type === "mention"  ? "💬"
                        : n.type === "rapport" ? "📊"
                        : n.type === "note"    ? "📌"
                        : n.type === "shooting" ? "📸"
                        : n.type === "retour"  ? "📦"
                        : "🔔";

                      const content = (
                        <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                          <span className="text-xl flex-shrink-0 mt-0.5">{typeIcon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 leading-snug">{n.title}</p>
                            {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">{n.body}</p>}
                            <p className="text-[10px] text-gray-400 mt-1">
                              {n.from_user && <span className="font-medium text-gray-500">{n.from_user} · </span>}
                              {timeLabel}
                            </p>
                          </div>
                          {n.url && (
                            <span className="text-xs text-indigo-500 flex-shrink-0 mt-1 font-medium">Voir ›</span>
                          )}
                        </div>
                      );

                      return n.url ? (
                        <Link
                          key={n.id}
                          href={n.url}
                          onClick={() => { setNotifOpen(false); notifRef.current = false; }}
                        >
                          {content}
                        </Link>
                      ) : (
                        <div key={n.id}>{content}</div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  {notifs.length > 0 && (
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 text-center">
                      <p className="text-xs text-gray-400">{notifs.length} notification{notifs.length > 1 ? "s" : ""} · 50 dernières</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {/* ── A : Bannière mentions urgentes — seul "Voir" ferme la bannière ── */}
        {pendingMentions.length > 0 && (
          <div className="bg-red-600 px-4 py-2.5 flex items-center gap-3 shrink-0 animate-pulse">
            <span className="text-white text-lg shrink-0">🔴</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">
                {pendingMentions.length === 1
                  ? `📣 ${pendingMentions[0].from_user || "Quelqu'un"} t'a mentionné dans Discussions`
                  : `📣 ${pendingMentions.length} mentions non lues dans Discussions`}
              </p>
              <p className="text-red-200 text-xs truncate">
                {pendingMentions[pendingMentions.length - 1]?.body || "Tu dois lire ce message"}
              </p>
            </div>
            <Link
              href="/dashboard/discussions"
              onClick={dismissAllMentions}
              className="text-white text-xs font-bold bg-red-800 hover:bg-red-900 px-3 py-1.5 rounded-lg shrink-0 transition whitespace-nowrap"
            >
              Lire maintenant →
            </Link>
          </div>
        )}

        {/* Bannière session expire bientôt */}
        {sessionExpiringSoon && !sessionExpired && (
          <div className="bg-orange-50 border-b border-orange-100 px-4 py-2.5 flex items-center gap-3 shrink-0">
            <span className="text-lg shrink-0">⏱️</span>
            <p className="text-sm text-orange-800 flex-1">
              Votre session expire dans moins de 5 minutes.
            </p>
            <button
              onClick={handleReconnect}
              className="text-xs font-semibold bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 transition shrink-0">
              Se reconnecter
            </button>
            <button
              onClick={() => setSessionExpiringSoon(false)}
              className="text-xs text-orange-500 hover:text-orange-700 shrink-0">
              ✕
            </button>
          </div>
        )}

        {/* Bannière notifications */}
        {pushStatus === "asking" && (
          <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex items-center gap-3 shrink-0">
            <span className="text-lg">🔔</span>
            <p className="text-sm text-amber-800 flex-1">
              Activer les notifications push pour recevoir les messages et alertes sur votre téléphone.
            </p>
            <button onClick={activerNotifications}
              className="text-xs font-semibold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition shrink-0">
              Activer
            </button>
            <button onClick={() => setPushStatus("denied")}
              className="text-xs text-amber-600 hover:text-amber-800 shrink-0">
              Plus tard
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── Icônes SVG inline ── */
function HomeIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/></svg>;
}
function PhoneIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 8a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/></svg>;
}
function BoxIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function TruckIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
}
function AlertIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}
function StockIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
}
function CartIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
}
function FinanceIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
}
function ChartIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
}
function MenuIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function ChatIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function OrgIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}
function CreatifIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
}
function CampaignIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function WarRoomIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>;
}
function OpsIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
}
function BellIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function BellNavIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="5" r="3" fill="currentColor" stroke="none" className="text-orange-400"/></svg>;
}
function FormationIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>;
}
function UsersIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function DatabaseIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
}
function AdminIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function OwnerIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/><path d="M12 12v9"/><path d="M8 16h8"/></svg>;
}
function PosIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/></svg>;
}
function CatalogIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
}
function ColsIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
}
