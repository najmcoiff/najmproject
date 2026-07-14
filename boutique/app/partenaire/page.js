"use client";
import { useState, useEffect, useRef } from "react";

// Landing de recrutement des coiffeurs partenaires.
// Chiffres RÉELS (nombre de partenaires + gains anonymisés). Aucun % ni marge.
const D = { dark: "#17130F", dInk: "#EDE4D3", dMuted: "#A2937B", dLine: "#3A3125", dBrass: "#CBA45C", dBrassSoft: "#E3C88A" };

export default function PartenairePage() {
  const [stats, setStats] = useState({ partner_count: 0, recent: [], testimonials: [] });
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
        <h1 className="text-[28px] font-black leading-tight mt-3 mb-2.5 text-white">من اليوم ولا عندك <span style={{ color: D.dBrassSoft }}>سپونسور</span> !</h1>
        <p className="text-[14.5px] max-w-[360px] mx-auto mb-5" style={{ color: D.dMuted }}>نجم كواف تتكفل، شارك الكود ديالك، وكل زبون تجيبه يربّحك. حتى تموّل مشترياتك بنفسك.</p>
        <button onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="inline-block font-black text-[15.5px] rounded-2xl px-7 py-3.5" style={{ background: `linear-gradient(180deg,${D.dBrassSoft},${D.dBrass})`, color: "#20180a" }}>انضم الآن — مجاناً</button>
        {/* Ticker live */}
        <div className="mt-5 inline-flex items-center gap-2.5 text-[12.5px] rounded-full px-3.5 py-2" style={{ color: D.dMuted, background: "rgba(0,0,0,.25)", border: `1px solid ${D.dLine}` }}>
          <span className="w-[7px] h-[7px] rounded-full flex-none" style={{ background: "#6FA882", boxShadow: "0 0 0 3px rgba(111,168,130,.2)" }} />
          <span key={tick}>{ticker[tick % ticker.length]}</span>
        </div>
      </div>

      <div className="max-w-[460px] mx-auto px-4">
        {/* Vidéo explicative (motion-graphics) */}
        <Section eyebrow="في 30 ثانية" title="كيفاش تربح مع كودك؟">
          <VideoExplainer onCTA={() => formRef.current?.scrollIntoView({ behavior: "smooth" })} />
        </Section>

        {/* Steps */}
        <Section eyebrow="بسيط" title="كيفاش يخدم؟">
          <div className="flex flex-col gap-3">
            <Step n="1" h="شارك الكود ديالك" p="عندك كود خاص بيك. أرسله لزبائنك على واتساب، انستغرام أو في الصالون." />
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
            <Val ic="🤝" h="زبونك يرتاح" p="توصيل سريع، منتج أصلي، و كلش تحت ضمانك." />
            <Val ic="🎁" h="مجاني تماماً" p="بلا اشتراك، بلا رأس مال. تنضم و تبدأ تربح." />
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
          {stats.testimonials && stats.testimonials.length > 0 && (
            <div className="flex flex-col gap-2.5 mt-5 text-right">
              {stats.testimonials.map((q, i) => (
                <Quote key={i} t={q.body} who={`${q.name}${q.city ? " · " + q.city : ""} · حلاق`} />
              ))}
            </div>
          )}
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

// ── Vidéo explicative motion-graphics (100% CSS/JS, 0 tournage) ──────────────
// 5 scènes qui suivent le script darija. Autoplay quand visible, rejouable.
const VE_CAPTIONS = [
  "راك حلاق؟ كل زبون تخدمو يقدر يولّي فلوس فجيبك.",
  "شارك الكود ديالك مع زبائنك. كي يشري، تربح — بلا ما تخسر حتى دورو.",
  "الزبون ياخذ ضمان و توصيل سريع، وانت تجمّع رصيدك.",
  "كل ما جبت أكثر، ربحت أكثر — حتى كي يعاود يشري بلا كود، تبقى تربح.",
  "سجّل دروك، الكود ديالك يستناك.",
];
const VE_DUR = [3000, 4200, 4200, 4400, 4200];

function VideoExplainer({ onCTA }) {
  const [scene, setScene] = useState(-1);   // -1 = poster, 0..4 = scènes
  const [ended, setEnded] = useState(false);
  const [counter, setCounter] = useState(0);
  const frameRef = useRef(null);
  const timers = useRef([]);
  const started = useRef(false);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const play = () => {
    clear(); setEnded(false); setScene(0);
    let acc = 0;
    for (let i = 1; i < VE_DUR.length; i++) {
      acc += VE_DUR[i - 1];
      timers.current.push(setTimeout(() => setScene(i), acc));
    }
    acc += VE_DUR[VE_DUR.length - 1];
    timers.current.push(setTimeout(() => setEnded(true), acc));
  };

  // Autoplay au premier passage à l'écran (respecte reduced-motion)
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
          if (reduce) { setScene(4); setEnded(true); } else { play(); }
        }
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compteur qui grimpe pendant la scène 3
  useEffect(() => {
    if (scene !== 3) return;
    let raf, start;
    const target = 1250, dur = 2400;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      setCounter(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setCounter(0); raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  const disp = ended ? 4 : scene;            // scène affichée (on tient la CTA à la fin)
  const capIdx = ended ? 4 : Math.max(0, scene);

  return (
    <div ref={frameRef} className="ve-frame">
      <style>{VE_CSS}</style>

      {/* Barre de progression 5 segments */}
      <div className="ve-prog">
        {VE_DUR.map((d, i) => (
          <div key={i} className="ve-seg">
            <div className="ve-seg-fill" style={{
              width: (ended || scene > i) ? "100%" : scene === i ? "100%" : "0%",
              transition: scene === i && !ended ? `width ${d}ms linear` : "none",
            }} />
          </div>
        ))}
      </div>

      {/* Filigrane marque */}
      <div className="ve-wm"><span style={{ color: "#9C7A34" }}>نجم</span> كواف</div>

      {/* Scène (rendu conditionnel → l'animation d'entrée rejoue à chaque scène) */}
      <div className="ve-stage">
        {disp === 0 && (
          <div key="s0" className="ve-scene">
            <div className="ve-chip ve-pop">
              <span className="ve-chip-l">الكود ديالك</span>
              <span className="ve-chip-c">karim42</span>
            </div>
            <div className="ve-emoji ve-up" style={{ animationDelay: ".35s" }}>💈</div>
          </div>
        )}

        {disp === 1 && (
          <div key="s1" className="ve-scene">
            <div className="ve-flow">
              <div className="ve-chip sm ve-pop"><span className="ve-chip-c">karim42</span></div>
              <div className="ve-arrow"><i /><i /><i /></div>
              <div className="ve-pot ve-pop" style={{ animationDelay: ".2s" }}>
                <div className="ve-coins">
                  <span className="ve-coin" style={{ animationDelay: ".3s" }}>🪙</span>
                  <span className="ve-coin" style={{ animationDelay: ".6s" }}>🪙</span>
                  <span className="ve-coin" style={{ animationDelay: ".9s" }}>🪙</span>
                </div>
                <div className="ve-pot-ic">👛</div>
              </div>
            </div>
          </div>
        )}

        {disp === 2 && (
          <div key="s2" className="ve-scene ve-split">
            <div className="ve-mini ve-up">
              <div className="ve-mini-ic">📦</div>
              <div className="ve-mini-t">الزبون</div>
              <div className="ve-mini-p">توصيل سريع + ضمان</div>
            </div>
            <div className="ve-mini gold ve-up" style={{ animationDelay: ".25s" }}>
              <div className="ve-bar"><div className="ve-bar-fill" /></div>
              <div className="ve-mini-t" style={{ color: "#E3C88A" }}>الحلاق</div>
              <div className="ve-mini-p" style={{ color: "#CBA45C" }}>رصيدك يكبر 💰</div>
            </div>
          </div>
        )}

        {disp === 3 && (
          <div key="s3" className="ve-scene">
            <div className="ve-count ve-pop">
              <span className="ve-count-n">{fmt(counter)}</span>
              <span className="ve-count-u">دج</span>
            </div>
            <div className="ve-count-l ve-up" style={{ animationDelay: ".2s" }}>كل ما جبت أكثر، ربحت أكثر</div>
          </div>
        )}

        {disp === 4 && (
          <div key="s4" className="ve-scene">
            <button onClick={onCTA} className="ve-cta ve-pop">انضم الآن</button>
            <div className="ve-cta-l ve-up" style={{ animationDelay: ".2s" }}>الكود ديالك يستناك</div>
          </div>
        )}
      </div>

      {/* Sous-titre (voix-off à l'écran) */}
      {scene >= 0 && (
        <div key={"cap" + capIdx} className="ve-cap ve-up">{VE_CAPTIONS[capIdx]}</div>
      )}

      {/* Poster (avant lecture) */}
      {scene === -1 && (
        <button className="ve-poster" onClick={play} aria-label="تشغيل">
          <span className="ve-play">▶</span>
          <span className="ve-poster-t">شوف كيفاش تربح</span>
          <span className="ve-poster-s">30 ثانية</span>
        </button>
      )}

      {/* Rejouer (à la fin, n'occulte pas la CTA) */}
      {ended && (
        <button className="ve-replay" onClick={play}>↻ عاود</button>
      )}
    </div>
  );
}

const VE_CSS = `
.ve-frame{position:relative;width:100%;max-width:342px;margin:0 auto;aspect-ratio:9/13;border-radius:24px;
  background:radial-gradient(120% 90% at 50% 0%,#241C13 0%,#17130F 62%);border:1px solid #3A3125;
  overflow:hidden;box-shadow:0 20px 50px -20px rgba(0,0,0,.6),inset 0 1px 0 rgba(227,200,138,.08)}
.ve-prog{position:absolute;top:12px;left:14px;right:14px;display:flex;gap:5px;z-index:3}
.ve-seg{flex:1;height:3px;border-radius:3px;background:rgba(227,200,138,.16);overflow:hidden}
.ve-seg-fill{height:100%;background:linear-gradient(90deg,#CBA45C,#E3C88A);border-radius:3px}
.ve-wm{position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:11px;font-weight:800;
  letter-spacing:.5px;color:#6b5f49;z-index:3}
.ve-stage{position:absolute;inset:0;display:grid;place-items:center;padding:26px 22px 64px;z-index:2}
.ve-scene{width:100%;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center}
.ve-chip{display:inline-flex;flex-direction:column;align-items:center;gap:4px;padding:16px 26px;border-radius:18px;
  background:linear-gradient(180deg,#2A2117,#1c160f);border:1px solid #4a3d29;box-shadow:0 10px 30px -10px rgba(0,0,0,.7)}
.ve-chip.sm{padding:11px 16px}
.ve-chip-l{font-size:11px;color:#A2937B;font-weight:700}
.ve-chip-c{font-size:26px;font-weight:900;letter-spacing:1px;color:#E3C88A;direction:ltr}
.ve-chip.sm .ve-chip-c{font-size:18px}
.ve-emoji{font-size:34px}
.ve-flow{display:flex;align-items:center;justify-content:center;gap:12px;width:100%}
.ve-arrow{display:flex;gap:5px}
.ve-arrow i{width:6px;height:6px;border-radius:50%;background:#CBA45C;opacity:.35;animation:veDot 1s infinite}
.ve-arrow i:nth-child(2){animation-delay:.15s}
.ve-arrow i:nth-child(3){animation-delay:.3s}
.ve-pot{position:relative;display:grid;place-items:center;width:92px;height:92px}
.ve-pot-ic{font-size:52px}
.ve-coins{position:absolute;top:-6px;left:0;right:0;display:flex;justify-content:center;gap:6px}
.ve-coin{font-size:20px;opacity:0;animation:veCoin .9s ease-out forwards}
.ve-split{flex-direction:row;gap:12px;align-items:stretch}
.ve-mini{flex:1;padding:16px 10px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid #3A3125;
  display:flex;flex-direction:column;align-items:center;gap:5px}
.ve-mini.gold{background:linear-gradient(180deg,rgba(227,200,138,.12),rgba(227,200,138,.03));border-color:#5a4a30}
.ve-mini-ic{font-size:30px}
.ve-mini-t{font-size:14px;font-weight:800;color:#EDE4D3}
.ve-mini-p{font-size:11px;color:#A2937B;line-height:1.4}
.ve-bar{width:20px;height:52px;border-radius:6px;background:rgba(227,200,138,.14);display:flex;align-items:flex-end;overflow:hidden;margin-bottom:2px}
.ve-bar-fill{width:100%;height:12%;background:linear-gradient(0deg,#CBA45C,#E3C88A);border-radius:6px;animation:veGrow 1.6s .2s ease-out forwards}
.ve-count{display:flex;align-items:baseline;gap:8px;direction:ltr}
.ve-count-n{font-size:52px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;line-height:1}
.ve-count-u{font-size:22px;font-weight:800;color:#E3C88A}
.ve-count-l{font-size:14px;font-weight:800;color:#E3C88A}
.ve-cta{padding:15px 40px;border-radius:16px;border:none;cursor:pointer;font-size:18px;font-weight:900;color:#20180a;
  background:linear-gradient(180deg,#E3C88A,#CBA45C);box-shadow:0 12px 34px -10px rgba(227,200,138,.5);animation:vePulse 1.6s ease-in-out infinite}
.ve-cta-l{font-size:14px;color:#A2937B;font-weight:700}
.ve-cap{position:absolute;left:16px;right:16px;bottom:34px;text-align:center;font-size:13.5px;font-weight:700;
  line-height:1.5;color:#EDE4D3;z-index:3;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.ve-poster{position:absolute;inset:0;z-index:4;border:none;cursor:pointer;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:8px;background:radial-gradient(120% 90% at 50% 40%,rgba(36,28,19,.6),rgba(23,19,15,.9))}
.ve-play{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;font-size:22px;color:#20180a;
  background:linear-gradient(180deg,#E3C88A,#CBA45C);box-shadow:0 10px 30px -8px rgba(227,200,138,.5);padding-left:4px}
.ve-poster-t{font-size:16px;font-weight:900;color:#EDE4D3;margin-top:6px}
.ve-poster-s{font-size:12px;color:#A2937B;font-weight:700}
.ve-replay{position:absolute;top:22px;right:14px;z-index:5;padding:6px 12px;border-radius:999px;cursor:pointer;
  font-size:12px;font-weight:800;color:#E3C88A;background:rgba(0,0,0,.4);border:1px solid #4a3d29}
.ve-pop{animation:vePop .5s cubic-bezier(.2,.8,.2,1) both}
.ve-up{animation:veUp .55s ease-out both}
@keyframes vePop{from{opacity:0;transform:scale(.72)}to{opacity:1;transform:scale(1)}}
@keyframes veUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes veCoin{0%{opacity:0;transform:translateY(-34px) scale(.5)}40%{opacity:1}100%{opacity:1;transform:translateY(6px) scale(1)}}
@keyframes veDot{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes veGrow{from{height:12%}to{height:82%}}
@keyframes vePulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@media (prefers-reduced-motion: reduce){.ve-pop,.ve-up,.ve-cta,.ve-coin,.ve-bar-fill{animation:none!important}.ve-cta{transform:none}}
`;
