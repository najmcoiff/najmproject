import "./globals.css";
import CartDrawer from "@/components/CartDrawer";
import WhatsAppButton from "@/components/WhatsAppButton";
import FloatingCart from "@/components/FloatingCart";
import MetaPixel from "@/components/MetaPixel";

export const metadata = {
  title: {
    default: "NAJMCOIFF - أدوات الحلاقة و التجميل",
    template: "%s | NAJMCOIFF",
  },
  description:
    "وجهتكم للمستلزمات الحلاقة والعناية بالأظافر في الجزائر. توصيل سريع لجميع الولايات.",
  keywords: ["الحلاقة", "العناية بالأظافر", "الجزائر", "شامبو", "منتجات الشعر", "coiffure", "onglerie", "algérie"],
  metadataBase: new URL("https://www.najmcoiff.com"),
  alternates: {
    canonical: "https://www.najmcoiff.com",
  },
  openGraph: {
    type: "website",
    locale: "ar_DZ",
    siteName: "نجم كواف",
    url: "https://www.najmcoiff.com",
  },
};

/* ── Contenu d'un seul "cycle" du ticker ──────────────────────────────── */
function TickerCycle() {
  return (
    <span className="flex items-center shrink-0" style={{ paddingLeft: "2rem", paddingRight: "2rem" }}>
      <span>🚚&nbsp;توصيل لكل الجزائر</span>
      <span style={{ margin: "0 1.5rem", opacity: 0.45 }}>✦</span>
      <span>💳&nbsp;الدفع عند الاستلام</span>
      <span style={{ margin: "0 1.5rem", opacity: 0.45 }}>✦</span>
      <span>⏱&nbsp;24-72 ساعة</span>
      <span style={{ margin: "0 1.5rem", opacity: 0.45 }}>✦</span>
      <span>✅&nbsp;منتجات أصلية</span>
      <span style={{ margin: "0 1.5rem", opacity: 0.45 }}>✦</span>
      <span>📦&nbsp;تغليف محكم وآمن</span>
      <span style={{ margin: "0 1.5rem", opacity: 0.45 }}>✦</span>
      <span>🔄&nbsp;خدمة عملاء 7/7</span>
      <span style={{ margin: "0 1.5rem", opacity: 0.45 }}>✦</span>
    </span>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="ltr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Metal+Mania&family=Noto+Kufi+Arabic:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">

        {/* ── Bandeau ticker livraison ─────────────────────────────────── */}
        <div className="ticker-bar overflow-hidden relative z-10" style={{ background: "#e63012", height: "36px" }}>
          <div className="ticker-track flex items-center h-full whitespace-nowrap text-white text-xs font-semibold tracking-wider">
            {/* 6 cycles = 2 demi-copies × 3 → translateX(-50%) seamless */}
            <TickerCycle /><TickerCycle /><TickerCycle />
            <TickerCycle /><TickerCycle /><TickerCycle />
          </div>
        </div>

        <MetaPixel />
        <CartDrawer />
        {children}
        <FloatingCart />
        <WhatsAppButton />
      </body>
    </html>
  );
}
