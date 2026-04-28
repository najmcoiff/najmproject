import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MerciPixelFire from "@/components/MerciPixelFire";
import { createServiceClient } from "@/lib/supabase";
import { formatPrice, formatDate } from "@/lib/utils";

export default async function MerciPage({ params }) {
  const { id } = await params;

  let order = null;
  let whatsappNumber = null;
  try {
    const sb = createServiceClient();
    const isOrderName = String(id).startsWith("NC-");
    const field = isOrderName ? "order_name" : "order_id";

    const [orderRes, configRes] = await Promise.all([
      sb.from("nc_orders")
        .select("order_id, order_name, full_name, customer_first_name, customer_last_name, wilaya, customer_commune, items_json, total_price, created_at, delivery_mode, delivery_type")
        .eq(field, id)
        .maybeSingle(),
      sb.from("nc_boutique_config")
        .select("value")
        .eq("key", "whatsapp_number")
        .maybeSingle(),
    ]);

    order = orderRes.data;
    const rawPhone = configRes.data?.value;
    if (rawPhone && rawPhone !== "213XXXXXXXXX") {
      whatsappNumber = rawPhone.replace(/\D/g, "");
    }
  } catch {}

  const displayName = order?.order_name || (String(id).startsWith("NC-") ? id : `#${id?.slice(0, 8)}`);
  const items = Array.isArray(order?.items_json) ? order.items_json : [];

  const fullName = order?.full_name
    || [order?.customer_first_name, order?.customer_last_name].filter(Boolean).join(" ")
    || "";
  const commune  = order?.customer_commune || "";
  const wilaya   = order?.wilaya || "";
  const total    = order?.total_price ? `${Number(order.total_price).toLocaleString("fr-DZ")} دج` : "";
  const waMessage = [
    `مرحباً، أريد تأكيد طلبي رقم ${displayName}`,
    fullName  ? `الاسم: ${fullName}` : null,
    (wilaya || commune) ? `الولاية: ${[wilaya, commune].filter(Boolean).join(" - ")}` : null,
    total ? `المجموع: ${total}` : null,
  ].filter(Boolean).join("\n");
  const waUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(waMessage)}`
    : null;

  const STEPS = [
    { step: "1", icon: "📞", title: "تأكيد هاتفي",      desc: "سيتصل بك فريقنا لتأكيد طلبك والتحقق من عنوان التسليم." },
    { step: "2", icon: "📦", title: "تحضير الطرد",      desc: "يتم تحضير طلبك وتغليفه بعناية." },
    { step: "3", icon: "🚚", title: "الشحن",             desc: "يُسلَّم الطرد إلى ZR Express للتوصيل." },
    { step: "4", icon: "🏠", title: "التوصيل إليك",     desc: "تستلم طردك وتدفع للمسلّم عند الاستلام." },
  ];

  // Extraire content_ids pour Meta Pixel Purchase (variant_ids des articles)
  const metaContentIds = items
    .map(i => String(i.variant_id || i.id || ""))
    .filter(Boolean);

  return (
    <>
      <MerciPixelFire
        orderId={String(order?.order_id || id)}
        orderTotal={Number(order?.total_price || 0)}
        contentIds={metaContentIds}
      />
      <Header />
      <main dir="rtl" className="max-w-2xl mx-auto px-4 py-12 min-h-screen">

        {/* ── تأكيد بصري ── */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            تم تأكيد طلبك !
          </h1>
          <p className="text-gray-500 text-sm">
            {fullName ? `شكراً ${fullName.split(" ")[0]}، ` : ""}تم استلام طلبك بنجاح.
            سيتصل بك فريقنا قريباً لتأكيد التسليم.
          </p>
        </div>

        {/* ── رقم الطلب ── */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center mb-6">
          <p className="text-xs text-amber-600 font-semibold uppercase tracking-widest mb-1">
            رقم الطلب
          </p>
          <p
            data-testid="merci-order-name"
            dir="ltr"
            className="text-3xl font-bold text-amber-700 font-mono tracking-wide"
          >
            {displayName}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            احتفظ بهذا الرقم لمتابعة طلبك
          </p>
        </div>

        {/* ── ملخص الطلب ── */}
        {order && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <h2 className="font-bold text-gray-900 mb-4 text-sm">تفاصيل الطلب</h2>

            {items.length > 0 && (
              <div className="space-y-2 mb-4">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <div dir="ltr" className="text-right">
                      <span className="text-gray-700">{item.title || item.product_title}</span>
                      {item.variant_title && item.variant_title !== "Default Title" && (
                        <span className="text-gray-400 mr-1">— {item.variant_title}</span>
                      )}
                      <span className="text-gray-400 mr-1">× {item.quantity || item.qty}</span>
                    </div>
                    <span dir="ltr" className="font-medium text-gray-900 shrink-0">
                      {formatPrice(Number(item.price) * (item.quantity || item.qty || 1))}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
              {order.total_price && (
                <div className="flex justify-between font-bold">
                  <span dir="ltr" className="text-amber-600">{formatPrice(order.total_price)}</span>
                  <span>المجموع التقديري</span>
                </div>
              )}
              {order.wilaya && (
                <div className="flex justify-between text-gray-600">
                  <span dir="ltr">{order.wilaya}</span>
                  <span>ولاية التسليم</span>
                </div>
              )}
              {order.created_at && (
                <div className="flex justify-between text-gray-600">
                  <span dir="ltr">{formatDate(order.created_at)}</span>
                  <span>تاريخ الطلب</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ماذا سيحدث الآن ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h2 className="font-bold text-gray-900 mb-4 text-sm">ماذا سيحدث الآن ؟</h2>
          <div className="space-y-3">
            {STEPS.map((s) => (
              <div key={s.step} className="flex gap-3 items-start">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-xs shrink-0" dir="ltr">
                  {s.step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{s.icon} {s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── الأزرار ── */}
        <div className="flex flex-col gap-3">
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2.5 font-bold py-3.5 rounded-2xl text-center transition-colors text-white"
              style={{ background: "#25D366" }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              أكد طلبك عبر واتساب
            </a>
          )}
          <Link
            href={`/suivi/${displayName}`}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3.5 rounded-2xl text-center transition-colors"
          >
            تتبع طلبي
          </Link>
          <Link
            href="/produits"
            className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-3.5 rounded-2xl text-center transition-colors"
          >
            → متابعة التسوق
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
