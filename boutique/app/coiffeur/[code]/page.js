"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

// Espace coiffeur — le lien = la clé (pas de login).
// DA uniquement, jamais de % ni de marge. Numéros masqués.
export default function CoiffeurSpace() {
  const { code } = useParams();
  const [data, setData]   = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [display, setDisplay] = useState(0);
  const [copied, setCopied]   = useState(false);
  const [myAvis, setMyAvis]   = useState(null);   // {body, statut}
  const [avisText, setAvisText] = useState("");
  const [avisMsg, setAvisMsg] = useState("");
  const [avisBusy, setAvisBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/boutique/coiffeur/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("خطأ في الاتصال"))
      .finally(() => setLoading(false));
  }, [code]);

  // Compteur animé de la cagnotte
  useEffect(() => {
    if (!data) return;
    const to = data.cagnotte_da || 0;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    if (reduce) { setDisplay(to); return; }
    let raf, start;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / 1000, 1);
      setDisplay(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  const fmt = (n) => (Number(n) || 0).toLocaleString("fr-FR").replace(/,/g, " ");

  const shareLink = typeof window !== "undefined"
    ? `${window.location.origin}/g/${data?.code || code}`
    : "";
  const shareText = `اطلب منتجاتك مع الكود ديالي ${data?.code || code} 👇\nتوصيل سريع ومنتج أصلي مضمون.\n${shareLink}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  function copyCode() {
    if (navigator.clipboard) navigator.clipboard.writeText(data?.code || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  useEffect(() => {
    if (!code) return;
    fetch(`/api/boutique/coiffeur/avis?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => { if (d.avis) { setMyAvis(d.avis); setAvisText(d.avis.body || ""); } })
      .catch(() => {});
  }, [code]);

  async function submitAvis() {
    if (!avisText.trim() || !data) return;
    setAvisBusy(true); setAvisMsg("");
    try {
      const r = await fetch("/api/boutique/coiffeur/avis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: data.code, body: avisText.trim() }),
      });
      const d = await r.json();
      if (d.ok) { setMyAvis({ body: avisText.trim(), statut: "pending" }); setAvisMsg("تم إرسال رأيك، سيظهر بعد المراجعة ✅"); }
      else setAvisMsg(d.error || "خطأ");
    } catch { setAvisMsg("خطأ في الاتصال"); }
    finally { setAvisBusy(false); }
  }

  if (loading) {
    return <Shell><div className="animate-pulse space-y-4">
      <div className="h-40 bg-black/10 rounded-3xl" />
      <div className="h-20 bg-black/10 rounded-2xl" />
    </div></Shell>;
  }
  if (error || !data) {
    return <Shell><div className="text-center py-16">
      <p className="text-4xl mb-3">🔒</p>
      <h1 className="text-lg font-bold mb-1">هذا الفضاء غير متوفّر</h1>
      <p className="text-sm text-gray-500">تأكّد من الرابط الخاص بك.</p>
    </div></Shell>;
  }

  return (
    <Shell>
      {/* Carte membre */}
      <section className="relative overflow-hidden rounded-3xl p-6 text-[#EDE4D3] shadow-2xl"
        style={{ background: "radial-gradient(120% 90% at 18% 8%,#2A2117 0%,#17130F 58%)", border: "1px solid #3A3125" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">{data.full_name || "شريك نجم كواف"}</div>
            <div className="text-xs mt-1" style={{ color: "#A2937B" }}>حلاق · شريك</div>
          </div>
          <svg className="w-9 h-9" style={{ color: "#CBA45C" }} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>
        </div>
        <div className="mt-6">
          <div className="text-xs font-semibold" style={{ color: "#A2937B" }}>رصيدك المتاح للاستعمال</div>
          <div className="mt-1 text-[44px] leading-none font-extrabold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span className="text-[19px] font-semibold align-middle ml-2" style={{ color: "#E3C88A" }}>دج</span>
            {fmt(display)}
          </div>
          {data.cagnotte_attente_da > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: "#A2937B" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#D8A24A", boxShadow: "0 0 0 3px rgba(216,162,74,.18)" }} />
              <span><b style={{ color: "#E3C88A" }}>+{fmt(data.cagnotte_attente_da)} دج</b> قيد الانتظار — تُضاف عند إستلام الطلب</span>
            </div>
          )}
          {/* Récap à vie : gagné vs dépensé (n'apparaît que s'il a déjà utilisé du crédit) */}
          {data.total_depense_da > 0 && (
            <div className="mt-4 pt-3 flex items-center gap-4 text-[12px]" style={{ borderTop: "1px solid rgba(226,200,138,.14)", color: "#A2937B" }}>
              <span>ربحت في المجموع <b style={{ color: "#E3C88A" }}>{fmt(data.total_gagne_da)} دج</b></span>
              <span style={{ opacity: .4 }}>·</span>
              <span>استعملت منها <b className="text-white">{fmt(data.total_depense_da)} دج</b></span>
            </div>
          )}
        </div>
      </section>

      {/* Utiliser le crédit */}
      <section className="rounded-2xl bg-white border border-gray-200 p-4">
        <div className="text-[13px] font-bold mb-2">استعمل رصيدك</div>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">رصيدك يُخصم من طلبياتك القادمة عند نجم كواف. كل ما شريت، استفدت منه.</p>
        <button
          onClick={() => {
            try { localStorage.setItem("nc_coiffeur_spend", data.code); } catch {}
            window.location.href = "/produits";
          }}
          disabled={!data.cagnotte_da}
          className="block w-full text-center rounded-xl py-3 font-bold text-[14px] text-[#20180a] disabled:opacity-50"
          style={{ background: "linear-gradient(180deg,#E3C88A,#CBA45C)" }}>
          {data.cagnotte_da > 0 ? "استعمل رصيدك في طلبية" : "لا يوجد رصيد بعد"}
        </button>
      </section>

      {/* Code + partage */}
      <section className="rounded-2xl bg-white border border-gray-200 p-4">
        <div className="text-[13px] font-bold">الكود ديالك — شاركه مع زبائنك</div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 text-center font-bold text-lg tracking-widest bg-gray-50 border border-dashed border-gray-300 rounded-xl py-3" dir="ltr">{data.code}</div>
          <button onClick={copyCode} className="flex-none border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-500">{copied ? "تم ✓" : "نسخ"}</button>
        </div>
        <a href={waHref} target="_blank" rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl py-3 font-bold text-[14px] text-white" style={{ background: "#1FA855" }}>
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1012 2zm5.8 14.2c-.2.6-1.2 1.1-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.7-1.2-4.4-3.9-4.6-4.1-.1-.2-1-1.4-1-2.6 0-1.2.6-1.8.9-2.1.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.7 1.8c.1.2.1.4 0 .5l-.3.5-.3.3c-.1.1-.3.3-.1.5.1.3.7 1.1 1.4 1.7.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.7.8c.3.1.4.2.5.3.1.2.1.7-.1 1.3z"/></svg>
          شارك كودك على واتساب
        </a>
      </section>

      {/* Guide du partenaire — tout le système expliqué */}
      <a href={`/coiffeur/${encodeURIComponent(data.code)}/guide`}
        className="flex items-center justify-between rounded-2xl bg-white border border-gray-200 p-4 active:scale-[.99] transition">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📖</span>
          <div className="text-right">
            <div className="text-[14px] font-extrabold">دليل الشريك</div>
            <div className="text-[12px] text-gray-500">كيفاش تربح أكثر · كل الحالات · نصائح</div>
          </div>
        </div>
        <span className="text-gray-400 text-xl leading-none">‹</span>
      </a>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-2.5">
        <Stat v={fmt(data.total_clients)} k="زبون" />
        <Stat v={fmt(data.total_commandes)} k="طلبية" />
        <Stat v={fmt(data.ce_mois_da)} k="هذا الشهر (دج)" gold />
      </section>

      {/* Historique */}
      {data.history.length > 0 && (
        <>
          <div className="text-[13px] font-bold px-1">آخر أرباحك</div>
          <section className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
            {data.history.map((h, i) => {
              const spend = h.montant_da < 0;
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 first:border-t-0">
                  <div className="flex-none w-9 h-9 rounded-lg grid place-items-center text-[13px] font-bold"
                    style={spend ? { background: "rgba(0,0,0,.05)", color: "#666" } : { background: "rgba(156,122,52,.12)", color: "#9C7A34" }} dir="ltr">
                    {spend ? "↓" : h.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{spend ? "استعملت رصيدك في طلبية" : (h.client_name || "زبون")}</div>
                    <div className="text-[11.5px] text-gray-500 mt-0.5">
                      {!spend && <><span dir="ltr">{h.phone_masked}</span> · </>}{new Date(h.date).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <div className="flex-none text-left">
                    <div className="text-[15px] font-extrabold" style={spend ? { color: "#666" } : undefined}>
                      {spend ? "−" : "+"}{fmt(Math.abs(h.montant_da))} دج
                    </div>
                    {!spend && <StatusChip s={h.statut} />}
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* Avis du coiffeur */}
      <section className="rounded-2xl bg-white border border-gray-200 p-4">
        <div className="text-[13px] font-bold mb-1">رأيك يهمنا 💬</div>
        <p className="text-[11.5px] text-gray-500 mb-2.5">شارك تجربتك — بعد المراجعة، رأيك يظهر للحلاقين الآخرين.</p>
        {myAvis && myAvis.statut === "approved" ? (
          <div className="rounded-xl p-3 text-[13px]" style={{ background: "rgba(63,122,86,.1)", border: "1px solid rgba(63,122,86,.3)" }}>
            <div style={{ color: "#3F7A56" }} className="font-bold text-xs mb-1">رأيك منشور ✅</div>
            «{myAvis.body}»
          </div>
        ) : (
          <>
            <textarea value={avisText} onChange={(e) => setAvisText(e.target.value.slice(0, 500))} rows={3}
              placeholder="اكتب رأيك هنا..." dir="rtl"
              className="w-full rounded-xl border border-gray-200 p-3 text-[13px] focus:outline-none" style={{ background: "#FBF8F1" }} />
            {myAvis && myAvis.statut === "pending" && (
              <p className="text-[11.5px] mt-1.5" style={{ color: "#A9761F" }}>رأيك قيد المراجعة ⏳</p>
            )}
            {avisMsg && <p className="text-[11.5px] mt-1.5" style={{ color: "#3F7A56" }}>{avisMsg}</p>}
            <button onClick={submitAvis} disabled={avisBusy || !avisText.trim()}
              className="mt-2 w-full rounded-xl py-2.5 font-bold text-[13.5px] text-[#20180a] disabled:opacity-50"
              style={{ background: "linear-gradient(180deg,#E3C88A,#CBA45C)" }}>
              {avisBusy ? "..." : "أرسل رأيك"}
            </button>
          </>
        )}
      </section>

      <p className="text-center text-[12px] text-gray-500 pt-1 leading-relaxed">كل زبون تجيبه يزيد رصيدك.<br /><b style={{ color: "#9C7A34" }}>كل ما جبت أكثر، ربحت أكثر.</b></p>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <main dir="rtl" className="min-h-screen bg-[#F3EEE3] px-4 py-6" style={{ color: "#2B2419" }}>
      <div className="max-w-[440px] mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <div className="text-base font-bold"><span style={{ color: "#9C7A34" }}>نجم</span> كواف · شريك</div>
          <div className="text-[10.5px] font-semibold text-gray-500">فضاء خاص</div>
        </div>
        {children}
      </div>
    </main>
  );
}

function Stat({ v, k, gold }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl py-3.5 px-2 text-center">
      <div className="text-xl font-extrabold" style={gold ? { color: "#9C7A34" } : undefined}>{v}</div>
      <div className="text-[11px] text-gray-500 mt-1">{k}</div>
    </div>
  );
}

function StatusChip({ s }) {
  if (s === "valide") return <span className="inline-block text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-full" style={{ color: "#3F7A56", background: "rgba(63,122,86,.14)" }}>مؤكّد</span>;
  if (s === "annule") return <span className="inline-block text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-full text-gray-400 line-through">ملغى</span>;
  return <span className="inline-block text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-full border border-dashed" style={{ color: "#A9761F", borderColor: "rgba(169,118,31,.5)" }}>في الانتظار</span>;
}
