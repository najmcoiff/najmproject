import { NextResponse } from "next/server";
import { getServiceClient, ownerGuard, daysAgo, formatDA } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!ownerGuard(req))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const sb = getServiceClient();
  const days = Number(req.nextUrl.searchParams.get("days") || 7);
  const since = daysAgo(days);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const [
      ordersRes,
      scoresRes,
      campaignsRes,
      segmentsRes,
      whatsappRes,
      contentRes,
      alertsRes,
      funnelRes,
      reportsRes,
      decisionsRes,
    ] = await Promise.all([
      sb.from("nc_orders")
        .select("order_id, total_price, order_date, order_source, customer_phone, items_json")
        .gte("order_date", since)
        .in("order_source", ["nc_boutique", "pos"]),
      sb.from("nc_ai_product_scores")
        .select("variant_id, health_score, velocity, sales_30d, world")
        .eq("score_date", new Date().toISOString().split("T")[0])
        .order("health_score", { ascending: false })
        .limit(20),
      sb.from("nc_ai_campaigns")
        .select("id, campaign_type, status, roas, budget_spent_da, revenue_da, world")
        .eq("status", "active"),
      sb.from("nc_ai_client_segments")
        .select("segment, world", { count: "exact" }),
      sb.from("nc_ai_whatsapp_logs")
        .select("id, direction, wati_status")
        .gte("created_at", since)
        .eq("direction", "outbound"),
      sb.from("nc_ai_content_queue")
        .select("id, status")
        .gte("created_at", since),
      sb.from("nc_ai_stock_alerts")
        .select("id, severity, alert_type")
        .eq("acknowledged", false),
      sb.from("nc_page_events")
        .select("event_type, session_id")
        .in("event_type", ["PAGE_VIEW", "PRODUCT_VIEW", "CART_ADD", "CHECKOUT_START", "ORDER_PLACED"])
        .gte("created_at", since),
      sb.from("nc_ai_daily_reports")
        .select("report_date, health_score, kpis")
        .order("report_date", { ascending: false })
        .limit(7),
      sb.from("nc_ai_decisions_log")
        .select("agent, decision_type, description, created_at, success")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const orders = ordersRes.data || [];
    const todayOrders = orders.filter(
      (o) => new Date(o.order_date) >= todayStart
    );

    // Revenue
    const revenue = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const todayRevenue = todayOrders.reduce(
      (s, o) => s + (Number(o.total_price) || 0),
      0
    );
    const avgOrderValue =
      orders.length > 0 ? Math.round(revenue / orders.length) : 0;

    // Funnel
    const funnelEvents = funnelRes.data || [];
    const funnelByStep = {};
    funnelEvents.forEach((e) => {
      if (!funnelByStep[e.event_type])
        funnelByStep[e.event_type] = new Set();
      funnelByStep[e.event_type].add(e.session_id);
    });
    const STEPS = [
      "PAGE_VIEW",
      "PRODUCT_VIEW",
      "CART_ADD",
      "CHECKOUT_START",
      "ORDER_PLACED",
    ];
    const funnel = STEPS.map((s) => ({
      step: s,
      sessions: funnelByStep[s]?.size || 0,
    }));

    const pageViews = funnelByStep["PAGE_VIEW"]?.size || 1;
    const orderSessions = funnelByStep["ORDER_PLACED"]?.size || 0;
    const conversionRate = Math.round((orderSessions / pageViews) * 10000) / 100;

    // Segments
    const segments = segmentsRes.data || [];
    const segmentCounts = {};
    segments.forEach((s) => {
      segmentCounts[s.segment] = (segmentCounts[s.segment] || 0) + 1;
    });

    // Campaigns
    const campaigns = campaignsRes.data || [];
    const avgRoas =
      campaigns.length > 0
        ? Math.round(
            (campaigns.reduce((s, c) => s + Number(c.roas || 0), 0) /
              campaigns.length) *
              100
          ) / 100
        : 0;

    // Alerts
    const alerts = alertsRes.data || [];
    const criticalAlerts = alerts.filter(
      (a) => a.severity === "critical"
    ).length;

    // WhatsApp
    const waSent = (whatsappRes.data || []).length;

    // Content
    const content = contentRes.data || [];
    const published = content.filter((c) => c.status === "published").length;

    // Top products
    const topProducts = (scoresRes.data || []).slice(0, 10);

    // Health score from latest report
    const latestReport = (reportsRes.data || [])[0];
    const healthScore = latestReport?.health_score || 0;

    // World split
    const worldSplit = { coiffure: 0, onglerie: 0 };
    orders.forEach((o) => {
      const items = Array.isArray(o.items_json) ? o.items_json : [];
      if (items.length > 0) {
        worldSplit.coiffure++;
      }
    });

    return NextResponse.json({
      ok: true,
      kpi: {
        revenue_da: revenue,
        revenue_formatted: formatDA(revenue),
        today_revenue_da: todayRevenue,
        orders_count: orders.length,
        today_orders: todayOrders.length,
        avg_order_value: avgOrderValue,
        conversion_rate: conversionRate,
        health_score: healthScore,
      },
      funnel,
      segments: segmentCounts,
      campaigns: {
        active: campaigns.length,
        avg_roas: avgRoas,
        list: campaigns,
      },
      whatsapp: { sent: waSent },
      content: { published, total: content.length },
      alerts: { critical: criticalAlerts, total: alerts.length },
      top_products: topProducts,
      recent_decisions: decisionsRes.data || [],
      history: (reportsRes.data || []).map((r) => ({
        date: r.report_date,
        score: r.health_score,
        revenue: r.kpis?.revenue_da || 0,
      })),
      days,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
