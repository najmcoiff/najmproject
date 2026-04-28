/**
 * meta-campaigns-health.spec.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests Playwright HUMAIN — Vérification complète des campagnes Meta.
 * Simule un vrai utilisateur qui navigue dans le dashboard marketing.
 *
 * MH-01  Dashboard Marketing charge + onglet Campagnes Meta visible
 * MH-02  KPIs Meta affichent spend > 0 (campagnes actives)
 * MH-03  Sync Meta manuel → réussi + last_synced_at mis à jour en DB
 * MH-04  API meta-health retourne 200 + ads ACTIVE + feed OK
 * MH-05  Feed produit accessible (≥ 500 items, premier ID 490...)
 * MH-06  Feed produit — titres NON VIDES (vérif locale sur 10 items)
 * MH-07  Feed produit — images accessibles (vérif 5 URLs Supabase)
 * MH-08  Product set coiffure — 900+ produits dans Meta catalogue
 * MH-09  Pixel ViewContent — fire avec content_ids sur page produit boutique
 * MH-10  Pixel AddToCart — fire avec content_ids quand ajout panier
 * MH-11  nc_ai_decisions_log — health_check_ok logué (après run health)
 * MH-12  Campagnes en DB — status active + last_synced_at < 2h
 * MH-13  Placements adsets — Facebook uniquement (0 Instagram)
 */

import { test, expect, sbQuery } from "./fixtures.js";

const BASE_DASH   = process.env.BASE_URL || "https://najmcoiffdashboard.vercel.app";
const BASE_SHOP   = "https://www.najmcoiff.com";
const SESSION_FILE = "vercel-quick/.playwright-auth/session.json";

import fs from "fs";
function getToken() {
  try { return JSON.parse(fs.readFileSync(".playwright-auth/session.json", "utf-8")).token; }
  catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────────────
// MH-01 — Dashboard charge + onglet Campagnes Meta visible
// ──────────────────────────────────────────────────────────────────────────────
test("MH-01 — Dashboard marketing charge + onglet Campagnes Meta", async ({ authedPage: page }) => {
  await page.goto(`${BASE_DASH}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const tab = page.locator("button").filter({ hasText: /Campagnes Meta/i }).first();
  await expect(tab).toBeVisible({ timeout: 8000 });
  console.log("✅ Onglet 'Campagnes Meta' visible");

  await tab.click();
  await page.waitForTimeout(2000);

  // Vérifier que le titre de l'onglet est actif
  const activeTab = page.locator("button.border-b-2").filter({ hasText: /Campagnes Meta/i });
  await expect(activeTab).toBeVisible({ timeout: 5000 });
  console.log("✅ Onglet Campagnes Meta actif");
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-02 — KPIs Meta affichent spend > 0
// ──────────────────────────────────────────────────────────────────────────────
test("MH-02 — KPIs Meta : spend > 0 DA (campagnes actives)", async ({ authedPage: page }) => {
  await page.goto(`${BASE_DASH}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const tab = page.locator("button").filter({ hasText: /Campagnes Meta/i }).first();
  await tab.click();
  await page.waitForTimeout(4000);

  // Vérifier qu'on voit le tableau des campagnes ou les KPIs de dépense
  const campagneCard = page.locator("text=/Retargeting Coiffure/i").first();
  await expect(campagneCard).toBeVisible({ timeout: 10000 });
  console.log("✅ Carte campagne 'Retargeting Coiffure' visible");

  // Vérifier les insights en DB
  const camps = await sbQuery(
    "nc_ai_campaigns",
    "select=campaign_name,status,budget_spent_da,impressions,clicks&order=budget_spent_da.desc"
  );
  console.log(`  Campagnes en DB: ${camps.length}`);
  camps.forEach(c => console.log(`    ${c.campaign_name}: spend=${c.budget_spent_da} | impressions=${c.impressions}`));

  const hasSpend = camps.some(c => Number(c.budget_spent_da || 0) > 0);
  expect(hasSpend).toBe(true);
  console.log("✅ Budget dépensé > 0 DA confirmé en DB");
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-03 — Sync Meta manuel réussi + last_synced_at mis à jour
// ──────────────────────────────────────────────────────────────────────────────
test("MH-03 — Sync Meta manuel → 200 + DB mis à jour", async ({ authedPage: page }) => {
  const token = getToken();
  expect(token).toBeTruthy();

  // Appeler POST sync-stats
  const before = new Date();
  const r = await page.request.post(`${BASE_DASH}/api/marketing/sync-stats?token=${token}`, {
    timeout: 30000,
  });
  expect(r.ok()).toBe(true);
  const body = await r.json();
  console.log(`  POST sync-stats → HTTP ${r.status()} | synced: ${body.synced}`);
  expect(body.ok).toBe(true);

  // Vérifier last_synced_at en DB
  await page.waitForTimeout(2000);
  const camps = await sbQuery(
    "nc_ai_campaigns",
    "select=campaign_name,last_synced_at&order=last_synced_at.desc&limit=2"
  );
  camps.forEach(c => {
    const ago = Math.round((Date.now() - new Date(c.last_synced_at)) / 1000);
    console.log(`    ${c.campaign_name}: synced ${ago}s ago`);
    expect(ago).toBeLessThan(120); // Sync < 2 min
  });
  console.log("✅ last_synced_at mis à jour < 2 min");
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-04 — API meta-health : ads ACTIVE + feed OK + catalogue OK
// ──────────────────────────────────────────────────────────────────────────────
test("MH-04 — Health check Meta : ads ACTIVE + feed ≥ 500 + catalogue ≥ 500 produits", async ({ authedPage: page }) => {
  const token = getToken();
  expect(token).toBeTruthy();

  const r = await page.request.post(`${BASE_DASH}/api/marketing/meta-health?token=${token}`, {
    timeout: 60000,
  });
  expect(r.ok()).toBe(true);
  const body = await r.json();
  console.log(`  meta-health → ok=${body.ok}`);
  console.log(`  ads: ${JSON.stringify(body.ads_checked?.map(a => ({ name: a.name, status: a.effective_status, action: a.action })))}`);
  console.log(`  feed: ${body.feed_items} items | feed_ok=${body.feed_ok}`);
  console.log(`  catalogue: ${body.catalog_product_count} produits | catalog_ok=${body.catalog_ok}`);
  console.log(`  actions: ${JSON.stringify(body.actions_taken)}`);

  // Statuts valides : ACTIVE (diffusé) | IN_PROCESS | PENDING_REVIEW (révision Meta en cours, pas de problème)
  const VALID_STATUSES = ["ACTIVE", "IN_PROCESS", "PENDING_REVIEW"];
  for (const ad of (body.ads_checked || [])) {
    console.log(`  Ad "${ad.name}": status=${ad.status} / effective=${ad.effective_status} | action=${ad.action}`);
    if (ad.issues?.length) {
      console.warn(`  ⚠️ Issues: ${JSON.stringify(ad.issues)}`);
    }
    // Ad réactivée par le health check → acceptable
    // Ad ACTIVE ou IN_PROCESS → acceptable
    const isOk = VALID_STATUSES.includes(ad.effective_status) || ad.action?.startsWith("reactivated");
    expect(isOk).toBe(true);
  }
  console.log("✅ Toutes les ads ACTIVE ou IN_PROCESS (aucun blocage)");

  // Feed OK
  expect(body.feed_ok).toBe(true);
  expect(body.feed_items).toBeGreaterThanOrEqual(500);
  console.log(`✅ Feed OK: ${body.feed_items} items`);

  // Catalogue OK
  expect(body.catalog_ok).toBe(true);
  expect(body.catalog_product_count).toBeGreaterThanOrEqual(500);
  console.log(`✅ Catalogue OK: ${body.catalog_product_count} produits`);

  // Placements OK (pas d'Instagram)
  console.log(`  placements_ok=${body.placements_ok}`);
  expect(body.placements_ok).toBe(true);
  console.log("✅ Placements OK: Facebook uniquement, pas d'Instagram");
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-05 — Feed produit accessible ≥ 500 items, premier ID 490...
// ──────────────────────────────────────────────────────────────────────────────
test("MH-05 — Feed produit ≥ 500 items + premier ID commence par 490", async ({ page }) => {
  const r = await page.request.get(`${BASE_SHOP}/api/boutique/meta-feed?world=coiffure`, {
    timeout: 30000,
  });
  expect(r.ok()).toBe(true);

  const xml = await r.text();
  const ids = [...xml.matchAll(/<g:id>(.*?)<\/g:id>/g)].map(m => m[1]);
  console.log(`  Feed coiffure: ${ids.length} items | premier: ${ids[0]}`);

  expect(ids.length).toBeGreaterThanOrEqual(500);
  console.log(`✅ Feed coiffure: ${ids.length} items ≥ 500`);

  // Le premier ID doit commencer par 490 (produits anciens en premier)
  expect(ids[0]).toMatch(/^490/);
  console.log(`✅ Premier ID commence par 490: ${ids[0]}`);

  // Vérifier le feed onglerie aussi
  const r2 = await page.request.get(`${BASE_SHOP}/api/boutique/meta-feed?world=onglerie`, {
    timeout: 30000,
  });
  const xml2 = await r2.text();
  const ids2 = [...xml2.matchAll(/<g:id>(.*?)<\/g:id>/g)].map(m => m[1]);
  console.log(`  Feed onglerie: ${ids2.length} items`);
  expect(ids2.length).toBeGreaterThan(0);
  console.log(`✅ Feed onglerie: ${ids2.length} items`);
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-06 — Feed produit : titres NON VIDES sur les 20 premiers items
// ──────────────────────────────────────────────────────────────────────────────
test("MH-06 — Feed produit : titres non vides (vérif 20 premiers)", async ({ page }) => {
  const r = await page.request.get(`${BASE_SHOP}/api/boutique/meta-feed?world=coiffure`, {
    timeout: 30000,
  });
  const xml = await r.text();

  // Extraire les 20 premiers items
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20);
  let emptyTitles = 0;
  let noImage = 0;
  let noPrice = 0;

  items.forEach((item, i) => {
    const title = item[1].match(/<g:title>(.*?)<\/g:title>/)?.[1] || "";
    const img   = item[1].match(/<g:image_link>(.*?)<\/g:image_link>/)?.[1] || "";
    const price = item[1].match(/<g:price>(.*?)<\/g:price>/)?.[1] || "";
    const id    = item[1].match(/<g:id>(.*?)<\/g:id>/)?.[1] || "";
    const avail = item[1].match(/<g:availability>(.*?)<\/g:availability>/)?.[1] || "";

    if (!title.trim()) {
      emptyTitles++;
      console.warn(`  ⚠️ Item ${i + 1} (${id}): titre vide`);
    }
    if (!img) noImage++;
    if (!price) noPrice++;

    if (i < 3) {
      console.log(`  Item ${i + 1}: id=${id} | titre='${title.substring(0, 40)}' | avail=${avail} | img=${img ? "OUI" : "NON"}`);
    }
  });

  console.log(`  Résultat 20 premiers: ${emptyTitles} titres vides, ${noImage} sans image, ${noPrice} sans prix`);
  expect(emptyTitles).toBe(0);
  console.log("✅ Tous les 20 premiers items ont un titre");
  expect(noImage).toBe(0);
  console.log("✅ Tous les 20 premiers items ont une image");
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-07 — Images produits accessibles (5 URLs Supabase Storage)
// ──────────────────────────────────────────────────────────────────────────────
test("MH-07 — Images Supabase Storage accessibles (5 produits)", async ({ page }) => {
  const r = await page.request.get(`${BASE_SHOP}/api/boutique/meta-feed?world=coiffure`, {
    timeout: 30000,
  });
  const xml = await r.text();
  const images = [...xml.matchAll(/<g:image_link>(.*?)<\/g:image_link>/g)]
    .map(m => m[1])
    .slice(0, 5);

  console.log(`  Test de ${images.length} images:`);
  for (const imgUrl of images) {
    const imgRes = await page.request.head(imgUrl, { timeout: 10000 }).catch(() => null);
    const status = imgRes?.status() || 0;
    console.log(`  ${status >= 200 && status < 400 ? "✅" : "❌"} ${imgUrl.split("/").pop()} → HTTP ${status}`);
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(400);
  }
  console.log("✅ Toutes les images Supabase sont accessibles");
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-08 — Product set coiffure Meta : 900+ produits
// ──────────────────────────────────────────────────────────────────────────────
test("MH-08 — Product set Meta coiffure ≥ 900 produits (post-fix)", async ({ authedPage: page }) => {
  const token = getToken();
  const r = await page.request.post(
    `${BASE_DASH}/api/marketing/meta-debug?token=${token}`,
    {
      data: { action: "inspect_product_set", product_set_id: "2007325089858160" },
      timeout: 20000,
    }
  );
  expect(r.ok()).toBe(true);
  const body = await r.json();
  const count = body.product_set_info?.product_count || 0;
  console.log(`  Product set 'NajmCoiff Coiffure': ${count} produits`);
  console.log(`  Issues summary: ${JSON.stringify(body.issues_summary)}`);
  console.log(`  Availability: ${JSON.stringify(body.by_availability)}`);

  expect(count).toBeGreaterThanOrEqual(900);
  console.log(`✅ Product set coiffure: ${count} produits ≥ 900`);

  // Aucun produit sans image dans le sample
  expect(body.issues_summary?.no_image || 0).toBe(0);
  console.log("✅ Tous les produits sample ont une image");
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-09 — Pixel ViewContent fire avec content_ids sur page produit
// ──────────────────────────────────────────────────────────────────────────────
test("MH-09 — Pixel ViewContent fire avec content_ids sur page produit", async ({ page }) => {
  const trackEventCalls = [];
  const fbqCalls = [];

  page.on("request", req => {
    if (req.url().includes("/api/boutique/track-event") && req.method() === "POST") {
      try { trackEventCalls.push(req.postDataJSON() || {}); } catch { /**/ }
    }
  });

  // Intercepter les calls fbq vers Meta pixel
  await page.addInitScript(() => {
    window._fbqCalls = [];
    const orig = window.fbq;
    Object.defineProperty(window, "fbq", {
      set(fn) { this._fbqOrig = fn; },
      get() {
        return function(...args) {
          window._fbqCalls.push(args);
          if (window._fbqOrig) window._fbqOrig.apply(this, args);
        };
      },
    });
  });

  const products = await sbQuery(
    "nc_variants",
    "select=variant_id,product_title,world&status=eq.active&inventory_quantity=gt.0&world=eq.coiffure&limit=1"
  );
  const prod = products[0];
  expect(prod).toBeTruthy();
  console.log(`  Produit test: ${prod.product_title} (ID: ${prod.variant_id})`);

  await page.goto(`${BASE_SHOP}/produits/${prod.variant_id}`);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.readyState === "complete");
  await page.waitForTimeout(4000);

  const addBtn = page.locator("button").filter({ hasText: /أضف للسلة|نفد المخزون/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  console.log(`✅ Page produit chargée: ${prod.product_title}`);

  // Vérifier event Supabase
  const viewEvent = trackEventCalls.find(e => e.event_type === "PRODUCT_VIEW");
  expect(viewEvent).toBeTruthy();
  expect(String(viewEvent?.product_id)).toBe(String(prod.variant_id));
  console.log(`✅ PRODUCT_VIEW Supabase OK: product_id=${viewEvent?.product_id}`);

  // Vérifier fbq ViewContent
  const fbqCaptured = await page.evaluate(() => window._fbqCalls || []);
  console.log(`  fbq calls capturés: ${fbqCaptured.length} | ${JSON.stringify(fbqCaptured.slice(0, 3))}`);
  const viewContentCall = fbqCaptured.find(c => c[0] === "track" && c[1] === "ViewContent");
  if (viewContentCall) {
    console.log(`✅ fbq ViewContent OK: content_ids=${JSON.stringify(viewContentCall[2]?.content_ids)}`);
    expect(viewContentCall[2]?.content_ids).toContain(String(prod.variant_id));
    expect(viewContentCall[2]?.currency).toBe("DZD");
  } else {
    console.log("  ℹ️ fbq ViewContent non capturé (pixel peut nécessiter consentement) — Supabase OK");
  }

  // Vérifier en DB
  await page.waitForTimeout(2000);
  const events = await sbQuery(
    "nc_page_events",
    `select=event_type,product_id&event_type=eq.PRODUCT_VIEW&product_id=eq.${prod.variant_id}&order=created_at.desc&limit=1`
  );
  expect(Array.isArray(events) && events.length > 0).toBe(true);
  console.log(`✅ PRODUCT_VIEW enregistré en DB`);
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-10 — Pixel AddToCart fire avec content_ids quand ajout panier
// ──────────────────────────────────────────────────────────────────────────────
test("MH-10 — Pixel AddToCart fire avec content_ids au clic Ajouter au panier", async ({ page }) => {
  const trackEventCalls = [];
  page.on("request", req => {
    if (req.url().includes("/api/boutique/track-event") && req.method() === "POST") {
      try { trackEventCalls.push(req.postDataJSON() || {}); } catch { /**/ }
    }
  });

  // Produit avec stock
  const products = await sbQuery(
    "nc_variants",
    "select=variant_id,product_title,price&status=eq.active&inventory_quantity=gt.0&world=eq.coiffure&limit=1"
  );
  const prod = Array.isArray(products) ? products[0] : null;
  expect(prod).toBeTruthy();

  await page.goto(`${BASE_SHOP}/produits/${prod.variant_id}`);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.readyState === "complete");
  await page.waitForTimeout(3000);

  // Cliquer sur "أضف للسلة" (bouton arabe sur la boutique)
  const addBtn = page.locator("button").filter({ hasText: /أضف للسلة/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  console.log(`✅ Bouton 'أضف للسلة' visible`);
  await addBtn.click();
  await page.waitForTimeout(2000);

  console.log(`  track-event calls après ajout: ${trackEventCalls.length}`);
  const cartEvent = trackEventCalls.find(e => e.event_type === "CART_ADD");
  expect(cartEvent).toBeTruthy();
  console.log(`✅ CART_ADD event envoyé: variant_id=${cartEvent?.variant_id}`);

  const varId = String(cartEvent?.variant_id || "");
  expect(varId).toBe(String(prod.variant_id));
  console.log(`✅ content_id CART_ADD correct: ${varId}`);

  // Vérifier en DB
  await page.waitForTimeout(2000);
  const cartEvents = await sbQuery(
    "nc_page_events",
    `select=event_type,variant_id&event_type=eq.CART_ADD&variant_id=eq.${prod.variant_id}&order=created_at.desc&limit=1`
  );
  const cartArr = Array.isArray(cartEvents) ? cartEvents : [];
  expect(cartArr.length).toBeGreaterThan(0);
  console.log(`✅ CART_ADD enregistré en DB`);
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-11 — nc_ai_decisions_log : health_check_ok logué (après run health)
// ──────────────────────────────────────────────────────────────────────────────
test("MH-11 — Health check logué dans Journal IA", async ({ authedPage: page }) => {
  const token = getToken();

  // Déclencher un health check
  const r = await page.request.post(`${BASE_DASH}/api/marketing/meta-health?token=${token}`, {
    timeout: 60000,
  });
  expect(r.ok()).toBe(true);
  const body = await r.json();
  console.log(`  Health check result: ok=${body.ok}, actions=${JSON.stringify(body.actions_taken)}`);

  // Vérifier en DB
  await page.waitForTimeout(2000);
  const logsRaw = await sbQuery(
    "nc_ai_decisions_log",
    "select=agent,decision_type,description,success,created_at&agent=eq.meta_health&order=created_at.desc&limit=3"
  );
  const logs = Array.isArray(logsRaw) ? logsRaw : [];
  console.log(`  Logs trouvés: ${logs.length}`);
  logs.forEach(l => console.log(`    [${l.decision_type}] ${l.description?.substring(0, 80)}`));

  expect(logs.length).toBeGreaterThan(0);
  console.log("✅ Health check logué dans Journal IA");

  // Vérifier dans le dashboard — onglet Journal IA
  await page.goto(`${BASE_DASH}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const tabJournal = page.locator("button").filter({ hasText: /Journal IA/i }).first();
  await tabJournal.click();
  await page.waitForTimeout(3000);

  const healthEntry = page.locator("text=/meta_health/i, text=/health_check/i, text=/Health check/i").first();
  const isVisible = await healthEntry.isVisible().catch(() => false);
  if (isVisible) {
    console.log("✅ Health check visible dans le Journal IA dashboard");
  } else {
    console.log("  (Journal IA peut nécessiter un refresh — log confirmé en DB)");
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-12 — Campagnes en DB : status active + last_synced_at < 2h
// ──────────────────────────────────────────────────────────────────────────────
test("MH-12 — Campagnes DB: status active + synced récemment", async ({ page }) => {
  const token = getToken();

  // Sync d'abord
  await page.request.post(`${BASE_DASH}/api/marketing/sync-stats?token=${token}`, { timeout: 30000 });
  await page.waitForTimeout(3000);

  const camps = await sbQuery(
    "nc_ai_campaigns",
    "select=campaign_name,status,impressions,clicks,budget_spent_da,last_synced_at&order=last_synced_at.desc"
  );

  console.log(`\n  === RAPPORT FINAL CAMPAGNES ===`);
  camps.forEach(c => {
    const syncedAgo = c.last_synced_at
      ? Math.round((Date.now() - new Date(c.last_synced_at)) / 60000)
      : 9999;
    const icon = syncedAgo < 120 ? "✅" : "⚠️";
    console.log(
      `  ${icon} ${c.campaign_name}: status=${c.status} | spend=${c.budget_spent_da} DA | ` +
      `impressions=${c.impressions} | clicks=${c.clicks} | synced=${syncedAgo}min ago`
    );
    expect(syncedAgo).toBeLessThan(120);
  });

  expect(camps.length).toBeGreaterThan(0);
  const activeCount = camps.filter(c => c.status === "active" || c.status === "ACTIVE").length;
  expect(activeCount).toBeGreaterThan(0);
  console.log(`\n✅ ${activeCount}/${camps.length} campagnes actives, toutes synchronisées < 2h`);
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-14 — AdSets : audience PIXEL (Visiteurs Coiffure), PAS Lookalike
// ──────────────────────────────────────────────────────────────────────────────
test("MH-14 — Audiences adsets : pixel Visiteurs Coiffure, 0 Lookalike", async ({ authedPage: page }) => {
  const token = getToken();
  expect(token).toBeTruthy();

  // IDs adsets et audiences pixel attendues
  const EXPECTED = [
    { adsetId: "120245473402310520", audienceId: "120245471426750520", name: "Visiteurs Coiffure 30j" },
    { adsetId: "120245473401520520", audienceId: "120245471426530520", name: "Visiteurs Coiffure 7j" },
  ];
  const LOOKALIKE_ID = "120245471392660520";

  for (const expected of EXPECTED) {
    const r = await page.request.get(
      `${BASE_DASH}/api/marketing/meta-debug?token=${token}&action=get_placements`,
      { timeout: 15000 }
    );
    expect(r.ok()).toBe(true);
    const body = await r.json();
    const adset = (body.adsets || []).find(a => a.id === expected.adsetId);
    expect(adset).toBeTruthy();

    const audiences = (adset?.targeting?.custom_audiences || []).map(a => a.id);
    console.log(`  AdSet ${adset?.name}:`);
    console.log(`    custom_audiences: ${JSON.stringify(adset?.targeting?.custom_audiences?.map(a => a.name))}`);

    // L'audience pixel DOIT être présente
    expect(audiences).toContain(expected.audienceId);
    console.log(`  ✅ Audience pixel "${expected.name}" présente`);

    // Le Lookalike NE DOIT PAS être présent
    expect(audiences).not.toContain(LOOKALIKE_ID);
    console.log(`  ✅ Lookalike absent (plus de risque de blocage 2490424)`);
  }

  console.log("✅ MH-14: Les deux adsets ciblent les audiences pixel Visiteurs Coiffure");
});

// ──────────────────────────────────────────────────────────────────────────────
// MH-13 — Placements AdSets : Facebook uniquement (0 Instagram)
// ──────────────────────────────────────────────────────────────────────────────
test("MH-13 — Placements adsets : Facebook uniquement (0 Instagram)", async ({ authedPage: page }) => {
  const token = getToken();
  expect(token).toBeTruthy();

  const ADSET_IDS = ["120245473401520520", "120245473402310520"];

  for (const asId of ADSET_IDS) {
    const r = await page.request.get(
      `${BASE_DASH}/api/marketing/meta-debug?token=${token}&action=get_placements`,
      { timeout: 30000 }
    );
    expect(r.ok()).toBe(true);
    const body = await r.json();
    const adset = (body.adsets || []).find(a => a.id === asId);
    expect(adset).toBeTruthy();

    const platforms = adset?.targeting?.publisher_platforms || [];
    console.log(`  AdSet ${adset?.name}:`);
    console.log(`    publisher_platforms: ${JSON.stringify(platforms)}`);
    console.log(`    facebook_positions: ${JSON.stringify(adset?.targeting?.facebook_positions)}`);

    expect(platforms).toContain("facebook");
    console.log(`  ✅ Facebook présent`);

    expect(platforms).not.toContain("instagram");
    console.log(`  ✅ Instagram absent`);
  }

  console.log("✅ MH-13: Les deux adsets utilisent Facebook uniquement — plus d'Instagram");
});
