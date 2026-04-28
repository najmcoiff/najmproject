import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, logDecision } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!cronGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();

  try {
    // Find orders delivered yesterday (J+1 post-delivery)
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];
    const dayBefore = new Date(Date.now() - 2 * 86400000)
      .toISOString()
      .split("T")[0];

    const { data: delivered } = await sb
      .from("nc_suivi_zr")
      .select("order_id, customer_name, customer_phone, tracking")
      .gte("date_livraison", `${dayBefore}T00:00:00Z`)
      .lte("date_livraison", `${yesterday}T23:59:59Z`)
      .in("statut_livraison", ["Livré", "livré", "delivered"]);

    if (!delivered || delivered.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    let sent = 0;
    const watiUrl = process.env.WATI_API_URL;
    const watiToken = process.env.WATI_API_TOKEN;

    for (const d of delivered) {
      if (!d.customer_phone) continue;

      // Check if we already sent a post-delivery message
      const { count } = await sb
        .from("nc_ai_whatsapp_queue")
        .select("id", { count: "exact", head: true })
        .eq("phone", d.customer_phone)
        .eq("flow_type", "post_delivery")
        .eq("order_id", d.order_id);

      if ((count || 0) > 0) continue;

      // Get order name
      const { data: order } = await sb
        .from("nc_orders")
        .select("order_name")
        .eq("order_id", d.order_id)
        .maybeSingle();

      const firstName = d.customer_name || "";
      const orderName = order?.order_name || d.tracking || "—";

      const msg = {
        phone: d.customer_phone,
        template_name: "najm_delivery_v2",
        template_params: { "1": firstName, "2": orderName },
        flow_type: "post_delivery",
        order_id: d.order_id,
        priority: 4,
      };

      const { data: inserted } = await sb
        .from("nc_ai_whatsapp_queue")
        .insert(msg)
        .select("id")
        .single();

      if (watiUrl && watiToken && inserted) {
        try {
          const formattedPhone = d.customer_phone
            .replace(/^0/, "213")
            .replace(/^\+/, "");
          await fetch(
            `${watiUrl}/api/v1/sendTemplateMessage?whatsappNumber=${formattedPhone}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${watiToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                template_name: "najm_delivery_v2",
                broadcast_name: `post_delivery_${Date.now()}`,
                parameters: [
                  { name: "1", value: firstName },
                  { name: "2", value: orderName },
                ],
              }),
            }
          );

          await sb
            .from("nc_ai_whatsapp_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", inserted.id);

          await sb.from("nc_ai_whatsapp_logs").insert({
            queue_id: inserted.id,
            phone: d.customer_phone,
            direction: "outbound",
            template_name: "najm_delivery_v2",
            wati_status: "sent",
          });

          sent++;
        } catch {
          await sb
            .from("nc_ai_whatsapp_queue")
            .update({ status: "failed" })
            .eq("id", inserted.id);
        }
      }
    }

    await logDecision(sb, {
      agent: "reactivation",
      decision_type: "post_delivery",
      description: `Sent ${sent} post-delivery messages for ${delivered.length} deliveries`,
      output_data: { delivered: delivered.length, sent },
      impact: sent > 0 ? "medium" : "low",
    });

    return NextResponse.json({ ok: true, delivered: delivered.length, sent });
  } catch (err) {
    await logDecision(sb, {
      agent: "reactivation",
      decision_type: "post_delivery",
      description: "Post-delivery check failed",
      error_message: err.message,
      success: false,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


