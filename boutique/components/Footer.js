"use client";
import Link from "next/link";

export default function Footer() {
  return (
    <footer
      className="mt-auto"
      style={{ background: "#0f0f0f", borderTop: "1px solid #1e1e1e" }}
    >
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* ── Marque ─────────────────────────────────────────────── */}
          <div>
            <div className="flex flex-col mb-4">
              <img
                src="/logo.png"
                alt="NAJMCOIFF"
                style={{
                  width: 52, height: 52,
                  objectFit: "contain",
                  mixBlendMode: "screen",
                  marginBottom: "10px",
                }}
              />
              <span
                className="font-bebas uppercase"
                style={{ color: "#f5f5f5", fontSize: "1.5rem", letterSpacing: "0.3em", lineHeight: 1 }}
              >
                NAJM<span style={{ color: "#e63012" }}>COIFF</span>
              </span>
              <div style={{ width: 36, height: 2, background: "#e63012", marginTop: 8, borderRadius: 1 }} />
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#a0a0a0" }}>
              وجهتكم للمستلزمات الحلاقة والعناية بالأظافر في الجزائر.
              <br />
              توصيل سريع لجميع الولايات.
            </p>
          </div>

          {/* ── Liens ──────────────────────────────────────────────── */}
          <div>
            <p className="font-semibold text-sm mb-3" style={{ color: "#f5f5f5" }}>
              روابط
            </p>
            <ul className="space-y-2 text-sm" style={{ color: "#a0a0a0" }}>
              <li>
                <Link href="/" className="transition-colors hover:text-white">الرئيسية</Link>
              </li>
              <li>
                <Link href="/produits" className="transition-colors hover:text-white">المنتجات</Link>
              </li>
              <li>
                <Link href="/panier" className="transition-colors hover:text-white">السلة</Link>
              </li>
              <li>
                <Link href="/suivi" className="transition-colors hover:text-white">تتبع الطلب</Link>
              </li>
            </ul>
          </div>

          {/* ── Livraison ───────────────────────────────────────────── */}
          <div>
            <p className="font-semibold text-sm mb-3" style={{ color: "#f5f5f5" }}>
              🚚 التوصيل
            </p>
            <ul className="space-y-2 text-sm" style={{ color: "#a0a0a0" }}>
              <li className="flex items-start gap-2">
                <span className="shrink-0">🗺️</span>
                <span>توصيل لكل ولايات الجزائر الـ 58</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">💵</span>
                <span>الدفع عند الاستلام — بدون دفع مسبق</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">⚡</span>
                <span>توصيل سريع خلال 24-72 ساعة</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">📍</span>
                <span>تتبع الطرد فور إرساله</span>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-8 pt-6 text-center text-xs"
          style={{ borderTop: "1px solid #1e1e1e", color: "#444" }}
        >
          © {new Date().getFullYear()}&nbsp;
          <span className="font-bebas" style={{ letterSpacing: "0.15em", color: "#555" }}>
            NAJMCOIFF
          </span>
          &nbsp;— جميع الحقوق محفوظة
        </div>
      </div>
    </footer>
  );
}
