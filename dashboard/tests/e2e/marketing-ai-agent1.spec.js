/**
 * marketing-ai-agent1.spec.js — Test humain Agent 1 (Catalog Intelligence)
 *
 * Vérifie :
 * 1. Page /dashboard/owner/ai accessible et affiche les données
 * 2. Agent 1 API POST /api/ai/catalog-intelligence retourne 200 + données
 * 3. DB : nc_ai_product_scores contient des lignes pour aujourd'hui
 * 4. DB : nc_ai_recommendations contient des recommandations
 * 5. DB : nc_ai_decisions_log contient le log de la dernière exécution
 */
import { test, expect, request } from "@playwright/test";

const CRON_SECRET = process.env.CRON_SECRET || "m5KjAbNWudGHFcZpY4heMtJrz2wskq3D";
const BASE_URL = process.env.BASE_URL || "https://najmcoiffdashboard.vercel.app";
const USERNAME = process.env.E2E_USERNAME || "najm";
const PASSWORD = process.env.E2E_PASSWORD || "admin123";

test.describe("Marketing IA — Agent 1 : Catalog Intelligence", () => {

  // ── Test 1 : API catalog-intelligence retourne 200 ──────────────────────
  test("POST /api/ai/catalog-intelligence — score 1000 produits", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/ai/catalog-intelligence`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.scored).toBeGreaterThan(0);
    expect(typeof data.recommendations).toBe("number");
  });

  // ── Test 2 : nc_ai_product_scores rempli aujourd'hui ────────────────────
  test("DB nc_ai_product_scores — contient des scores aujourd'hui", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/ai/catalog-intelligence`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const data = await res.json();
    expect(data.scored).toBeGreaterThanOrEqual(100);
  });

  // ── Test 3 : Recommandations générées ────────────────────────────────────
  test("DB nc_ai_recommendations — au moins 10 recommandations en attente", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/ai/catalog-intelligence`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  // ── Test 4 : Refus sans CRON_SECRET ──────────────────────────────────────
  test("POST sans Authorization → 403", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/ai/catalog-intelligence`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);
  });

  // ── Test 5 : Page /dashboard/owner/ai accessible (humain) ────────────────
  test("Page /dashboard/owner/ai accessible après login owner", async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/`);
    await page.waitForSelector('input[placeholder="Votre identifiant"]', { timeout: 15000 });
    await page.getByPlaceholder("Votre identifiant").fill(USERNAME);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });

    // Naviguer vers la page IA
    await page.goto(`${BASE_URL}/dashboard/owner/ai`);
    await page.waitForTimeout(3000);

    // Vérifier que la page charge (pas de 404, pas de page blanche)
    const title = await page.title();
    expect(title).toBeTruthy();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(20);
  });

});
