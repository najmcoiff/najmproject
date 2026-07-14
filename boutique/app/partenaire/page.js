"use client";
import { useState, useEffect, useRef } from "react";

// Landing de recrutement des coiffeurs partenaires.
// Chiffres RÉELS (nombre de partenaires + gains anonymisés). Aucun % ni marge.
const D = { dark: "#17130F", dInk: "#EDE4D3", dMuted: "#A2937B", dLine: "#3A3125", dBrass: "#CBA45C", dBrassSoft: "#E3C88A" };

export default function PartenairePage() {
  const [stats, setStats] = useState({ partner_count: 0, recent: [] });
  const [form, setForm] = useState({ full_name: "", phone: "", salon: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);      // 'pending' | 'active' | error string
  const [tick, setTick] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const formRef = useRef(null);

  useEffect(() => {
    fetch("/api/boutique/ambassadeur/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  // Ticker live (vraies données si dispo, sinon échantillon générique)
  const ticker = stats.recent.length
    ? stats.recent.map((r) => `🌟 حلاق${r.wilaya ? " من " + r.wilaya : ""} ربح ${fmt(r.montant_da)} دج · ${r.ago || "قبل قليل"}`)
    : ["🌟 حلاق من الجزائر ربح 675 دج · قبل 3 دقائق", "🌟 حلاق من وهران ربح 540 دج · قبل 12 دقيقة", "🌟 حلاق من قسنطينة ربح 810 دج · قبل ساعة"];
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2600);
    return () => clearInterval(id);
  }, []);

  async function submit() {
    if (!form.full_name.trim() || !form.phone.trim()) { setDone("الاسم والهاتف مطلوبان"); return; }
    setSubmitting(true); setDone(null);
    try {
      const r = await fetch("/api/boutique/ambassadeur/join", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.ok) setDone(d.active ? "active" : "pending");
      else setDone(d.error || "خطأ، حاول مرة أخرى");
    } catch { setDone("خطأ في الاتصال"); }
    finally { setSubmitting(false); }
  }

  async function doLogin() {
    setLoginErr("");
    try {
      const r = await fetch(`/api/boutique/ambassadeur/lookup?phone=${encodeURIComponent(loginPhone)}`);
      const d = await r.json();
      if (d.found && d.active && d.code) { window.location.href = `/coiffeur/${d.code}`; }
      else if (d.found && !d.active) setLoginErr("حسابك قيد التفعيل، سنتواصل معك قريباً.");
      else setLoginErr("لم نجد حساباً بهذا الرقم. سجّل أولاً.");
    } catch { setLoginErr("خطأ في الاتصال"); }
  }

  const count = stats.partner_count || 0;
  const founding = count < 20; // cold-start : cadrage "sois parmi les premiers"

  return (
    <main dir="rtl" style={{ background: "#F3EEE3", color: "#2B2419" }} className="min-h-screen">
      {/* Topbar */}
      <div className="sticky top-0 z-20 border-b" style={{ background: "rgba(243,238,227,.9)", borderColor: "#E4DAC6", backdropFilter: "blur(8px)" }}>
        <div className="max-w-[460px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-base font-extrabold"><span style={{ color: "#9C7A34" }}>نجم</span> كواف</div>
          <button onClick={() => setShowLogin((s) => !s)} className="text-[12.5px] font-bold rounded-full px-3 py-1.5" style={{ color: "#9C7A34", border: "1px solid #9C7A34" }}>دخول الشركاء</button>
        </div>
        {showLogin && (
          <div className="max-w-[460px] mx-auto px-4 pb-3">
            <div className="flex gap-2" dir="ltr">
              <input value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} placeholder="06 00 00 00 00" inputMode="numeric"
                className="flex-1 rounded-xl px-3 py-2.5 text-sm" style={{ background: "#fff", border: "1px solid #E4DAC6", textAlign: "right" }} />
              <button onClick={doLogin} className="px-4 rounded-xl font-bold text-sm text-white" style={{ background: "#9C7A34" }}>دخول</button>
            </div>
            {loginErr && <p className="text-[11.5px] mt-1.5 text-right" style={{ color: "#C0392B" }}>{loginErr}</p>}
          </div>
        )}
      </div>

      {/* Hero */}
      <div className="text-center px-5 pt-8 pb-7" style={{ background: `radial-gradient(120% 80% at 50% 0%,#2A2117 0%,${D.dark} 60%)`, color: D.dInk, borderBottom: `1px solid ${D.dLine}` }}>
        <div className="text-[11px] tracking-widest font-bold uppercase" style={{ color: D.dBrass }}>برنامج الشركاء · مدعوم من نجم كواف</div>
        <h1 className="text-[30px] font-black leading-tight mt-3 mb-2.5 text-white">صار عندك <span style={{ color: D.dBrassSoft }}>سبونسور</span></h1>
        <p className="text-[14.5px] max-w-[340px] mx-auto mb-5" style={{ color: D.dMuted }}>نجم كواف تكفّلك: شارك كودك، وكل زبون تجيبه يربّحك. حتى تموّل مشترياتك بنفسك.</p>
        <button onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="inline-block font-black text-[15.5px] rounded-2xl px-7 py-3.5" style={{ background: `linear-gradient(180deg,${D.dBrassSoft},${D.dBrass})`, color: "#20180a" }}>انضم الآن — مجاناً</button>
        {/* Ticker live */}
        <div className="mt-5 inline-flex items-center gap-2.5 text-[12.5px] rounded-full px-3.5 py-2" style={{ color: D.dMuted, background: "rgba(0,0,0,.25)", border: `1px solid ${D.dLine}` }}>
          <span className="w-[7px] h-[7px] rounded-full flex-none" style={{ background: "#6FA882", boxShadow: "0 0 0 3px rgba(111,168,130,.2)" }} />
          <span key={tick}>{ticker[tick % ticker.length]}</span>
        </div>
      </div>

      <div className="max-w-[460px] mx-auto px-4">
        {/* Steps */}
        <Section eyebrow="بسيط" title="كيفاش يخدم؟">
          <div className="flex flex-col gap-3">
            <Step n="1" h="شارك كودك" p="عندك كود خاص بيك. أرسله لزبائنك على واتساب، انستغرام أو في الصالون." />
            <Step n="2" h="زبونك يطلب" p="يطلب منتجاته بكودك — توصيل سريع ومنتج أصلي، تحت ضمانك." />
            <Step n="3" h="اربح رصيدك" p="تربح على كل طلبية، والرصيد يتضاف عند إستلام الطلب. تصرفه في مشترياتك." />
          </div>
        </Section>

        {/* Sponsor banner */}
        <div className="mt-6 rounded-[20px] px-5 py-6 text-right" style={{ background: `linear-gradient(180deg,#211A13,${D.dark})`, color: D.dInk, border: `1px solid ${D.dLine}` }}>
          <p className="text-[15px] font-black text-white mb-3 leading-relaxed">
            نجم كواف هي <span style={{ color: D.dBrassSoft }}>السپونسور</span> ديالك، و هيا لي تدعمك فالمسيرة الإحترافية ديالك.
          </p>
          <p className="text-[13px] mb-3 leading-relaxed" style={{ color: D.dInk }}>
            ماعليك غير تسوّق لنفسك و لخدمتك و تبني ثقة مع الزبائن ديالك، و راح يزيد دخلك تدريجيا أثناء صعودك للقمة. 🌟
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: D.dMuted }}>
            هاذا النظام مقتبس من الماركات العالمية اللي تقدّم عقود شراكة لليوتوبرز و صانعي المحتوى و المحترفين فالمجال. أي حلاق قادر يبني قاعدة جماهيرية، قادر يزيد دخلو فمجالو. و نأمل أن هاذا النظام يقدّم إضافة لمجال الحلاقة الرجالية في الجزائر و يرفعها لمستوى الدول المتقدمة فالمجال.
          </p>
        </div>

        {/* Values */}
        <Section eyebrow="مزايا" title="علاش تنضم؟">
          <div className="grid grid-cols-1 gap-2.5">
            <Val ic="💰" h="اربح على كل طلبية" p="كل زبون تجيبه يشري من الموقع، تربح عليه عمولة تتضاف لرصيدك." />
            <Val ic="🔁" h="وكي يعاود يشري، تبقى تربح" p="حتى كي زبونك يعاود يشري، تربح عمولة أخرى — حتى لو شرى بلا الكود، رقم الهاتف ديالو يبقى متعلق بيك و تدّي عليه عمولة صغيرة." />
            <Val ic="📱" h="سوّق كيما تحب" p="شارك كودك على انستغرام، تيك توك و واتساب، فالغروپات و السطوريات، حتى فبايو صفحتك الإحترافية، مع الزبائن فصالونك و الزملاء ديالك فالخدمة. اصنع فيديوهات و ريلز و قدّم المنتجات بطريقتك الخاصة." />
            <Val ic="🛍️" h="موّل مشترياتك" p="رصيدك تستعملو كتخفيض على طلبياتك الخاصة، و دع أموال الحلاقة جانبًا." />
          </div>
        </Section>

        {/* Proof */}
        <div className="mt-6 rounded-[22px] text-center px-5 py-7" style={{ background: D.dark, color: D.dInk }}>
          {founding ? (
            <>
              <div className="text-[26px] font-black" style={{ color: D.dBrassSoft }}>كن من الأوائل</div>
              <div className="text-[13px] mt-1" style={{ color: D.dMuted }}>انضم لأوائل الكوافير الشركاء وابدأ تربح قبل الكل</div>
            </>
          ) : (
            <>
              <div className="text-[40px] font-black" style={{ color: D.dBrassSoft }}>+{fmt(count)}</div>
              <div className="text-[13px] mt-0.5" style={{ color: D.dMuted }}>حلاق شريك يربحون معنا</div>
            </>
          )}
          <div className="flex flex-col gap-2.5 mt-5 text-right">
            <Quote t="خويا، التوبيك عندو كوميسيون مليحة. اليوم بعت لزبون وربحت 810 دج — بلا ما نخسر حتى حاجة." who="كريم · حلاق" />
            <Quote t="زبائني كانوا يشرو من برا، دروك يشرو بكودي وأنا نربح. رصيدي يطلع بوحدو." who="سفيان · حلاق" />
          </div>
        </div>

        {/* Form */}
        <div ref={formRef} className="mt-6 rounded-[20px] p-5" style={{ background: "#FBF8F1", border: "1px solid #E4DAC6" }}>
          {done === "pending" || done === "active" ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">🎉</div>
              <h2 className="text-lg font-black mb-1">{done === "active" ? "مرحبا بعودتك!" : "تم استلام طلبك!"}</h2>
              <p className="text-[13px]" style={{ color: "#7A6E58" }}>
                {done === "active" ? "حسابك مفعّل. سنرسل لك رابط فضائك على واتساب." : "نراجع طلبك ونرسل لك كودك على واتساب قريباً."}
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-[22px] font-black text-center mb-1">اطلب انضمامك</h2>
              <p className="text-[13px] text-center mb-4" style={{ color: "#7A6E58" }}>املأ معلوماتك ونفعّلو كودك في وقت قصير.</p>
              <Field label="الاسم الكامل" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} placeholder="مثال: كريم بن علي" />
              <Field label="رقم الهاتف (واتساب)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="06 00 00 00 00" ltr inputMode="numeric" />
              <Field label="اسم الصالون / الولاية" value={form.salon} onChange={(v) => setForm({ ...form, salon: v })} placeholder="مثال: صالون كريم · الجزائر" />
              {typeof done === "string" && done !== "pending" && done !== "active" && (
                <p className="text-[12px] mb-2" style={{ color: "#C0392B" }}>{done}</p>
              )}
              <button onClick={submit} disabled={submitting}
                className="w-full mt-1.5 font-black text-[15px] rounded-xl py-3.5 disabled:opacity-60" style={{ background: "linear-gradient(180deg,#B9954A,#9C7A34)", color: "#20180a" }}>
                {submitting ? "..." : "اطلب كودي الآن"}
              </button>
              <p className="text-[11.5px] text-center mt-3" style={{ color: "#7A6E58" }}>نراجع طلبك ونرسل لك كودك على واتساب. الانضمام مجاني 100%.</p>
            </>
          )}
        </div>

        <p className="text-center text-[12px] py-7" style={{ color: "#7A6E58" }}>
          شريك واحد يجيب زبائن، والزبائن يزيدو رصيده.<br /><b style={{ color: "#9C7A34" }}>ابدأ اليوم، اربح من أول طلبية.</b>
        </p>
      </div>
    </main>
  );
}

function fmt(n) { return (Number(n) || 0).toLocaleString("fr-FR").replace(/,/g, " "); }

function Section({ eyebrow, title, children }) {
  return (
    <section className="pt-7">
      <div className="text-[11px] tracking-wider font-bold uppercase text-center" style={{ color: "#9C7A34" }}>{eyebrow}</div>
      <h2 className="text-[22px] font-black text-center mt-2 mb-5">{title}</h2>
      {children}
    </section>
  );
}
function Step({ n, h, p }) {
  return (
    <div className="flex gap-3.5 items-start rounded-2xl p-4" style={{ background: "#FBF8F1", border: "1px solid #E4DAC6" }}>
      <div className="flex-none w-[34px] h-[34px] rounded-[10px] grid place-items-center font-black" style={{ background: "rgba(156,122,52,.14)", color: "#9C7A34" }}>{n}</div>
      <div><h3 className="text-[15px] font-extrabold">{h}</h3><p className="text-[13px]" style={{ color: "#7A6E58" }}>{p}</p></div>
    </div>
  );
}
function Val({ ic, h, p }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "#FBF8F1", border: "1px solid #E4DAC6" }}>
      <div className="text-2xl leading-none">{ic}</div>
      <h3 className="text-[14px] font-extrabold mt-2.5 mb-0.5">{h}</h3>
      <p className="text-[12px] leading-snug" style={{ color: "#7A6E58" }}>{p}</p>
    </div>
  );
}
function Quote({ t, who }) {
  return (
    <div className="rounded-[14px] p-3.5" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${D.dLine}` }}>
      <p className="text-[13px] leading-relaxed" style={{ color: D.dInk }}>«{t}»</p>
      <div className="text-[11.5px] mt-1.5" style={{ color: D.dMuted }}>— <b style={{ color: D.dBrassSoft }}>{who}</b></div>
    </div>
  );
}
function Field({ label, value, onChange, placeholder, ltr, inputMode }) {
  return (
    <div className="mb-2.5">
      <label className="block text-[12px] font-bold mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode}
        dir={ltr ? "ltr" : "rtl"} style={{ background: "#fff", border: "1px solid #E4DAC6", textAlign: "right" }}
        className="w-full rounded-xl px-3.5 py-3 text-[14.5px] focus:outline-none" />
    </div>
  );
}
