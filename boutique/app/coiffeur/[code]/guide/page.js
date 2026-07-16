"use client";
import { useParams } from "next/navigation";

// Guide du partenaire (coiffeur) — tout le système expliqué, en darija, sans %.
// Objectif : le coiffeur trouve la réponse à toutes ses questions ici → zéro ticket support.
export default function GuidePartenaire() {
  const { code } = useParams();
  const back = `/coiffeur/${encodeURIComponent(code || "")}`;

  return (
    <main dir="rtl" className="min-h-screen bg-[#F3EEE3] px-4 py-6" style={{ color: "#2B2419" }}>
      <div className="max-w-[440px] mx-auto flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="text-base font-bold"><span style={{ color: "#9C7A34" }}>نجم</span> كواف · دليل الشريك</div>
          <a href={back} className="text-[12px] font-semibold" style={{ color: "#9C7A34" }}>رجوع ›</a>
        </div>

        {/* Intro */}
        <section className="rounded-3xl p-6 text-[#EDE4D3]"
          style={{ background: "radial-gradient(120% 90% at 18% 8%,#2A2117 0%,#17130F 58%)", border: "1px solid #3A3125" }}>
          <div className="text-xl font-black mb-2">📖 دليل الشريك</div>
          <p className="text-[13.5px] leading-relaxed" style={{ color: "#D8CDB8" }}>
            تم تطوير برنامج الشركاء بعد أشهر من الدراسة و العمل، باش ندعمو الحلاقين و نوفّرو فرصة حقيقية لدخل إضافي بطريقة احترافية و عادلة. نجم كواف هي السپونسور ديالك — و كل ما كبّرت شبكتك، كبّر دخلك مع الوقت.
          </p>
        </section>

        {/* Les cas */}
        <GroupTitle emoji="📌" title="كيفاش تربح العمولة — كل الحالات" />

        <Sub title="👤 مع زبائنك">
          <Case n="1" t="الزبون يطلب بكودك" d="تربح عمولة تُضاف لرصيدك المعلّق، و تتأكد بعد توصيل الطلبية." />
          <Case n="2" t="الزبون يعاود يشري بنفس الكود" d="عمولة جديدة على كل طلبية." />
          <Case n="3" t="الزبون يعاود يشري بدون الكود" d="بنفس رقم هاتفه → تربح عمولة أصغر، لأن رقمه يبقى مرتبطًا بشبكتك." />
          <Case warn t="حالة نادرة: زبونك يستعمل كود حلاق آخر" d="ينتقل رقمه إلى شبكة ذلك الحلاق، و تتوقف عمولاتك المستقبلية عنه. لهذا ذكّر زبائنك دائمًا يستعملو كودك." />
        </Sub>

        <Sub title="🤝 مع الحلاقين في شبكتك">
          <Case n="4" t="حلاق يشري بكودك" d="يُعتبر زبون داخل شبكتك، و تربح عمولة على مشترياته." />
          <Case n="5" t="الحلاق يصبح شريك" d="إذا اشترى بدون كود، رقمه يبقى مرتبطًا بشبكتك و تربح عمولة صغيرة على مشترياته." />
          <Case warn t="حالة نادرة: يستعمل كود حلاق آخر" d="ينتقل لشبكته و تتوقف عمولتك عنه. نادر جدًا، لأن أغلب الحلاقين بعد ما ياخذو كودهم يستعملوه في كل مشترياتهم." />
        </Sub>

        <Sub title="💳 مشترياتك أنت">
          <Case n="6" t="تشري لنفسك بكودك" d="تربح عمولة تُضاف لرصيدك المعلّق (تتأكد بعد التوصيل) — كأنك ترجّع جزء من ثمن مشترياتك." />
          <Case n="7" t="استعمل رصيدك" d="خصم فوري على طلبياتك — دفع جزئي أو كامل حسب الرصيد المتوفر." />
        </Sub>

        {/* Astuces */}
        <GroupTitle emoji="🚀" title="نصائح لأكبر دخل ممكن" />
        <section className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col gap-2.5">
          <Tip d="ابدأ مبكرًا و لا تؤجّل — كل يوم يمرّ يعطي غيرك فرصة يبني شبكة أكبر." />
          <Tip d="ركّز على بناء شبكة دائمة، ماشي فقط مبيعات سريعة." />
          <Tip d="شجّع الحلاقين ينضمّوا بكودك، لأنهم غالبًا يشترون باستمرار." />
          <Tip d="حافظ على زبائنك و ذكّرهم دائمًا يستعملو كودك عند كل طلبية." />
          <Tip d="ركّز على الزبائن المتكررين — يحققون لك دخلًا تراكميًا مع الوقت." />
          <Tip d="شارك كودك في كل وسائل التواصل، داخل صالونك، و مع زملائك." />
        </section>

        {/* Notes importantes */}
        <GroupTitle emoji="📢" title="ملاحظات مهمة" />
        <section className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "#FBF8F1", border: "1px solid #E4DAC6" }}>
          <Note d="نرجو الالتزام بالاحترام المتبادل مع فريق العمل. في حال أي إساءة أو تجاوز، تحتفظ نجم كواف بحق إيقاف الحساب و إلغاء كود الشراكة، مع إرجاع رصيدك المستحق إليك." />
          <Note d="نسبة العمولة يحسبها النظام تلقائيًا حسب عدة عوامل داخلية (تكلفة الشراء، توفّر المنتجات، اتفاقيات الموردين، تكاليف الشحن...)، لذلك فهي غير قابلة للتفاوض أو التعديل." />
          <Note d="لأي استفسار حول البرنامج، تواصل عبر واتساب فقط — فريق خدمة الشركاء يرد عليك غالبًا في أقل من 10 دقائق في أوقات العمل." />
        </section>

        {/* Contact WhatsApp support partenaires */}
        <a href="https://wa.me/213798522820?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%D8%8C%20%D8%B9%D9%86%D8%AF%D9%8A%20%D8%B3%D8%A4%D8%A7%D9%84%20%D8%AD%D9%88%D9%84%20%D8%A8%D8%B1%D9%86%D8%A7%D9%85%D8%AC%20%D8%A7%D9%84%D8%B4%D8%B1%D9%83%D8%A7%D8%A1"
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 font-bold text-[14px] text-white" style={{ background: "#1FA855" }}>
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1012 2zm5.8 14.2c-.2.6-1.2 1.1-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.7-1.2-4.4-3.9-4.6-4.1-.1-.2-1-1.4-1-2.6 0-1.2.6-1.8.9-2.1.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.7 1.8c.1.2.1.4 0 .5l-.3.5-.3.3c-.1.1-.3.3-.1.5.1.3.7 1.1 1.4 1.7.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.7.8c.3.1.4.2.5.3.1.2.1.7-.1 1.3z"/></svg>
          عندك سؤال؟ تواصل مع خدمة الشركاء
        </a>

        <a href={back} className="text-center rounded-xl py-3.5 font-bold text-[14px] text-[#20180a] mt-1"
          style={{ background: "linear-gradient(180deg,#E3C88A,#CBA45C)" }}>
          رجوع إلى فضائي
        </a>
      </div>
    </main>
  );
}

function GroupTitle({ emoji, title }) {
  return (
    <div className="flex items-center gap-2 px-1 mt-1">
      <span className="text-xl">{emoji}</span>
      <h2 className="text-[16px] font-black">{title}</h2>
    </div>
  );
}
function Sub({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-bold px-1" style={{ color: "#9C7A34" }}>{title}</div>
      {children}
    </div>
  );
}
function Case({ n, t, d, warn }) {
  return (
    <div className="rounded-2xl p-4 flex gap-3"
      style={{ background: warn ? "#FBF3E8" : "#fff", border: `1px solid ${warn ? "#E8D3B0" : "#E4DAC6"}` }}>
      <div className="flex-none w-7 h-7 rounded-full grid place-items-center text-[13px] font-black"
        style={{ background: warn ? "rgba(200,140,50,.15)" : "rgba(156,122,52,.12)", color: warn ? "#B26B1B" : "#9C7A34" }}>
        {warn ? "⚠️" : n}
      </div>
      <div className="flex-1">
        <h3 className="text-[14px] font-extrabold leading-snug">{t}</h3>
        <p className="text-[12.5px] leading-snug mt-0.5" style={{ color: "#7A6E58" }}>{d}</p>
      </div>
    </div>
  );
}
function Tip({ d }) {
  return (
    <div className="flex gap-2.5 text-[13px] leading-snug">
      <span className="flex-none" style={{ color: "#9C7A34" }}>✔</span>
      <span>{d}</span>
    </div>
  );
}
function Note({ d }) {
  return (
    <div className="flex gap-2.5 text-[12.5px] leading-relaxed" style={{ color: "#5E5545" }}>
      <span className="flex-none">•</span>
      <span>{d}</span>
    </div>
  );
}
