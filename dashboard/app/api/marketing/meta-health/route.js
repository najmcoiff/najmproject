/**
 * GET/POST /api/marketing/meta-health
 * Cron quotidien — vérifie les ads Meta et réactive automatiquement si bloqué.
 * Loggue chaque action dans nc_ai_decisions_log.
 * 
 * Appelé par cron (Authorization: Bearer DASHBOARD_SECRET)
 * ou manuellement par le owner (?token=...)
 */
import { NextResponse } from "next/server";
import { getServiceClient, ownerGuard, logDecision } from "@/lib/ai-helpers";

export const dynamic   = "force-dynamic";
export const maxDuration = 60;

const META_API   = "https://graph.facebook.com/v21.0";
const CAMP_IDS   = ["120245473401430520", "120245473402100520"];
const ADSET_IDS  = ["120245473401520520", "120245473402310520"];
const CATALOG_ID = "1598091401402032";
const SITE_URL   = "https://www.najmcoiff.com";

const FEED_URLS = {
  "NajmCoiff Feed Complet":  `${SITE_URL}/api/boutique/meta-feed`,
  "NajmCoiff Feed Coiffure": `${SITE_URL}/api/boutique/meta-feed?world=coiffure`,
  "NajmCoiff Feed Onglerie": `${SITE_URL}/api/boutique/meta-feed?world=onglerie`,
};

function cronGuard(req) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.DASHBOARD_SECRET;
  if (auth === `Bearer ${secret}`) return true;
  return ownerGuard(req);
}

async function metaGet(path, params = {}) {
  const token = process.env.META_MARKETING_TOKEN;
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const r = await fetch(`${META_API}/${path}?${qs}`);
  return r.json();
}

async function metaPost(path, body = {}) {
  const token = process.env.META_MARKETING_TOKEN;
  const r = await fetch(`${META_API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  return r.json();
}

export async function GET(req) {
  if (!cronGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return runHealthCheck(req);
}

export async function POST(req) {
  if (!cronGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return runHealthCheck(req);
}

async function runHealthCheck() {
  const token = process.env.META_MARKETING_TOKEN;
  if (!token) return NextResponse.json({ error: "META_MARKETING_TOKEN manquant" }, { status: 500 });

  const sb = getServiceClient();
  const report = {
    checked_at: new Date().toISOString(),
    ads_checked: [],
    actions_taken: [],
    feed_ok: false,
    catalog_ok: false,
    errors: [],
  };

  // ── 1. Vérifier chaque campagne et ses ads ──────────────────────────────────
  for (const campId of CAMP_IDS) {
    const ads = await metaGet(`${campId}/ads`, {
      fields: "id,name,status,effective_status,issues_info",
    });

    for (const ad of (ads.data || [])) {
      const adReport = {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        issues: (ad.issues_info || []).map(i => ({
          code: i.error_code,
          summary: i.error_summary,
          type: i.error_type,
        })),
        action: null,
      };

      // IN_PROCESS = Meta en train de réviser → pas d'action, c'est normal
      if (ad.effective_status === "IN_PROCESS") {
        adReport.action = "ok";
      }
      // WITH_ISSUES → analyser le code d'erreur avant toute action
      else if (ad.effective_status === "WITH_ISSUES") {
        const hasInternalError    = adReport.issues.some(i => i.code === 2643131);
        // Code 2490424 = "taux élevé d'invalidations" → boucle de blocage si on réactive → NE PAS TOUCHER
        const hasInvalidTraffic   = adReport.issues.some(i => i.code === 2490424);

        if (hasInvalidTraffic) {
          // STOP automatique — réactiver crée une boucle infinie de blocages
          adReport.action = "blocked_invalid_traffic_no_auto_reactivation";
          report.actions_taken.push(`Ad "${ad.name}" bloquée 2490424 (trafic invalide) → PAS de réactivation automatique. Action manuelle requise : vérifier l'audience.`);
          report.errors.push(`Ad "${ad.name}" bloquée 2490424 — audience retargeting incorrecte ou trafic frauduleux DZ`);
          await logDecision(sb, {
            agent: "meta_health",
            decision_type: "ad_blocked_2490424",
            description: `Ad "${ad.name}" bloquée code 2490424 — réactivation automatique désactivée pour éviter la boucle`,
            output_data: { ad_id: ad.id, issues: adReport.issues },
            success: false,
            impact: "high",
          });
        } else if (hasInternalError) {
          // Code 2643131 = erreur interne Meta → duplication
          const copyRes = await fetch(`https://graph.facebook.com/v21.0/${ad.id}/copies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status_option: "ACTIVE", access_token: token })
          }).then(r => r.json());

          if (copyRes.copied_ad_id || copyRes.id) {
            await metaPost(ad.id, { status: "PAUSED" });
            adReport.action = `duplicated:${copyRes.copied_ad_id || copyRes.id}`;
            report.actions_taken.push(`Ad "${ad.name}" erreur interne Meta → dupliquée (nouvelle ID: ${copyRes.copied_ad_id || copyRes.id})`);
          } else {
            adReport.action = `dup_failed: ${copyRes.error?.message}`;
            report.actions_taken.push(`Ad "${ad.name}" → duplication échouée: ${copyRes.error?.message}`);
          }
          await logDecision(sb, {
            agent: "meta_health",
            decision_type: "ad_reactivation",
            description: `Ad "${ad.name}" bloquée (${ad.effective_status}) — action: ${adReport.action}`,
            output_data: { ad_id: ad.id, issues: adReport.issues },
            success: adReport.action.startsWith("duplicated"),
            impact: "high",
          });
        } else {
          // Autre blocage inconnu → refresh catalogue + réactivation classique
          await refreshCatalog(token, CATALOG_ID);
          const upd = await metaPost(ad.id, { status: "ACTIVE" });
          adReport.action = upd.success ? "reactivated" : `failed: ${upd.error?.message}`;
          report.actions_taken.push(`Ad "${ad.name}" → ${adReport.action}`);
          await logDecision(sb, {
            agent: "meta_health",
            decision_type: "ad_reactivation",
            description: `Ad "${ad.name}" bloquée (${ad.effective_status}) — action: ${adReport.action}`,
            output_data: { ad_id: ad.id, issues: adReport.issues },
            success: adReport.action.startsWith("reactivated"),
            impact: "high",
          });
        }
      }
      // PAUSED sans WITH_ISSUES → réactiver normalement
      else if (ad.status === "PAUSED") {
        const upd = await metaPost(ad.id, { status: "ACTIVE" });
        adReport.action = upd.success ? "reactivated" : `failed: ${upd.error?.message}`;
        report.actions_taken.push(`Ad "${ad.name}" (paused) → ${adReport.action}`);
      } else {
        adReport.action = "ok";
      }

      report.ads_checked.push(adReport);
    }
  }

  // ── 2. Vérifier le feed produit ─────────────────────────────────────────────
  try {
    const feedRes = await fetch(`${SITE_URL}/api/boutique/meta-feed?world=coiffure`);
    const feedText = await feedRes.text();
    const itemCount = (feedText.match(/<g:id>/g) || []).length;
    const firstId   = feedText.match(/<g:id>(.*?)<\/g:id>/)?.[1] || "";
    const noTitleCount = (feedText.match(/<g:title><\/g:title>/g) || []).length;

    report.feed_ok     = feedRes.ok && itemCount >= 500;
    report.feed_items  = itemCount;
    report.feed_first_id = firstId;
    report.feed_empty_titles = noTitleCount;

    if (!report.feed_ok || noTitleCount > 50) {
      report.errors.push(`Feed anormal: ${itemCount} items, ${noTitleCount} titres vides`);
      await logDecision(sb, {
        agent: "meta_health",
        decision_type: "feed_warning",
        description: `Feed Meta anormal: ${itemCount} items, ${noTitleCount} titres vides`,
        output_data: { items: itemCount, empty_titles: noTitleCount, first_id: firstId },
        success: false,
        impact: "high",
      });
    }
  } catch (e) {
    report.feed_ok = false;
    report.errors.push(`Feed inaccessible: ${e.message}`);
  }

  // ── 3. Vérifier le catalogue Meta ───────────────────────────────────────────
  const catalog = await metaGet(CATALOG_ID, { fields: "id,name,product_count" });
  report.catalog_product_count = catalog.product_count;
  report.catalog_ok = (catalog.product_count || 0) >= 500;

  if (!report.catalog_ok) {
    report.errors.push(`Catalogue sous-peuplé: ${catalog.product_count} produits`);
    // Forcer refresh du catalogue
    await refreshCatalog(token, CATALOG_ID);
    report.actions_taken.push("Catalogue refreshé (trop peu de produits)");
  }

  // ── 4. Vérifier et corriger les placements (Instagram → Facebook only) ──────
  report.placements_ok = true;
  try {
    for (const asId of ADSET_IDS) {
      const asData = await metaGet(asId, { fields: "id,name,targeting" });
      const t = asData.targeting || {};
      const platforms = t.publisher_platforms || [];

      // Si Instagram est présent ou si publisher_platforms est vide (= auto = inclut Instagram)
      const hasInstagram = platforms.includes("instagram") || platforms.length === 0;

      if (hasInstagram) {
        report.placements_ok = false;
        report.actions_taken.push(`AdSet ${asId}: Instagram détecté dans placements → correction automatique`);

        const geoRaw = t.geo_locations || {};
        const geoClean = {};
        if (geoRaw.countries) geoClean.countries = Array.isArray(geoRaw.countries) ? geoRaw.countries : [geoRaw.countries];
        if (!Object.keys(geoClean).length) geoClean.countries = ["DZ"];

        const newTargeting = {
          geo_locations: geoClean,
          age_min: t.age_min || 20,
          age_max: t.age_max || 55,
          publisher_platforms: ["facebook"],
          facebook_positions: ["feed", "story"],
        };
        const customAud = (t.custom_audiences || []).map(a => ({ id: a.id }));
        const excludedAud = (t.excluded_custom_audiences || []).map(a => ({ id: a.id }));
        if (customAud.length) newTargeting.custom_audiences = customAud;
        if (excludedAud.length) newTargeting.excluded_custom_audiences = excludedAud;

        const fixRes = await metaPost(asId, { targeting: newTargeting });
        if (fixRes.success) {
          report.actions_taken.push(`AdSet ${asId}: placements corrigés → Facebook uniquement`);
        } else {
          report.errors.push(`AdSet ${asId}: échec correction placements: ${fixRes.error?.message}`);
        }

        await logDecision(sb, {
          agent: "meta_health",
          decision_type: "placements_fix",
          description: `AdSet ${asId} avait Instagram → correction automatique vers Facebook uniquement`,
          output_data: { adset_id: asId, was_platforms: platforms, fix_result: fixRes },
          success: !!fixRes.success,
          impact: "high",
        });
      }
    }
  } catch (e) {
    report.errors.push(`Vérification placements: ${e.message}`);
  }

  // ── 5. Log global si tout est OK ───────────────────────────────────────────
  const allOk = report.ads_checked.every(a => a.action === "ok") && report.feed_ok && report.catalog_ok && report.placements_ok;

  if (allOk) {
    await logDecision(sb, {
      agent: "meta_health",
      decision_type: "health_check_ok",
      description: `Health check Meta OK — ${report.ads_checked.length} ads actives, ${report.feed_items} items feed, ${report.catalog_product_count} produits catalogue`,
      output_data: report,
      success: true,
      impact: "low",
    });
  }

  return NextResponse.json({ ok: allOk, ...report });
}

async function refreshCatalog(token, catalogId) {
  try {
    const feedsRes = await fetch(
      `${META_API}/${catalogId}/product_feeds?fields=id,name&access_token=${token}`
    ).then(r => r.json());

    for (const feed of (feedsRes.data || [])) {
      const feedUrl = FEED_URLS[feed.name] || `${SITE_URL}/api/boutique/meta-feed`;
      await fetch(`${META_API}/${feed.id}/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, url: feedUrl }),
      });
    }
  } catch {
    // Silencieux — ne bloque pas le health check
  }
}
