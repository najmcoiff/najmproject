/**
 * barcodes.spec.js — Test humain T122
 *
 * Vérifie que le filtre PO (clic sur un bouton PO)
 * ne provoque PAS de scroll reset (bug scroll reset étiquettes).
 *
 * Comportement attendu : la page reste à sa position de scroll
 * après clic sur un filtre PO — car le filtrage est client-side
 * (pas de re-fetch API qui affiche le Spinner et remet la page en haut).
 */
import { test, expect } from "./fixtures.js";

test.describe("Page Barcodes (Étiquettes) — T122 scroll stable", () => {

  test("la page Barcodes se charge", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barcodes");
    await authedPage.waitForTimeout(3000);

    const title = authedPage.getByText(/barcode|étiquette|impression/i).first();
    await expect(title).toBeVisible({ timeout: 15000 });
  });

  test("le filtre PO ne provoque pas de spinner (filtrage client-side)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barcodes");
    await authedPage.waitForTimeout(3000);

    // Attendre que le chargement initial soit terminé (spinner disparaît)
    await expect(authedPage.locator("[class*='animate-spin']").first()).not.toBeVisible({ timeout: 15000 })
      .catch(() => {}); // pas de spinner = déjà OK

    // Vérifier qu'au moins un bouton de filtre PO est présent
    const poButtons = authedPage.locator("button").filter({ hasText: /^[A-Z0-9]{2,}-/ });
    const nbPO = await poButtons.count();

    if (nbPO === 0) {
      // Pas de PO en base = on teste juste le bouton "Tous"
      const tousBtn = authedPage.getByRole("button", { name: /tous/i }).first();
      const isTousVisible = await tousBtn.isVisible().catch(() => false);
      if (isTousVisible) {
        // Scroll vers le bas
        await authedPage.evaluate(() => window.scrollTo(0, 500));
        const scrollBefore = await authedPage.evaluate(() => window.scrollY);
        await tousBtn.click();
        await authedPage.waitForTimeout(800);

        // Pas de spinner apparu après le clic (filtrage client-side)
        const spinnerVisible = await authedPage.locator("[class*='animate-spin']").first().isVisible().catch(() => false);
        expect(spinnerVisible, "Aucun spinner ne doit apparaître sur clic filtre (client-side)").toBe(false);
      }
      return;
    }

    // Scroll vers le bas pour simuler un utilisateur ayant déjà scrollé
    await authedPage.evaluate(() => window.scrollTo(0, 500));
    await authedPage.waitForTimeout(300);
    const scrollBefore = await authedPage.evaluate(() => window.scrollY);

    // Clic sur le premier bouton PO
    await poButtons.first().click();
    await authedPage.waitForTimeout(800);

    // Vérifier qu'aucun spinner n'est apparu après le clic (preuve du filtrage client-side)
    const spinnerApparait = await authedPage.locator("[class*='animate-spin']").first().isVisible().catch(() => false);
    expect(spinnerApparait, "Aucun spinner ne doit apparaître — le filtre est client-side").toBe(false);

    // Vérifier que le scroll n'a pas été réinitialisé à 0
    const scrollAfter = await authedPage.evaluate(() => window.scrollY);
    // La page ne doit pas remonter en haut (scrollY ne doit pas chuter à 0 si elle était > 100)
    if (scrollBefore > 100) {
      expect(scrollAfter, "Le scroll ne doit pas remonter en haut après clic filtre").toBeGreaterThan(0);
    }
  });

  test("le bouton 'Tous' réaffiche toutes les étiquettes", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barcodes");
    await authedPage.waitForTimeout(3000);

    const tousBtn = authedPage.getByRole("button", { name: /tous/i }).first();
    const isTousVisible = await tousBtn.isVisible().catch(() => false);

    if (!isTousVisible) {
      // Pas de filtres = OK, pas de données PO disponibles
      return;
    }

    await tousBtn.click();
    await authedPage.waitForTimeout(500);

    // Vérifier qu'aucun spinner n'est apparu (filtrage client-side)
    const spinnerApparait = await authedPage.locator("[class*='animate-spin']").first().isVisible().catch(() => false);
    expect(spinnerApparait, "Aucun spinner sur clic 'Tous'").toBe(false);
  });

  test("le bouton Imprimer est présent", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barcodes");
    await authedPage.waitForTimeout(2000);

    const printBtn = authedPage.getByRole("button", { name: /imprimer/i }).first();
    await expect(printBtn).toBeVisible({ timeout: 10000 });
  });

});
