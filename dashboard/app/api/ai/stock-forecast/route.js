import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, logDecision, daysAgo } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!cronGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();
  const today = new Date().toISOString().split("T")[0];

  try {
    const [variantsRes, ordersRes, viewsRes] = await Promise.all([
      sb.from("nc_variants")
        .select("variant_id, price, inventory_quantity, world, cost_price, status")
        .eq("status", "active"),
      sb.from("nc_orders")
        .select("items_json, order_date")
        .gte("order_date", daysAgo(90))
        .not("items_json", "is", null)
        .in("order_source", ["nc_boutique", "pos"]),
      sb.from("nc_page_events")
        .select("variant_id")
        .eq("event_type", "PRODUCT_VIEW")
        .gte("created_at", daysAgo(30))
        .not("variant_id", "is", null),
    ]);

    const variants = variantsRes.data || [];
    const orders = ordersRes.data || [];

    // Build weekly sales data per variant (12 weeks)
    const weeklyMap = {};
    orders.forEach((o) => {
      const items = Array.isArray(o.items_json) ? o.items_json : [];
      const weekNum = Math.floor(
        (Date.now() - new Date(o.order_date).getTime()) / (7 * 86400000)
      );
      if (weekNum > 12) return;

      items.forEach((item) => {
        const vid = String(item.variant_id);
        const qty = Number(item.qty || item.quantity || 1);
        if (!weeklyMap[vid]) weeklyMap[vid] = Array(13).fill(0);
        weeklyMap[vid][weekNum] += qty;
      });
    });

    // Views per variant (for demand signals)
    const viewsMap = {};
    (viewsRes.data || []).forEach((e) => {
      viewsMap[e.variant_id] = (viewsMap[e.variant_id] || 0) + 1;
    });

    const forecasts = [];
    const alerts = [];

    for (const v of variants) {
      const vid = v.variant_id;
      const weekly = weeklyMap[vid] || Array(13).fill(0);
      const totalSales90 = weekly.reduce((s, w) => s + w, 0);
      const avgWeekly = totalSales90 / 13;

      // Simple linear trend (slope over 12 weeks)
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < 13; i++) {
        sumX += i;
        sumY += weekly[12 - i]; // oldest to newest
        sumXY += i * weekly[12 - i];
        sumX2 += i * i;
      }
      const n = 13;
      const slope =
        sumX2 * n - sumX * sumX !== 0
          ? (sumXY * n - sumX * sumY) / (sumX2 * n - sumX * sumX)
          : 0;

      let trend = "stable";
      if (slope > 0.1) trend = "rising";
      else if (slope < -0.1) trend = "declining";

      const demand30 = Math.max(0, Math.round(avgWeekly * 4.3));
      const demand60 = Math.max(0, Math.round(avgWeekly * 8.6));
      const demand90 = Math.max(0, Math.round(avgWeekly * 13));

      const dailySales = demand30 / 30;
      const stockDays =
        dailySales > 0 ? v.inventory_quantity / dailySales : 999;
      const reorderPoint = Math.ceil(demand30 * 1.5);
      const reorderQty = Math.max(
        0,
        Math.ceil(demand30 * 2 - v.inventory_quantity)
      );

      const confidence = totalSales90 > 10 ? 0.8 : totalSales90 > 3 ? 0.6 : 0.3;

      forecasts.push({
        variant_id: vid,
        forecast_date: today,
        demand_30d: demand30,
        demand_60d: demand60,
        demand_90d: demand90,
        confidence,
        trend,
        current_stock: v.inventory_quantity,
        reorder_point: reorderPoint,
        reorder_qty: reorderQty,
        world: v.world || "coiffure",
      });

      // Generate alerts
      if (v.inventory_quantity <= 0 && totalSales90 > 0) {
        alerts.push({
          variant_id: vid,
          alert_type: "out_of_stock",
          severity: "critical",
          message: `En rupture avec ${totalSales90} ventes sur 90j`,
          current_stock: 0,
          threshold: reorderPoint,
          suggested_action: "reorder",
          world: v.world || "coiffure",
        });
      } else if (stockDays < 7 && totalSales90 > 0) {
        alerts.push({
          variant_id: vid,
          alert_type: "low_stock",
          severity: "critical",
          message: `Seulement ${Math.round(stockDays)}j de stock (${v.inventory_quantity} unités)`,
          current_stock: v.inventory_quantity,
          threshold: reorderPoint,
          suggested_action: "reorder",
          world: v.world || "coiffure",
        });
      } else if (stockDays < 14 && totalSales90 > 0) {
        alerts.push({
          variant_id: vid,
          alert_type: "low_stock",
          severity: "high",
          message: `${Math.round(stockDays)}j de stock restant`,
          current_stock: v.inventory_quantity,
          threshold: reorderPoint,
          suggested_action: "reorder",
          world: v.world || "coiffure",
        });
      } else if (
        totalSales90 === 0 &&
        v.inventory_quantity > 0
      ) {
        alerts.push({
          variant_id: vid,
          alert_type: "dead_stock",
          severity: "medium",
          message: `0 vente en 90 jours, ${v.inventory_quantity} unités en stock`,
          current_stock: v.inventory_quantity,
          suggested_action: "liquidate",
          world: v.world || "coiffure",
        });
      }
    }

    // Upsert forecasts
    await sb.from("nc_ai_demand_forecast").delete().eq("forecast_date", today);
    for (let i = 0; i < forecasts.length; i += 500) {
      await sb
        .from("nc_ai_demand_forecast")
        .insert(forecasts.slice(i, i + 500));
    }

    // Insert new alerts (clear old unacknowledged ones first)
    await sb
      .from("nc_ai_stock_alerts")
      .delete()
      .eq("acknowledged", false);
    if (alerts.length > 0) {
      for (let i = 0; i < alerts.length; i += 500) {
        await sb.from("nc_ai_stock_alerts").insert(alerts.slice(i, i + 500));
      }
    }

    await logDecision(sb, {
      agent: "stock",
      decision_type: "weekly_forecast",
      description: `Forecasted ${forecasts.length} products, generated ${alerts.length} stock alerts`,
      output_data: {
        forecasted: forecasts.length,
        alerts: alerts.length,
        critical: alerts.filter((a) => a.severity === "critical").length,
        dead_stock: alerts.filter((a) => a.alert_type === "dead_stock").length,
      },
      impact: "medium",
    });

    return NextResponse.json({
      ok: true,
      forecasted: forecasts.length,
      alerts: alerts.length,
    });
  } catch (err) {
    await logDecision(sb, {
      agent: "stock",
      decision_type: "weekly_forecast",
      description: "Stock forecast failed",
      error_message: err.message,
      success: false,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
