// ─── Test humain : Page Formation ────────────────────────────────
// Simule un utilisateur qui visite la formation, cherche un terme,
// ouvre une section, vérifie les mockups visuels.
import { test, expect } from "./fixtures.js";

test.describe("Formation — page complète feature-based", () => {

  test("La page Formation se charge avec le hero et les statistiques", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    // Titre principal visible
    await expect(authedPage.getByText("Formation Complète")).toBeVisible({ timeout: 15000 });

    // Stats dans le hero
    await expect(authedPage.getByText(/pages documentées/)).toBeVisible();
    await expect(authedPage.getByText(/sujets détaillés/)).toBeVisible();
    await expect(authedPage.getByText(/Mockups visuels inclus/)).toBeVisible();
    await expect(authedPage.getByText(/Mis à jour V4\.86/)).toBeVisible();
  });

  test("La barre de recherche est présente et filtre les sections", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    const searchBar = authedPage.locator("input[type='text']");
    await expect(searchBar).toBeVisible({ timeout: 15000 });

    // Recherche 'coupon' → section Confirmation visible
    await searchBar.click();
    await authedPage.keyboard.type("coupon");
    await authedPage.waitForTimeout(800);

    // Le compteur "X sections trouvées" doit apparaître
    await expect(authedPage.getByText(/sections? trouvée?s?/i).first()).toBeVisible({ timeout: 8000 });

    // Effacer → retour à l'état normal
    await searchBar.clear();
    await authedPage.waitForTimeout(400);
    await expect(authedPage.getByText("Table des Matières")).toBeVisible({ timeout: 5000 });
  });

  test("La Table des Matières s'ouvre et affiche les liens de sections", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    // Ouvrir la TOC
    const tocBtn = authedPage.getByText("Table des Matières");
    await expect(tocBtn).toBeVisible({ timeout: 10000 });
    await tocBtn.click();
    await authedPage.waitForTimeout(600);

    // Les liens de sections doivent être visibles
    await expect(authedPage.getByText("Confirmation").first()).toBeVisible();
    await expect(authedPage.getByText("Préparation").first()).toBeVisible();
    await expect(authedPage.getByText("Finance").first()).toBeVisible();
  });

  test("Ouvrir section Confirmation et voir sous-sections", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    // Trouver et cliquer sur la section Confirmation
    const confBtn = authedPage.locator("button").filter({ hasText: "Confirmation" }).first();
    await expect(confBtn).toBeVisible({ timeout: 10000 });
    await confBtn.click();
    await authedPage.waitForTimeout(800);

    // La description doit être visible
    await expect(authedPage.getByText(/Page centrale de gestion des commandes/)).toBeVisible({ timeout: 5000 });
    // Les sous-sections doivent apparaître
    await expect(authedPage.getByText("Les Onglets de Filtrage")).toBeVisible({ timeout: 5000 });
  });

  test("Les liens rapides en bas de page sont présents", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    await expect(authedPage.getByText("Aller au dashboard")).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText("Signaler un problème")).toBeVisible({ timeout: 5000 });
    await expect(authedPage.getByText("Confirmation").first()).toBeVisible();
    await expect(authedPage.getByText("POS Comptoir").first()).toBeVisible();
  });

  test("Règles d'or sont affichées", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    await expect(authedPage.getByText(/Règles d.*or/i)).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText(/mot de passe/i).first()).toBeVisible();
    await expect(authedPage.getByText(/Supabase/i).first()).toBeVisible();
  });

  test("Nouvelles sections BI et Campagnes présentes dans la TOC", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    // Ouvrir la Table des Matières
    const tocBtn = authedPage.getByText("Table des Matières");
    await expect(tocBtn).toBeVisible({ timeout: 10000 });
    await tocBtn.click();
    await authedPage.waitForTimeout(600);

    // Nouvelles sections visibles dans la TOC
    await expect(authedPage.getByText("Tableau de Bord BI (Owner)").first()).toBeVisible({ timeout: 5000 });
    await expect(authedPage.getByText("Campagnes WhatsApp (Owner)").first()).toBeVisible({ timeout: 5000 });
  });

  test("Ouvrir section BI et voir les sous-sections", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    // Recherche 'BI' pour trouver la section
    const searchBar = authedPage.locator("input[type='text']");
    await searchBar.click();
    await authedPage.keyboard.type("Score de Santé");
    await authedPage.waitForTimeout(800);

    await expect(authedPage.getByText(/Tableau de Bord BI/)).toBeVisible({ timeout: 8000 });
    await searchBar.clear();
  });

  test("Ouvrir section Campagnes et voir Template Lab", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/formation");
    await authedPage.waitForTimeout(2000);

    const searchBar = authedPage.locator("input[type='text']");
    await searchBar.click();
    await authedPage.keyboard.type("Template Lab");
    await authedPage.waitForTimeout(800);

    await expect(authedPage.getByText(/Campagnes WhatsApp/)).toBeVisible({ timeout: 8000 });
    await searchBar.clear();
  });

});
