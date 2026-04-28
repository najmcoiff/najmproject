"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatPrice, isValidAlgerianPhone, calcCartTotal } from "@/lib/utils";
import { WILAYAS } from "@/lib/constants";
import { trackPageView, trackCheckoutStart, trackCheckoutStep, getSessionId, getUtmParams } from "@/lib/track";
import { readCart, clearCart } from "@/lib/cart";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5" style={{ color: "#a0a0a0" }}>
        {label} {required && <span style={{ color: "#e63012" }}>*</span>}
      </label>
      {children}
      {error && <p className="text-xs mt-1.5" style={{ color: "#e63012" }}>{error}</p>}
    </div>
  );
}

const inputStyle = (hasError, accent) => ({
  width:        "100%",
  background:   "#1e1e1e",
  border:       `1px solid ${hasError ? "#e63012" : "#2a2a2a"}`,
  borderRadius: "0.75rem",
  padding:      "0.75rem 1rem",
  fontSize:     "1rem",
  color:        "#f5f5f5",
  outline:      "none",
});

// ── Page principale ───────────────────────────────────────────────────────────

export default function CommanderPage() {
  const router         = useRouter();
  const idempotencyRef = useRef(null);

  const [items, setItems]           = useState([]);
  const [cartTotal, setCartTotal]   = useState(0);
  const [loading, setLoading]       = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [serverError, setServerError] = useState("");

  // Livraison
  const [deliveryPrice, setDeliveryPrice]   = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [officeAvailable, setOfficeAvailable] = useState(true);

  // Communes dynamiques
  const [communes,       setCommunes]       = useState([]);
  const [communesLoading, setCommunesLoading] = useState(false);

  // Coupon
  const [coupon, setCoupon]           = useState(null);
  const [couponCode, setCouponCode]   = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  // Monde → accent
  const [world, setWorld]           = useState("coiffure");
  const accent = world === "onglerie" ? "#e8a0bf" : "#e63012";

  const [form, setForm] = useState({
    first_name:    "",
    last_name:     "",
    phone:         "",
    wilaya:        "",
    wilaya_code:   "",
    commune:       "",
    delivery_type: "home",  // 'home' | 'office'
  });

  const [errors, setErrors] = useState({});

  // ── Initialisation ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cart = readCart();
    if (cart.length === 0) {
      router.replace("/produits");
      return;
    }
    setItems(cart);
    setCartTotal(calcCartTotal(cart));
    trackPageView("Commander");
    trackCheckoutStart(cart.length, calcCartTotal(cart));
    idempotencyRef.current = `${getSessionId()}-${Date.now()}`;

    // Lire le monde
    const w = sessionStorage.getItem("nc_world") || "coiffure";
    setWorld(w);

    // Lire le coupon depuis le drawer
    try {
      const saved = sessionStorage.getItem("nc_coupon");
      if (saved) setCoupon(JSON.parse(saved));
    } catch {}
  }, []);

  // ── Fetch prix livraison quand wilaya/type change ────────────────────────────
  useEffect(() => {
    if (!form.wilaya_code) { setDeliveryPrice(0); return; }
    setDeliveryLoading(true);
    fetch(`/api/boutique/delivery?wilaya_code=${form.wilaya_code}&type=${form.delivery_type}`)
      .then((r) => r.json())
      .then((d) => setDeliveryPrice(Number(d.price) || 0))
      .catch(() => setDeliveryPrice(0))
      .finally(() => setDeliveryLoading(false));
  }, [form.wilaya_code, form.delivery_type]);

  // ── Calculs totaux — remise basée sur la marge ──────────────────────────────
  // remise_article = (prix_vente - coût) × percentage/100
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
  const grandTotal = cartTotal - discount + deliveryPrice;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
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
        sessionStorage.setItem("nc_coupon", JSON.stringify(data));
        setCouponCode("");
        setCouponError("");
      } else {
        setCouponError(data.error || "الكود غير صحيح");
      }
    } catch {
      setCouponError("خطأ في الاتصال، حاول مجدداً");
    } finally {
      setCouponLoading(false);
    }
  }

  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: "" }));
    trackCheckoutStep(field);
  }

  // Sauvegarde phone + prénom dans nc_carts dès saisie (pour récupération panier abandonné)
  async function saveCartEarly(field, value, currentForm) {
    const updatedForm = { ...currentForm, [field]: value };
    const phone     = updatedForm.phone?.trim();
    const firstName = updatedForm.first_name?.trim();
    if (!phone || phone.length < 9) return;

    try {
      await fetch("/api/boutique/cart-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id:  getSessionId(),
          phone,
          first_name:  firstName || null,
          items,
          cart_total:  cartTotal,
        }),
      });
    } catch { /* silencieux */ }
  }

  function handlePhoneBlur(value) {
    saveCartEarly("phone", value, form);
  }

  function handleFirstNameBlur(value) {
    saveCartEarly("first_name", value, form);
  }

  function handleWilaya(code) {
    const w = WILAYAS.find((x) => x.code === code);
    setForm((f) => ({
      ...f,
      wilaya_code:   code,
      wilaya:        w ? w.name : "",
      commune:       "",
      delivery_type: "home",
    }));
    setOfficeAvailable(true);
    setErrors((e) => ({ ...e, wilaya: "", commune: "" }));
    setCommunes([]);
    if (!code) return;

    // Vérifier si le stopdesk est disponible pour cette wilaya
    fetch(`/api/boutique/delivery?wilaya_code=${code}&type=office`)
      .then((r) => r.json())
      .then((d) => {
        const available = Number(d.price) > 0 && d.default !== true;
        setOfficeAvailable(available);
      })
      .catch(() => setOfficeAvailable(false));

    // Charger les communes de cette wilaya
    setCommunesLoading(true);
    fetch(`/api/boutique/delivery?wilaya_code=${code}&list=communes`)
      .then((r) => r.json())
      .then((d) => setCommunes(d.communes || []))
      .catch(() => setCommunes([]))
      .finally(() => setCommunesLoading(false));
  }

  function validate() {
    const e = {};
    if (!form.first_name.trim()) e.first_name = "الاسم مطلوب";
    if (!form.last_name.trim())  e.last_name  = "اللقب مطلوب";
    if (!form.phone.trim()) {
      e.phone = "رقم الهاتف مطلوب";
    } else if (!isValidAlgerianPhone(form.phone)) {
      e.phone = "الصيغة غير صحيحة. مثال: 0612345678";
    }
    if (!form.wilaya) e.wilaya  = "اختر الولاية";
    if (!form.commune.trim()) e.commune = "البلدية مطلوبة";
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Scroll vers le premier champ en erreur
      const firstErr = document.querySelector("[data-error='true']");
      firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLoading(true);
    setSubmitted(true);
    setServerError("");

    try {
      const utm     = getUtmParams();
      const payload = {
        items: items.map((i) => ({
          variant_id:    i.variant_id,
          qty:           i.qty,
          price:         i.price,
          title:         i.title,
          variant_title: i.variant_title,
          image_url:     i.image_url || null,
        })),
        customer: {
          first_name:    form.first_name.trim(),
          last_name:     form.last_name.trim(),
          phone:         form.phone.trim(),
          wilaya:        form.wilaya,
          wilaya_code:   Number(form.wilaya_code),
          commune:       form.commune.trim(),
          delivery_type: form.delivery_type,
        },
        delivery_price:   deliveryPrice,
        coupon:           coupon || null,
        session_id:       getSessionId(),
        idempotency_key:  idempotencyRef.current,
        utm: {
          source:   utm.utm_source,
          medium:   utm.utm_medium,
          campaign: utm.utm_campaign,
        },
      };

      const res  = await fetch("/api/boutique/order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setServerError(data.error || "حدث خطأ أثناء تأكيد الطلب، حاول مجدداً");
        setSubmitted(false);
        setLoading(false);
        return;
      }

      // Succès → vider le panier + coupon + rediriger
      clearCart();
      sessionStorage.removeItem("nc_coupon");
      router.push(`/merci/${data.order_name || data.order_id}`);
    } catch {
      setServerError("خطأ في الاتصال. تحقق من الإنترنت وأعد المحاولة.");
      setSubmitted(false);
      setLoading(false);
    }
  }

  if (items.length === 0) return null;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Header />
      <main className="w-full max-w-2xl mx-auto px-4 py-8 min-h-screen" style={{ minWidth: 0 }}>

        {/* Titre */}
        <div className="mb-6" dir="rtl">
          <h1 className="text-2xl font-bold" style={{ color: "#f5f5f5" }}>تأكيد الطلب</h1>
          <p className="text-sm mt-1" style={{ color: "#666" }}>
            أدخل بياناتك لإتمام الطلب
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6 w-full min-w-0">

          {/* ── Carte infos client ─────────────────────────────────────── */}
          <div className="w-full rounded-2xl p-5 space-y-4" dir="rtl" style={{ background: "#161616", border: "1px solid #2a2a2a", minWidth: 0 }}>
            <h2 className="font-bold text-base" style={{ color: "#f5f5f5" }}>بيانات الطلب</h2>

            {/* Prénom + Nom (côte à côte — en RTL : الاسم à droite, اللقب à gauche) */}
            <div className="grid grid-cols-2 gap-3 w-full">
              <Field label="الاسم" required error={errors.first_name}>
                <input
                  data-testid="checkout-first-name"
                  type="text"
                  value={form.first_name}
                  onChange={(e) => handleChange("first_name", e.target.value)}
                  onBlur={(e) => handleFirstNameBlur(e.target.value)}
                  placeholder="الاسم"
                  style={inputStyle(!!errors.first_name, accent)}
                  autoComplete="given-name"
                  data-error={!!errors.first_name}
                />
              </Field>
              <Field label="اللقب" required error={errors.last_name}>
                <input
                  data-testid="checkout-last-name"
                  type="text"
                  value={form.last_name}
                  onChange={(e) => handleChange("last_name", e.target.value)}
                  placeholder="اللقب"
                  style={inputStyle(!!errors.last_name, accent)}
                  autoComplete="family-name"
                  data-error={!!errors.last_name}
                />
              </Field>
            </div>

            {/* Téléphone */}
            <Field label="رقم الهاتف" required error={errors.phone}>
              <input
                data-testid="checkout-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                onBlur={(e) => handlePhoneBlur(e.target.value)}
                placeholder="0612345678"
                dir="ltr"
                style={inputStyle(!!errors.phone, accent)}
                autoComplete="tel"
                inputMode="tel"
                data-error={!!errors.phone}
              />
              <p className="text-xs mt-1" style={{ color: "#555" }}>
                05 / 06 / 07 + 8 أرقام
              </p>
            </Field>

            {/* Wilaya */}
            <Field label="الولاية" required error={errors.wilaya}>
              <select
                data-testid="checkout-wilaya"
                value={form.wilaya_code}
                onChange={(e) => handleWilaya(e.target.value)}
                style={{ ...inputStyle(!!errors.wilaya, accent), cursor: "pointer" }}
                data-error={!!errors.wilaya}
              >
                <option value="">اختر الولاية</option>
                {WILAYAS.map((w) => (
                  <option key={w.code} value={w.code}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Commune — select dynamique si communes disponibles, sinon texte libre */}
            <Field label="البلدية" required error={errors.commune}>
              {communesLoading ? (
                <div
                  style={{ ...inputStyle(false, accent), display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <span
                    style={{
                      display: "inline-block", width: "1rem", height: "1rem",
                      border: "2px solid #333", borderTop: "2px solid #999",
                      borderRadius: "50%", animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span style={{ color: "#666", fontSize: "0.9rem" }}>جارٍ تحميل البلديات...</span>
                </div>
              ) : communes.length > 0 ? (
                <select
                  data-testid="checkout-commune"
                  value={form.commune}
                  onChange={(e) => handleChange("commune", e.target.value)}
                  style={{ ...inputStyle(!!errors.commune, accent), cursor: "pointer" }}
                  data-error={!!errors.commune}
                >
                  <option value="">اختر البلدية</option>
                  {communes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <input
                  data-testid="checkout-commune"
                  type="text"
                  value={form.commune}
                  onChange={(e) => handleChange("commune", e.target.value)}
                  placeholder={form.wilaya_code ? "اكتب اسم البلدية" : "اختر الولاية أولاً"}
                  style={inputStyle(!!errors.commune, accent)}
                  autoComplete="address-level2"
                  data-error={!!errors.commune}
                  disabled={!form.wilaya_code}
                />
              )}
            </Field>

            {/* Type livraison */}
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: "#a0a0a0" }}>
                نوع التوصيل
              </p>
              <div className={`grid gap-3 ${officeAvailable ? "grid-cols-2" : "grid-cols-1"}`}>
                {[
                  { value: "home",   label: "للمنزل",  icon: "🏠" },
                  { value: "office", label: "للمكتب",  icon: "🏢" },
                ]
                  .filter((opt) => opt.value === "home" || officeAvailable)
                  .map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleChange("delivery_type", opt.value)}
                      className="flex flex-col items-center justify-center py-3 px-4 rounded-xl font-semibold text-sm transition-all"
                      style={
                        form.delivery_type === opt.value
                          ? { background: accent + "22", border: `2px solid ${accent}`, color: accent }
                          : { background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#a0a0a0" }
                      }
                    >
                      <span className="text-xl mb-1">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
              </div>
              {!officeAvailable && form.wilaya_code && (
                <p className="text-xs mt-2 text-right" style={{ color: "#555" }}>
                  التوصيل للمكتب غير متوفر في هذه الولاية
                </p>
              )}
            </div>
          </div>

          {/* ── Section coupon ─────────────────────────────────────────── */}
          {coupon ? (
            <div
              className="w-full flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}
            >
              <div dir="rtl">
                <p className="text-sm font-bold" style={{ color: "#22c55e" }}>
                  ✓ كود الشريك {coupon.code}
                </p>
                <p className="text-xs" style={{ color: "#a0a0a0" }}>{coupon.nom}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCoupon(null);
                  setCouponError("");
                  sessionStorage.removeItem("nc_coupon");
                }}
                className="text-xs"
                style={{ color: "#666" }}
              >
                حذف
              </button>
            </div>
          ) : (
            <div className="w-full rounded-2xl p-4 space-y-2" style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
              <p className="text-sm font-semibold text-right" style={{ color: "#a0a0a0" }}>كود الشريك</p>
              <div className="flex gap-2" dir="ltr">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                  placeholder="أدخل الكود"
                  dir="ltr"
                  style={{
                    flex:         1,
                    minWidth:     0,
                    background:   "#1e1e1e",
                    border:       `1px solid ${couponError ? "#e63012" : "#2a2a2a"}`,
                    borderRadius: "0.75rem",
                    padding:      "0.6rem 0.9rem",
                    fontSize:     "0.95rem",
                    color:        "#f5f5f5",
                    outline:      "none",
                    letterSpacing: "0.05em",
                  }}
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  className="shrink-0 px-4 rounded-xl font-semibold text-sm transition-all"
                  style={
                    couponLoading || !couponCode.trim()
                      ? { background: "#2a2a2a", color: "#555", cursor: "not-allowed" }
                      : { background: accent, color: "#fff" }
                  }
                >
                  {couponLoading ? "..." : "تطبيق"}
                </button>
              </div>
              {couponError && (
                <p className="text-xs text-right" style={{ color: "#e63012" }}>{couponError}</p>
              )}
            </div>
          )}

          {/* ── Récapitulatif ──────────────────────────────────────────── */}
          <div dir="rtl" className="rounded-2xl p-5 space-y-3" style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
            <h2 className="font-bold text-base" style={{ color: "#f5f5f5" }}>ملخص الطلب</h2>

            {/* Articles */}
            <div className="space-y-3 pb-3" style={{ borderBottom: "1px solid #2a2a2a" }}>
              {items.map((item) => {
                const itemTotal   = Number(item.price) * item.qty;
                const discountAmt = itemMarginDiscount(item);
                const itemFinal   = itemTotal - discountAmt;
                return (
                  <div key={item.variant_id} className="flex items-center gap-3 text-sm">
                    {/* Image produit */}
                    <div
                      className="shrink-0 rounded-lg overflow-hidden"
                      style={{ width: 52, height: 52, background: "#2a2a2a" }}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.title}
                          width={52}
                          height={52}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>
                          🛍️
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ color: "#f5f5f5", fontWeight: 500 }}>{item.title}</p>
                      {item.variant_title && item.variant_title !== "Default Title" && (
                        <p className="text-xs" style={{ color: "#888" }}>{item.variant_title}</p>
                      )}
                      <p className="text-xs" style={{ color: "#555" }}>× {item.qty}</p>
                    </div>
                    <div className="text-left shrink-0" dir="ltr">
                      {discountAmt > 0 ? (
                        <>
                          <p className="text-xs" style={{ color: "#555", textDecoration: "line-through" }}>
                            {formatPrice(itemTotal)}
                          </p>
                          <p className="font-bold" style={{ color: "#22c55e" }}>
                            {formatPrice(itemFinal)}
                          </p>
                        </>
                      ) : (
                        <span className="font-semibold" style={{ color: "#f5f5f5" }}>
                          {formatPrice(itemTotal)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totaux */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm" style={{ color: "#a0a0a0" }}>
                <span>سعر المنتجات</span>
                <span dir="ltr">{formatPrice(cartTotal)}</span>
              </div>

              {coupon && discount > 0 && (
                <div className="flex justify-between text-sm" style={{ color: "#22c55e" }}>
                  <span>خصم كود الشريك</span>
                  <span dir="ltr">− {formatPrice(discount)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm" style={{ color: "#a0a0a0" }}>
                <span>سعر التوصيل</span>
                <span dir="ltr" data-testid="delivery-price-display">
                  {deliveryLoading
                    ? "..."
                    : form.wilaya_code
                    ? formatPrice(deliveryPrice)
                    : "يُحدَّد بعد اختيار الولاية"
                  }
                </span>
              </div>

              <div
                className="flex justify-between text-base font-bold pt-2"
                style={{ borderTop: "1px solid #2a2a2a", color: "#f5f5f5" }}
              >
                <span>المجموع الكلي</span>
                <span dir="ltr" style={{ color: accent }}>{formatPrice(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* ── Badge paiement à la livraison ─────────────────────────── */}
          <div
            dir="rtl"
            className="flex items-center gap-3 rounded-xl p-4"
            style={{ background: "rgba(230,48,18,0.08)", border: "1px solid rgba(230,48,18,0.2)" }}
          >
            <span className="text-2xl shrink-0">💳</span>
            <div>
              <p className="font-semibold text-sm" style={{ color: "#f5f5f5" }}>الدفع عند الاستلام</p>
              <p className="text-xs mt-0.5" style={{ color: "#a0a0a0" }}>
                تدفع المبلغ لعامل التوصيل عند استلام طلبك.
              </p>
            </div>
          </div>

          {/* ── Erreur serveur ────────────────────────────────────────── */}
          {serverError && (
            <div
              className="rounded-xl p-4 text-sm"
              style={{ background: "rgba(230,48,18,0.1)", border: "1px solid rgba(230,48,18,0.3)", color: "#e63012" }}
            >
              {serverError}
            </div>
          )}

          {/* ── Bouton confirmer ──────────────────────────────────────── */}
          <button
            data-testid="checkout-submit"
            type="submit"
            disabled={loading || submitted}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
            style={
              loading || submitted
                ? { background: "#2a2a2a", color: "#555", cursor: "not-allowed" }
                : { background: accent, color: "#fff" }
            }
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                جارٍ التأكيد...
              </span>
            ) : "تأكيد الشراء"}
          </button>

        </form>
      </main>
      <Footer />
    </>
  );
}
