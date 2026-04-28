import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, logDecision, daysAgo, formatDA } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!cronGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  try {
    const yesterdayStart = `${yesterday}T00:00:00.000Z`;
    const yesterdayEnd = `${yesterday}T23:59:59.999Z`;

    const [ordersRes, prevOrdersRes, segmentsRes, waRes, alertsRes, contentRes, campaignsRes] =
      await Promise.all([
        sb.from("nc_orders")
          .select("total_price, order_source, customer_phone")
          .gte("order_date", yesterdayStart)
          .lte("order_date", yesterdayEnd)
          .in("order_source", ["nc_boutique", "pos"]),
        sb.from("nc_orders")
          .select("total_price")
          .gte("order_date", daysAgo(2).split("T")[0] + "T00:00:00.000Z")
          .lte("order_date", daysAgo(2).split("T")[0] + "T23:59:59.999Z")
          .in("order_source", ["nc_boutique", "pos"]),
        sb.from("nc_ai_client_segments")
          .select("segment", { count: "exact" })
          .eq("segment", "dormant_30"),
        sb.from("nc_ai_whatsapp_logs")
          .select("id", { count: "exact" })
          .eq("direction", "outbound")
          .gte("created_at", yesterdayStart),
        sb.from("nc_ai_stock_alerts")
          .select("id", { count: "exact" })
          .eq("acknowledged", false)
          .eq("severity", "critical"),
        sb.from("nc_ai_content_queue")
          .select("id", { count: "exact" })
          .eq("status", "published")
          .gte("created_at", yesterdayStart),
        sb.from("nc_ai_campaigns")
          .select("roas, status")
          .eq("status", "active"),
      ]);

    const orders = ordersRes.data || [];
    const prevOrders = prevOrdersRes.data || [];
    const revenue = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const prevRevenue = prevOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const variation =
      prevRevenue > 0
        ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100)
        : 0;
    const avgOrder = orders.length > 0 ? Math.round(revenue / orders.length) : 0;
    const uniquePhones = new Set(orders.map((o) => o.customer_phone)).size;

    const activeCampaigns = campaignsRes.data || [];
    const avgRoas =
      activeCampaigns.length > 0
        ? Math.round(
            (activeCampaigns.reduce((s, c) => s + Number(c.roas || 0), 0) /
              activeCampaigns.length) *
              100
          ) / 100
        : 0;

    // Health score calculation
    const revenueScore = Math.min(30, (revenue / 80000) * 30);
    const conversionScore = orders.length > 0 ? 15 : 0;
    const stockScore = (alertsRes.count || 0) === 0 ? 15 : 5;
    const campaignScore = avgRoas > 2 ? 15 : avgRoas > 0 ? 10 : 5;
    const customerScore = uniquePhones > 3 ? 10 : uniquePhones * 3;
    const contentScore = (contentRes.count || 0) > 0 ? 10 : 5;
    const healthScore = Math.round(
      revenueScore + conversionScore + stockScore + campaignScore + customerScore + contentScore
    );

    const kpis = {
      revenue_da: revenue,
      orders_count: orders.length,
      avg_order_value: avgOrder,
      new_customers: uniquePhones,
      reactivated_customers: 0,
      whatsapp_sent: waRes.count || 0,
      campaigns_active: activeCampaigns.length,
      campaigns_roas: avgRoas,
      content_published: contentRes.count || 0,
      stock_alerts_critical: alertsRes.count || 0,
    };

    const insights = [];
    if (variation > 10)
      insights.push(`CA en hausse de ${variation}% vs la veille`);
    if (variation < -10)
      insights.push(`CA en baisse de ${Math.abs(variation)}% — surveiller`);
    if ((alertsRes.count || 0) > 0)
      insights.push(`${alertsRes.count} alertes stock critiques à traiter`);
    if (orders.length === 0) insights.push("Aucune commande hier — vérifier");
    if (avgRoas > 5) insights.push(`Excellent ROAS de ${avgRoas}x`);

    // Upsert daily report
    const { error: upsertErr } = await sb.from("nc_ai_daily_reports").upsert(
      {
        report_date: yesterday,
        report_type: "daily",
        health_score: healthScore,
        kpis,
        insights,
        actions_taken: [],
      },
      { onConflict: "report_date,report_type" }
    );

    if (upsertErr) throw upsertErr;

    // Send to owner via WATI (if configured)
    const watiUrl = process.env.WATI_API_URL;
    const watiToken = process.env.WATI_API_TOKEN;
    const ownerPhone = process.env.WATI_OWNER_PHONE;

    let sentVia = null;
    if (watiUrl && watiToken && ownerPhone) {
      try {
        await fetch(`${watiUrl}/api/v1/sendTemplateMessage?whatsappNumber=${ownerPhone}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${watiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_name: "daily_report",
            broadcast_name: `daily_report_${yesterday}`,
            parameters: [
              { name: "1", value: yesterday },
              { name: "2", value: formatDA(revenue) },
              { name: "3", value: `${variation > 0 ? "+" : ""}${variation}%` },
              { name: "4", value: String(orders.length) },
              { name: "5", value: formatDA(avgOrder) },
              { name: "6", value: "—" },
              { name: "7", value: String(0) },
              { name: "8", value: String(waRes.count || 0) },
              { name: "9", value: String(healthScore) },
              { name: "10", value: insights[0] || "RAS" },
            ],
          }),
        });
        sentVia = "whatsapp";
      } catch {
        sentVia = "dashboard";
      }
    }

    if (sentVia) {
      await sb
        .from("nc_ai_daily_reports")
        .update({ sent_via: sentVia })
        .eq("report_date", yesterday)
        .eq("report_type", "daily");
    }

    await logDecision(sb, {
      agent: "commander",
      decision_type: "daily_report",
      description: `Daily report for ${yesterday}: ${formatDA(revenue)}, ${orders.length} orders, score ${healthScore}/100`,
      output_data: { kpis, health_score: healthScore },
      impact: "low",
    });

    return NextResponse.json({
      ok: true,
      report_date: yesterday,
      health_score: healthScore,
      kpis,
      insights,
      sent_via: sentVia,
    });
  } catch (err) {
    await logDecision(sb, {
      agent: "commander",
      decision_type: "daily_report",
      description: "Daily report failed",
      error_message: err.message,
      success: false,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
