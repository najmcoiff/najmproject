import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";

export const metadata = {
  title: "من نحن | نجم كواف",
  description: "نجم كواف — متجر متخصص في مستلزمات الحلاقة والعناية بالأظافر في الجزائر. توصيل لكل الولايات، دفع عند الاستلام.",
};

export default function AProposPage() {
  return (
    <>
      <Header />
      <main
        className="max-w-2xl mx-auto px-4 py-12 min-h-screen"
        dir="rtl"
        style={{ color: "#f5f5f5" }}
      >
        {/* Titre */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3">
            نجم<span style={{ color: "#e63012" }}>كواف</span>
          </h1>
          <p className="text-base" style={{ color: "#a0a0a0" }}>
            متخصصون في مستلزمات الحلاقة والعناية بالأظافر
          </p>
        </div>

        {/* À propos */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{ background: "#161616", border: "1px solid #2a2a2a" }}
        >
          <h2 className="text-lg font-bold mb-3" style={{ color: "#e63012" }}>
            من نحن
          </h2>
          <p className="text-sm leading-7" style={{ color: "#a0a0a0" }}>
            نجم كواف هو متجر جزائري متخصص في توفير منتجات الحلاقة والعناية بالأظافر بجودة عالية وبأسعار تنافسية.
            نوفر لك أفضل العلامات التجارية العالمية والمحلية، مع توصيل سريع لجميع ولايات الجزائر.
          </p>
        </div>

        {/* Valeurs */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          {[
            { icon: "🚚", title: "توصيل لكل الجزائر", desc: "نوصل طلبك لجميع الـ 58 ولاية خلال 24 إلى 72 ساعة عبر ZR Express." },
            { icon: "💳", title: "الدفع عند الاستلام", desc: "تدفع فقط عند استلام طلبك. لا حاجة لبطاقة بنكية أو تحويل مسبق." },
            { icon: "✅", title: "جودة مضمونة", desc: "كل المنتجات المعروضة مختارة بعناية ومضمونة الجودة." },
            { icon: "📞", title: "دعم العملاء", desc: "فريقنا متاح للإجابة على استفساراتك وتأكيد طلباتك." },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-4 rounded-xl p-4"
              style={{ background: "#161616", border: "1px solid #2a2a2a" }}
            >
              <span className="text-2xl shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-bold mb-0.5" style={{ color: "#f5f5f5" }}>{item.title}</p>
                <p className="text-xs leading-5" style={{ color: "#a0a0a0" }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div
          className="rounded-2xl p-6 mb-8"
          style={{ background: "#161616", border: "1px solid #2a2a2a" }}
        >
          <h2 className="text-lg font-bold mb-3" style={{ color: "#e63012" }}>
            تواصل معنا
          </h2>
          <div className="space-y-2 text-sm" style={{ color: "#a0a0a0" }}>
            <p>📍 الجزائر</p>
            <p>🕐 7/7 من 9سا صباحا الى 22سا ليلا</p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/produits"
            className="inline-block font-bold py-3.5 px-8 rounded-2xl transition-colors text-white"
            style={{ background: "#e63012" }}
          >
            تصفح المنتجات ←
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
