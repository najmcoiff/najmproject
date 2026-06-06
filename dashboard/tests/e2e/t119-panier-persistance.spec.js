/**
 * t119-panier-persistance.spec.js — Playwright humain mobile
 *
 * Régression user (2026-06-06) : "quand un agent rempli un bon dans POS
 * comptoir et puis par accident actualise ou sort de la feuille pour
 * vérifier autre chose, le bon s'efface complètement".
 *
 * Fix : panier POS (cart + discount) et panier Stock (panier + poId) sont
 * persistés dans localStorage avec TTL 24h. Restauration synchrone au mount.
 *
 * Ce test :
 *  A. POS — ajoute 2 articles + remise → reload → panier restauré
 *  B. POS — ajoute 1 article → navigue ailleurs puis revient → panier là
 *  C. POS — ajoute 1 article → vide manuellement → reload → vide
 *  D. Stock — ajoute article au bon → reload → article toujours là
 */
import { test, expect, sbInsert, sbDelete } from "./fixtures.js";

const STAMP = Date.now().toString().slice(-9);
const VAR_A = `nc_test_t119_${STAMP}_a`;
const VAR_B = `nc_test_t119_${STAMP}_b`;

test.describe("T119 — Persistance panier POS + Stock", () => {

  test.beforeAll(async () => {
    await sbInsert("nc_variants", {
      variant_id: VAR_A,
      display_name: `T119 Persist A ${STAMP}`,
      product_title: `T119 Persist A ${STAMP}`,
      barcode: `7${STAMP}11`,
      price: 1500,
      inventory_quantity: 8,
      status: "active",
      synced_at: new Date().toISOString(),
    });
    await sbInsert("nc_variants", {
      variant_id: VAR_B,
      display_name: `T119 Persist B ${STAMP}`,
      product_title: `T119 Persist B ${STAMP}`,
      barcode: `7${STAMP}22`,
      price: 2200,
      inventory_quantity: 5,
      status: "active",
      synced_at: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_variants", `variant_id=eq.${VAR_A}`);
    await sbDelete("nc_variants", `variant_id=eq.${VAR_B}`);
  });

  // Helper : ouvre POS, attend que le catalogue soit chargé
  async function gotoPos(page) {
    await page.goto("/dashboard/pos");
    await expect(page.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await page.waitForFunction(() => /\d+ articles/.test(document.body.textContent || ""),
      { timeout: 30000, polling: 600 }).catch(() => {});
  }

  async function addToPosCart(page, query) {
    const search = page.locator('[data-testid="pos-search"]');
    await search.click();
    await search.fill("");
    await search.fill(query);
    const tile = page.locator('[data-testid="pos-result-item"]').first();
    await tile.waitFor({ timeout: 10000 });
    await tile.click();
    await page.waitForTimeout(300);
  }

  // ──────────────────────────────────────────────────────────────
  test("A. POS — 2 articles + remise → reload → panier restauré", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await gotoPos(authedPage);

    await addToPosCart(authedPage, `T119 Persist A ${STAMP}`);
    await addToPosCart(authedPage, `T119 Persist B ${STAMP}`);

    // Ouvrir le bottom sheet pour mettre une remise
    await authedPage.locator('[data-testid="pos-float-cart-btn"]').click();
    const sheet = authedPage.locator('[data-testid="pos-cart-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await authedPage.locator('[data-testid="pos-discount-input"]').first().fill("200");
    await authedPage.waitForTimeout(300);

    // Snapshot avant reload : total visible
    const totalBefore = await authedPage.locator('[data-testid="pos-cart-total"]').first().textContent();
    console.log(`[T119][A] Total avant reload : ${totalBefore}`);

    // Reload sec
    await authedPage.reload();
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await authedPage.waitForTimeout(800);

    // Le bouton flottant doit montrer 2 articles
    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).toBeVisible({ timeout: 8000 });
    await expect(floatCart).toContainText("2");
    console.log(`[T119][A] ✓ Panier 2 articles restauré après reload`);

    // Ouvrir le sheet et vérifier que la remise est aussi restaurée
    await floatCart.click();
    const discountInput = authedPage.locator('[data-testid="pos-discount-input"]').first();
    await expect(discountInput).toHaveValue("200", { timeout: 5000 });
    console.log(`[T119][A] ✓ Remise 200 DA restaurée`);
  });

  // ──────────────────────────────────────────────────────────────
  test("B. POS — navigation ailleurs puis retour → panier là", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await gotoPos(authedPage);

    await addToPosCart(authedPage, `T119 Persist A ${STAMP}`);
    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).toContainText("1");

    // Naviguer vers une autre feuille
    await authedPage.goto("/dashboard/stock");
    await authedPage.waitForTimeout(800);

    // Revenir au POS
    await gotoPos(authedPage);
    const floatCart2 = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart2).toBeVisible({ timeout: 8000 });
    await expect(floatCart2).toContainText("1");
    console.log(`[T119][B] ✓ Panier conservé après navigation ailleurs/retour`);
  });

  // ──────────────────────────────────────────────────────────────
  test("C. POS — vide manuellement → reload → toujours vide", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await gotoPos(authedPage);

    await addToPosCart(authedPage, `T119 Persist A ${STAMP}`);

    // Ouvrir le sheet et vider via la × de chaque ligne
    await authedPage.locator('[data-testid="pos-float-cart-btn"]').click();
    const sheet = authedPage.locator('[data-testid="pos-cart-sheet"]');
    await expect(sheet).toBeVisible();

    // Boutons × dans chaque CartItem
    const removeBtns = sheet.locator('button:has-text("×")');
    const n = await removeBtns.count();
    // Le dernier bouton × est celui du header ; on clique les premiers
    if (n > 1) {
      await removeBtns.nth(0).click(); // remove item
      await authedPage.waitForTimeout(300);
    }

    // Reload
    await authedPage.reload();
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await authedPage.waitForTimeout(800);

    // Pas de bouton flottant car panier vide
    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).not.toBeVisible({ timeout: 5000 });
    console.log(`[T119][C] ✓ Panier vidé → reload → bien vide (pas de localStorage residuel)`);
  });

  // ──────────────────────────────────────────────────────────────
  test("D. Stock BonTab — article ajouté au bon → reload → toujours là", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await authedPage.goto("/dashboard/stock");

    // Attendre que la page Stock soit chargée
    const search = authedPage.locator('input[placeholder*="Rechercher"]').first();
    await expect(search).toBeVisible({ timeout: 30000 });
    await authedPage.waitForTimeout(1500); // laisse variants charger

    await search.click();
    await search.fill(`T119 Persist A ${STAMP}`);
    await authedPage.waitForTimeout(500);

    // Cliquer le 1er résultat (zone résultat sous l'input)
    const result = authedPage.locator('div.flex.items-center.gap-3.px-4.py-3.border-b').first();
    await expect(result).toBeVisible({ timeout: 8000 });
    await result.click();
    await authedPage.waitForTimeout(300);

    // Vérifier qu'on voit "1 article" quelque part dans la page (header bon)
    await expect(authedPage.locator("text=/1 article/i").first()).toBeVisible({ timeout: 5000 });

    // Reload
    await authedPage.reload();
    await expect(authedPage.locator('input[placeholder*="Rechercher"]').first()).toBeVisible({ timeout: 30000 });
    await authedPage.waitForTimeout(1500);

    // Le bon doit toujours avoir 1 article
    await expect(authedPage.locator("text=/1 article/i").first()).toBeVisible({ timeout: 8000 });
    console.log(`[T119][D] ✓ Bon Stock restauré après reload`);
  });
});
