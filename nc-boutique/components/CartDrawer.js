"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/utils";

// ─── Ouvre le drawer depuis n'importe où ────────────────────────────────────
export function openCart() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("nc_open_cart"));
  }
}

// ─── Composant principal ────────────────────────────────────────────────────
export default function CartDrawer() {
  const [open, setOpen]               = useState(false);
  const [couponCode, setCouponCode]   = useState("");
  const [coupon, setCoupon]           = useState(null);   // { percentage, nom, code }
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [world, setWorld]             = useState("coiffure");

  const { items, total, updateQty, removeFromCart } = useCart();

  const accent  = world === "onglerie" ? "#e8a0bf" : "#e63012";

  // Remise basée sur la marge : remise_article = (prix_vente - coût) × percentage/100
  // ⚠️  Si coût inconnu → remise = 0 (jamais réduire sur le prix entier)
  function itemMarginDiscount(item) {
    if (!coupon?.percentage) return 0;
    const pp  = coupon.purchase_prices?.[item.variant_id];
    if (pp == null) return 0;           // coût inconnu → pas de remise
    const base = Number(item.price) - Number(pp);
    if (base <= 0) return 0;
    return Math.round(base * coupon.percentage / 100) * Number(item.qty);
  }

  const discount   = coupon ? items.reduce((s, i) => s + itemMarginDiscount(i), 0) : 0;
  const finalTotal = total - discount;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWorld(sessionStorage.getItem("nc_world") || "coiffure");
    }
    function handleOpen() { setOpen(true); }
    window.addEventListener("nc_open_cart", handleOpen);
    return () => window.removeEventListener("nc_open_cart", handleOpen);
  }, []);

  // Fermer avec Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Bloquer le scroll du body quand ouvert
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = open ? "hidden" : "";
    }
    return () => { if (typeof document !== "undefined") document.body.style.overflow = ""; };
  }, [open]);

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    setCoupon(null);
    try {
      const cartItems = items.map((i) => ({
        variant_id: i.variant_id,
        qty:        i.qty,
        price:      i.price,
      }));
      const res  = await fetch("/api/boutique/coupon", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ code, items: cartItems }),
      });
      const data = await res.json();
      if (data.valid) {
        setCoupon(data);
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem("nc_coupon", JSON.stringify(data));
        }
      } else {
        setCouponError(data.error || "الكود غير صحيح");
        sessionStorage.removeItem("nc_coupon");
      }
    } catch {
      setCouponError("خطأ في الاتصال، حاول مجدداً");
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponCode("");
    setCouponError("");
    sessionStorage.removeItem("nc_coupon");
  }

  function handleFinalize() {
    setOpen(false);
    // nc_coupon déjà en sessionStorage — page /commander le lira
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Overlay ──────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background:  "rgba(0,0,0,0.75)",
          opacity:     open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* ── Drawer ───────────────────────────────────────────────────────── */}
      <aside
        data-testid="cart-drawer"
        className="fixed top-0 right-0 h-full z-50 flex flex-col transition-transform duration-300"
        style={{
          width:      "min(420px, 100vw)",
          background: "#161616",
          borderLeft: "1px solid #2a2a2a",
          transform:  open ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
          boxShadow:  open ? "-8px 0 32px rgba(0,0,0,0.6)" : "none",
          willChange: "transform",
        }}
        aria-label="سلة المشتريات"
      >
        {/* ── En-tête ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid #2a2a2a" }}
        >
          <h2 className="text-lg font-bold" style={{ color: "#f5f5f5" }}>
            سلة المشتريات
            {items.length > 0 && (
              <span
                className="mr-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: accent + "22", color: accent }}
              >
                {items.reduce((s, i) => s + Number(i.qty), 0)}
              </span>
            )}
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
            style={{ color: "#a0a0a0", background: "#1e1e1e" }}
            aria-label="إغلاق"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Corps — liste articles ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <span className="text-5xl mb-4">🛒</span>
              <p className="font-semibold" style={{ color: "#a0a0a0" }}>السلة فارغة</p>
              <p className="text-sm mt-1" style={{ color: "#555" }}>أضف منتجات للمتابعة</p>
              <button
                onClick={() => setOpen(false)}
                className="mt-6 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors"
                style={{ background: accent, color: "#fff" }}
              >
                تصفح المنتجات
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.variant_id}
                className="flex items-start gap-3 rounded-2xl p-3"
                style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}
              >
                {/* Image */}
                <div
                  className="w-16 h-16 shrink-0 rounded-xl overflow-hidden"
                  style={{ background: "#2a2a2a" }}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#444" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p dir="ltr" className="text-sm font-semibold line-clamp-2 text-right" style={{ color: "#f5f5f5" }}>
                    {item.title}
                  </p>
                  {item.variant_title && item.variant_title !== "Default Title" && (
                    <p className="text-xs mt-0.5" style={{ color: "#666" }}>{item.variant_title}</p>
                  )}
                  {(() => {
                    const originalTotal  = Number(item.price) * Number(item.qty);
                    const discountAmt    = itemMarginDiscount(item);
                    const discountedTotal = originalTotal - discountAmt;
                    if (discountAmt > 0) {
                      return (
                        <div className="mt-1">
                          <span className="text-xs" style={{ color: "#555", textDecoration: "line-through" }}>
                            {formatPrice(originalTotal)}
                          </span>
                          <span className="text-sm font-bold mr-1.5" style={{ color: "#22c55e" }}>
                            {formatPrice(discountedTotal)}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <p className="text-sm font-bold mt-1" style={{ color: accent }}>
                        {formatPrice(originalTotal)}
                      </p>
                    );
                  })()}

                  {/* Contrôle quantité + supprimer */}
                  <div className="flex items-center justify-between mt-2">
                    <div
                      className="flex items-center rounded-lg overflow-hidden"
                      style={{ border: "1px solid #2a2a2a" }}
                    >
                      <button
                        onClick={() => updateQty(item.variant_id, item.qty - 1)}
                        className="w-8 h-8 flex items-center justify-center text-sm font-bold transition-colors"
                        style={{ color: "#f5f5f5", background: "transparent" }}
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-sm font-semibold" style={{ color: "#f5f5f5" }}>
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateQty(item.variant_id, Math.min(item.qty + 1, item.max_qty || 99))}
                        className="w-8 h-8 flex items-center justify-center text-sm font-bold transition-colors"
                        style={{ color: "#f5f5f5", background: "transparent" }}
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.variant_id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                      style={{ color: "#e63012", background: "rgba(230,48,18,0.1)" }}
                      aria-label="إزالة"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Pied — coupon + total + bouton ──────────────────────────── */}
        {items.length > 0 && (
          <div className="shrink-0 px-4 pb-6 pt-3 space-y-4" style={{ borderTop: "1px solid #2a2a2a" }}>

            {/* Code partenaire */}
            {!coupon ? (
              <div>
                <p className="text-xs mb-1.5" style={{ color: "#a0a0a0" }}>أدخل كود الشريك</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                    placeholder="PARTNER-CODE"
                    dir="ltr"
                    className="flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                    style={{
                      background: "#1e1e1e",
                      border: `1px solid ${couponError ? "#e63012" : "#2a2a2a"}`,
                      color: "#f5f5f5",
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
                  />
                  <button
                    onClick={applyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                    style={{ background: accent, color: "#fff" }}
                  >
                    {couponLoading ? "..." : "تطبيق"}
                  </button>
                </div>
                {couponError && (
                  <p className="text-xs mt-1.5" style={{ color: "#e63012" }}>{couponError}</p>
                )}
              </div>
            ) : (
              <div
                className="flex items-center justify-between rounded-xl px-3 py-2.5"
                style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}
              >
                <div>
                  <p className="text-xs font-bold" style={{ color: "#22c55e" }}>
                    ✓ كود الشريك {coupon.code}
                  </p>
                  <p className="text-xs" style={{ color: "#a0a0a0" }}>{coupon.nom}</p>
                </div>
                <button onClick={removeCoupon} className="text-xs" style={{ color: "#a0a0a0" }}>
                  حذف
                </button>
              </div>
            )}

            {/* Totaux */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm" style={{ color: "#a0a0a0" }}>
                <span>سعر المنتجات</span>
                <span dir="ltr">{formatPrice(total)}</span>
              </div>
              {coupon && discount > 0 && (
                <div className="flex items-center justify-between text-sm" style={{ color: "#22c55e" }}>
                  <span>خصم كود الشريك</span>
                  <span dir="ltr">− {formatPrice(discount)}</span>
                </div>
              )}
              <div
                className="flex items-center justify-between text-base font-bold pt-2"
                style={{ borderTop: "1px solid #2a2a2a", color: "#f5f5f5" }}
              >
                <span>المجموع الفرعي</span>
                <span dir="ltr" style={{ color: accent }}>{formatPrice(finalTotal)}</span>
              </div>
            </div>

            {/* Bouton finaliser */}
            <Link
              href="/commander"
              onClick={handleFinalize}
              className="flex items-center justify-center w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
              style={{ background: accent, color: "#fff" }}
            >
              إنهاء عملية الشراء ←
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
