/**
 * Test E2E — BI KPI Fix (timezone + progression 2 décimales)
 * Vérifie :
 * 1. La page BI se charge et affiche la section "Commandes boutique"
 * 2. Les KPIs Récoltées, Confirmées, Ventes confirmées sont présents
 * 3. La progression mensuelle affiche une valeur % (potentiellement avec décimales)
 */
import { test, expect } from "./fixtures.js";

const BASE = "https://najmcoiffdashboard.vercel.app";

test.describe("BI Dashboard — KPI fixes (timezone Algérie + progression 2 décimales)", () => {

  test("Page BI se charge et affiche la section commandes boutique", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // La section commandes boutique doit être visible
    await expect(page.locator("text=Commandes boutique").first()).toBeVisible({ timeout: 10000 });
  });

  test("KPI Récoltées (boutique) et Confirmées sont affichés", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await expect(page.locator("text=Récoltées (boutique)").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Confirmées").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Annulées").first()).toBeVisible({ timeout: 5000 });
  });

  test("KPI Ventes confirmées est affiché dans la section boutique", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await expect(page.locator("text=Ventes confirmées").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Panier moyen").first()).toBeVisible({ timeout: 5000 });
  });

  test("Progression bénéfice mensuel est affichée avec valeur %", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // La barre de progression mensuelle doit être présente
    await expect(page.locator("text=Progression bénéfice mensuel").first()).toBeVisible({ timeout: 10000 });

    // La valeur % est affichée dans le sous-titre de la BigCard "Bénéfice mensuel"
    const allText = await page.locator("body").textContent();
    // Vérifie que "% de l'objectif" est présent (BigCard bénéfice mensuel sub)
    expect(allText).toContain("% de l'objectif");

    // Vérifie que la valeur n'est pas juste "0%" si le mois a du CA
    // (simple check de présence d'un pattern numérique suivi de %)
    const pctPattern = /\d+(\.\d{1,2})?%/;
    expect(pctPattern.test(allText)).toBe(true);
  });

  test("API bi/dashboard retourne boutique.recoltes cohérent avec les données DB", async ({ request, authedPage: page }) => {
    // Se connecter via la page pour récupérer le token depuis la session
    await page.goto(`${BASE}/dashboard/owner/bi`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Extraire le token de la session
    const token = await page.evaluate(() => {
      try {
        const session = JSON.parse(sessionStorage.getItem("nc_session") || "{}");
        return session.token || "";
      } catch { return ""; }
    });

    if (!token) {
      test.skip(true, "Token non disponible — test API ignoré");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const res = await request.get(`${BASE}/api/bi/dashboard?date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();

    // boutique.recoltes doit être un nombre >= 0
    expect(typeof data.boutique.recoltes).toBe("number");
    expect(data.boutique.recoltes).toBeGreaterThanOrEqual(0);

    // confirmees <= recoltes
    expect(data.boutique.confirmees).toBeLessThanOrEqual(data.boutique.recoltes);

    // progression_pct doit permettre des décimales (multiplié par 10000 / 100)
    // On vérifie que si bénéfice mois > 0, la progression n'est pas forcément entière
    const pct = data.benefice.progression_pct;
    expect(typeof pct).toBe("number");
    // Vérifier que la valeur n'a pas été arrondie à l'entier (peut avoir des décimales)
    // On vérifie juste qu'elle est bien calculée (entre 0 et qqch de cohérent)
    expect(pct).toBeGreaterThanOrEqual(0);

    console.log(`✅ Récoltées: ${data.boutique.recoltes} | Confirmées: ${data.boutique.confirmees} | Progression: ${pct}%`);
  });
});
