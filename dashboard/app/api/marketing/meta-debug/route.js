// Route diagnostic Meta Ads — à supprimer après usage
import { NextResponse } from "next/server";
import { ownerGuard, getServiceClient } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

const CAMP_IDS = ["120245473401430520", "120245473402100520"];
const ADSET_IDS = ["120245473401520520", "120245473402310520"];
const ACCOUNT = "act_880775160439589";

async function meta(path, params = {}) {
  const token = process.env.META_MARKETING_TOKEN;
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const r = await fetch(`https://graph.facebook.com/v21.0/${path}?${qs}`);
  return r.json();
}

export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const token = process.env.META_MARKETING_TOKEN;
  if (!token) return NextResponse.json({ error: "META_MARKETING_TOKEN manquant" }, { status: 500 });

  const results = {};

  // Compte publicitaire
  results.account = await meta(ACCOUNT, {
    fields: "id,name,account_status,disable_reason,balance,currency,funding_source_details"
  });

  // Campagnes
  results.campaigns = [];
  for (const id of CAMP_IDS) {
    const c = await meta(id, { fields: "id,name,status,effective_status,configured_status,issues_info" });
    results.campaigns.push(c);
  }

  // Ad Sets
  results.adsets = [];
  for (const id of ADSET_IDS) {
    const a = await meta(id, { fields: "id,name,status,effective_status,issues_info,bid_strategy,optimization_goal,billing_event,targeting" });
    results.adsets.push(a);
  }

  // Ads de chaque campagne
  results.ads = [];
  for (const campId of CAMP_IDS) {
    const ads = await meta(`${campId}/ads`, {
      fields: "id,name,status,effective_status,issues_info,creative{id,name,status,object_story_spec,thumbnail_url}"
    });
    results.ads.push({ campaign_id: campId, ads: ads.data || [], error: ads.error });
  }

  // Insights 7j
  results.insights = [];
  for (const id of CAMP_IDS) {
    const ins = await meta(`${id}/insights`, {
      fields: "campaign_name,impressions,clicks,spend,reach,actions",
      date_preset: "last_7d"
    });
    results.insights.push({ campaign_id: id, data: ins.data, error: ins.error });
  }

  // Insights jour-par-jour (today + yesterday + last 3d) — ciblé pour le diag
  results.insights_daily = [];
  for (const id of CAMP_IDS) {
    const ins = await meta(`${id}/insights`, {
      fields: "campaign_name,impressions,clicks,spend,reach",
      date_preset: "last_3d",
      time_increment: "1",
    });
    results.insights_daily.push({ campaign_id: id, data: ins.data || [], error: ins.error });
  }

  // Account-level delivery_estimate + spend total + transactions billing
  results.account_insights_today = await meta(`${ACCOUNT}/insights`, {
    fields: "spend,impressions,clicks",
    date_preset: "today",
  });
  results.account_insights_yesterday = await meta(`${ACCOUNT}/insights`, {
    fields: "spend,impressions,clicks",
    date_preset: "yesterday",
  });

  // Historique des transactions (paiements, refus, débits)
  results.transactions = await meta(`${ACCOUNT}/transactions`, {
    fields: "id,status,billing_reason,billing_period,charge_type,time,amount{value,currency},payment_option,vat_invoice_id,product_type,billing_period",
    limit: "10",
  });

  // Audiences custom (taille = critique pour retargeting)
  results.custom_audiences = [];
  for (const adset of results.adsets) {
    const t = adset.targeting || {};
    const audIds = [...((t.custom_audiences || []).map(a => a.id)), ...((t.excluded_custom_audiences || []).map(a => a.id))];
    for (const audId of audIds) {
      const aud = await meta(audId, {
        fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status,time_updated"
      });
      results.custom_audiences.push({ adset_id: adset.id, audience: aud });
    }
  }

  // Pixel — events count 7j (savoir si le pixel reçoit toujours)
  const PIXEL_ID = "1436593504886973";
  results.pixel = await meta(PIXEL_ID, {
    fields: "id,name,last_fired_time,is_unavailable,data_use_setting"
  });
  results.pixel_stats = await meta(`${PIXEL_ID}/stats`, {
    aggregation: "event",
    start_time: Math.floor(Date.now()/1000) - 7*86400,
    end_time:   Math.floor(Date.now()/1000),
  });

  // Catalogues produits du Business Manager
  const catalogs = await meta(`301096122408704/owned_product_catalogs`, {
    fields: "id,name,product_count"
  });
  results.catalogs = catalogs;

  // Product sets liés aux ad sets
  results.product_sets = [];
  for (const adset of results.adsets) {
    const ps = await meta(`${adset.id}`, {
      fields: "id,name,promoted_object"
    });
    if (ps.promoted_object?.product_set_id) {
      const psId = ps.promoted_object.product_set_id;
      const psData = await meta(psId, {
        fields: "id,name,product_count,filter,catalog_id"
      });
      // Quelques produits du set pour voir les IDs
      const psProducts = await meta(`${psId}/products`, {
        fields: "id,title,availability,image_url,retailer_id",
        limit: "5"
      });
      results.product_sets.push({
        adset_id: adset.id,
        product_set_id: psId,
        product_set: psData,
        sample_products: psProducts.data || [],
        error: psProducts.error
      });
    } else {
      results.product_sets.push({ adset_id: adset.id, promoted_object: ps.promoted_object, no_product_set: true });
    }
  }

  // Tester le feed URL
  try {
    const feedRes = await fetch("https://www.najmcoiff.com/api/boutique/meta-feed?world=coiffure");
    const feedText = await feedRes.text();
    const itemCount = (feedText.match(/<item>/g) || []).length;
    results.feed_check = {
      status: feedRes.status,
      items: itemCount,
      ok: feedRes.ok && itemCount > 0,
      first_id: feedText.match(/<g:id>(.*?)<\/g:id>/)?.[1] || null,
      first_availability: feedText.match(/<g:availability>(.*?)<\/g:availability>/)?.[1] || null,
    };
  } catch (e) {
    results.feed_check = { error: e.message };
  }

  return NextResponse.json(results, { status: 200 });
}

export async function POST(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const token = process.env.META_MARKETING_TOKEN;
  if (!token) return NextResponse.json({ error: "META_MARKETING_TOKEN manquant" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // Réactiver les ads paused
  if (action === "reactivate_ads") {
    const results = [];

    // Récupérer toutes les ads des 2 campagnes
    for (const campId of CAMP_IDS) {
      const ads = await (async () => {
        const qs = new URLSearchParams({ fields: "id,name,status,effective_status,issues_info", access_token: token }).toString();
        const r = await fetch(`https://graph.facebook.com/v21.0/${campId}/ads?${qs}`);
        return r.json();
      })();

      for (const ad of (ads.data || [])) {
        if (ad.status === "PAUSED" || ad.effective_status === "WITH_ISSUES") {
          // Tenter de passer en ACTIVE
          const updateRes = await fetch(`https://graph.facebook.com/v21.0/${ad.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ACTIVE", access_token: token })
          });
          const updateData = await updateRes.json();
          results.push({
            ad_id: ad.id,
            ad_name: ad.name,
            was_status: ad.status,
            was_effective: ad.effective_status,
            update_result: updateData,
            success: !!updateData.success
          });
        }
      }
    }

    return NextResponse.json({ ok: true, reactivated: results });
  }

  // Forcer refresh du catalogue
  if (action === "refresh_catalog") {
    const { catalog_id } = body;
    if (!catalog_id) return NextResponse.json({ error: "catalog_id requis" }, { status: 400 });

    const SITE_URL = "https://www.najmcoiff.com";
    const FEED_URLS = {
      "NajmCoiff Feed Complet":   `${SITE_URL}/api/boutique/meta-feed`,
      "NajmCoiff Feed Coiffure":  `${SITE_URL}/api/boutique/meta-feed?world=coiffure`,
      "NajmCoiff Feed Onglerie":  `${SITE_URL}/api/boutique/meta-feed?world=onglerie`,
    };

    const feedsRes = await (async () => {
      const qs = new URLSearchParams({ fields: "id,name,latest_upload", access_token: token }).toString();
      const r = await fetch(`https://graph.facebook.com/v21.0/${catalog_id}/product_feeds?${qs}`);
      return r.json();
    })();

    const refreshResults = [];
    for (const feed of (feedsRes.data || [])) {
      const feedUrl = FEED_URLS[feed.name] || `${SITE_URL}/api/boutique/meta-feed`;
      const r = await fetch(`https://graph.facebook.com/v21.0/${feed.id}/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, url: feedUrl })
      });
      const data = await r.json();
      refreshResults.push({ feed_id: feed.id, feed_name: feed.name, feed_url: feedUrl, result: data });
    }

    return NextResponse.json({ ok: true, feeds: feedsRes.data || [], refreshResults });
  }

  // Récupérer placements détaillés des adsets
  if (action === "get_placements") {
    const results = [];
    for (const asId of ADSET_IDS) {
      const d = await fetch(
        `https://graph.facebook.com/v21.0/${asId}?fields=id,name,status,effective_status,publisher_platforms,facebook_positions,instagram_positions,optimization_goal,targeting&access_token=${token}`
      ).then(r => r.json());
      results.push(d);
    }
    return NextResponse.json({ ok: true, adsets: results });
  }

  // Supprimer Instagram des placements — Facebook uniquement
  if (action === "remove_instagram") {
    const results = [];
    for (const asId of ADSET_IDS) {
      // Récupérer targeting actuel
      const current = await fetch(
        `https://graph.facebook.com/v21.0/${asId}?fields=id,name,targeting&access_token=${token}`
      ).then(r => r.json());

      const t = current.targeting || {};

      // Construire un targeting propre — uniquement les champs modifiables
      // geo_locations: retirer location_types (read-only) — Meta API n'accepte que countries/regions/cities
      const geoRaw = t.geo_locations || {};
      const geoClean = {};
      if (geoRaw.countries) geoClean.countries = geoRaw.countries;
      if (geoRaw.regions) geoClean.regions = geoRaw.regions;
      if (geoRaw.cities) geoClean.cities = geoRaw.cities;
      if (geoRaw.zips) geoClean.zips = geoRaw.zips;
      if (!Object.keys(geoClean).length) geoClean.countries = ["DZ"];

      // Audiences — garder seulement id (pas name)
      const customAud = (t.custom_audiences || []).map(a => ({ id: a.id }));
      const excludedAud = (t.excluded_custom_audiences || []).map(a => ({ id: a.id }));

      const newTargeting = {
        geo_locations: geoClean,
        age_min: t.age_min || 20,
        age_max: t.age_max || 55,
        publisher_platforms: ["facebook"],
        facebook_positions: ["feed", "story"],
      };
      if (customAud.length) newTargeting.custom_audiences = customAud;
      if (excludedAud.length) newTargeting.excluded_custom_audiences = excludedAud;

      const updateRes = await fetch(`https://graph.facebook.com/v21.0/${asId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targeting: newTargeting, access_token: token }),
      }).then(r => r.json());

      results.push({ adset_id: asId, name: current.name, update: updateRes, new_platforms: ["facebook"] });
    }

    // Réactiver les ads après modification des placements
    const reactivated = [];
    for (const campId of CAMP_IDS) {
      const ads = await fetch(
        `https://graph.facebook.com/v21.0/${campId}/ads?fields=id,name,status&access_token=${token}`
      ).then(r => r.json());
      for (const ad of (ads.data || [])) {
        const up = await fetch(`https://graph.facebook.com/v21.0/${ad.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE", access_token: token }),
        }).then(r => r.json());
        reactivated.push({ id: ad.id, name: ad.name, success: !!up.success });
      }
    }

    return NextResponse.json({ ok: true, adsets_updated: results, reactivated });
  }

  // Inspecter le product set coiffure (ce que Meta voit réellement)
  if (action === "inspect_product_set") {
    const psId = body.product_set_id || "2007325089858160";
    const results = {};

    // Tous les produits du set (premier batch) — utiliser "name" (champ correct Meta)
    const prods = await fetch(
      `https://graph.facebook.com/v21.0/${psId}/products?fields=id,name,retailer_id,availability,price,image_url,url,review_status,review_rejection_reasons&limit=20&access_token=${token}`
    ).then(r => r.json());
    results.products = prods.data || [];
    results.error = prods.error;
    results.total = prods.data?.length || 0;

    // Compter par availability
    const byAvail = {};
    (prods.data || []).forEach(p => {
      byAvail[p.availability] = (byAvail[p.availability] || 0) + 1;
    });
    results.by_availability = byAvail;

    // Produits avec review_rejection_reasons
    const rejected = (prods.data || []).filter(p => p.review_rejection_reasons?.length > 0);
    results.rejected = rejected.map(p => ({ id: p.retailer_id, name: p.name, reasons: p.review_rejection_reasons }));

    // Produits sans nom ou sans image
    const noName = (prods.data || []).filter(p => !p.name || p.name.trim() === "").length;
    const noImg  = (prods.data || []).filter(p => !p.image_url).length;
    results.issues_summary = { no_name: noName, no_image: noImg, total_sample: prods.data?.length || 0 };

    // Info du product set
    const psInfo = await fetch(
      `https://graph.facebook.com/v21.0/${psId}?fields=id,name,product_count,filter&access_token=${token}`
    ).then(r => r.json());
    results.product_set_info = psInfo;

    return NextResponse.json(results);
  }

  // Créer de nouveaux adsets avec "All Products" et recréer les ads
  if (action === "recreate_adsets") {
    const ALL_PRODUCTS_SET_ID = "933509856334630";
    const CATALOG_ID = "1598091401402032";
    const PIXEL_ID = "1436593504886973";
    const PAGE_ID = "108762367616665";
    const IG_ACCOUNT_ID = "17841442358614489";
    const AD_ACCOUNT = "act_880775160439589";
    const results = { steps: [] };

    // Récupérer les budgets actuels des adsets
    const adsetDetails = [];
    for (const asId of ADSET_IDS) {
      const d = await fetch(
        `https://graph.facebook.com/v21.0/${asId}?fields=id,name,daily_budget,lifetime_budget,bid_strategy,optimization_goal,billing_event,targeting,campaign_id&access_token=${token}`
      ).then(r => r.json());
      adsetDetails.push(d);
    }
    results.original_adsets = adsetDetails.map(a => ({ id: a.id, name: a.name, daily_budget: a.daily_budget, campaign_id: a.campaign_id }));

    // Créer 2 nouveaux adsets avec le product set "All Products"
    const newAdsets = [];
    for (const orig of adsetDetails) {
      if (!orig.campaign_id) continue;

      const createRes = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/adsets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orig.name + " v2",
          campaign_id: orig.campaign_id,
          daily_budget: orig.daily_budget || 500,
          bid_strategy: orig.bid_strategy || "LOWEST_COST_WITHOUT_CAP",
          optimization_goal: "OFFSITE_CONVERSIONS",
          billing_event: "IMPRESSIONS",
          targeting: orig.targeting,
          promoted_object: {
            product_set_id: ALL_PRODUCTS_SET_ID,
            custom_event_type: "PURCHASE",
            pixel_id: PIXEL_ID
          },
          status: "ACTIVE",
          access_token: token
        })
      }).then(r => r.json());

      newAdsets.push({ original_id: orig.id, original_name: orig.name, new_adset: createRes });
      results.steps.push(`Adset "${orig.name}" → ${createRes.id ? `nouveau ID: ${createRes.id}` : `ERREUR: ${createRes.error?.error_user_msg || createRes.error?.message}`}`);
    }
    results.new_adsets = newAdsets;

    // Pause les anciens adsets
    for (const asId of ADSET_IDS) {
      await fetch(`https://graph.facebook.com/v21.0/${asId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED", access_token: token })
      }).then(r => r.json());
    }
    results.steps.push("Anciens adsets mis en pause");

    return NextResponse.json({ ok: true, ...results });
  }

  // Diagnostiquer et corriger le product set
  if (action === "fix_product_set") {
    const CATALOG_ID = "1598091401402032";
    const results = { steps: [] };

    // 1. Lister les product sets existants du catalogue
    const psListRes = await fetch(
      `https://graph.facebook.com/v21.0/${CATALOG_ID}/product_sets?fields=id,name,product_count,filter&access_token=${token}`
    ).then(r => r.json());
    results.existing_product_sets = psListRes.data || [];
    results.steps.push(`Trouvé ${results.existing_product_sets.length} product set(s)`);

    // 2. Chercher ou créer un product set "tous les produits actifs"
    let allProductsSetId = null;
    const existingAll = results.existing_product_sets.find(ps =>
      ps.name?.toLowerCase().includes("tous") || ps.name?.toLowerCase().includes("all") || !ps.filter
    );

    if (existingAll && existingAll.product_count > 0) {
      allProductsSetId = existingAll.id;
      results.steps.push(`Product set existant trouvé: ${existingAll.id} (${existingAll.product_count} produits)`);
    } else {
      // Créer un product set "Tous les produits" sans filtre restrictif
      const createRes = await fetch(`https://graph.facebook.com/v21.0/${CATALOG_ID}/product_sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "NajmCoiff — Tous Produits Actifs",
          filter: JSON.stringify({
            retailer_availability: { is_any: ["in stock"] }
          }),
          access_token: token
        })
      }).then(r => r.json());

      if (createRes.id) {
        allProductsSetId = createRes.id;
        results.steps.push(`Nouveau product set créé: ${createRes.id}`);
      } else {
        results.new_product_set_error = createRes.error?.message;
        results.steps.push(`Erreur création: ${createRes.error?.message}`);
      }
    }

    results.all_products_set_id = allProductsSetId;

    // 3. Mettre à jour les adsets pour utiliser le nouveau product set
    if (allProductsSetId) {
      const updateResults = [];
      for (const adsetId of ADSET_IDS) {
        // Pour PRODUCT_CATALOG_SALES, on ne peut mettre que product_set_id dans promoted_object
        const updateRes = await fetch(`https://graph.facebook.com/v21.0/${adsetId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promoted_object: { product_set_id: allProductsSetId },
            access_token: token
          })
        }).then(r => r.json());
        updateResults.push({ adset_id: adsetId, result: updateRes });
      }
      results.adset_updates = updateResults;
      results.steps.push(`${updateResults.filter(u => u.result.success).length}/${ADSET_IDS.length} adsets mis à jour`);
    }

    // 4. Réactiver les ads
    const reactivateResults = [];
    for (const campId of CAMP_IDS) {
      const ads = await fetch(
        `https://graph.facebook.com/v21.0/${campId}/ads?fields=id,name,status&access_token=${token}`
      ).then(r => r.json());
      for (const ad of (ads.data || [])) {
        const upRes = await fetch(`https://graph.facebook.com/v21.0/${ad.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE", access_token: token })
        }).then(r => r.json());
        reactivateResults.push({ ad_id: ad.id, name: ad.name, success: !!upRes.success });
      }
    }
    results.reactivated = reactivateResults;
    results.steps.push(`${reactivateResults.filter(r => r.success).length} ad(s) réactivée(s)`);

    return NextResponse.json({ ok: true, ...results });
  }

  // Archiver (supprimer) les ads bloquées WITH_ISSUES → propre la liste
  if (action === "archive_broken_ads") {
    const AD_IDS_TO_DELETE = body.ad_ids || ["120245473556570520", "120245473413110520"];
    const results = [];

    for (const adId of AD_IDS_TO_DELETE) {
      // DELETE supprime définitivement — utiliser ARCHIVED pour soft-delete
      const r = await fetch(`https://graph.facebook.com/v21.0/${adId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token })
      }).then(r => r.json());
      results.push({ ad_id: adId, result: r, success: !!r.success });
    }

    return NextResponse.json({ ok: results.every(r => r.success), results });
  }

  // Dupliquer les ads avec creative bloqué → nouvelles copies fraîches
  if (action === "duplicate_ads") {
    const AD_IDS = ["120245473556570520", "120245473413110520"];
    const results = [];

    for (const adId of AD_IDS) {
      // Obtenir les infos de l'ad original
      const adInfo = await fetch(
        `https://graph.facebook.com/v21.0/${adId}?fields=id,name,adset_id,campaign_id,status&access_token=${token}`
      ).then(r => r.json());

      // Dupliquer via l'endpoint /copies
      const copyRes = await fetch(`https://graph.facebook.com/v21.0/${adId}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status_option: "ACTIVE",
          rename_options: { rename_suffix: " v2" },
          access_token: token
        })
      }).then(r => r.json());

      // Mettre l'original en pause
      if (copyRes.id || (copyRes.copied_ad_id)) {
        await fetch(`https://graph.facebook.com/v21.0/${adId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PAUSED", access_token: token })
        });
      }

      results.push({
        original_id: adId,
        original_name: adInfo.name,
        copy_result: copyRes,
        new_ad_id: copyRes.id || copyRes.copied_ad_id,
        success: !!(copyRes.id || copyRes.copied_ad_id)
      });
    }

    return NextResponse.json({ ok: results.every(r => r.success), results });
  }

  // Créer de nouvelles ads avec creative template DPA frais
  if (action === "recreate_ads") {
    const PAGE_ID = "108762367616665";
    const CATALOG_ID = "1598091401402032";
    const PS_ID = "2007325089858160";
    const PIXEL_ID = "1436593504886973";
    const AD_ACCOUNT = "act_880775160439589";
    const SITE_URL = "https://www.najmcoiff.com";
    const results = { steps: [] };

    // Créer un nouveau creative DPA
    const newCreative = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/adcreatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `NajmCoiff DPA ${new Date().toISOString().slice(0,10)}`,
        object_story_spec: {
          page_id: PAGE_ID,
          template_data: {
            call_to_action: {
              type: "SHOP_NOW",
              value: { link: `${SITE_URL}/produits/{{product.retailer_id}}` }
            },
            message: "{{product.description}}",
            name: "{{product.name}}",
            description: "{{product.current_price}} DZD",
            image_crops: { "191x100": [[0, 0], [100, 100]], "400x150": [[0, 0], [100, 100]] }
          }
        },
        product_set_id: PS_ID,
        access_token: token
      })
    }).then(r => r.json());

    results.creative = newCreative;
    if (!newCreative.id) {
      results.steps.push(`Erreur création creative: ${newCreative.error?.message}`);
      return NextResponse.json({ ok: false, ...results });
    }
    results.steps.push(`Creative créé: ${newCreative.id}`);

    // Récupérer les ads actuelles et les mettre à jour avec le nouveau creative
    const updatedAds = [];
    for (const campId of CAMP_IDS) {
      const ads = await fetch(
        `https://graph.facebook.com/v21.0/${campId}/ads?fields=id,name,adset_id&access_token=${token}`
      ).then(r => r.json());

      for (const ad of (ads.data || [])) {
        // Créer une nouvelle ad dans le même adset avec le nouveau creative
        const newAd = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/ads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: ad.name + " fresh",
            adset_id: ad.adset_id,
            creative: { creative_id: newCreative.id },
            status: "ACTIVE",
            access_token: token
          })
        }).then(r => r.json());

        // Pause l'ancienne ad
        if (newAd.id) {
          await fetch(`https://graph.facebook.com/v21.0/${ad.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "PAUSED", access_token: token })
          });
        }

        updatedAds.push({ old_id: ad.id, new_id: newAd.id, name: ad.name, success: !!newAd.id, error: newAd.error?.message });
        results.steps.push(`Ad "${ad.name}": ${newAd.id ? `nouvelle ID ${newAd.id}` : `ERREUR: ${newAd.error?.message}`}`);
      }
    }
    results.ads = updatedAds;

    return NextResponse.json({ ok: results.ads?.every(a => a.success), ...results });
  }

  // ─── Créer une campagne broad pour ramener du trafic et nourrir le pixel ─────
  // Use case : retargeting bloqué (audience trop petite) → broad TRAFFIC en
  // parallèle pour générer des landing-page views, grossir l'audience pixel
  // et permettre au retargeting existant de redémarrer plus tard.
  if (action === "create_broad_traffic") {
    const PAGE_ID    = "108762367616665";
    const AD_ACCOUNT = "act_880775160439589";
    const SITE_URL   = "https://www.najmcoiff.com";
    const out = { steps: [] };

    // 1. Récupérer le budget des adsets existants pour s'aligner
    const refAdset = await meta(ADSET_IDS[0], { fields: "daily_budget,bid_strategy" });
    const dailyBudget = body.daily_budget || refAdset.daily_budget || 500;
    out.daily_budget_used = dailyBudget;
    out.steps.push(`Daily budget = ${dailyBudget} (cents EUR)`);

    // 2. Récupérer un creative_id existant d'une ad active pour le réutiliser
    let creativeId = null;
    for (const campId of CAMP_IDS) {
      const ads = await meta(`${campId}/ads`, { fields: "id,creative{id}" });
      for (const ad of (ads.data || [])) {
        if (ad.creative?.id) { creativeId = ad.creative.id; break; }
      }
      if (creativeId) break;
    }
    out.reused_creative_id = creativeId;
    out.steps.push(creativeId ? `Creative existant réutilisé: ${creativeId}` : "Pas de creative existant trouvé — fallback sur creative simple");

    // 3. Créer la campagne broad TRAFFIC
    const campRes = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `NC — Broad Trafic ${new Date().toISOString().slice(0,10)}`,
        objective: "OUTCOME_TRAFFIC",
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
        status: "ACTIVE",
        access_token: process.env.META_MARKETING_TOKEN,
      }),
    }).then(r => r.json());
    out.campaign = campRes;
    if (!campRes.id) {
      out.steps.push(`ERREUR campagne: ${campRes.error?.error_user_msg || campRes.error?.message}`);
      return NextResponse.json({ ok: false, ...out }, { status: 500 });
    }
    out.steps.push(`Campagne broad créée: ${campRes.id}`);

    // 4. Créer l'adset broad — DZ femmes 20-55, FB only, optim LP views
    const adsetRes = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/adsets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "NC — Broad Trafic — AdSet",
        campaign_id: campRes.id,
        daily_budget: dailyBudget,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        billing_event: "IMPRESSIONS",
        optimization_goal: "LANDING_PAGE_VIEWS",
        destination_type: "WEBSITE",
        targeting: {
          geo_locations: { countries: ["DZ"] },
          age_min: 20,
          age_max: 55,
          genders: [2],
          publisher_platforms: ["facebook"],
          facebook_positions: ["feed", "story"],
        },
        status: "ACTIVE",
        access_token: process.env.META_MARKETING_TOKEN,
      }),
    }).then(r => r.json());
    out.adset = adsetRes;
    if (!adsetRes.id) {
      out.steps.push(`ERREUR adset: ${adsetRes.error?.error_user_msg || adsetRes.error?.message}`);
      return NextResponse.json({ ok: false, ...out }, { status: 500 });
    }
    out.steps.push(`AdSet broad créé: ${adsetRes.id}`);

    // 5. Créer l'ad — d'abord essayer le creative existant
    let adRes = null;
    if (creativeId) {
      adRes = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "NC — Broad Trafic — Ad",
          adset_id: adsetRes.id,
          creative: { creative_id: creativeId },
          status: "ACTIVE",
          access_token: process.env.META_MARKETING_TOKEN,
        }),
      }).then(r => r.json());
      out.ad_attempt_reused = adRes;
      if (adRes.id) out.steps.push(`Ad créée avec creative existant: ${adRes.id}`);
      else          out.steps.push(`Creative existant rejeté: ${adRes.error?.error_user_msg || adRes.error?.message} → fallback`);
    }

    // Fallback : creative simple link_data pointant homepage (logo statique)
    if (!adRes?.id) {
      const fallbackCreative = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/adcreatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `NC Broad Trafic ${Date.now()}`,
          object_story_spec: {
            page_id: PAGE_ID,
            link_data: {
              link: SITE_URL,
              message: "Découvre tout le matériel coiffure et onglerie pro NajmCoiff — livraison partout en Algérie 🇩🇿",
              name: "NajmCoiff — Grossiste Coiffure & Onglerie",
              description: "Catalogue complet, paiement à la livraison.",
              call_to_action: { type: "SHOP_NOW", value: { link: SITE_URL } },
              picture: `${SITE_URL}/logo-najmcoiff-og.jpg`,
            },
          },
          access_token: process.env.META_MARKETING_TOKEN,
        }),
      }).then(r => r.json());
      out.fallback_creative = fallbackCreative;

      if (fallbackCreative.id) {
        adRes = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/ads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "NC — Broad Trafic — Ad",
            adset_id: adsetRes.id,
            creative: { creative_id: fallbackCreative.id },
            status: "ACTIVE",
            access_token: process.env.META_MARKETING_TOKEN,
          }),
        }).then(r => r.json());
        out.ad_fallback = adRes;
        out.steps.push(adRes.id ? `Ad fallback créée: ${adRes.id}` : `ERREUR ad fallback: ${adRes.error?.error_user_msg || adRes.error?.message}`);
      } else {
        out.steps.push(`ERREUR creative fallback: ${fallbackCreative.error?.error_user_msg || fallbackCreative.error?.message}`);
      }
    }

    out.summary = {
      campaign_id: campRes.id,
      adset_id:    adsetRes.id,
      ad_id:       adRes?.id || null,
      objective:   "OUTCOME_TRAFFIC",
      optim:       "LANDING_PAGE_VIEWS",
      targeting:   "DZ femmes 20-55 — broad — FB feed/story",
      daily_budget_eur_cents: dailyBudget,
    };
    return NextResponse.json({ ok: !!adRes?.id, ...out });
  }

  return NextResponse.json({ error: "Action inconnue. Utiliser: reactivate_ads | refresh_catalog | fix_product_set | duplicate_ads | recreate_ads | create_broad_traffic" }, { status: 400 });
}
