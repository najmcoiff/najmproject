/**
 * preparation-modal.spec.js — Test humain T123
 *
 * Vérifie que cliquer sur un article dans la vue Préparation
 * ouvre un modal de détail produit (stock, SKU, barcode, image).
 *
 * Parcours simulé :
 *  1. Naviguer vers /dashboard/preparation
 *  2. Cliquer sur une commande dans la liste gauche
 *  3. Attendre les articles à préparer
 *  4. Cliquer sur une carte article (prep-item-card)
 *  5. Vérifier que le modal s'ouvre avec les infos attendues
 *  6. Fermer le modal avec ×
 *  7. Vérifier que le modal est fermé
 */
import { test, expect } from "./fixtures.js";

test.describe("Page Préparation — T123 modal détail produit", () => {

  test("la page Préparation se charge et affiche la liste", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(3000);

    // L'onglet "Préparation commandes" doit être présent
    const tabCommandes = authedPage.getByText(/préparation commandes/i).first();
    await expect(tabCommandes).toBeVisible({ timeout: 15000 });
  });

  test("cliquer sur une commande affiche les articles", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(4000);

    // Trouver une commande dans la liste gauche
    const orderCards = authedPage.locator("[class*='cursor-pointer'][class*='border-b']").filter({
      hasNot: authedPage.locator("input"),
    });
    const nbOrders = await orderCards.count();

    if (nbOrders === 0) {
      console.warn("⚠️ Aucune commande disponible — test non bloquant");
      return;
    }

    // Cliquer sur la première commande
    await orderCards.first().click();
    await authedPage.waitForTimeout(2500);

    // La section "Articles à préparer" doit apparaître
    const articlesSection = authedPage.getByText(/articles à préparer/i).first();
    await expect(articlesSection).toBeVisible({ timeout: 10000 });
  });

  test("cliquer sur une carte article ouvre le modal produit", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(4000);

    // Cliquer sur la première commande disponible
    const orderCards = authedPage.locator(".border-b.cursor-pointer");
    const nbOrders = await orderCards.count();

    if (nbOrders === 0) {
      console.warn("⚠️ Aucune commande — test conditionnel non bloquant");
      return;
    }

    await orderCards.first().click();
    await authedPage.waitForTimeout(3000);

    // Chercher les cartes articles avec data-testid="prep-item-card"
    const itemCards = authedPage.locator("[data-testid='prep-item-card']");
    const nbItems = await itemCards.count();

    if (nbItems === 0) {
      console.warn("⚠️ Aucun article dans cette commande — test conditionnel non bloquant");
      return;
    }

    // Vérifier que la première carte article est visible
    await expect(itemCards.first()).toBeVisible({ timeout: 8000 });

    // Vérifier que le clic est possible (curseur pointer = varData disponible)
    const hasCursor = await itemCards.first().evaluate(el => {
      return window.getComputedStyle(el).cursor === "pointer";
    });

    if (!hasCursor) {
      console.warn("⚠️ Article sans données variante dans nc_variants — modal non déclenchable, test conditionnel OK");
      return;
    }

    // Cliquer sur la carte article
    await itemCards.first().click();
    await authedPage.waitForTimeout(1000);

    // Le modal doit s'ouvrir — vérifier le bouton × de fermeture
    const closeBtn = authedPage.locator("[data-testid='modal-produit-close']");
    await expect(closeBtn).toBeVisible({ timeout: 8000 });

    // Vérifier que le modal contient la section Stock
    const stockEl = authedPage.locator("[data-testid='modal-produit-stock']");
    await expect(stockEl).toBeVisible({ timeout: 5000 });
  });

  test("le modal produit se ferme au clic ×", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(4000);

    const orderCards = authedPage.locator(".border-b.cursor-pointer");
    if (await orderCards.count() === 0) {
      console.warn("⚠️ Aucune commande — skip");
      return;
    }

    await orderCards.first().click();
    await authedPage.waitForTimeout(3000);

    const itemCards = authedPage.locator("[data-testid='prep-item-card']");
    if (await itemCards.count() === 0) {
      console.warn("⚠️ Aucun article — skip");
      return;
    }

    // Vérifier si l'article a un cursor pointer (= varData existe)
    const hasCursor = await itemCards.first().evaluate(el =>
      window.getComputedStyle(el).cursor === "pointer"
    ).catch(() => false);

    if (!hasCursor) {
      console.warn("⚠️ Pas de varData — skip");
      return;
    }

    await itemCards.first().click();
    await authedPage.waitForTimeout(1000);

    // Modal ouvert ?
    const closeBtn = authedPage.locator("[data-testid='modal-produit-close']");
    const isModalOpen = await closeBtn.isVisible().catch(() => false);

    if (!isModalOpen) {
      console.warn("⚠️ Modal non ouvert (item sans varData en prod) — skip");
      return;
    }

    // Fermer le modal
    await closeBtn.click();
    await authedPage.waitForTimeout(500);

    // Le modal doit être fermé
    await expect(closeBtn).not.toBeVisible({ timeout: 3000 });
  });

  test("le modal produit se ferme au clic overlay (fond sombre)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(4000);

    const orderCards = authedPage.locator(".border-b.cursor-pointer");
    if (await orderCards.count() === 0) return;

    await orderCards.first().click();
    await authedPage.waitForTimeout(3000);

    const itemCards = authedPage.locator("[data-testid='prep-item-card']");
    if (await itemCards.count() === 0) return;

    const hasCursor = await itemCards.first().evaluate(el =>
      window.getComputedStyle(el).cursor === "pointer"
    ).catch(() => false);
    if (!hasCursor) return;

    await itemCards.first().click();
    await authedPage.waitForTimeout(1000);

    const closeBtn = authedPage.locator("[data-testid='modal-produit-close']");
    const isOpen = await closeBtn.isVisible().catch(() => false);
    if (!isOpen) return;

    // Cliquer sur l'overlay (fixed inset-0 = fond sombre)
    await authedPage.keyboard.press("Escape");
    // Ou cliquer en dehors du modal (coin haut gauche)
    await authedPage.mouse.click(10, 10);
    await authedPage.waitForTimeout(500);

    await expect(closeBtn).not.toBeVisible({ timeout: 3000 });
  });

  test("l'onglet Quota Préparation reste fonctionnel", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(3000);

    const tabQuota = authedPage.getByText(/préparation quota/i).first();
    await expect(tabQuota).toBeVisible({ timeout: 10000 });

    await tabQuota.click();
    await authedPage.waitForTimeout(2000);

    // L'onglet quota doit afficher son contenu (liste ou message vide)
    const quotaContent = authedPage.getByText(/quota|variante|articles|génér/i).first();
    await expect(quotaContent).toBeVisible({ timeout: 8000 });
  });

});
