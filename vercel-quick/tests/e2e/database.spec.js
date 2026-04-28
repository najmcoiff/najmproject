// ── Tests Playwright humain — Page Base de données (filtres nc_orders)
import { test, expect } from "./fixtures.js";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://najmcoiffdashboard.vercel.app";

test.describe("Page Base de données — filtres rapides nc_orders", () => {

  // ── Régression bug session localStorage — la page ne doit PAS afficher "Token invalide"
  test("DB-0 : la page se charge sans afficher 'Token invalide' (bug localStorage fix)", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/database`);
    await authedPage.waitForTimeout(3000);

    // La page ne doit PAS afficher "Token invalide"
    const tokenError = authedPage.locator("text=Token invalide");
    await expect(tokenError).not.toBeVisible();

    // La page ne doit PAS être bloquée sur "Chargement…"
    const loadingText = authedPage.locator("text=Chargement…");
    await expect(loadingText).not.toBeVisible();

    // La sidebar des tables doit être visible
    await expect(authedPage.locator("button", { hasText: "Commandes" }).first()).toBeVisible();
    console.log("✅ DB-0 : page chargée sans erreur Token invalide");
  });

  test("DB-1 : la page se charge et affiche la sidebar des tables", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/database");
    await authedPage.waitForTimeout(2000);
    await expect(authedPage.locator("text=Base de données").first()).toBeVisible();
    await expect(authedPage.locator("button", { hasText: "Commandes" }).first()).toBeVisible();
    console.log("✅ Sidebar tables visible");
  });

  test("DB-2 : nc_orders affiche uniquement les commandes actives par défaut (pas archive_)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/database");
    await authedPage.waitForTimeout(1500);

    await authedPage.locator("button", { hasText: "Commandes" }).click();
    await authedPage.waitForTimeout(2500);

    // Vérifier que les chips filtres sont visibles
    await expect(authedPage.locator("button", { hasText: "Masquer POS" })).toBeVisible();
    await expect(authedPage.locator("button", { hasText: "Masquer clôturés" })).toBeVisible();
    await expect(authedPage.locator("button", { hasText: "Masquer last" })).toBeVisible();
    await expect(authedPage.locator("button", { hasText: "Masquer ZR lockés" })).toBeVisible();
    await expect(authedPage.locator("button", { hasText: "Sans tracking seul" })).toBeVisible();
    await expect(authedPage.locator("button", { hasText: "Afficher archivés" })).toBeVisible();
    console.log("✅ Tous les 6 chips filtres sont visibles");

    // Vérifier qu'aucune ligne archive_ n'est visible (filtre archived=false par défaut)
    const tableContent = await authedPage.locator("table tbody").textContent().catch(() => "");
    expect(tableContent.includes("archive_")).toBeFalsy();
    console.log("✅ Aucune ligne archive_ (filtre actif par défaut)");
  });

  test("DB-3 : chip 'Afficher archivés' → affiche les lignes archive_", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/database");
    await authedPage.waitForTimeout(1500);
    await authedPage.locator("button", { hasText: "Commandes" }).click();
    await authedPage.waitForTimeout(2500);

    const countBefore = await authedPage.locator("text=/\\d+ lignes/").first().textContent().catch(() => "");
    console.log(`Lignes actives: ${countBefore}`);

    await authedPage.locator("button", { hasText: "Afficher archivés" }).click();
    await authedPage.waitForTimeout(2500);

    const countAfter = await authedPage.locator("text=/\\d+ lignes/").first().textContent().catch(() => "");
    console.log(`Lignes avec archivés: ${countAfter}`);

    // Vérifier que le count a significativement augmenté (317 → ~25994)
    const numBefore = parseInt((countBefore.match(/\d[\d\s]*/) || ["0"])[0].replace(/\s/g, ""));
    const numAfter  = parseInt((countAfter.match(/\d[\d\s]*/)  || ["0"])[0].replace(/\s/g, ""));
    expect(numAfter).toBeGreaterThan(numBefore * 10);
    console.log(`✅ Count passé de ${numBefore} → ${numAfter} (archivés inclus)`);
  });

  test("DB-4 : chip 'Masquer POS' → réduit le nombre de lignes", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/database");
    await authedPage.waitForTimeout(1500);
    await authedPage.locator("button", { hasText: "Commandes" }).click();
    await authedPage.waitForTimeout(2500);

    const countBefore = await authedPage.locator("text=/\\d+ lignes/").first().textContent().catch(() => "0 lignes");
    console.log(`Avant masquer POS: ${countBefore}`);

    await authedPage.locator("button", { hasText: "Masquer POS" }).click();
    await authedPage.waitForTimeout(2000);

    const countAfter = await authedPage.locator("text=/\\d+ lignes/").first().textContent().catch(() => "0 lignes");
    console.log(`Après masquer POS: ${countAfter}`);

    const numBefore = parseInt((countBefore.match(/\d[\d\s]*/) || ["0"])[0].replace(/\s/g, ""));
    const numAfter  = parseInt((countAfter.match(/\d[\d\s]*/)  || ["0"])[0].replace(/\s/g, ""));
    expect(numAfter).toBeLessThan(numBefore);
    console.log("✅ Masquer POS réduit bien le nombre de commandes");
  });

  test("DB-5 : chip 'Sans tracking seul' → toggle fonctionne (actif/inactif)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/database");
    await authedPage.waitForTimeout(1500);
    await authedPage.locator("button", { hasText: "Commandes" }).click();
    await authedPage.waitForTimeout(2500);

    const chipBtn = authedPage.locator("button", { hasText: "Sans tracking seul" });
    await expect(chipBtn).toBeVisible();

    // Récupérer la classe avant activation
    const classBefore = await chipBtn.getAttribute("class");

    // Activer le chip
    await chipBtn.click();
    await authedPage.waitForTimeout(2000);

    // Vérifier que le chip est bien activé (classe change)
    const classAfter = await chipBtn.getAttribute("class");
    expect(classAfter).not.toEqual(classBefore);

    // Désactiver le chip
    await chipBtn.click();
    await authedPage.waitForTimeout(1500);

    // La classe doit revenir à l'état initial
    const classReset = await chipBtn.getAttribute("class");
    expect(classReset).toEqual(classBefore);

    console.log("✅ DB-5 : chip 'Sans tracking seul' toggle correct (actif ↔ inactif)");
  });

  test("DB-6 : chips ne s'affichent PAS sur une autre table (ex: Events)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/database");
    await authedPage.waitForTimeout(1500);
    await authedPage.locator("button", { hasText: "📋 Events" }).first().click();
    await authedPage.waitForTimeout(1500);

    const chipsVisible = await authedPage.locator("button", { hasText: "Masquer POS" }).isVisible().catch(() => false);
    expect(chipsVisible).toBeFalsy();
    console.log("✅ Chips n'apparaissent pas sur la table Events");
  });

});
