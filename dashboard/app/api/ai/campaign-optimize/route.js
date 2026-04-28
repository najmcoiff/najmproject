import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, logDecision } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!cronGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();

  try {
    const metaToken = process.env.META_MARKETING_TOKEN;

    const { data: campaigns } = await sb
      .from("nc_ai_campaigns")
      .select("*")
      .eq("status", "active");

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ ok: true, message: "No active campaigns" });
    }

    const actions = [];

    for (const c of campaigns) {
      // If Meta API configured, fetch real metrics
      if (metaToken && c.meta_campaign_id) {
        try {
          const insightsRes = await fetch(
            `https://graph.facebook.com/v21.0/${c.meta_campaign_id}/insights?fields=impressions,clicks,spend,actions,action_values&date_preset=last_7d&access_token=${metaToken}`
          );
          const insights = await insightsRes.json();
          const data = insights.data?.[0];

          if (data) {
            const spend = Number(data.spend || 0);
            const impressions = Number(data.impressions || 0);
            const clicks = Number(data.clicks || 0);
            const purchases =
              data.actions?.find((a) => a.action_type === "purchase")
                ?.value || 0;
            const revenue =
              data.action_values?.find(
                (a) => a.action_type === "purchase"
              )?.value || 0;
            const EUR_TO_DA = 290;
            const PROFIT_PER_ORDER = 2862;
            const spend_da   = Math.round(spend * EUR_TO_DA);
            const revenue_da = Math.round(Number(revenue) * EUR_TO_DA);
            const profit_da  = Math.round(Number(purchases) * PROFIT_PER_ORDER - spend_da);
            const roab       = spend_da > 0 ? Math.round((profit_da / spend_da) * 100) / 100 : 0;
            const roas       = spend > 0 ? Number(revenue) / spend : 0;
            const cpo_da     = Number(purchases) > 0 ? Math.round(spend_da / Number(purchases)) : 0;

            await sb
              .from("nc_ai_campaigns")
              .update({
                impressions,
                clicks,
                conversions: Number(purchases),
                budget_spent_da: spend_da,
                spend_da:        spend_da,
                revenue_da,
                profit_da,
                roab,
                roas: Math.round(roas * 100) / 100,
                cpo_da,
                ctr: Number(data.ctr || 0),
                auto_optimized: true,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", c.id);

            // Auto-pause si ROAB < 0 pendant 3+ jours (perd de l'argent)
            if (roab < 0 && spend_da > (c.budget_daily_da || 4350) * 3) {
              await sb
                .from("nc_ai_campaigns")
                .update({ status: "paused" })
                .eq("id", c.id);

              // Pause on Meta too
              if (c.meta_campaign_id) {
                await fetch(
                  `https://graph.facebook.com/v21.0/${c.meta_campaign_id}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      status: "PAUSED",
                      access_token: metaToken,
                    }),
                  }
                ).catch(() => {});
              }

              actions.push({
                campaign_id: c.id,
                action: "paused",
                reason: `ROAB ${roab}x < 0 (perd de l'argent — ${spend_da} DA dépensé, ${profit_da} DA bénéfice)`,
              });
            }
          }
        } catch {
          // Metrics fetch failed — skip optimization
        }
      }
    }

    await logDecision(sb, {
      agent: "campaign",
      decision_type: "optimize_campaigns",
      description: `Optimized ${campaigns.length} campaigns, ${actions.length} actions taken`,
      output_data: { optimized: campaigns.length, actions },
      impact: actions.length > 0 ? "high" : "low",
    });

    return NextResponse.json({
      ok: true,
      optimized: campaigns.length,
      actions,
    });
  } catch (err) {
    await logDecision(sb, {
      agent: "campaign",
      decision_type: "optimize_campaigns",
      description: "Campaign optimization failed",
      error_message: err.message,
      success: false,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
