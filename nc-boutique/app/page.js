"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [active, setActive] = useState(null);

  function choose(worldId) {
    setActive(worldId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("nc_world", worldId);
    }
    router.push(`/collections/${worldId}`);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0a" }}>

      {/* ── Header minimal ──────────────────────────────────────────── */}
      <header className="flex items-center justify-center py-8 px-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-1">
            <img
              src="/logo.png"
              alt="NAJMCOIFF"
              className="h-10 w-10 object-contain"
              style={{ mixBlendMode: "screen" }}
            />
            <h1
              className="font-bebas uppercase"
              style={{ color: "#f5f5f5", fontSize: "2.2rem", letterSpacing: "0.18em", lineHeight: 1 }}
            >
              NAJM<span style={{ color: "#e63012" }}>COIFF</span>
            </h1>
          </div>
          <p className="text-sm" style={{ color: "#555" }}>Grossiste Coiffure &amp; Onglerie · Algérie</p>
        </div>
      </header>

      {/* ── Choix du monde ──────────────────────────────────────────── */}
      <main className="flex flex-col items-center justify-center flex-1 px-4 pb-12">
        <p className="text-sm mb-8 text-center font-medium" style={{ color: "#666" }}>
          اختر عالمك — Choisissez votre univers
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">

          {/* ── Carte COIFFURE ────────────────────────────────────── */}
          <button
            data-world="coiffure"
            onClick={() => choose("coiffure")}
            disabled={active !== null}
            className="group relative rounded-3xl overflow-hidden transition-all duration-300 active:scale-95 text-left"
            style={{
              border:    `2px solid ${active === "coiffure" ? "#e63012" : "#2a2a2a"}`,
              opacity:   active !== null && active !== "coiffure" ? 0.35 : 1,
              minHeight: "280px",
            }}
          >
            <img src="/hero-coiffure.png" alt="Coiffure"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.15) 100%)" }} />
            <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: "280px" }}>
              <span className="text-xs font-bold uppercase tracking-widest mb-2 px-3 py-1 rounded-full w-fit"
                style={{ background: "#e63012", color: "#fff" }}>
                ✂️ Coiffure &amp; Barbier
              </span>
              <h2 className="text-2xl font-extrabold mb-1" style={{ color: "#fff" }}>الحلاقة</h2>
              <p className="text-sm" style={{ color: "#ccc" }}>مقصات · ماكينات · منتجات العناية</p>
              <div className="mt-4 flex items-center gap-2 text-sm font-bold w-fit px-4 py-2 rounded-xl transition-all duration-200 group-hover:gap-3"
                style={{ background: "#e63012", color: "#fff" }}>
                <span>تسوّق الآن</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </div>
            </div>
            {active === "coiffure" && (
              <div className="absolute inset-0 flex items-center justify-center z-20"
                style={{ background: "rgba(0,0,0,0.5)" }}>
                <span className="text-white font-bold text-lg">جاري التحميل...</span>
              </div>
            )}
          </button>

          {/* ── Carte ONGLERIE ────────────────────────────────────── */}
          <button
            data-world="onglerie"
            onClick={() => choose("onglerie")}
            disabled={active !== null}
            className="group relative rounded-3xl overflow-hidden transition-all duration-300 active:scale-95 text-left"
            style={{
              border:    `2px solid ${active === "onglerie" ? "#e8a0bf" : "#2a2a2a"}`,
              opacity:   active !== null && active !== "onglerie" ? 0.35 : 1,
              minHeight: "280px",
            }}
          >
            <img src="/hero-onglerie.png" alt="Onglerie"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(30,10,20,0.9) 0%, rgba(30,10,20,0.25) 55%, rgba(0,0,0,0.1) 100%)" }} />
            <div className="absolute top-4 right-5 text-lg select-none pointer-events-none"
              style={{ filter: "drop-shadow(0 0 6px #e8a0bf)" }}>✦</div>
            <div className="absolute top-10 right-14 text-xs select-none pointer-events-none"
              style={{ color: "#f9c8dd", opacity: 0.7 }}>✦</div>
            <div className="absolute top-6 left-8 text-sm select-none pointer-events-none"
              style={{ color: "#f0b8d0", opacity: 0.5 }}>✦</div>
            <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: "280px" }}>
              <span className="text-xs font-bold uppercase tracking-widest mb-2 px-3 py-1 rounded-full w-fit"
                style={{ background: "linear-gradient(135deg, #e8a0bf, #f4c2d8)", color: "#4a1030" }}>
                💅 Onglerie &amp; Beauté
              </span>
              <h2 className="text-2xl font-extrabold mb-1" style={{ color: "#fff" }}>العناية بالأظافر</h2>
              <p className="text-sm" style={{ color: "#f4c2d8" }}>جل UV · ورنيس · مواد الأظافر</p>
              <div className="mt-4 flex items-center gap-2 text-sm font-bold w-fit px-4 py-2 rounded-xl transition-all duration-200 group-hover:gap-3"
                style={{ background: "linear-gradient(135deg, #e8a0bf, #f4c2d8)", color: "#4a1030" }}>
                <span>تسوّقي الآن</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </div>
            </div>
            {active === "onglerie" && (
              <div className="absolute inset-0 flex items-center justify-center z-20"
                style={{ background: "rgba(30,10,20,0.6)" }}>
                <span className="font-bold text-lg" style={{ color: "#f4c2d8" }}>جاري التحميل... ✦</span>
              </div>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
