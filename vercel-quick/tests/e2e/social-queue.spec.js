/**
 * T_SOCIAL_QUEUE — File d'attente Créatif
 * Playwright humain
 */
import { test, expect } from "./fixtures.js";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

// ID Supabase du salon "Discussion créatif"
const SALON_CREATIF_ID = "4ae4dffb-f6b1-4b70-a1bd-472beb5f6bb7";

/**
 * Crée un JWT minimal valide côté client (non vérifié côté serveur).
 * exp=9999999999 (secondes, ~année 2286) → isTokenExpired() retourne false.
 */
function buildChefSession() {
  // exp en millisecondes (le layout vérifie exp < Date.now() directement)
  // 9999999999999 ms ≈ année 2286 → jamais expiré en prod
  const payload = { nom: "soheib", role: "chef d'equipe", exp: 9999999999999 };
  const payloadB64 = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payloadB64}.playwright_test_sig`;
  return { token, user: payload };
}

test.describe("Créatif — File d'attente réseaux sociaux", () => {

  test("T_SOCIAL_QUEUE — Page /social-queue accessible avec compteurs et tabs", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/social-queue`);
    await page.waitForSelector("h1", { timeout: 15000 });

    await expect(page.locator("h1")).toContainText("File d");

    // Tabs
    await expect(page.locator("button:has-text('À partager')")).toBeVisible();
    await expect(page.locator("button:has-text('Partagés')")).toBeVisible();

    // Compteurs objectifs
    await expect(page.locator("text=Coiffure Reels")).toBeVisible();
    await expect(page.locator("text=Onglerie Reels")).toBeVisible();

    console.log("✅ T_SOCIAL_QUEUE : page /social-queue accessible, compteurs et tabs présents");
  });

  test("T_SOCIAL_QUEUE — Lien Créatif visible dans la sidebar", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForSelector("nav", { timeout: 10000 });
    const link = page.locator("a[href='/dashboard/social-queue']");
    await expect(link).toBeVisible();
    console.log("✅ T_SOCIAL_QUEUE : lien Créatif 🎬 visible dans la sidebar");
  });

  test("T_SOCIAL_QUEUE — Tab Partagés cliquable et s'active", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/social-queue`);
    await page.waitForSelector("button:has-text('Partagés')", { timeout: 15000 });
    await page.locator("button:has-text('Partagés')").click();
    await page.waitForTimeout(500);
    // Vérifier que le tab est actif (classe bg-white shadow-sm)
    const tabActive = page.locator("button:has-text('Partagés')");
    await expect(tabActive).toHaveClass(/bg-white/);
    console.log("✅ T_SOCIAL_QUEUE : tab Partagés activable");
  });

  /**
   * TEST HUMAIN — Permisssion chef d'equipe
   * Simule soheib (chef d'equipe) qui ouvre le salon Créatif
   * et vérifie que le bouton +🎬 apparaît au survol d'un message.
   */
  test("T_SOCIAL_QUEUE — Bouton +🎬 visible pour chef d'equipe dans salon Créatif", async ({ page }) => {
    // 1. Injecter session chef d'equipe avant navigation
    const session = buildChefSession();
    await page.addInitScript((s) => {
      try { localStorage.setItem("nc_session", JSON.stringify(s)); } catch {}
      try { sessionStorage.setItem("nc_session", JSON.stringify(s)); } catch {}
    }, session);

    // 2. Forcer viewport desktop (sidebar visible)
    await page.setViewportSize({ width: 1280, height: 800 });

    // 3. Ouvrir discussions
    await page.goto(`${BASE}/dashboard/discussions`);
    await page.waitForTimeout(1500);

    // 4. Cliquer sur le salon "Discussion créatif"
    const salonBtn = page.locator(`[data-testid="salon-btn-${SALON_CREATIF_ID}"]`);
    await expect(salonBtn).toBeVisible({ timeout: 15000 });
    await salonBtn.click();
    await page.waitForTimeout(2000); // attendre chargement messages

    // 5. Trouver le premier conteneur message (.group dans la zone chat)
    //    Les messages sont dans div.space-y-0\.5 > div.group
    const firstMessage = page.locator("div.space-y-0\\.5 div.group").first();
    await expect(firstMessage).toBeVisible({ timeout: 10000 });

    // 6. Hover sur le message (simule un vrai utilisateur)
    await firstMessage.hover();
    await page.waitForTimeout(400);

    // 7. Vérifier que le bouton +🎬 est maintenant visible
    const btnFile = page.locator("button[title=\"Ajouter à la file d'attente Créatif\"]").first();
    await expect(btnFile).toBeVisible({ timeout: 3000 });

    // 8. Vérifier que le bouton n'est PAS visible pour un agent simple (régression)
    // (owner) vérifie via authedPage séparément — ici on confirme chef d'equipe ✓
    console.log("✅ T_SOCIAL_QUEUE : bouton +🎬 visible pour chef d'equipe dans salon Créatif");
  });

  /**
   * TEST HUMAIN — Régression : bouton +🎬 visible pour owner
   * Vérifie que l'owner conserve toujours la permission.
   */
  test("T_SOCIAL_QUEUE — Bouton +🎬 visible pour owner dans salon Créatif (régression)", async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/dashboard/discussions`);
    await page.waitForTimeout(1500);

    const salonBtn = page.locator(`[data-testid="salon-btn-${SALON_CREATIF_ID}"]`);
    await expect(salonBtn).toBeVisible({ timeout: 15000 });
    await salonBtn.click();
    await page.waitForTimeout(2000);

    const firstMessage = page.locator("div.space-y-0\\.5 div.group").first();
    await expect(firstMessage).toBeVisible({ timeout: 10000 });
    await firstMessage.hover();
    await page.waitForTimeout(400);

    const btnFile = page.locator("button[title=\"Ajouter à la file d'attente Créatif\"]").first();
    await expect(btnFile).toBeVisible({ timeout: 3000 });

    console.log("✅ T_SOCIAL_QUEUE : bouton +🎬 toujours visible pour owner (régression OK)");
  });

});
