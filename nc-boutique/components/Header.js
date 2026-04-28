"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { openCart } from "@/components/CartDrawer";

export default function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [world, setWorld]         = useState("coiffure");

  // Accent couleur selon le monde actif
  const accent = world === "onglerie" ? "#e8a0bf" : "#e63012";

  useEffect(() => {
    // Lire le monde depuis sessionStorage
    if (typeof window !== "undefined") {
      setWorld(sessionStorage.getItem("nc_world") || "coiffure");
    }

    function updateCount() {
      try {
        const cart  = JSON.parse(localStorage.getItem("nc_cart") || "[]");
        const count = cart.reduce((s, i) => s + (Number(i.qty) || 0), 0);
        setCartCount(count);
      } catch {
        setCartCount(0);
      }
    }
    updateCount();
    window.addEventListener("nc_cart_updated", updateCount);
    return () => window.removeEventListener("nc_cart_updated", updateCount);
  }, []);

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: "#0a0a0a", borderBottom: "1px solid #2a2a2a" }}
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo — Minimal Cut */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <img
            src="/logo.png"
            alt="NAJMCOIFF"
            style={{
              objectFit: "contain",
              mixBlendMode: "screen",
              transition: "transform 0.3s ease",
            }}
            className="w-7 h-7 md:w-9 md:h-9 group-hover:scale-110"
          />
          <div className="flex flex-col leading-none">
            <span
              className="font-bebas uppercase"
              style={{ color: "#f5f5f5", fontSize: "1.25rem", letterSpacing: "0.3em", lineHeight: 1 }}
            >
              NAJM<span style={{ color: "#e63012" }}>COIFF</span>
            </span>
            <span className="text-[9px] font-medium uppercase" style={{ color: "#555", letterSpacing: "0.18em" }}>
              {world === "onglerie" ? "Onglerie · Beauté" : "Coiffure · Barbier"}
            </span>
          </div>
        </Link>

        {/* Navigation desktop */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
          <Link
            href="/produits"
            className="transition-colors"
            style={{ color: "#a0a0a0" }}
            onMouseEnter={e => (e.target.style.color = "#f5f5f5")}
            onMouseLeave={e => (e.target.style.color = "#a0a0a0")}
          >
            المنتجات
          </Link>
          <Link
            href="/suivi"
            className="transition-colors"
            style={{ color: "#a0a0a0" }}
            onMouseEnter={e => (e.target.style.color = "#f5f5f5")}
            onMouseLeave={e => (e.target.style.color = "#a0a0a0")}
          >
            تتبع طلبي
          </Link>
          <Link
            href="/a-propos"
            className="transition-colors"
            style={{ color: "#a0a0a0" }}
            onMouseEnter={e => (e.target.style.color = "#f5f5f5")}
            onMouseLeave={e => (e.target.style.color = "#a0a0a0")}
          >
            من نحن
          </Link>
          <Link
            href="/compte"
            className="transition-colors"
            style={{ color: "#a0a0a0" }}
            onMouseEnter={e => (e.target.style.color = "#f5f5f5")}
            onMouseLeave={e => (e.target.style.color = "#a0a0a0")}
          >
            حسابي
          </Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">

          {/* Panier → ouvre le drawer */}
          <button
            onClick={openCart}
            className="relative flex items-center justify-center w-10 h-10 rounded-full transition-colors"
            style={{ color: "#f5f5f5" }}
            aria-label="السلة"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {cartCount > 0 && (
              <span
                data-testid="cart-count"
                className="absolute -top-1 -left-1 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: accent }}
              >
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </button>

          {/* Burger mobile */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-full transition-colors"
            style={{ color: "#f5f5f5" }}
            aria-label="القائمة"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      {menuOpen && (
        <div
          className="md:hidden px-4 py-3 flex flex-col gap-1"
          style={{ borderTop: "1px solid #2a2a2a", background: "#0f0f0f" }}
        >
          <Link
            href="/produits"
            onClick={() => setMenuOpen(false)}
            className="text-sm font-semibold py-3 px-2 rounded-lg transition-colors"
            style={{ color: "#f5f5f5" }}
          >
            المنتجات
          </Link>
          <Link
            href="/suivi"
            onClick={() => setMenuOpen(false)}
            className="text-sm font-semibold py-3 px-2 rounded-lg transition-colors"
            style={{ color: "#f5f5f5" }}
          >
            تتبع طلبي
          </Link>
          <Link
            href="/compte"
            onClick={() => setMenuOpen(false)}
            className="text-sm font-semibold py-3 px-2 rounded-lg transition-colors"
            style={{ color: "#f5f5f5" }}
          >
            حسابي
          </Link>
          <Link
            href="/a-propos"
            onClick={() => setMenuOpen(false)}
            className="text-sm font-semibold py-3 px-2 rounded-lg transition-colors"
            style={{ color: "#f5f5f5" }}
          >
            من نحن
          </Link>
        </div>
      )}
    </header>
  );
}
