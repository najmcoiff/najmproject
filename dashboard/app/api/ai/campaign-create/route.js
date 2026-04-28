import { NextResponse } from "next/server";
import { getServiceClient, cronGuard, ownerGuard, logDecision } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/campaign-create
 * Agent 2 — Campaign Engine (complet)
 *
 * Crée une campagne Meta complète : Campagne → Ad Set → Creative → Ad
 *
 * Types de campagnes :
 *   retargeting   → Visiteurs pixel 7j sans achat (le plus rentable)
 *   best_seller   → Top produits Agent 1 → audience lookalike
 *   flash_sale    → Liquidation stock mort → audience large
 *   new_arrival   → Produits is_new → followers + lookalike
 *   lookalike     → Meilleurs clients → lookalike 2%
 *
 * Body optionnel :
 *   { campaign_type, world, force: true }
 *   Sans body = mode auto (lit nc_ai_recommendations)
 */

const META_API = "https://graph.facebook.com/v21.0";
const SITE_URL = "https://www.najmcoiff.com";

// Pixels par monde (H7 — règle inviolable)
const PIXELS = {
  coiffure: "1436593504886973",
  onglerie: "839178319213103",
};

// Budgets par type de campagne (DA/jour)
const BUDGETS_DA = {
  retargeting:  700,
  best_seller:  500,
  flash_sale:  1000,
  new_arrival:  500,
  lookalike:    800,
};

// Textes publicitaires par type (arabe — langue principale)
const AD_COPIES = {
  coiffure: {
    retargeting: { headline: "NajmCoiff — منتجاتك في انتظارك", body: "المنتجات لي شفتها مازالت متوفرة. اطلب دابا واستلم في ولايتك 🚀", cta: "SHOP_NOW" },
    best_seller: { headline: "الأكثر مبيعاً في NajmCoiff", body: "منتجات كوافير احترافية بأفضل الأسعار. توصيل لجميع الولايات 📦", cta: "SHOP_NOW" },
    flash_sale:  { headline: "عروض خاصة — NajmCoiff", body: "تخفيضات على منتجات الكوافير. الكميات محدودة ⚡", cta: "SHOP_NOW" },
    new_arrival: { headline: "وصلت منتجات جديدة 🔥", body: "أحدث المنتجات في NajmCoiff. كن أول من يطلب!", cta: "SHOP_NOW" },
    lookalike:   { headline: "NajmCoiff — احتراف الكوافير", body: "آلاف الكوافيرين يثقون في NajmCoiff. انضم إليهم اليوم 💪", cta: "LEARN_MORE" },
  },
  onglerie: {
    retargeting: { headline: "NajmCoiff — منتجات الأظافر في انتظارك", body: "المنتجات لي شفتيها مازالت متوفرة. اطلبي دابا 💅", cta: "SHOP_NOW" },
    best_seller: { headline: "الأكثر مبيعاً في Onglerie NajmCoiff", body: "منتجات أظافر احترافية. توصيل لجميع الولايات 📦", cta: "SHOP_NOW" },
    flash_sale:  { headline: "عروض خاصة — Onglerie", body: "تخفيضات على منتجات الأظافر. الكميات محدودة ⚡", cta: "SHOP_NOW" },
    new_arrival: { headline: "جديد في Onglerie NajmCoiff 🔥", body: "أحدث منتجات الأظافر وصلت. اطلبي دابا!", cta: "SHOP_NOW" },
    lookalike:   { headline: "NajmCoiff — احترافية الأظافر", body: "آلاف المختصات في الأظافر يثقن في NajmCoiff 💅", cta: "LEARN_MORE" },
  },
};

export async function POST(req) {
  const isOwner = ownerGuard(req);
  const isCron  = cronGuard(req);
  if (!isOwner && !isCron)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sb = getServiceClient();

  const metaToken   = process.env.META_MARKETING_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID?.replace("act_", "");
  // Page Facebook NAJMCOIFF — ID fixe + Instagram @najm_coiff
  const pageId = process.env.META_PAGE_ID_COIFFURE || "108762367616665";

  if (!metaToken || !adAccountId) {
    return NextResponse.json({ error: "META_MARKETING_TOKEN ou META_AD_ACCOUNT_ID manquant" }, { status: 500 });
  }

  // Récupérer les audiences existantes
  const { data: audiences } = await sb
    .from("nc_ai_audiences")
    .select("meta_audience_id, audience_type, world, name")
    .eq("status", "active");

  const audienceMap = buildAudienceMap(audiences || []);

  let campaignsToCreate = [];

  // ── Mode manuel (body.campaign_type fourni) ─────────────────────────────────
  if (body.campaign_type) {
    campaignsToCreate = [
      {
        campaign_type: body.campaign_type,
        world: body.world || "coiffure",
        variant_ids: body.variant_ids || [],
        force: body.force || false,
      },
    ];
  } else {
    // ── Mode auto — lit les recommandations Agent 1 ─────────────────────────
    const { data: recos } = await sb
      .from("nc_ai_recommendations")
      .select("variant_id, action_type, reason, world, suggested_value")
      .eq("status", "pending")
      .in("action_type", ["promote", "liquidate"])
      .order("priority", { ascending: true })
      .limit(5);

    // Toujours lancer une campagne retargeting si aucune active depuis 1j
    const { data: activeRetargeting } = await sb
      .from("nc_ai_campaigns")
      .select("id")
      .eq("campaign_type", "retargeting")
      .eq("status", "active")
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

    if (!activeRetargeting || activeRetargeting.length === 0) {
      campaignsToCreate.push({ campaign_type: "retargeting", world: "coiffure", variant_ids: [] });
      campaignsToCreate.push({ campaign_type: "retargeting", world: "onglerie", variant_ids: [] });
    }

    // Ajouter les campagnes issues des recommandations
    for (const reco of recos || []) {
      campaignsToCreate.push({
        campaign_type: reco.action_type === "liquidate" ? "flash_sale" : "best_seller",
        world: reco.world || "coiffure",
        variant_ids: [reco.variant_id],
      });
    }
  }

  const created = [];

  for (const camp of campaignsToCreate) {
    const result = await createFullCampaign({
      sb, metaToken, adAccountId, pageId,
      audienceMap, ...camp,
    });
    if (result.ok) created.push(result);
  }

  await logDecision(sb, {
    agent: "campaign",
    decision_type: "create_campaigns",
    description: `${created.length} campagne(s) créée(s) (Meta + DB)`,
    output_data: { campaigns: created },
    impact: created.length > 0 ? "high" : "low",
  });

  return NextResponse.json({ ok: true, created: created.length, campaigns: created });
}

// ── Création complète d'une campagne (Campagne → Ad Set → Creative → Ad) ─────

async function createFullCampaign({ sb, metaToken, adAccountId, pageId, audienceMap, campaign_type, world, variant_ids }) {
  const pixelId  = PIXELS[world] || PIXELS.coiffure;
  const copy     = AD_COPIES[world]?.[campaign_type] || AD_COPIES.coiffure.best_seller;
  const budget   = BUDGETS_DA[campaign_type] || 500;
  // Identité publicitaire = toujours page NAJM COIFF (108762367616665)
  // Instagram lié = @najm_coiff (17841442358614439)
  const fbPageId = pageId || "108762367616665";
  const igAccountId = process.env.META_IG_ACCOUNT_ID || "17841442358614439";
  const campName = `NajmCoiff — ${campaign_type} — ${world} — ${new Date().toISOString().slice(0, 10)}`;

  // Trouver les images produits à utiliser
  const imageUrls = await getProductImages(sb, campaign_type, world, variant_ids);
  const imageUrl  = imageUrls[0] || `https://www.najmcoiff.com/logo.png`;

  let metaCampaignId = null;
  let metaAdSetId    = null;
  let metaCreativeId = null;
  let metaAdId       = null;
  let status         = "draft";

  try {
    // ── NIVEAU 1 : Campagne ────────────────────────────────────────────────
    const campRes = await metaPost(`/act_${adAccountId}/campaigns`, metaToken, {
      name: campName,
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: [],
    });

    if (!campRes.id) throw new Error(campRes.error?.message || "Campaign creation failed");
    metaCampaignId = campRes.id;

    // ── NIVEAU 2 : Ad Set (audience + budget + placement) ──────────────────
    const targeting = buildTargeting(campaign_type, world, pixelId, audienceMap);
    const adSetRes  = await metaPost(`/act_${adAccountId}/adsets`, metaToken, {
      name:               `${campName} — AdSet`,
      campaign_id:        metaCampaignId,
      daily_budget:       String(Math.round(budget * 100 / 130)), // DA → centimes approx
      billing_event:      "IMPRESSIONS",
      optimization_goal:  "OFFSITE_CONVERSIONS",
      promoted_object:    { pixel_id: pixelId, custom_event_type: "PURCHASE" },
      targeting,
      status: "PAUSED",
    });

    if (!adSetRes.id) throw new Error(adSetRes.error?.message || "Ad set creation failed");
    metaAdSetId = adSetRes.id;

    // ── NIVEAU 3 : Ad Creative (image + texte) ─────────────────────────────
    const destUrl = `${SITE_URL}/produits${world === "onglerie" ? "?world=onglerie" : ""}`;
    const creativeRes = await metaPost(`/act_${adAccountId}/adcreatives`, metaToken, {
      name: `${campName} — Creative`,
      object_story_spec: {
        page_id:             fbPageId,       // NAJM COIFF FB page
        instagram_actor_id:  igAccountId,    // @najm_coiff IG
        link_data: {
          image_url:     imageUrl,
          link:          destUrl,
          message:       copy.body,
          name:          copy.headline,
          call_to_action: { type: copy.cta, value: { link: destUrl } },
        },
      },
    });

    if (!creativeRes.id) throw new Error(creativeRes.error?.message || "Creative creation failed");
    metaCreativeId = creativeRes.id;

    // ── NIVEAU 4 : Ad (combine creative + ad set) ──────────────────────────
    const adRes = await metaPost(`/act_${adAccountId}/ads`, metaToken, {
      name:      `${campName} — Ad`,
      adset_id:  metaAdSetId,
      creative:  { creative_id: metaCreativeId },
      status:    "PAUSED",
    });

    if (!adRes.id) throw new Error(adRes.error?.message || "Ad creation failed");
    metaAdId = adRes.id;
    status   = "active";

  } catch (err) {
    console.error("[campaign-create] Meta API error:", err.message);
    // On continue et on sauvegarde en draft
  }

  // ── Sauvegarder dans nc_ai_campaigns ──────────────────────────────────────
  const { data: saved } = await sb
    .from("nc_ai_campaigns")
    .insert({
      campaign_name:     campName,
      campaign_type,
      world,
      status,
      objective:         "OUTCOME_SALES",
      budget_daily_da:   budget,
      budget_spent_da:   0,
      impressions:       0,
      clicks:            0,
      conversions:       0,
      revenue_da:        0,
      roas:              0,
      ctr:               0,
      cpc:               0,
      spend_da:          0,
      variant_ids:       variant_ids || [],
      meta_campaign_id:  metaCampaignId,
      meta_adset_id:     metaAdSetId,
      meta_creative_id:  metaCreativeId,
      meta_ad_id:        metaAdId,
      ad_copy:           { headline: AD_COPIES[world]?.[campaign_type]?.headline, body: AD_COPIES[world]?.[campaign_type]?.body },
      auto_optimized:    false,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
    .select("id")
    .single();

  return {
    ok: true,
    db_id:            saved?.id,
    campaign_type,
    world,
    status,
    meta_campaign_id: metaCampaignId,
    meta_adset_id:    metaAdSetId,
    meta_creative_id: metaCreativeId,
    meta_ad_id:       metaAdId,
    budget_da:        budget,
    image_used:       (await getProductImages(sb, campaign_type, world, variant_ids))[0] || null,
  };
}

// ── Targeting par type de campagne ────────────────────────────────────────────

function buildTargeting(campaignType, world, pixelId, audienceMap) {
  const algerie = { geo_locations: { countries: ["DZ"] } };
  const ageRange = { age_min: 20, age_max: 55 };

  const retargetingAudienceId = world === "coiffure"
    ? audienceMap.coiffure_7j
    : audienceMap.onglerie_7j;

  const lookalikeid = audienceMap.lookalike_2pct;
  const customersId = audienceMap.clients_existants;

  switch (campaignType) {
    case "retargeting":
      return {
        ...algerie,
        ...ageRange,
        custom_audiences: retargetingAudienceId
          ? [{ id: retargetingAudienceId }]
          : [],
        excluded_custom_audiences: customersId
          ? [{ id: customersId }]
          : [],
      };

    case "best_seller":
    case "new_arrival":
      return {
        ...algerie,
        ...ageRange,
        custom_audiences: lookalikeid ? [{ id: lookalikeid }] : [],
        flexible_spec: world === "coiffure"
          ? [{ interests: [{ id: "6003027758310", name: "Hairdressing" }] }]
          : [{ interests: [{ id: "6004082318673", name: "Nail art" }] }],
      };

    case "flash_sale":
      // Audience large Algérie
      return {
        ...algerie,
        ...ageRange,
        flexible_spec: world === "coiffure"
          ? [{ interests: [{ id: "6003027758310", name: "Hairdressing" }] }]
          : [{ interests: [{ id: "6004082318673", name: "Nail art" }] }],
      };

    case "lookalike":
      return {
        ...algerie,
        ...ageRange,
        custom_audiences: lookalikeid ? [{ id: lookalikeid }] : [],
      };

    default:
      return { ...algerie, ...ageRange };
  }
}

// ── Récupérer les images des top produits ─────────────────────────────────────

async function getProductImages(sb, campaignType, world, variantIds) {
  let query = sb
    .from("nc_variants")
    .select("image_url, display_name")
    .eq("status", "active")
    .eq("world", world)
    .gt("inventory_quantity", 0)
    .not("image_url", "is", null)
    .limit(3);

  if (variantIds && variantIds.length > 0) {
    query = query.in("variant_id", variantIds);
  } else if (campaignType === "best_seller") {
    // Utiliser les scores Agent 1
    const { data: scores } = await sb
      .from("nc_ai_product_scores")
      .select("variant_id")
      .eq("world", world)
      .order("health_score", { ascending: false })
      .limit(3);

    if (scores && scores.length > 0) {
      query = query.in("variant_id", scores.map(s => s.variant_id));
    } else {
      query = query.eq("is_new", true).order("sort_order");
    }
  } else {
    query = query.order("sort_order");
  }

  const { data } = await query;
  return (data || []).map(p => p.image_url).filter(Boolean);
}

// ── Build audience map ────────────────────────────────────────────────────────

function buildAudienceMap(audiences) {
  const map = {};
  for (const a of audiences) {
    if (a.audience_type === "website_retargeting" && a.world === "coiffure" && a.name?.includes("7j")) {
      map.coiffure_7j = a.meta_audience_id;
    }
    if (a.audience_type === "website_retargeting" && a.world === "onglerie" && a.name?.includes("7j")) {
      map.onglerie_7j = a.meta_audience_id;
    }
    if (a.audience_type === "lookalike") {
      map.lookalike_2pct = a.meta_audience_id;
    }
    if (a.audience_type === "custom_customers") {
      map.clients_existants = a.meta_audience_id;
    }
  }
  return map;
}

// ── Meta API helper ────────────────────────────────────────────────────────────

async function metaPost(endpoint, token, payload) {
  const res = await fetch(`${META_API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, access_token: token }),
  });
  return res.json();
}
