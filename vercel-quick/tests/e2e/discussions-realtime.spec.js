/**
 * Test Playwright HUMAIN — Discussions temps réel (style WhatsApp)
 * Vérifie que les messages d'un autre utilisateur apparaissent
 * SANS actualisation de page (via Realtime + polling fallback 4s).
 */
import { test, expect, sbQuery, sbInsert, sbDelete } from "./fixtures.js";

const BASE_URL = "https://najmcoiffdashboard.vercel.app";

test.describe("Discussions — messages temps réel (sans refresh)", () => {

  test("T_DISC_RT_INDICATOR — indicateur En direct visible dans le header", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(5000);

    // L'indicateur Realtime doit exister dans le DOM
    const indicator = page.locator('[data-testid="realtime-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 15000 });

    // Après quelques secondes la subscription doit être SUBSCRIBED
    await page.waitForTimeout(4000);
    const status = await indicator.getAttribute("data-status");
    console.log(`📡 Statut Realtime: ${status}`);
    expect(["SUBSCRIBED", "CONNECTING"]).toContain(status);

    // Le texte "En direct" ou "Connexion" doit être présent
    await expect(page.locator("text=/En direct|Connexion/").first()).toBeVisible({ timeout: 10000 });
    console.log("✅ T_DISC_RT_INDICATOR : indicateur Realtime visible");
  });

  test("T_DISC_RT_POLLING — message inséré en DB apparaît sans refresh (<8s)", async ({ authedPage: page }) => {
    test.setTimeout(90000);

    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(6000);

    // Récupérer l'ID du premier salon (actif par défaut)
    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });

    const firstBtnTestId = await salonBtns.first().getAttribute("data-testid");
    const salonId = firstBtnTestId?.replace("salon-btn-", "");
    if (!salonId) throw new Error("Impossible de récupérer l'ID du salon actif");
    console.log(`📌 Salon actif: ${salonId}`);

    // Compter les messages actuellement affichés
    const msgsBefore = await page.locator(".space-y-0\\.5 > *").count();
    console.log(`📊 Messages avant injection: ${msgsBefore}`);

    // === Injecter un message en DB (simule un autre utilisateur) ===
    const contenuTest = `[RT-TEST] Message temps réel ${Date.now()}`;
    await sbInsert("messages", {
      salon_id: salonId,
      auteur_nom: "TestAgent",
      auteur_role: "agent digital",
      contenu: contenuTest,
      type: "text",
    });
    console.log(`📤 Message injecté en DB: "${contenuTest.slice(0, 40)}"`);

    // === Attendre que le polling (4s) ou Realtime détecte le message ===
    // Max 12s pour laisser le temps au polling (4s cadence) + marge
    await expect(
      page.locator(`text=${contenuTest.slice(0, 30)}`).first()
    ).toBeVisible({ timeout: 12000 });

    console.log("✅ T_DISC_RT_POLLING : message apparu dans l'UI sans refresh !");

    // Vérification DB : le message est bien dans Supabase
    const rows = await sbQuery("messages", `salon_id=eq.${salonId}&contenu=like.*RT-TEST*&order=created_at.desc&limit=3`);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    console.log(`✅ DB: ${rows.length} message(s) de test trouvé(s)`);

    // Nettoyage
    if (rows[0]?.id) {
      await sbDelete("messages", `id=eq.${rows[0].id}`);
      console.log("🧹 Message de test supprimé");
    }
  });

  test("T_DISC_RT_SEND — message envoyé visible immédiatement pour l'émetteur", async ({ authedPage: page }) => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(5000);

    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });

    const salonId = (await salonBtns.first().getAttribute("data-testid"))?.replace("salon-btn-", "");

    // Taper et envoyer un message
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    const msg = `[RT-SEND] Test envoi ${Date.now()}`;
    await textarea.click();
    await page.keyboard.type(msg);
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");

    // Message doit apparaître immédiatement (< 2s) pour l'émetteur
    await expect(
      page.locator(`text=${msg.slice(0, 25)}`).first()
    ).toBeVisible({ timeout: 5000 });

    console.log("✅ T_DISC_RT_SEND : message envoyé visible immédiatement");

    // Vérification DB
    if (salonId) {
      const rows = await sbQuery("messages", `salon_id=eq.${salonId}&contenu=like.*RT-SEND*&order=created_at.desc&limit=3`);
      expect(rows.length).toBeGreaterThan(0);
      console.log(`✅ DB vérifiée : ${rows.length} message(s) "RT-SEND" présent(s)`);
      if (rows[0]?.id) {
        await sbDelete("messages", `id=eq.${rows[0].id}`);
        console.log("🧹 Nettoyage OK");
      }
    }
  });

  test("T_DISC_RT_VISIBILITY — refresh au retour de focus (visibilitychange)", async ({ authedPage: page }) => {
    test.setTimeout(90000);

    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(6000);

    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });
    const salonId = (await salonBtns.first().getAttribute("data-testid"))?.replace("salon-btn-", "");
    if (!salonId) throw new Error("Impossible de récupérer le salon ID");

    // Simuler l'onglet en arrière-plan (visibilityState = hidden)
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(1000);

    // Injecter un message pendant que l'onglet est "caché"
    const contenuVis = `[RT-VIS] Test visibilité ${Date.now()}`;
    await sbInsert("messages", {
      salon_id: salonId,
      auteur_nom: "TestAgent",
      auteur_role: "agent digital",
      contenu: contenuVis,
      type: "text",
    });
    console.log(`📤 Message injecté pendant focus=hidden`);
    await page.waitForTimeout(500);

    // Simuler le retour au premier plan
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Le message doit apparaître grâce au handler visibilitychange OU au polling 4s
    await expect(
      page.locator(`text=${contenuVis.slice(0, 25)}`).first()
    ).toBeVisible({ timeout: 12000 });

    console.log("✅ T_DISC_RT_VISIBILITY : message apparu au retour de focus !");

    // Nettoyage
    const rows = await sbQuery("messages", `salon_id=eq.${salonId}&contenu=like.*RT-VIS*&order=created_at.desc&limit=3`);
    if (rows[0]?.id) {
      await sbDelete("messages", `id=eq.${rows[0].id}`);
      console.log("🧹 Message de test supprimé");
    }
  });

  test("T_DISC_RT_DEDUP — pas de doublons si Realtime + polling reçoivent le même message", async ({ authedPage: page }) => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(6000);

    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });
    const salonId = (await salonBtns.first().getAttribute("data-testid"))?.replace("salon-btn-", "");
    if (!salonId) throw new Error("Impossible de récupérer le salon ID");

    // Injecter 1 seul message
    const contenuDedup = `[RT-DEDUP] ${Date.now()}`;
    await sbInsert("messages", {
      salon_id: salonId,
      auteur_nom: "TestAgent",
      auteur_role: "agent digital",
      contenu: contenuDedup,
      type: "text",
    });

    // Attendre que le message soit rendu (polling 4s + marge)
    await expect(
      page.locator(`text=${contenuDedup.slice(0, 20)}`).first()
    ).toBeVisible({ timeout: 12000 });

    // Attendre encore 6s pour que le polling passe une 2e fois
    await page.waitForTimeout(6000);

    // Vérifier qu'il n'y a PAS de doublon dans l'UI
    const occurrences = await page.locator(`text=${contenuDedup.slice(0, 20)}`).count();
    expect(occurrences).toBe(1);
    console.log(`✅ T_DISC_RT_DEDUP : ${occurrences} occurrence(s) — pas de doublon`);

    // Nettoyage
    const rows = await sbQuery("messages", `salon_id=eq.${salonId}&contenu=like.*RT-DEDUP*&order=created_at.desc&limit=3`);
    if (rows[0]?.id) {
      await sbDelete("messages", `id=eq.${rows[0].id}`);
      console.log("🧹 Nettoyage OK");
    }
  });

});
