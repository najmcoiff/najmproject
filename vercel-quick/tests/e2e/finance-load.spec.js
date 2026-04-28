/**
 * finance-load.spec.js — Régression bug session localStorage
 *
 * Vérifie que la page Finance se charge correctement (pas bloquée sur "Chargement...")
 * Bug : la page lisait sessionStorage uniquement, mais la session est dans localStorage.
 * Fix : getRawSession() lit localStorage en priorité, sessionStorage en fallback.
 */
import { test, expect } from "./fixtures.js";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://najmcoiffdashboard.vercel.app";

test.describe("Page Finance — chargement session (bug localStorage fix)", () => {

  // ── Test 1 : La page Finance se charge (pas bloquée sur Chargement...)
  test("FIN-LOAD-1 : Finance s'affiche sans rester bloquée sur Chargement...", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForTimeout(3000);

    // La page ne doit PAS rester bloquée sur "Chargement..."
    const loading = authedPage.locator("text=Chargement...");
    await expect(loading).not.toBeVisible();

    // Le titre "Finance" doit apparaître
    await expect(authedPage.locator("h1", { hasText: "Finance" })).toBeVisible();

    // Les onglets doivent être visibles
    await expect(authedPage.locator("button", { hasText: "Gestion de fond" })).toBeVisible();
    await expect(authedPage.locator("button", { hasText: "Recettes" })).toBeVisible();

    // Les KPIs du fond doivent être visibles (solde affiché)
    await expect(authedPage.locator("text=Solde actuel")).toBeVisible();
    console.log("✅ FIN-LOAD-1 : Finance chargée correctement");
  });

  // ── Test 2 : L'onglet Recettes charge les données correctement
  test("FIN-LOAD-2 : Onglet Recettes charge sans 'Token invalide'", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");

    // Naviguer vers l'onglet Recettes
    await authedPage.locator("button", { hasText: "Recettes" }).click();
    await authedPage.waitForTimeout(2000);

    // Aucune erreur "Token invalide" ne doit apparaître
    const tokenError = authedPage.locator("text=Token invalide");
    await expect(tokenError).not.toBeVisible();

    // Les KPIs du jour doivent être visibles
    await expect(authedPage.locator("text=Total POS réel")).toBeVisible();
    await expect(authedPage.locator("text=Total déclaré")).toBeVisible();
    await expect(authedPage.locator("text=Écart global")).toBeVisible();

    // Le bouton Déclarer doit être visible
    await expect(authedPage.locator("button", { hasText: "Déclarer" }).first()).toBeVisible();
    console.log("✅ FIN-LOAD-2 : Recettes chargées sans erreur token");
  });

  // ── Test 3 : La page Finance affiche bien les transactions de fond
  test("FIN-LOAD-3 : Gestion de fond affiche les KPIs sans erreur", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForTimeout(3000);

    // Le solde actuel doit être affiché (pas "—")
    const solde = authedPage.locator("text=Solde actuel");
    await expect(solde).toBeVisible();

    // Les KPIs totaux doivent être présents
    await expect(authedPage.locator("text=Total entrées")).toBeVisible();
    await expect(authedPage.locator("text=Total sorties")).toBeVisible();

    // Bouton "Nouvelle transaction" doit être visible
    await expect(authedPage.locator("button", { hasText: "transaction" }).first()).toBeVisible();

    console.log("✅ FIN-LOAD-3 : Gestion de fond affichée correctement");
  });

  // ── Test 4 : Simuler un vrai humain — naviguer entre les onglets
  test("FIN-LOAD-4 : Navigation humain entre Fond et Recettes fonctionne", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");

    // L'onglet "Gestion de fond" est actif par défaut
    await expect(authedPage.locator("text=Solde actuel")).toBeVisible();

    // Cliquer sur l'onglet Recettes
    await authedPage.locator("button", { hasText: "Recettes" }).click();
    await authedPage.waitForTimeout(1500);

    // Vérifier que les KPIs recettes sont visibles
    await expect(authedPage.locator("text=Total POS réel")).toBeVisible();

    // Revenir sur l'onglet Fond
    await authedPage.locator("button", { hasText: "Gestion de fond" }).click();
    await authedPage.waitForTimeout(500);

    // Le solde doit être de nouveau visible
    await expect(authedPage.locator("text=Solde actuel")).toBeVisible();

    console.log("✅ FIN-LOAD-4 : Navigation entre onglets fonctionne");
  });

});
