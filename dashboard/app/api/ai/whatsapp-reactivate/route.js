import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, logDecision, daysBetween } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

const MAX_MESSAGES_PER_WEEK = 3;
const MIN_DELAY_HOURS = 48;

export async function GET(req) { return POST(req); }

// Extrait le prénom uniquement (premier mot, max 20 chars)
function extractFirstName(fullName) {
  if (!fullName) return "";
  const clean = String(fullName).trim();
  // Si le nom contient un espace, prendre le premier mot
  const first = clean.split(/\s+/)[0] || clean;
  return first.substring(0, 20);
}

export async function POST(req) {
  if (!cronGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();

  try {
    // Step 1: Build client segments from nc_orders
    const { data: orders } = await sb
      .from("nc_orders")
      .select("customer_phone, full_name, customer_name, order_date, total_price, order_source, items_json")
      .in("order_source", ["nc_boutique", "pos"])
      .not("customer_phone", "is", null)
      .order("order_date", { ascending: false });

    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, message: "No orders to segment" });
    }

    // Aggregate by phone
    const byPhone = {};
    for (const o of orders) {
      const phone = String(o.customer_phone || "").replace(/\s+/g, "").trim();
      if (!phone || phone.length < 9) continue;

      if (!byPhone[phone]) {
        byPhone[phone] = {
          phone,
          full_name: o.full_name || o.customer_name || "",
          orders: [],
          total_spent: 0,
          worlds: new Set(),
        };
      }
      byPhone[phone].orders.push(o);
      byPhone[phone].total_spent += Number(o.total_price) || 0;

      const items = Array.isArray(o.items_json) ? o.items_json : [];
      items.forEach(() => byPhone[phone].worlds.add("coiffure"));
    }

    // Segment each client
    const segments = [];
    const reactivationQueue = [];

    for (const [phone, data] of Object.entries(byPhone)) {
      const lastOrder = data.orders[0]?.order_date;
      const daysSince = lastOrder ? daysBetween(lastOrder) : 999;
      const orderCount = data.orders.length;
      const avgValue =
        orderCount > 0 ? Math.round(data.total_spent / orderCount) : 0;

      let segment;
      if (orderCount >= 5 || data.total_spent > 50000) segment = "vip";
      else if (daysSince <= 30) segment = "active";
      else if (daysSince <= 60) segment = "dormant_30";
      else if (daysSince <= 90) segment = "dormant_60";
      else segment = "dormant_90";

      const world =
        data.worlds.size > 1
          ? "both"
          : data.worlds.values().next().value || "coiffure";

      segments.push({
        phone,
        full_name: data.full_name,
        segment,
        world,
        total_orders: orderCount,
        total_spent_da: data.total_spent,
        last_order_date: lastOrder || null,
        avg_order_value: avgValue,
        days_since_last: daysSince,
        updated_at: new Date().toISOString(),
      });

      // Queue reactivation messages for dormant clients
      const firstName = extractFirstName(data.full_name || data.customer_name);

      if (segment === "dormant_30") {
        reactivationQueue.push({
          phone,
          template_name: "najm_react30_v2",
          template_params: {
            "1": firstName,
            "2": world === "onglerie" ? "الأونقلري" : "الكوافير",
          },
          flow_type: "reactivation",
          world,
          priority: 3,
        });
      } else if (segment === "dormant_60" || segment === "dormant_90") {
        reactivationQueue.push({
          phone,
          template_name: "najm_react60_v2",
          template_params: {
            "1": firstName,
          },
          flow_type: "reactivation",
          world,
          priority: 2,
        });
      }
    }

    // Upsert segments
    for (let i = 0; i < segments.length; i += 200) {
      const batch = segments.slice(i, i + 200);
      await sb.from("nc_ai_client_segments").upsert(batch, {
        onConflict: "phone",
      });
    }

    // Anti-spam: check message limits before queuing
    let queued = 0;
    const watiUrl = process.env.WATI_API_URL;
    const watiToken = process.env.WATI_API_TOKEN;

    for (const msg of reactivationQueue) {
      // Check weekly limit
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count } = await sb
        .from("nc_ai_whatsapp_queue")
        .select("id", { count: "exact", head: true })
        .eq("phone", msg.phone)
        .gte("sent_at", weekAgo)
        .in("status", ["sent", "delivered", "read"]);

      if ((count || 0) >= MAX_MESSAGES_PER_WEEK) continue;

      // Check minimum delay
      const { data: lastMsg } = await sb
        .from("nc_ai_whatsapp_queue")
        .select("sent_at")
        .eq("phone", msg.phone)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        lastMsg?.sent_at &&
        Date.now() - new Date(lastMsg.sent_at).getTime() <
          MIN_DELAY_HOURS * 3600000
      )
        continue;

      // Queue the message
      const { data: inserted } = await sb
        .from("nc_ai_whatsapp_queue")
        .insert(msg)
        .select("id")
        .single();

      // Send via WATI if configured
      if (watiUrl && watiToken && inserted) {
        try {
          const formattedPhone = msg.phone
            .replace(/^0/, "213")
            .replace(/^\+/, "");
          const params = Object.entries(msg.template_params).map(
            ([name, value]) => ({ name, value: String(value) })
          );

          await fetch(
            `${watiUrl}/api/v1/sendTemplateMessage?whatsappNumber=${formattedPhone}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${watiToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                template_name: msg.template_name,
                broadcast_name: `reactivation_${Date.now()}`,
                parameters: params,
              }),
            }
          );

          await sb
            .from("nc_ai_whatsapp_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", inserted.id);

          await sb.from("nc_ai_whatsapp_logs").insert({
            queue_id: inserted.id,
            phone: msg.phone,
            direction: "outbound",
            template_name: msg.template_name,
            wati_status: "sent",
          });

          queued++;
        } catch {
          await sb
            .from("nc_ai_whatsapp_queue")
            .update({ status: "failed", error_message: "WATI send failed" })
            .eq("id", inserted.id);
        }
      } else {
        queued++;
      }
    }

    await logDecision(sb, {
      agent: "reactivation",
      decision_type: "segment_and_reactivate",
      description: `Segmented ${segments.length} clients, queued ${queued} reactivation messages`,
      output_data: {
        total_clients: segments.length,
        segments_breakdown: segments.reduce((acc, s) => {
          acc[s.segment] = (acc[s.segment] || 0) + 1;
          return acc;
        }, {}),
        messages_queued: queued,
      },
      impact: "high",
    });

    return NextResponse.json({
      ok: true,
      segmented: segments.length,
      queued,
    });
  } catch (err) {
    await logDecision(sb, {
      agent: "reactivation",
      decision_type: "segment_and_reactivate",
      description: "Reactivation failed",
      error_message: err.message,
      success: false,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


