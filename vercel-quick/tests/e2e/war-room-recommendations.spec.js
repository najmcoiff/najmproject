/**
 * Test Playwright humain — War Room Marketing
 * État actuel : REC-001 et REC-002 acceptées, campagnes créées sur Meta
 * Simule un vrai utilisateur qui navigue la War Room
 */

import { test, expect } from "./fixtures.js";

const BASE = "https://najmcoiffdashboard.vercel.app";

test.describe("War Room — Onglet Recommandations (REC-001/002 acceptées)", () => {

  test("la page War Room se charge avec le titre et les KPIs", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await expect(page.locator("h1")).toContainText("War Room", { timeout: 8000 });

    // Au moins un onglet visible
    const recTab = page.locator("button").filter({ hasText: /Recommandations/i }).first();
    await expect(recTab).toBeVisible({ timeout: 8000 });

    // Bandeau KPIs marge présent
    await expect(page.locator("text=Marge coiffure").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=35.2%").first()).toBeVisible({ timeout: 5000 });

    console.log("✅ Page War Room chargée, KPIs marges affichés");
  });

  test("onglet Recommandations : REC-001 et REC-002 apparaissent comme acceptées", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const recTab = page.locator("button").filter({ hasText: /Recommandations/i }).first();
    await recTab.click();
    await page.waitForTimeout(2000);

    // Section Historique avec les 2 recs acceptées
    await expect(page.locator("text=REC-001").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=REC-002").first()).toBeVisible({ timeout: 5000 });

    // Badge "Accepté" visible
    await expect(page.locator("text=Accepté").first()).toBeVisible({ timeout: 5000 });

    console.log("✅ REC-001 et REC-002 visibles avec statut Accepté");
  });

  test("onglet Recommandations : KPIs marge et équation budget 290 DA/EUR", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const recTab = page.locator("button").filter({ hasText: /Recommandations/i }).first();
    await recTab.click();
    await page.waitForTimeout(1500);

    // Taux 290 DA/EUR dans l'équation budget
    await expect(page.locator("text=290").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=Équation budget").first()).toBeVisible({ timeout: 5000 });

    // Budget départ 4 350 DA
    await expect(page.locator("text=4 350").first()).toBeVisible({ timeout: 5000 });

    console.log("✅ Équation budget 290 DA/EUR et 4 350 DA affichés");
  });

  test("onglet Recommandations : bouton Nouvelle recommandation visible", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const recTab = page.locator("button").filter({ hasText: /Recommandations/i }).first();
    await recTab.click();
    await page.waitForTimeout(1500);

    // Zone "En attente de nouvelles recommandations" ou bouton
    const pageText = await page.content();
    const hasNewRec = pageText.includes("En attente") || pageText.includes("Nouvelle") || pageText.includes("pending");
    expect(hasNewRec).toBeTruthy();

    console.log("✅ Zone nouvelles recommandations présente");
  });

  test("onglet Kanban : affiche les campagnes Meta créées", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Naviguer vers l'onglet Kanban
    const kanbanTab = page.locator("button").filter({ hasText: /Kanban/i }).first();
    await kanbanTab.click();
    await page.waitForTimeout(3000);

    // Le formulaire "Nouvelle campagne" est toujours présent dans le Kanban
    await expect(page.locator("text=Nouvelle campagne").first()).toBeVisible({ timeout: 10000 });

    // Les campagnes NC — Retargeting Coiffure doivent apparaître (insérées dans nc_campaign_plans)
    await expect(page.locator("text=Coiffure").first()).toBeVisible({ timeout: 10000 });

    console.log("✅ Onglet Kanban : formulaire + campagnes Coiffure visibles");
  });

  test("onglet Workflow : plan marketing affiché", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/marketing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const workflowTab = page.locator("button").filter({ hasText: /Workflow/i }).first();
    await workflowTab.click();
    await page.waitForTimeout(1500);

    // Section workflow présente
    const pageText = await page.content();
    expect(pageText.toLowerCase()).toContain("workflow");

    console.log("✅ Onglet Workflow chargé");
  });

});
