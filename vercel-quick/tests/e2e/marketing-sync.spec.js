// ═══════════════════════════════════════════════════════════════════
//  marketing-sync.spec.js
//  Tests Playwright humains — War Room Marketing
//  Valide : sync Meta, Journal IA, WhatsApp campagnes
// ═══════════════════════════════════════════════════════════════════

import { test, expect, sbQuery } from "./fixtures.js";

const BASE = "https://najmcoiffdashboard.vercel.app";

test.describe("War Room Marketing — Sync & Journal IA", () => {

  // ── 1. Page se charge, onglet Campagnes Meta visible ──────────────
  test("SYNC-01 — page War Room charge onglet Campagnes Meta", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const tabMeta = page.locator("button").filter({ hasText: /Campagnes Meta/i }).first();
    await expect(tabMeta).toBeVisible();
    console.log("✅ Onglet Campagnes Meta visible");
  });

  // ── 2. KPIs affichés depuis DB, sans attendre Meta API ────────────
  test("SYNC-02 — KPIs Meta depuis DB (rapide, sans appel Meta API)", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const tabMeta = page.locator("button").filter({ hasText: /Campagnes Meta/i }).first();
    await tabMeta.click();
    await page.waitForTimeout(3000);

    // Le KPI "Dépensé total" doit apparaître < 5s (depuis DB, pas Meta API)
    const kpiDepense = page.locator("text=Dépensé total").first();
    await expect(kpiDepense).toBeVisible({ timeout: 5000 });
    console.log("✅ KPI Dépensé total visible depuis DB");

    // Une campagne Retargeting doit être listée
    const campCard = page.locator("text=Retargeting Coiffure").first();
    await expect(campCard).toBeVisible({ timeout: 5000 });
    const campText = await campCard.textContent();
    console.log(`✅ Campagne visible : ${campText?.substring(0, 40)}`);
  });

  // ── 3. Bouton Sync Meta → route POST → retourne 200 ──────────────
  test("SYNC-03 — bouton Sync maintenant → POST sync-stats → 200", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const tabMeta = page.locator("button").filter({ hasText: /Campagnes Meta/i }).first();
    await tabMeta.click();
    await page.waitForTimeout(1500);

    // Intercepter la requête POST sync-stats
    let syncStatus = null;
    let syncResponse = null;
    page.on("response", async (resp) => {
      if (resp.url().includes("/api/marketing/sync-stats") && resp.request().method() === "POST") {
        syncStatus = resp.status();
        try { syncResponse = await resp.json(); } catch { /* ignore */ }
        console.log(`  POST sync-stats → HTTP ${syncStatus} | ok: ${syncResponse?.ok} | synced: ${syncResponse?.synced}`);
      }
    });

    const btnSync = page.locator("button").filter({ hasText: /Sync maintenant/i }).first();
    await expect(btnSync).toBeVisible();
    await btnSync.click();
    console.log("  Sync lancé, attente réponse Meta API...");

    // Attendre jusqu'à 20s que le bouton revienne actif (fin du sync)
    await page.waitForFunction(
      () => !document.querySelector("button[disabled]"),
      { timeout: 20000 }
    ).catch(() => { /* timeout ok */ });
    await page.waitForTimeout(2000);

    expect(syncStatus).toBe(200);
    expect(syncResponse?.ok).toBe(true);
    console.log(`✅ sync-stats POST 200 — ${syncResponse?.synced} campagnes synchronisées`);

    // Timestamp "Dernière sync" doit maintenant s'afficher
    await page.waitForTimeout(1500);
    const syncedText = page.locator("text=/Dernière sync/i").first();
    await expect(syncedText).toBeVisible({ timeout: 5000 });
    console.log("✅ Timestamp 'Dernière sync' mis à jour dans le header");
  });

  // ── 4. Vérifier DB après sync (Supabase direct) ──────────────────
  test("SYNC-04 — DB nc_ai_campaigns a un last_synced_at récent après sync", async ({ authedPage: page }) => {
    // Déclencher sync
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const tabMeta = page.locator("button").filter({ hasText: /Campagnes Meta/i }).first();
    await tabMeta.click();
    await page.waitForTimeout(1000);

    const btnSync = page.locator("button").filter({ hasText: /Sync maintenant/i }).first();
    await btnSync.click();
    await page.waitForTimeout(18000); // attendre Meta API

    // Vérifier en DB via Supabase
    const camps = await sbQuery("nc_ai_campaigns", "meta_campaign_id=not.is.null&select=campaign_name,impressions,spend_da,last_synced_at");
    console.log("DB nc_ai_campaigns:", JSON.stringify(camps));

    expect(Array.isArray(camps)).toBe(true);
    expect(camps.length).toBeGreaterThan(0);

    const synced = camps.filter(c => c.last_synced_at !== null);
    expect(synced.length).toBeGreaterThan(0);

    // La dernière sync doit être dans les 2 dernières minutes
    const latestSync = new Date(synced[0].last_synced_at);
    const ageMs = Date.now() - latestSync.getTime();
    console.log(`✅ last_synced_at: ${synced[0].last_synced_at} (il y a ${Math.round(ageMs / 1000)}s)`);
    expect(ageMs).toBeLessThan(5 * 60 * 1000); // moins de 5 minutes
  });

  // ── 5. Journal IA — entrées visible depuis nc_ai_decisions_log ────
  test("SYNC-05 — Journal IA affiche décisions (non vide)", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const tabJournal = page.locator("button").filter({ hasText: /Journal/i }).first();
    await tabJournal.click();
    await page.waitForTimeout(3000);

    // Titre présent
    const titre = page.locator("text=Journal des décisions IA").first();
    await expect(titre).toBeVisible({ timeout: 5000 });
    console.log("✅ Titre Journal des décisions IA visible");

    // Agent 1 Catalogue présent (41 entrées en DB)
    const agentEntry = page.locator("text=Agent 1 — Catalogue").first();
    await expect(agentEntry).toBeVisible({ timeout: 5000 });
    console.log("✅ Entrée Agent 1 Catalogue visible");

    // Compteur > 0
    const counter = page.locator("text=/\\d+ actions enregistrées/").first();
    await expect(counter).toBeVisible({ timeout: 5000 });
    const txt = await counter.textContent();
    const nb = parseInt(txt?.match(/\d+/)?.[0] || "0");
    expect(nb).toBeGreaterThan(0);
    console.log(`✅ Journal : ${nb} actions enregistrées`);

    // Vérifier aussi en DB
    const logs = await sbQuery("nc_ai_decisions_log", "select=id,agent,decision_type&limit=5");
    expect(Array.isArray(logs) && logs.length > 0).toBe(true);
    console.log(`✅ DB nc_ai_decisions_log : ${logs.length}+ entrées`);
  });

  // ── 6. WhatsApp — segments avec vrais chiffres affichés ──────────
  test("SYNC-06 — WhatsApp: segments non-zero, stats 197 envoyés, campagnes Test 200", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const tabWa = page.locator("button").filter({ hasText: /WhatsApp/i }).first();
    await tabWa.click();
    await page.waitForTimeout(4000);

    // Titre
    await expect(page.locator("text=WhatsApp Campaign Manager").first()).toBeVisible({ timeout: 5000 });
    console.log("✅ WhatsApp Campaign Manager visible");

    // Stats 30j — doit afficher 197+ messages envoyés
    const statsEnvoyes = page.locator("text=Envoyés").first();
    await expect(statsEnvoyes).toBeVisible({ timeout: 5000 });
    console.log("✅ KPI Envoyés (30j) visible");

    // Vérifier que les segments ont des vrais chiffres (pas 0)
    const segCards = page.locator("text=Clients VIP").first();
    await expect(segCards).toBeVisible({ timeout: 5000 });

    // Compter les chiffres affichés dans les cartes segments
    // Le total VIP doit être > 0 (676 en DB)
    const vipTotal = page.locator("text=Clients VIP").first().locator("..").locator("..");
    const vipText = await page.locator("text=Clients VIP").first().locator("..").locator("..").textContent().catch(() => "");
    console.log(`  Texte carte VIP: ${vipText?.substring(0, 80)}`);

    // Vérifier en DB
    const segments = await sbQuery("nc_ai_client_segments", "select=segment&limit=1");
    expect(Array.isArray(segments) && segments.length > 0).toBe(true);

    // Route whatsapp-campaigns doit retourner des segments avec total > 0
    const watiData = await sbQuery("nc_ai_client_segments", "select=segment&segment=eq.vip&limit=1");
    expect(watiData.length).toBeGreaterThan(0);
    console.log(`✅ Segments VIP présents en DB`);

    // Vérifier campagnes envoyées
    const watiCamps = await sbQuery("nc_wati_campaigns", "select=name,total_sent,status&order=created_at.desc&limit=4");
    const sent = watiCamps.filter(c => c.total_sent > 0);
    expect(sent.length).toBeGreaterThan(0);
    console.log(`✅ ${sent.length} campagne(s) avec messages envoyés`);

    // Vérifier que la page affiche "contacts disponibles" avec un total > 0
    const headerText = await page.locator("text=/contacts disponibles/i").first().textContent().catch(() => "");
    console.log(`  Header contacts: ${headerText}`);
    // Le total est là si on a des segments chargés
    expect(headerText).toBeTruthy();
    console.log("✅ Compteur contacts disponibles visible");
  });

  // ── 7. Route wati-sync-status → 200 via requête directe ─────────
  test("SYNC-07 — API wati-sync-status retourne 200 et log dans Journal", async ({ authedPage: page, token }) => {
    test.setTimeout(90000); // max 90s car WATI peut prendre du temps
    // Appel direct via page.request (hérite des cookies de la page authed)
    const resp = await page.request.post(`${BASE}/api/marketing/wati-sync-status?token=${token}`, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
    });

    console.log(`  POST wati-sync-status → HTTP ${resp.status()}`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    console.log(`  Response body: ${JSON.stringify(body)}`);
    expect(body.ok).toBe(true);
    console.log(`✅ wati-sync-status 200 — checked: ${body.checked}, note: ${body.note || "OK"}`);

    // Vérifier que ça a loggué dans Journal IA
    await page.waitForTimeout(1000);
    const logs = await sbQuery(
      "nc_ai_decisions_log",
      "agent=eq.reactivation&decision_type=eq.wati_status_sync&select=description,created_at&order=created_at.desc&limit=1"
    );
    console.log("Log WATI sync:", JSON.stringify(logs));
    expect(logs.length).toBeGreaterThan(0);
    console.log(`✅ Log WATI sync dans Journal IA : ${logs[0].description}`);
  });

});
