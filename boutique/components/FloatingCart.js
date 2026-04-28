"use client";
import { useState, useEffect, useRef } from "react";
import { useCart } from "@/lib/cart";
import { openCart } from "@/components/CartDrawer";

export default function FloatingCart() {
  const { count } = useCart();
  const [visible, setVisible] = useState(false);
  const [bounce, setBounce]   = useState(false);
  const [plusOne, setPlusOne] = useState(false);
  const bounceTimer = useRef(null);
  const plusTimer   = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function handleAnim() {
      // Déclencher bounce
      setBounce(false);
      clearTimeout(bounceTimer.current);
      clearTimeout(plusTimer.current);
      // Forcer re-trigger de l'animation (micro-delay)
      requestAnimationFrame(() => {
        setBounce(true);
        setPlusOne(true);
        bounceTimer.current = setTimeout(() => setBounce(false), 700);
        plusTimer.current   = setTimeout(() => setPlusOne(false), 1100);
      });
    }
    window.addEventListener("nc_cart_add_animation", handleAnim);
    return () => {
      window.removeEventListener("nc_cart_add_animation", handleAnim);
      clearTimeout(bounceTimer.current);
      clearTimeout(plusTimer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={openCart}
      aria-label="عرض السلة"
      data-testid="floating-cart-btn"
      className={`fixed bottom-24 left-6 z-50 flex items-center justify-center w-14 h-14 rounded-full transition-all duration-200 hover:scale-110 active:scale-95${bounce ? " cart-icon-bounce" : ""}`}
      style={{
        background: "linear-gradient(145deg, #1c1c1c 0%, #0f0f0f 100%)",
        border: "2px solid #e63012",
        boxShadow: "0 4px 24px rgba(230,48,18,0.45), 0 2px 10px rgba(0,0,0,0.7)",
      }}
    >
      {/* Cart SVG icon */}
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#e63012" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>

      {/* Badge count */}
      {count > 0 && (
        <span
          data-testid="floating-cart-count"
          className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] flex items-center justify-center rounded-full text-white text-[11px] font-bold leading-none px-1"
          style={{
            background: "#e63012",
            boxShadow: "0 2px 10px rgba(230,48,18,0.7)",
            border: "2px solid #0a0a0a",
          }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}

      {/* Flash +1 qui monte */}
      {plusOne && (
        <span
          className="absolute cart-plus-one pointer-events-none select-none text-white font-bold text-sm"
          style={{ textShadow: "0 1px 6px #000" }}
        >
          +1
        </span>
      )}

      {/* Anneau pulsant permanent quand panier non-vide */}
      {count > 0 && (
        <span
          className="absolute inset-0 rounded-full cart-ring-pulse pointer-events-none"
          style={{ border: "2px solid rgba(230,48,18,0.5)" }}
        />
      )}
    </button>
  );
}
