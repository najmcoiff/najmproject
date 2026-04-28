import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, ownerGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

// Constantes NajmCoiff (marché noir 290 DA = 1 EUR)
const EUR_TO_DA          = 290;
const PROFIT_PER_ORDER   = 2862; // DA (marge coiffure 35.2% × panier 8130 DA)
const CAMPAIGNS = [
  { meta_campaign_id: "120245473401430520", meta_adset_id: "120245473401520520" },
  { meta_campaign_id: "120245473402100520", meta_adset_id: "120245473402310520" },
];

async function metaInsights(campaignId, token) {
  const fields = "impressions,clicks,spend,actions,action_values,ctr,cpc";
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${campaignId}/insights?fields=${fields}&date_preset=today&access_token=${token}`
  );
  const d = await r.json();
  if (d.error) throw new Error("Meta Insights: " + d.error.message);
  return d.data?.[0] || null;
}

async function metaInsightsYesterday(campaignId, token) {
  const fields = "impressions,clicks,spend,actions,action_values,ctr,cpc";
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${campaignId}/insights?fields=${fields}&date_preset=yesterday&access_token=${token}`
  );
  const d = await r.json();
  if (d.error) throw new Error("Meta Insights yesterday: " + d.error.message);
  return d.data?.[0] || null;
}

async function metaInsightsLifetime(campaignId, token) {
  const fields = "impressions,clicks,spend,actions,action_values,ctr,cpc";
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${campaignId}/insights?fields=${fields}&date_preset=maximum&access_token=${token}`
  );
  const d = await r.json();
  if (d.error) return null;
  return d.data?.[0] || null;
}

function parseInsights(data) {
  if (!data) return null;
  const spend_eur  = Number(data.spend || 0);
  const spend_da   = Math.round(spend_eur * EUR_TO_DA);
  const impressions = Number(data.impressions || 0);
  const clicks     = Number(data.clicks || 0);
  const ctr        = Number(data.ctr || 0);
  const cpc_eur    = Number(data.cpc || 0);
  const cpc_da     = Math.round(cpc_eur * EUR_TO_DA);
  const purchases  = Number(data.actions?.find(a => a.action_type === "purchase")?.value || 0);
  const revenue_eur= Number(data.action_values?.find(a => a.action_type === "purchase")?.value || 0);
  const revenue_da = Math.round(revenue_eur * EUR_TO_DA);
  const profit_da  = Math.round(purchases * PROFIT_PER_ORDER - spend_da);
  const roab       = spend_da > 0 ? Math.round((profit_da / spend_da) * 100) / 100 : 0;
  const cpo_da     = purchases > 0 ? Math.round(spend_da / purchases) : 0;
  return { spend_eur, spend_da, impressions, clicks, ctr, cpc_da, purchases, revenue_da, profit_da, roab, cpo_da };
}

const AD_ACCOUNT = "act_880775160439589";

/** Découverte automatique : insère toute nouvelle campagne active Meta dans nc_ai_campaigns */
async function discoverNewCampaigns(sb, token) {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${AD_ACCOUNT}/campaigns?fields=id,name,objective,effective_status,status,adsets{id}&limit=50&access_token=${token}`
    );
    const data = await r.json();
    const activeCamps = (data.data || []).filter(c =>
      ["ACTIVE", "PAUSED", "IN_PROCESS"].includes(c.effective_status)
    );

    const { data: existing } = await sb
      .from("nc_ai_campaigns")
      .select("meta_campaign_id");
    const existingIds = new Set((existing || []).map(c => c.meta_campaign_id));

    for (const camp of activeCamps) {
      if (existingIds.has(camp.id)) continue;
      const adsetId = camp.adsets?.data?.[0]?.id || null;
      await sb.from("nc_ai_campaigns").insert({
        meta_campaign_id: camp.id,
        meta_adset_id:    adsetId,
        campaign_name:    camp.name,
        objective:        camp.objective,
        status:           camp.effective_status === "ACTIVE" ? "active" : "paused",
        campaign_type:    "retargeting",
        world:            "coiffure",
        budget_daily_da:  0,
        budget_spent_da:  0,
        impressions:      0,
        clicks:           0,
        conversions:      0,
        last_synced_at:   new Date().toISOString(),
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      });
    }
  } catch {
    // Non bloquant
  }
}

export async function POST(req) {
  const isOwner = ownerGuard(req);
  const isCron  = cronGuard(req);
  if (!isOwner && !isCron)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();
  const token = process.env.META_MARKETING_TOKEN;
  if (!token) return NextResponse.json({ error: "META_MARKETING_TOKEN manquant" }, { status: 500 });

  // Découverte automatique des nouvelles campagnes
  await discoverNewCampaigns(sb, token);

  const results = [];

  // Sync toutes les campagnes présentes en DB (y compris les nouvellement découvertes)
  const { data: campaigns } = await sb
    .from("nc_ai_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  for (const c of campaigns || []) {
    try {
      const [today, yesterday, lifetime] = await Promise.all([
        metaInsights(c.meta_campaign_id, token),
        metaInsightsYesterday(c.meta_campaign_id, token),
        metaInsightsLifetime(c.meta_campaign_id, token),
      ]);

      const t  = parseInsights(today);
      const y  = parseInsights(yesterday);
      const lt = parseInsights(lifetime);

      // Màj nc_ai_campaigns avec stats lifetime
      if (lt) {
        await sb.from("nc_ai_campaigns").update({
          impressions:     lt.impressions,
          clicks:          lt.clicks,
          conversions:     lt.purchases,
          budget_spent_da: lt.spend_da,
          spend_da:        lt.spend_da,
          revenue_da:      lt.revenue_da,
          profit_da:       lt.profit_da,
          roab:            lt.roab,
          roas:            lt.spend_da > 0 ? Math.round((lt.revenue_da / lt.spend_da) * 100) / 100 : 0,
          ctr:             lt.ctr,
          cpc:             lt.cpc_da,
          cpo_da:          lt.cpo_da,
          last_synced_at:  new Date().toISOString(),
          updated_at:      new Date().toISOString(),
        }).eq("id", c.id);
      }

      // Sauvegarder snapshot journalier dans nc_ai_decisions_log
      if (yesterday) {
        await sb.from("nc_ai_decisions_log").insert({
          agent: "campaign",
          decision_type: "daily_stats",
          description: `Stats hier — ${c.campaign_name}`,
          reasoning: `Dépense: ${y?.spend_da} DA | Clics: ${y?.clicks} | Achats: ${y?.purchases} | ROAB: ${y?.roab}x`,
          output_data: { campaign_id: c.id, campaign_name: c.campaign_name, date: "yesterday", ...y },
          success: true,
          impact: (y?.roab || 0) > 1 ? "high" : "medium",
          created_at: new Date().toISOString(),
        });
      }

      results.push({
        id: c.id,
        name: c.campaign_name,
        today: t,
        yesterday: y,
        lifetime: lt,
      });

    } catch (err) {
      results.push({ id: c.id, name: c.campaign_name, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, results });
}

// GET — lire les stats depuis DB (UNIQUEMENT DB — aucun appel Meta)
export async function GET(req) {
  if (!ownerGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();

  const { data: campaigns } = await sb
    .from("nc_ai_campaigns")
    .select("*")
    .in("meta_campaign_id", CAMPAIGNS.map(c => c.meta_campaign_id))
    .order("created_at", { ascending: false });

  const totalSpend       = (campaigns || []).reduce((s, c) => s + Number(c.budget_spent_da || 0), 0);
  const totalProfit      = (campaigns || []).reduce((s, c) => s + Number(c.profit_da || 0), 0);
  const totalConversions = (campaigns || []).reduce((s, c) => s + Number(c.conversions || 0), 0);
  const globalRoab       = totalSpend > 0 ? Math.round((totalProfit / totalSpend) * 100) / 100 : 0;

  return NextResponse.json({
    ok: true,
    campaigns: campaigns || [],
    liveStats: [],
    summary: {
      total_spend_da:    totalSpend,
      total_profit_da:   totalProfit,
      total_conversions: totalConversions,
      global_roab:       globalRoab,
      last_synced:       (campaigns || []).find(c => c.last_synced_at)?.last_synced_at || null,
    },
  });
}
