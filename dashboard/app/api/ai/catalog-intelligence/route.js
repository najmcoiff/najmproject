import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, logDecision, normalize, daysAgo } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!cronGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();
  const now = new Date().toISOString().split("T")[0];

  try {
    const [variantsRes, ordersRes, viewsRes, cartAddsRes, poLinesRes] =
      await Promise.all([
        sb.from("nc_variants")
          .select("variant_id, price, inventory_quantity, world, is_new, status, cost_price")
          .eq("status", "active"),
        sb.from("nc_orders")
          .select("items_json, order_date, total_price")
          .gte("order_date", daysAgo(90))
          .not("items_json", "is", null),
        sb.from("nc_page_events")
          .select("variant_id")
          .eq("event_type", "PRODUCT_VIEW")
          .gte("created_at", daysAgo(30))
          .not("variant_id", "is", null),
        sb.from("nc_page_events")
          .select("variant_id")
          .eq("event_type", "CART_ADD")
          .gte("created_at", daysAgo(30))
          .not("variant_id", "is", null),
        sb.from("nc_po_lines")
          .select("variant_id, purchase_price"),
      ]);

    const variants = variantsRes.data || [];
    const orders = ordersRes.data || [];

    // Count sales per variant (last 30 days)
    const salesMap = {};
    const sales90Map = {};
    orders.forEach((o) => {
      const items = Array.isArray(o.items_json) ? o.items_json : [];
      const orderDate = new Date(o.order_date);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      items.forEach((item) => {
        const vid = String(item.variant_id);
        const qty = Number(item.qty || item.quantity || 1);
        sales90Map[vid] = (sales90Map[vid] || 0) + qty;
        if (orderDate >= thirtyDaysAgo) {
          salesMap[vid] = (salesMap[vid] || 0) + qty;
        }
      });
    });

    // Count views per variant
    const viewsMap = {};
    (viewsRes.data || []).forEach((e) => {
      viewsMap[e.variant_id] = (viewsMap[e.variant_id] || 0) + 1;
    });

    // Count cart adds per variant
    const cartMap = {};
    (cartAddsRes.data || []).forEach((e) => {
      cartMap[e.variant_id] = (cartMap[e.variant_id] || 0) + 1;
    });

    // Cost map from PO lines
    const costMap = {};
    (poLinesRes.data || []).forEach((p) => {
      if (p.purchase_price) costMap[p.variant_id] = Number(p.purchase_price);
    });

    // Calculate scores
    const maxSales = Math.max(1, ...Object.values(salesMap));
    const maxViews = Math.max(1, ...Object.values(viewsMap));

    const scores = [];
    const recommendations = [];

    for (const v of variants) {
      const vid = v.variant_id;
      const sales30 = salesMap[vid] || 0;
      const views30 = viewsMap[vid] || 0;
      const carts30 = cartMap[vid] || 0;
      const convRate = views30 > 0 ? sales30 / views30 : 0;
      const cost = costMap[vid] || v.cost_price || null;
      const marginPct = cost ? ((v.price - cost) / v.price) * 100 : null;
      const dailySales = sales30 / 30;
      const stockDaysLeft =
        dailySales > 0 ? v.inventory_quantity / dailySales : null;

      const healthScore =
        (normalize(sales30, 0, maxSales) * 35 +
          normalize(convRate, 0, 0.1) * 25 +
          normalize(marginPct || 0, 0, 80) * 20 +
          normalize(views30, 0, maxViews) * 10 +
          normalize(v.inventory_quantity > 0 ? 1 : 0, 0, 1) * 10);

      let velocity = "normal";
      if (sales30 >= maxSales * 0.1) velocity = "fast";
      else if (sales30 === 0 && (sales90Map[vid] || 0) === 0) velocity = "dead";
      else if (sales30 <= maxSales * 0.01) velocity = "slow";

      scores.push({
        variant_id: vid,
        score_date: now,
        health_score: Math.round(healthScore * 100) / 100,
        sales_30d: sales30,
        views_30d: views30,
        cart_adds_30d: carts30,
        conversion_rate: Math.round(convRate * 10000) / 10000,
        margin_pct: marginPct ? Math.round(marginPct * 100) / 100 : null,
        stock_days_left: stockDaysLeft
          ? Math.round(stockDaysLeft * 10) / 10
          : null,
        velocity,
        world: v.world || "coiffure",
      });

      // Generate recommendations
      if (velocity === "fast" && stockDaysLeft !== null && stockDaysLeft < 7) {
        recommendations.push({
          variant_id: vid,
          action_type: "restock",
          priority: 1,
          reason: `Best-seller avec seulement ${Math.round(stockDaysLeft)}j de stock restant`,
          suggested_value: { reorder_qty: Math.ceil(dailySales * 60) },
          world: v.world || "coiffure",
        });
      }
      if (
        velocity === "dead" &&
        v.inventory_quantity > 0
      ) {
        recommendations.push({
          variant_id: vid,
          action_type: "liquidate",
          priority: 2,
          reason: "Zéro vente en 90 jours avec du stock disponible",
          suggested_value: {
            compare_at_price: v.price,
            new_price: Math.round(v.price * 0.7),
          },
          world: v.world || "coiffure",
        });
      }
      if (velocity === "fast" && !v.is_new) {
        recommendations.push({
          variant_id: vid,
          action_type: "promote",
          priority: 3,
          reason: `Produit en forte demande (${sales30} ventes/30j), à mettre en avant`,
          world: v.world || "coiffure",
        });
      }
    }

    // Upsert scores (conflict on variant_id + score_date — update in place)
    let insertErrors = [];
    if (scores.length > 0) {
      for (let i = 0; i < scores.length; i += 500) {
        const { error: upsertErr } = await sb
          .from("nc_ai_product_scores")
          .upsert(scores.slice(i, i + 500), { onConflict: "variant_id,score_date" });
        if (upsertErr) insertErrors.push(upsertErr.message);
      }
    }
    if (insertErrors.length > 0) {
      console.error("[catalog-intelligence] Upsert errors:", insertErrors);
    }

    // Auto-expire is_new flag after 21 days using is_new_since timestamp
    const expiryDate = new Date(Date.now() - 21 * 86400000).toISOString();
    const { data: expiredRows, error: expireErr } = await sb
      .from("nc_variants")
      .update({ is_new: false })
      .eq("is_new", true)
      .not("is_new_since", "is", null)
      .lt("is_new_since", expiryDate)
      .select("variant_id");
    const expiredCount = expiredRows?.length || 0;
    if (expiredCount > 0) {
      console.log(`[catalog-intelligence] Auto-expired ${expiredCount} is_new products (> 21 days)`);
    }

    // Insert recommendations (only new pending ones)
    if (recommendations.length > 0) {
      await sb.from("nc_ai_recommendations").insert(recommendations);
    }

    await logDecision(sb, {
      agent: "catalog",
      decision_type: "daily_scoring",
      description: `Scored ${scores.length} products, generated ${recommendations.length} recommendations`,
      output_data: {
        total_scored: scores.length,
        fast: scores.filter((s) => s.velocity === "fast").length,
        dead: scores.filter((s) => s.velocity === "dead").length,
        recommendations: recommendations.length,
        insert_errors: insertErrors.length > 0 ? insertErrors : undefined,
      },
      impact: "medium",
    });

    return NextResponse.json({
      ok: true,
      scored: scores.length,
      recommendations: recommendations.length,
    });
  } catch (err) {
    await logDecision(sb, {
      agent: "catalog",
      decision_type: "daily_scoring",
      description: "Catalog intelligence failed",
      error_message: err.message,
      success: false,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
