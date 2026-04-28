/**
 * Test Playwright HUMAIN — Badges messages non lus (style WhatsApp)
 * Vérifie que les compteurs de non-lus s'affichent correctement dans la sidebar des discussions
 */
import { test, expect, sbQuery, sbInsert, sbDelete } from "./fixtures.js";

const BASE_URL = "https://najmcoiffdashboard.vercel.app";

test.describe("Discussions — badges non lus (style WhatsApp)", () => {

  test("T_DISC_LOAD — page discussions se charge avec la sidebar salons", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(4000);

    // Le titre "💬 Salons" dans la sidebar doit être visible
    await expect(page.locator("h2").filter({ hasText: /Salon/ }).first()).toBeVisible({ timeout: 15000 });
    console.log("✅ T_DISC_LOAD : header salons visible");
  });

  test("T_DISC_SALONS — sidebar affiche les boutons de salons avec data-testid", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(5000);

    // Attendre que les salons se chargent
    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });

    const count = await salonBtns.count();
    console.log(`✅ T_DISC_SALONS : ${count} salon(s) trouvé(s)`);
    expect(count).toBeGreaterThan(0);
  });

  test("T_DISC_ACTIVE — le premier salon est actif (fond noir)", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(5000);

    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });

    // Le premier salon doit avoir le fond noir (actif)
    const firstClasses = await salonBtns.first().getAttribute("class");
    expect(firstClasses).toContain("bg-gray-900");
    console.log("✅ T_DISC_ACTIVE : premier salon actif (bg-gray-900)");
  });

  test("T_DISC_SWITCH — changer de salon → badge réinitialisé sur le nouveau salon actif", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(5000);

    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });

    const count = await salonBtns.count();
    if (count < 2) {
      console.log("ℹ️ Moins de 2 salons disponibles — test partiel");
      return;
    }

    // Cliquer sur le deuxième salon
    await salonBtns.nth(1).click();
    await page.waitForTimeout(2000);

    // Le deuxième salon doit maintenant être actif (fond noir)
    const secondClasses = await salonBtns.nth(1).getAttribute("class");
    expect(secondClasses).toContain("bg-gray-900");

    // Aucun badge non-lu sur le salon actif
    const badgesOnSecond = salonBtns.nth(1).locator('[data-testid^="unread-badge-"]');
    await expect(badgesOnSecond).toHaveCount(0);

    console.log("✅ T_DISC_SWITCH : salon 2 activé, aucun badge sur le salon actif");
  });

  test("T_DISC_BADGE_STYLE — badges verts si messages non lus (ou absence si tout lu)", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(5000);

    const badges = page.locator('[data-testid^="unread-badge-"]');
    const badgeCount = await badges.count();
    console.log(`ℹ️ ${badgeCount} badge(s) de messages non lus présent(s)`);

    if (badgeCount > 0) {
      // Vérifier que les badges ont la classe verte
      const firstBadge = badges.first();
      const classes = await firstBadge.getAttribute("class");
      expect(classes).toContain("bg-green-500");

      const text = await firstBadge.textContent();
      const num = parseInt(text.trim());
      expect(num).toBeGreaterThan(0);
      console.log(`✅ T_DISC_BADGE_STYLE : badge vert avec valeur "${num}" (> 0)`);
    } else {
      console.log("ℹ️ Aucun message non lu — pas de badge (comportement correct)");
    }
  });

  test("T_DISC_NAV_BADGE — lien Discussions visible dans la sidebar de navigation", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(3000);

    // Sur desktop, la sidebar doit être visible
    const discLink = page.locator('a[href="/dashboard/discussions"]').first();
    await expect(discLink).toBeVisible({ timeout: 15000 });
    console.log("✅ T_DISC_NAV_BADGE : lien Discussions visible dans la nav");

    await discLink.click();
    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/dashboard/discussions");
    console.log("✅ T_DISC_NAV_BADGE : navigation vers discussions réussie");
  });

  test("T_DISC_SEND — envoi d'un message dans le salon actif et vérification DB", async ({ authedPage: page }) => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(5000);

    // Attendre que le salon actif soit chargé
    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });

    // Récupérer l'ID du salon actif depuis les data-testid
    const firstBtnTestId = await salonBtns.first().getAttribute("data-testid");
    const salonId = firstBtnTestId?.replace("salon-btn-", "");
    console.log(`📌 Salon actif ID: ${salonId}`);

    // Trouver la textarea et envoyer un message
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    const testMsg = `[TEST BADGE] Vérification non-lus ${Date.now()}`;
    await textarea.click();
    await page.keyboard.type(testMsg);
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);

    // Le message doit apparaître dans la conversation
    await expect(page.locator(`text=${testMsg.slice(0, 30)}`).first()).toBeVisible({ timeout: 10000 });
    console.log("✅ T_DISC_SEND : message envoyé et visible dans la conversation");

    // Vérification DB : le message est dans Supabase
    if (salonId) {
      const rows = await sbQuery("messages", `salon_id=eq.${salonId}&contenu=like.*TEST BADGE*&order=created_at.desc&limit=3`);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      console.log(`✅ T_DISC_SEND : message trouvé dans DB (${rows.length} entrée(s))`);

      // Nettoyage : supprimer le message de test
      if (rows[0]?.id) {
        await sbDelete("messages", `id=eq.${rows[0].id}`);
        console.log("🧹 T_DISC_SEND : message de test supprimé");
      }
    }
  });

  test("T_DISC_SALON_READS — table salon_reads correctement mise à jour à l'ouverture", async ({ authedPage: page }) => {
    test.setTimeout(45000);

    await page.goto(`${BASE_URL}/dashboard/discussions`);
    await page.waitForTimeout(6000);

    // Attendre que les salons soient chargés et cliquables
    const salonBtns = page.locator('[data-testid^="salon-btn-"]');
    await expect(salonBtns.first()).toBeVisible({ timeout: 15000 });

    // Récupérer l'ID du salon actif
    const firstBtnTestId = await salonBtns.first().getAttribute("data-testid");
    const salonId = firstBtnTestId?.replace("salon-btn-", "");

    if (!salonId) {
      console.log("ℹ️ Impossible de récupérer l'ID du salon — test DB ignoré");
      return;
    }

    // Vérifier que salon_reads a bien été mis à jour
    await page.waitForTimeout(2000); // laisser le upsert se faire
    const reads = await sbQuery("salon_reads", `salon_id=eq.${salonId}&user_nom=eq.najm&select=user_nom,salon_id,last_read_at`);
    expect(Array.isArray(reads)).toBe(true);
    expect(reads.length).toBeGreaterThan(0);

    const readEntry = reads[0];
    const lastRead = new Date(readEntry.last_read_at);
    const now = new Date();
    const diffMs = now - lastRead;
    // last_read_at doit être récent (moins de 2 minutes)
    expect(diffMs).toBeLessThan(120000);
    console.log(`✅ T_DISC_SALON_READS : salon_reads mis à jour pour najm/${salonId}, last_read_at il y a ${Math.round(diffMs/1000)}s`);
  });

});
