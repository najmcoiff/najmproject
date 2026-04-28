import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, logDecision } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

function extractFirstName(fullName) {
  if (!fullName) return "";
  const clean = String(fullName).trim();
  const first = clean.split(/\s+/)[0] || clean;
  return first.substring(0, 20);
}

export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!cronGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();

  try {
    const fourHoursAgo = new Date(Date.now() - 4 * 3600000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();

    // Find sessions that started checkout 2-4h ago but didn't complete
    const { data: checkouts } = await sb
      .from("nc_page_events")
      .select("session_id, metadata, created_at")
      .eq("event_type", "CHECKOUT_START")
      .gte("created_at", fourHoursAgo)
      .lte("created_at", twoHoursAgo);

    if (!checkouts || checkouts.length === 0) {
      return NextResponse.json({ ok: true, abandoned: 0 });
    }

    const sessionIds = [...new Set(checkouts.map((c) => c.session_id))];

    // Check which sessions completed an order
    const { data: completed } = await sb
      .from("nc_page_events")
      .select("session_id")
      .eq("event_type", "ORDER_PLACED")
      .in("session_id", sessionIds)
      .gte("created_at", fourHoursAgo);

    const completedSessions = new Set(
      (completed || []).map((c) => c.session_id)
    );
    const abandoned = sessionIds.filter((s) => !completedSessions.has(s));

    let queued = 0;
    const watiUrl = process.env.WATI_API_URL;
    const watiToken = process.env.WATI_API_TOKEN;

    for (const sessionId of abandoned) {
      // 1. Chercher dans nc_carts en priorité (capturé dès saisie formulaire)
      const { data: cart } = await sb
        .from("nc_carts")
        .select("phone, first_name")
        .eq("session_id", sessionId)
        .not("phone", "is", null)
        .maybeSingle();

      // 2. Fallback : chercher dans nc_orders (client existant)
      const { data: sessionOrder } = !cart?.phone
        ? await sb.from("nc_orders").select("customer_phone, full_name, customer_name").eq("session_id", sessionId).limit(1).maybeSingle()
        : { data: null };

      const phone = cart?.phone || sessionOrder?.customer_phone;
      if (!phone) continue;

      // Anti-spam check
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count } = await sb
        .from("nc_ai_whatsapp_queue")
        .select("id", { count: "exact", head: true })
        .eq("phone", phone)
        .eq("flow_type", "abandon_cart")
        .gte("created_at", weekAgo);

      if ((count || 0) >= 1) continue; // Max 1 abandon cart per week

      // Prénom : depuis nc_carts (first_name direct) ou extraire du nom complet
      const rawName = cart?.first_name || sessionOrder?.full_name || sessionOrder?.customer_name || "";
      const firstName = cart?.first_name
        ? String(cart.first_name).trim().substring(0, 20)
        : extractFirstName(rawName);

      const msg = {
        phone,
        template_name: "najm_cart_v2",
        template_params: { "1": firstName },
        flow_type: "abandon_cart",
        priority: 2,
        status: "queued",
      };

      const { data: inserted } = await sb
        .from("nc_ai_whatsapp_queue")
        .insert(msg)
        .select("id")
        .single();

      if (watiUrl && watiToken && inserted) {
        try {
          const formattedPhone = phone
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
                template_name: "najm_cart_v2",
                broadcast_name: `abandon_cart_${Date.now()}`,
                parameters: [{ name: "1", value: firstName }],
              }),
            }
          );

          await sb
            .from("nc_ai_whatsapp_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", inserted.id);

          await sb.from("nc_ai_whatsapp_logs").insert({
            queue_id: inserted.id,
            phone,
            direction: "outbound",
            template_name: "najm_cart_v2",
            wati_status: "sent",
          });

          queued++;
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
      decision_type: "abandon_cart",
      description: `Found ${abandoned.length} abandoned carts, sent ${queued} reminders`,
      output_data: { abandoned: abandoned.length, queued },
      impact: queued > 0 ? "high" : "low",
    });

    return NextResponse.json({
      ok: true,
      abandoned: abandoned.length,
      queued,
    });
  } catch (err) {
    await logDecision(sb, {
      agent: "reactivation",
      decision_type: "abandon_cart",
      description: "Abandon cart check failed",
      error_message: err.message,
      success: false,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


