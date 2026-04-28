"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSession } from "@/lib/auth";
import Link from "next/link";

const OWNER_NAV = [
  { href: "/dashboard/owner",              label: "Vue d'ensemble",    icon: "🏠" },
  { href: "/dashboard/owner/catalogue",    label: "Stock",             icon: "📦" },
  { href: "/dashboard/owner/collections",  label: "Collections",       icon: "📂" },
  { href: "/dashboard/owner/boutique",     label: "Config boutique",   icon: "⚙️" },
  { href: "/dashboard/owner/livraison",    label: "Prix livraison",    icon: "🚚" },
  { href: "/dashboard/owner/banners",      label: "Bannières",         icon: "🖼️" },
  { href: "/dashboard/owner/bi",           label: "KPIs & BI",         icon: "🏥" },
  { href: "/dashboard/owner/analytics",    label: "Analytics",         icon: "📊" },
  { href: "/dashboard/owner/marketing",    label: "War Room 🎯",        icon: "🎯" },
  { href: "/dashboard/utilisateurs",       label: "Utilisateurs",      icon: "👥" },
  { href: "/dashboard",                    label: "← Dashboard agents", icon: "◀" },
];

const OPEN_PATHS = ["/dashboard/owner/catalogue", "/dashboard/owner/collections"];

export default function OwnerLayout({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s?.token) { router.replace("/"); return; }
    const role    = (s.user?.role || "").toLowerCase();
    const nom     = (s.user?.nom  || "").toLowerCase();
    const isOwner = role === "owner" || nom === "najm";
    const isOpen  = OPEN_PATHS.some(p => pathname.startsWith(p));
    if (!isOwner && !isOpen) {
      router.replace("/dashboard");
    }
  }, [router, pathname]);

  // Fermer la sidebar au changement de route (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div className="flex h-full gap-0 relative">

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar owner */}
      <aside className={`
        fixed md:relative z-40 md:z-auto
        w-64 md:w-52 shrink-0 bg-gray-900 text-white flex flex-col
        border-r border-gray-700 h-full md:min-h-full
        transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="px-4 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Owner</p>
            <p className="text-sm font-bold text-white">NAJM COIFF</p>
          </div>
          <button
            className="md:hidden text-gray-400 hover:text-white text-xl leading-none px-1"
            onClick={() => setSidebarOpen(false)}
          >✕</button>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {OWNER_NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Zone contenu */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Barre mobile avec bouton hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
          <button
            data-testid="owner-menu-toggle"
            onClick={() => setSidebarOpen(true)}
            className="text-gray-300 hover:text-white p-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <p className="text-sm font-bold text-white">Espace Owner</p>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
          {children}
        </div>
      </div>
    </div>
  );
}
