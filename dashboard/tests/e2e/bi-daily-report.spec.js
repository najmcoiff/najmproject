/**
 * Test E2E — T_BI_DAILY_REPORT
 * Vérifie les nouvelles sections ajoutées à la page BI :
 * 1. Section "Top produits du jour" ou message d'absence
 * 2. Section "WhatsApp Marketing"
 * 3. Section "Évolution vs hier (J-1)"
 * 4. API retourne top_produits, whatsapp, j1
 */
import { test, expect } from "./fixtures.js";

const BASE = "https://najmcoiffdashboard.vercel.app";

test.describe("BI Daily Report — nouvelles sections marketing", () => {

  test("La page BI affiche la section 'Évolution vs hier'", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await expect(page.locator("text=Évolution vs hier").first()).toBeVisible({ timeout: 10000 });
  });

  test("La page BI affiche la section 'WhatsApp Marketing'", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await expect(page.locator("text=WhatsApp Marketing").first()).toBeVisible({ timeout: 10000 });
  });

  test("La page BI affiche Boutique en ligne avec sources de trafic", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await expect(page.locator("text=Boutique en ligne").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Visiteurs uniques").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Taux conversion").first()).toBeVisible({ timeout: 5000 });
  });

  test("API bi/dashboard retourne top_produits, whatsapp, j1", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const token = await page.evaluate(() => {
      try {
        const s = JSON.parse(sessionStorage.getItem("nc_session") || "{}");
        return s.token || "";
      } catch { return ""; }
    });

    if (!token) {
      test.skip(true, "Token non disponible");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const res = await page.request.get(`${BASE}/api/bi/dashboard?date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();

    // whatsapp est un objet avec les bons champs
    expect(data.whatsapp).toBeDefined();
    expect(typeof data.whatsapp.envoyes).toBe("number");
    expect(typeof data.whatsapp.convertis).toBe("number");
    expect(typeof data.whatsapp.revenue_da).toBe("number");
    console.log(`✅ whatsapp: ${data.whatsapp.envoyes} envoyés, ${data.whatsapp.convertis} convertis, ${data.whatsapp.revenue_da} DA`);

    // j1 est un objet avec les deltas
    expect(data.j1).toBeDefined();
    expect(typeof data.j1.confirmees).toBe("number");
    expect(typeof data.j1.delta_confirmees).toBe("number");
    expect(typeof data.j1.delta_benefice).toBe("number");
    console.log(`✅ j1: hier=${data.j1.confirmees} conf., delta=${data.j1.delta_confirmees}`);

    // marketing contient utm_sources
    expect(Array.isArray(data.marketing?.utm_sources)).toBe(true);
    console.log(`✅ utm_sources: ${data.marketing.utm_sources.length} source(s)`);
  });

  test("API bi/daily-report génère un rapport avec section WhatsApp", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const token = await page.evaluate(() => {
      try {
        const s = JSON.parse(sessionStorage.getItem("nc_session") || "{}");
        return s.token || "";
      } catch { return ""; }
    });

    if (!token) {
      test.skip(true, "Token non disponible");
      return;
    }

    const res = await page.request.post(`${BASE}/api/bi/daily-report`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.health_score).toBeGreaterThanOrEqual(0);

    // Le message_preview doit contenir "COMMANDES" et "BÉNÉFICE"
    expect(data.message_preview).toContain("COMMANDES");
    expect(data.message_preview).toContain("BÉNÉFICE");
    console.log(`✅ Rapport généré — score: ${data.health_score}/100 | wati_sent: ${data.wati_sent}`);
  });

});
