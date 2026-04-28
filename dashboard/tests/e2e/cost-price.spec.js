/**
 * cost-price.spec.js — Test humain T_COSTPRICE
 *
 * Vérifie que le prix d'achat (cost_price) est visible et éditable :
 *  1. Dans le catalogue admin owner (/dashboard/owner/catalogue)
 *     - Colonne "Prix achat (DA)" dans le tableau
 *     - Valeur affichée pour un article avec cost_price (test DB + Shopify réel)
 *     - Champ input-cost-price dans le modal d'édition
 *     - Mise à jour via inline edit → vérification DB
 *  2. Dans la page stock (/dashboard/stock)
 *     - "achat:" visible dans la liste compacte si cost_price > 0
 *     - "Coût" affiché dans le panneau détail
 *  3. Vérification avec un article Shopify réel (Vernis fengshangmei, coût 350 DA)
 *
 * Flux simulant un vrai humain owner.
 */
import { test, expect, sbInsert, sbQuery, sbDelete, sbPatch } from "./fixtures.js";

// Article Shopify réel avec cost_price connu (récupéré via migrate --phase=cost_price)
const REAL_ARTICLE_TITLE = "Vernis fengshangmei";
const REAL_COST_PRICE    = 350;

const TS              = Date.now();
const TEST_VARIANT_ID = `nc_e2e_cp_${TS}`;
const TEST_TITLE      = `E2E Cost Price ${TS}`;
const INITIAL_COST    = 450;
const UPDATED_COST    = 680;

test.describe.configure({ mode: "serial" });

test.describe("T_COSTPRICE — Prix d'achat visible dans catalogue owner + stock", () => {

  // ── Setup : insérer un article avec cost_price ──────────────────
  test.beforeAll(async () => {
    await sbInsert("nc_variants", {
      variant_id:          TEST_VARIANT_ID,
      product_id:          `nc_p_cp_${TS}`,
      product_title:       TEST_TITLE,
      display_name:        TEST_TITLE,
      price:               1200,
      cost_price:          INITIAL_COST,
      compare_at_price:    1500,
      inventory_quantity:  10,
      status:              "active",
      world:               "coiffure",
      vendor:              "NajmCoiff",
      tags:                [],
      collections:         [],
      collection_ids:      [],
      collections_titles:  "",
      updated_at:          new Date().toISOString(),
    });
  });

  // ── Cleanup ─────────────────────────────────────────────────────
  test.afterAll(async () => {
    await sbDelete("nc_variants", `variant_id=eq.${TEST_VARIANT_ID}`);
  });

  // ── Test 1 : colonne "Prix achat (DA)" présente dans le tableau ─
  test("1. Catalogue owner — colonne Prix achat visible dans le tableau", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(3000);

    // Chercher l'article test
    const searchInput = authedPage.locator("input[type='search'], input[placeholder*='Rechercher']").first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(2000);

    // Vérifier que l'en-tête "Prix achat" existe
    const header = authedPage.locator("th", { hasText: /Prix achat/i }).first();
    await expect(header).toBeVisible({ timeout: 8000 });
  });

  // ── Test 2 : valeur cost_price affichée dans le tableau ─────────
  test("2. Catalogue owner — valeur du prix d'achat affichée dans la ligne article", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(3000);

    // Rechercher l'article
    const searchInput = authedPage.locator("input[type='search'], input[placeholder*='Rechercher']").first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(2500);

    // Le prix d'achat (450 DA) doit être visible
    const costCell = authedPage.locator(`text=${INITIAL_COST.toLocaleString("fr-DZ")}`).first();
    await expect(costCell).toBeVisible({ timeout: 10000 });
  });

  // ── Test 3 : champ cost_price dans le modal d'édition ───────────
  test("3. Catalogue owner — champ Prix d'achat présent dans le modal Modifier", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(3000);

    // Rechercher l'article
    const searchInput = authedPage.locator("input[type='search'], input[placeholder*='Rechercher']").first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(2500);

    // Cliquer "Modifier"
    const btnModifier = authedPage.locator("[data-testid='btn-modifier']").first();
    await expect(btnModifier).toBeVisible({ timeout: 10000 });
    await btnModifier.click();
    await authedPage.waitForTimeout(1500);

    // Le champ input-cost-price doit exister dans le modal
    const costInput = authedPage.locator("[data-testid='input-cost-price']");
    await expect(costInput).toBeVisible({ timeout: 8000 });

    // Le champ doit contenir la valeur initiale
    await expect(costInput).toHaveValue(String(INITIAL_COST), { timeout: 5000 });

    // Fermer le modal
    await authedPage.keyboard.press("Escape");
  });

  // ── Test 4 : mise à jour cost_price via modal → vérif DB ────────
  test("4. Catalogue owner — modifier le prix d'achat via le modal et vérifier en DB", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(3000);

    // Rechercher l'article
    const searchInput = authedPage.locator("input[type='search'], input[placeholder*='Rechercher']").first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(2500);

    // Cliquer Modifier
    const btnModifier = authedPage.locator("[data-testid='btn-modifier']").first();
    await expect(btnModifier).toBeVisible({ timeout: 10000 });
    await btnModifier.click();
    await authedPage.waitForTimeout(1500);

    // Modifier le prix d'achat
    const costInput = authedPage.locator("[data-testid='input-cost-price']");
    await costInput.triple_click?.() || await costInput.click({ clickCount: 3 });
    await costInput.fill(String(UPDATED_COST));
    await authedPage.waitForTimeout(500);

    // Soumettre
    await authedPage.locator("button[type='submit']").last().click();
    await authedPage.waitForTimeout(3000);

    // Vérifier en DB
    const rows = await sbQuery(
      "nc_variants",
      `variant_id=eq.${TEST_VARIANT_ID}&select=cost_price`
    );
    const dbCost = Number(rows?.[0]?.cost_price);
    expect(dbCost).toBe(UPDATED_COST);
  });

  // ── Test 5 : page stock — affichage cost_price liste compacte ───
  test("5. Page Stock — prix d'achat visible dans la liste compacte", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/stock");
    await authedPage.waitForTimeout(4000);

    // Rechercher l'article test
    const searchInput = authedPage.locator(
      "input[placeholder*='nom'], input[placeholder*='SKU'], input[placeholder*='Rechercher']"
    ).first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(2500);

    // Le texte "achat:" doit apparaître pour l'article (car cost_price > 0)
    const achatLabel = authedPage.locator("text=achat:").first();
    await expect(achatLabel).toBeVisible({ timeout: 10000 });
  });

  // ── Test 6 : page stock — panneau détail affiche "Coût" ─────────
  test("6. Page Stock — panneau détail affiche le label Coût (article test)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/stock");
    await authedPage.waitForTimeout(4000);

    // Rechercher l'article test
    const searchInput = authedPage.locator(
      "input[placeholder*='nom'], input[placeholder*='SKU'], input[placeholder*='Rechercher']"
    ).first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(2500);

    // Cliquer sur l'article pour ouvrir le panneau détail
    const row = authedPage.locator(`text=${TEST_TITLE.slice(0, 20)}`).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();
    await authedPage.waitForTimeout(1500);

    // Le panneau détail doit contenir "Coût"
    const coutLabel = authedPage.locator("text=Coût").first();
    await expect(coutLabel).toBeVisible({ timeout: 8000 });
  });

});

// ── Suite 2 : vérification avec articles Shopify réels ──────────────────────
test.describe("T_COSTPRICE_SHOPIFY — Données Shopify réelles visibles dans l'UI", () => {

  test.describe.configure({ mode: "serial" });

  // ── Test 7 : catalogue owner — article Shopify réel avec coût ───
  test("7. Catalogue owner — coût Shopify réel (350 DA) visible dans le tableau", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(3000);

    // Rechercher l'article réel
    const searchInput = authedPage.locator("input[type='search'], input[placeholder*='Rechercher']").first();
    await searchInput.click();
    await authedPage.keyboard.type(REAL_ARTICLE_TITLE);
    await authedPage.waitForTimeout(2500);

    // Le prix d'achat réel (350 DA) doit être visible dans le tableau
    const costCell = authedPage.locator(`text=${REAL_COST_PRICE.toLocaleString("fr-DZ")}`).first();
    await expect(costCell).toBeVisible({ timeout: 10000 });
  });

  // ── Test 8 : catalogue owner — modal affiche le coût Shopify réel
  test("8. Catalogue owner — modal Modifier affiche le coût Shopify réel (350 DA)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(3000);

    const searchInput = authedPage.locator("input[type='search'], input[placeholder*='Rechercher']").first();
    await searchInput.click();
    await authedPage.keyboard.type(REAL_ARTICLE_TITLE);
    await authedPage.waitForTimeout(2500);

    // Cliquer Modifier sur le premier résultat
    const btnModifier = authedPage.locator("[data-testid='btn-modifier']").first();
    await expect(btnModifier).toBeVisible({ timeout: 10000 });
    await btnModifier.click();
    await authedPage.waitForTimeout(1500);

    // Le champ cost_price doit contenir 350 (récupéré depuis Shopify)
    const costInput = authedPage.locator("[data-testid='input-cost-price']");
    await expect(costInput).toBeVisible({ timeout: 8000 });
    await expect(costInput).toHaveValue(String(REAL_COST_PRICE), { timeout: 5000 });

    await authedPage.keyboard.press("Escape");
  });

  // ── Test 9 : stock — article Shopify réel avec achat: visible ───
  test("9. Page Stock — article Shopify réel affiche 'achat: 350 DA' dans la liste", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/stock");

    // Attendre que les variants soient chargés (le badge de count s'affiche)
    await authedPage.waitForSelector("button:has-text('Stock')", { timeout: 15000 });
    await authedPage.waitForTimeout(5000); // laisser le temps au fetch variants

    const searchInput = authedPage.locator(
      "input[placeholder*='nom'], input[placeholder*='SKU'], input[placeholder*='Rechercher']"
    ).first();
    await searchInput.click();
    await authedPage.keyboard.type(REAL_ARTICLE_TITLE);
    await authedPage.waitForTimeout(3000);

    // "achat:" suivi du prix doit être visible dans la liste compacte
    const achatLabel = authedPage.locator("text=achat:").first();
    await expect(achatLabel).toBeVisible({ timeout: 12000 });

    // Le prix d'achat réel doit apparaître
    const costValue = authedPage.locator(`text=${REAL_COST_PRICE.toLocaleString("fr-FR")} DA`).first();
    await expect(costValue).toBeVisible({ timeout: 8000 });
  });

  // ── Test 10 : stock — panneau détail affiche le coût Shopify réel
  test("10. Page Stock — panneau détail affiche coût = 350 DA (article Shopify réel)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/stock");
    await authedPage.waitForTimeout(4000);

    const searchInput = authedPage.locator(
      "input[placeholder*='nom'], input[placeholder*='SKU'], input[placeholder*='Rechercher']"
    ).first();
    await searchInput.click();
    await authedPage.keyboard.type(REAL_ARTICLE_TITLE);
    await authedPage.waitForTimeout(2500);

    // Cliquer sur l'article pour ouvrir le panneau détail
    const row = authedPage.locator(`text=${REAL_ARTICLE_TITLE}`).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();
    await authedPage.waitForTimeout(1500);

    // Le panneau détail doit contenir "Coût" ET la valeur 350 DA
    const coutLabel = authedPage.locator("text=Coût").first();
    await expect(coutLabel).toBeVisible({ timeout: 8000 });

    // Chercher la valeur dans le panneau détail
    const panel = authedPage.locator(".w-80, [class*='w-80']").first();
    const coutValue = panel.locator(`text=${REAL_COST_PRICE.toLocaleString("fr-FR")} DA`).first();
    await expect(coutValue).toBeVisible({ timeout: 8000 });
  });

});
