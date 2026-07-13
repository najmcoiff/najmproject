"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Page client "sous garantie du coiffeur" — arrivée via le lien perso du coiffeur.
// Elle pose le code ambassadeur (localStorage) puis renvoie vers la boutique.
// Le client ne voit AUCUN chiffre financier — juste la réassurance.
export default function GarantiePage() {
  const { code } = useParams();
  const router = useRouter();
  const [state, setState] = useState({ loading: true, valid: false, first_name: "" });

  useEffect(() => {
    if (!code) return;
    fetch(`/api/boutique/ambassadeur?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          try { localStorage.setItem("nc_ambassadeur", d.code); } catch {}
          setState({ loading: false, valid: true, first_name: d.first_name || "" });
        } else {
          setState({ loading: false, valid: false, first_name: "" });
        }
      })
      .catch(() => setState({ loading: false, valid: false, first_name: "" }));
  }, [code]);

  if (state.loading) {
    return <Shell><div className="h-56 rounded-3xl bg-black/5 animate-pulse" /></Shell>;
  }

  return (
    <Shell>
      <section className="relative overflow-hidden rounded-3xl p-7 text-center text-[#EDE4D3] shadow-2xl"
        style={{ background: "radial-gradient(120% 90% at 50% 0%,#2A2117 0%,#17130F 62%)", border: "1px solid #3A3125" }}>
        <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-4"
          style={{ background: "rgba(203,164,92,.14)", color: "#CBA45C" }}>
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>
        </div>
        {state.valid && state.first_name ? (
          <>
            <p className="text-sm" style={{ color: "#A2937B" }}>مرحبا بك 👋</p>
            <h1 className="text-[22px] font-extrabold mt-1 text-white leading-snug">
              أنت تطلب تحت ضمان<br /><span style={{ color: "#E3C88A" }}>{state.first_name}</span>
            </h1>
          </>
        ) : (
          <h1 className="text-[22px] font-extrabold mt-1 text-white leading-snug">مرحبا بك في نجم كواف</h1>
        )}
      </section>

      {/* Garanties */}
      <section className="grid gap-2.5">
        <Perk icon="🚚" title="توصيل سريع" desc="طلبك يوصلك بأسرع وقت، لكل الولايات." />
        <Perk icon="✅" title="منتجات أصلية 100%" desc="كل المنتجات أصلية ومضمونة." />
        {state.valid && state.first_name && (
          <Perk icon="🤝" title={`تحت ضمان ${state.first_name}`} desc="كوافورك يضمن لك الطلبية — أي مشكل، هو معاك." />
        )}
      </section>

      <button onClick={() => router.push("/produits")}
        className="w-full rounded-2xl py-4 font-extrabold text-[15px] text-[#20180a]"
        style={{ background: "linear-gradient(180deg,#E3C88A,#CBA45C)" }}>
        تسوّق الآن
      </button>

      <p className="text-center text-[12px] text-gray-500 leading-relaxed">اختر منتجاتك وأكمل الطلب — كل شيء محضّر لك.</p>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <main dir="rtl" className="min-h-screen bg-[#F3EEE3] px-4 py-8" style={{ color: "#2B2419" }}>
      <div className="max-w-[420px] mx-auto flex flex-col gap-4">
        <div className="text-center text-base font-bold mb-1"><span style={{ color: "#9C7A34" }}>نجم</span> كواف</div>
        {children}
      </div>
    </main>
  );
}

function Perk({ icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex-none text-2xl leading-none mt-0.5">{icon}</div>
      <div>
        <div className="text-[14px] font-bold">{title}</div>
        <div className="text-[12.5px] text-gray-500 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
