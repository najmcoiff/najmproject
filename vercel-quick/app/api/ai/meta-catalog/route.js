import { NextResponse } from "next/server";
import { getServiceClient, ownerGuard, logDecision } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/meta-catalog
 * Actions :
 *   create_catalog      → Crée le catalogue produits dans Meta Business Manager
 *   register_feed       → Enregistre le Product Feed XML dans le catalogue
 *   create_audiences    → Crée les 5 audiences (visiteurs + custom clients + lookalike)
 *   upload_customers    → Upload les téléphones clients hashés SHA-256 dans Meta
 *   status              → Retourne l'état actuel (catalog_id, feed_id, audiences)
 */

const META_API = "https://graph.facebook.com/v21.0";
const BM_ID    = "301096122408704";
const SITE_URL = "https://www.najmcoiff.com";

// Pixel IDs séparés par monde (règle H7)
const PIXEL_COIFFURE = "1436593504886973";
const PIXEL_ONGLERIE = "839178319213103";

export async function POST(req) {
  if (!ownerGuard(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  const metaToken = process.env.META_MARKETING_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!metaToken) {
    return NextResponse.json({ error: "META_MARKETING_TOKEN manquant" }, { status: 500 });
  }

  const sb = getServiceClient();

  // ── Status ─────────────────────────────────────────────────────────────────
  if (action === "status") {
    const { data: settings } = await sb
      .from("nc_ai_decisions_log")
      .select("decision_type, output_data, created_at")
      .in("decision_type", ["meta_catalog_created", "meta_feed_registered", "meta_audiences_created"])
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: audiences } = await sb
      .from("nc_ai_audiences")
      .select("name, audience_type, meta_audience_id, world, size_estimate, created_at")
      .order("created_at", { ascending: false });

    return NextResponse.json({ ok: true, logs: settings || [], audiences: audiences || [] });
  }

  // ── Créer le catalogue Meta ─────────────────────────────────────────────────
  if (action === "create_catalog") {
    const res = await fetch(`${META_API}/${BM_ID}/owned_product_catalogs?access_token=${metaToken}`);
    const existing = await res.json();

    // Vérifier si un catalogue NajmCoiff existe déjà
    const existingCatalog = existing?.data?.find(c =>
      c.name?.toLowerCase().includes("najmcoiff") || c.name?.toLowerCase().includes("najm")
    );

    let catalogId;
    if (existingCatalog) {
      catalogId = existingCatalog.id;
      await logDecision(sb, {
        agent: "meta_catalog",
        decision_type: "meta_catalog_created",
        description: `Catalogue existant trouvé : ${existingCatalog.name}`,
        output_data: { catalog_id: catalogId, catalog_name: existingCatalog.name, reused: true },
        impact: "low",
      });
      return NextResponse.json({ ok: true, catalog_id: catalogId, reused: true, name: existingCatalog.name });
    }

    // Créer le catalogue
    const createRes = await fetch(`${META_API}/${BM_ID}/owned_product_catalogs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "NajmCoiff Catalogue",
        access_token: metaToken,
      }),
    });
    const createData = await createRes.json();

    if (createData.error) {
      return NextResponse.json({ error: createData.error.message }, { status: 400 });
    }

    catalogId = createData.id;

    await logDecision(sb, {
      agent: "meta_catalog",
      decision_type: "meta_catalog_created",
      description: `Catalogue Meta créé : ${catalogId}`,
      output_data: { catalog_id: catalogId, catalog_name: "NajmCoiff Catalogue" },
      impact: "high",
    });

    return NextResponse.json({ ok: true, catalog_id: catalogId, catalog_name: "NajmCoiff Catalogue" });
  }

  // ── Enregistrer le Product Feed ─────────────────────────────────────────────
  if (action === "register_feed") {
    const { catalog_id } = body;
    if (!catalog_id) return NextResponse.json({ error: "catalog_id requis" }, { status: 400 });

    // Enregistrer les 2 feeds (coiffure + onglerie séparés pour H7)
    const feeds = [
      { name: "NajmCoiff Feed Complet", url: `${SITE_URL}/api/boutique/meta-feed`, world: "all" },
      { name: "NajmCoiff Feed Coiffure", url: `${SITE_URL}/api/boutique/meta-feed?world=coiffure`, world: "coiffure" },
      { name: "NajmCoiff Feed Onglerie", url: `${SITE_URL}/api/boutique/meta-feed?world=onglerie`, world: "onglerie" },
    ];

    const feedResults = [];
    for (const feed of feeds) {
      const feedRes = await fetch(`${META_API}/${catalog_id}/product_feeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: feed.name,
          schedule: {
            interval: "DAILY",
            url: feed.url,
            hour: "3",
          },
          access_token: metaToken,
        }),
      });
      const feedData = await feedRes.json();
      feedResults.push({
        world: feed.world,
        feed_id: feedData.id,
        error: feedData.error?.message,
        ok: !feedData.error,
      });
    }

    await logDecision(sb, {
      agent: "meta_catalog",
      decision_type: "meta_feed_registered",
      description: `${feedResults.filter(f => f.ok).length}/3 feeds enregistrés dans catalogue ${catalog_id}`,
      output_data: { catalog_id, feeds: feedResults },
      impact: "high",
    });

    return NextResponse.json({ ok: true, catalog_id, feeds: feedResults });
  }

  // ── Créer les 5 audiences ────────────────────────────────────────────────────
  if (action === "create_audiences") {
    if (!adAccountId) {
      return NextResponse.json({ error: "META_AD_ACCOUNT_ID manquant" }, { status: 500 });
    }

    const accountId = adAccountId.replace("act_", "");

    const audiencesToCreate = [
      {
        name: "NajmCoiff — Visiteurs Coiffure 7j",
        world: "coiffure",
        type: "website_retargeting",
        pixelId: PIXEL_COIFFURE,
        retention: 7 * 24 * 3600, // 7 jours en secondes
        urlFilter: null,
      },
      {
        name: "NajmCoiff — Visiteurs Onglerie 7j",
        world: "onglerie",
        type: "website_retargeting",
        pixelId: PIXEL_ONGLERIE,
        retention: 7 * 24 * 3600,
        urlFilter: null,
      },
      {
        name: "NajmCoiff — Visiteurs Coiffure 30j",
        world: "coiffure",
        type: "website_retargeting",
        pixelId: PIXEL_COIFFURE,
        retention: 30 * 24 * 3600,
        urlFilter: null,
      },
    ];

    const createdAudiences = [];

    for (const aud of audiencesToCreate) {
      const payload = {
        name: aud.name,
        subtype: "WEBSITE",
        description: `Audience générée automatiquement par NajmCoiff AI — ${aud.world}`,
        rule: {
          inclusions: {
            operator: "or",
            rules: [
              {
                event_sources: [{ id: aud.pixelId, type: "pixel" }],
                retention_seconds: aud.retention,
                filter: aud.urlFilter
                  ? {
                      operator: "and",
                      filters: [{ field: "url", operator: "i_contains", value: aud.urlFilter }],
                    }
                  : undefined,
              },
            ],
          },
        },
        prefill: true,
        access_token: metaToken,
      };

      // Nettoyer les undefined dans le payload
      const cleanPayload = JSON.parse(JSON.stringify(payload));

      const audRes = await fetch(`${META_API}/act_${accountId}/customaudiences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanPayload),
      });
      const audData = await audRes.json();

      if (audData.id) {
        // Sauvegarder dans nc_ai_audiences
        await sb.from("nc_ai_audiences").upsert({
          name: aud.name,
          segment_name: aud.name,
          audience_type: aud.type,
          meta_audience_id: audData.id,
          world: aud.world,
          pixel_id: aud.pixelId,
          retention_days: Math.floor(aud.retention / 86400),
          size_estimate: null,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "meta_audience_id" });

        createdAudiences.push({ name: aud.name, id: audData.id, world: aud.world, ok: true });
      } else {
        createdAudiences.push({ name: aud.name, error: audData.error?.message, world: aud.world, ok: false });
      }
    }

    await logDecision(sb, {
      agent: "meta_catalog",
      decision_type: "meta_audiences_created",
      description: `${createdAudiences.filter(a => a.ok).length}/${audiencesToCreate.length} audiences créées`,
      output_data: { audiences: createdAudiences },
      impact: "high",
    });

    return NextResponse.json({ ok: true, created: createdAudiences.filter(a => a.ok).length, audiences: createdAudiences });
  }

  // ── Upload clients existants comme Custom Audience ───────────────────────────
  if (action === "upload_customers") {
    if (!adAccountId) {
      return NextResponse.json({ error: "META_AD_ACCOUNT_ID manquant" }, { status: 500 });
    }

    const accountId = adAccountId.replace("act_", "");

    // Récupérer les numéros de téléphone des clients depuis nc_orders
    const { data: customers } = await sb
      .from("nc_orders")
      .select("customer_phone, full_name, world:order_source")
      .not("customer_phone", "is", null)
      .gt("order_date", new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString());

    if (!customers || customers.length === 0) {
      return NextResponse.json({ error: "Aucun client avec téléphone trouvé" }, { status: 404 });
    }

    // Dédupliquer + formater les téléphones pour l'Algérie (+213)
    const phones = [...new Set(
      customers
        .map(c => normalizeAlgerianPhone(c.customer_phone))
        .filter(Boolean)
    )];

    // Créer la Custom Audience
    const createRes = await fetch(`${META_API}/act_${accountId}/customaudiences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "NajmCoiff — Clients Existants",
        subtype: "CUSTOM",
        description: "Clients ayant passé une commande sur NajmCoiff (téléphones hashés)",
        customer_file_source: "USER_PROVIDED_ONLY",
        access_token: metaToken,
      }),
    });
    const audienceData = await createRes.json();

    if (!audienceData.id) {
      return NextResponse.json({ error: audienceData.error?.message }, { status: 400 });
    }

    const audienceId = audienceData.id;

    // Hasher les téléphones SHA-256 et les uploader par batch de 1000
    const { createHash } = await import("crypto");
    const BATCH_SIZE = 1000;
    let totalUploaded = 0;
    const errors = [];

    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
      const batch = phones.slice(i, i + BATCH_SIZE);
      const hashedPhones = batch.map(phone =>
        createHash("sha256").update(phone).digest("hex")
      );

      const uploadRes = await fetch(`${META_API}/${audienceId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            schema: ["PHONE"],
            data: hashedPhones.map(h => [h]),
          },
          access_token: metaToken,
        }),
      });
      const uploadData = await uploadRes.json();

      if (uploadData.num_received) {
        totalUploaded += uploadData.num_received;
      } else if (uploadData.error) {
        errors.push(uploadData.error.message);
      }
    }

    // Sauvegarder l'audience dans nc_ai_audiences
    await sb.from("nc_ai_audiences").upsert({
      name: "NajmCoiff — Clients Existants",
      segment_name: "NajmCoiff — Clients Existants",
      audience_type: "custom_customers",
      meta_audience_id: audienceId,
      world: "all",
      member_count: totalUploaded,
      size_estimate: totalUploaded,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "meta_audience_id" });

    await logDecision(sb, {
      agent: "meta_catalog",
      decision_type: "customers_uploaded",
      description: `${totalUploaded} clients uploadés dans Meta Custom Audience`,
      output_data: { audience_id: audienceId, total_phones: phones.length, uploaded: totalUploaded },
      impact: "high",
    });

    return NextResponse.json({
      ok: true,
      audience_id: audienceId,
      total_phones: phones.length,
      uploaded: totalUploaded,
      errors: errors.slice(0, 3),
    });
  }

  // ── Créer les Lookalike audiences ────────────────────────────────────────────
  if (action === "create_lookalike") {
    const { source_audience_id } = body;
    if (!source_audience_id || !adAccountId) {
      return NextResponse.json({ error: "source_audience_id + META_AD_ACCOUNT_ID requis" }, { status: 400 });
    }

    const accountId = adAccountId.replace("act_", "");

    const lookalikes = [
      { name: "NajmCoiff — Lookalike 1% Algérie", ratio: 0.01 },
      { name: "NajmCoiff — Lookalike 2% Algérie", ratio: 0.02 },
    ];

    const results = [];
    for (const lk of lookalikes) {
      const lkRes = await fetch(`${META_API}/act_${accountId}/customaudiences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lk.name,
          subtype: "LOOKALIKE",
          origin_audience_id: source_audience_id,
          lookalike_spec: {
            type: "similarity",
            country: "DZ",
            ratio: lk.ratio,
          },
          access_token: metaToken,
        }),
      });
      const lkData = await lkRes.json();

      if (lkData.id) {
        await sb.from("nc_ai_audiences").upsert({
          name: lk.name,
          segment_name: lk.name,
          audience_type: "lookalike",
          meta_audience_id: lkData.id,
          world: "all",
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "meta_audience_id" });

        results.push({ name: lk.name, id: lkData.id, ok: true });
      } else {
        results.push({ name: lk.name, error: lkData.error?.message, ok: false });
      }
    }

    return NextResponse.json({ ok: true, lookalikes: results });
  }

  return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeAlgerianPhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/\s+/g, "").replace(/[-().]/g, "");

  // Formats Algérie : 0XXXXXXXXX → +213XXXXXXXXX
  if (p.startsWith("0") && p.length === 10) return `+213${p.slice(1)}`;
  if (p.startsWith("213") && p.length === 12) return `+${p}`;
  if (p.startsWith("+213")) return p;
  if (/^\d{9}$/.test(p)) return `+213${p}`;

  return null;
}
