/**
 * t119-panier-persistance.spec.js — Playwright humain mobile
 *
 * Régression user (2026-06-06) : "quand un agent rempli un bon dans POS
 * comptoir et puis par accident actualise ou sort de la feuille pour
 * vérifier autre chose, le bon s'efface complètement".
 *
 * Fix : panier POS (cart + discount) et panier Stock (panier + poId) sont
 * persistés dans localStorage (clés nc_pos_cart_v1 / nc_stock_bon_v1, TTL 24h).
 *
 * Scénarios (mobile 375 contre prod) :
 *  A. POS — ajout 2 articles → reload → 2 articles encore là
 *  B. POS — navigation /stock puis retour → panier conservé
 *  C. POS — clear localStorage manuel → reload → bien vide (pas de cruft)
 *  D. POS — TTL : localStorage avec ts > 24h → reload → vide (expiration)
 *  E. Stock — panier seedé via localStorage → reload → bon visible
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
      price: 1500, inventory_quantity: 8, status: "active",
      synced_at: new Date().toISOString(),
    });
    await sbInsert("nc_variants", {
      variant_id: VAR_B,
      display_name: `T119 Persist B ${STAMP}`,
      product_title: `T119 Persist B ${STAMP}`,
      barcode: `7${STAMP}22`,
      price: 2200, inventory_quantity: 5, status: "active",
      synced_at: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_variants", `variant_id=eq.${VAR_A}`);
    await sbDelete("nc_variants", `variant_id=eq.${VAR_B}`);
  });

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
  test("A. POS — 2 articles → reload → toujours 2 articles", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await gotoPos(authedPage);

    await addToPosCart(authedPage, `T119 Persist A ${STAMP}`);
    await addToPosCart(authedPage, `T119 Persist B ${STAMP}`);

    await expect(authedPage.locator('[data-testid="pos-float-cart-btn"]')).toContainText("2");
    console.log(`[T119][A] 2 articles ajoutés`);

    // Vérifie que localStorage est bien rempli
    const stored = await authedPage.evaluate(() => localStorage.getItem("nc_pos_cart_v1"));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored);
    expect(parsed.cart.length).toBe(2);
    console.log(`[T119][A] localStorage contient ${parsed.cart.length} ligne(s)`);

    await authedPage.reload();
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });

    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).toBeVisible({ timeout: 8000 });
    await expect(floatCart).toContainText("2");
    console.log(`[T119][A] ✓ 2 articles restaurés après reload`);
  });

  // ──────────────────────────────────────────────────────────────
  test("B. POS — navigation /stock puis retour → panier conservé", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await gotoPos(authedPage);

    await addToPosCart(authedPage, `T119 Persist A ${STAMP}`);
    await expect(authedPage.locator('[data-testid="pos-float-cart-btn"]')).toContainText("1");

    await authedPage.goto("/dashboard/stock");
    await authedPage.waitForTimeout(800);

    await gotoPos(authedPage);
    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).toBeVisible({ timeout: 8000 });
    await expect(floatCart).toContainText("1");
    console.log(`[T119][B] ✓ Panier conservé après navigation`);
  });

  // ──────────────────────────────────────────────────────────────
  test("C. POS — localStorage vidé manuellement → reload → bien vide", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await gotoPos(authedPage);

    await addToPosCart(authedPage, `T119 Persist A ${STAMP}`);
    await expect(authedPage.locator('[data-testid="pos-float-cart-btn"]')).toContainText("1");

    // Simule un vidage (logout, clear cache, etc.)
    await authedPage.evaluate(() => localStorage.removeItem("nc_pos_cart_v1"));
    await authedPage.reload();
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await authedPage.waitForTimeout(800);

    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).not.toBeVisible({ timeout: 5000 });
    console.log(`[T119][C] ✓ localStorage vidé → reload → panier bien vide`);
  });

  // ──────────────────────────────────────────────────────────────
  test("D. POS — TTL : entrée localStorage > 24h ignorée au reload", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await gotoPos(authedPage);

    // Injecte un panier "vieux" de 25h dans localStorage
    await authedPage.evaluate((vid) => {
      const old = Date.now() - 25 * 60 * 60 * 1000;
      localStorage.setItem("nc_pos_cart_v1", JSON.stringify({
        cart: [{ variant_id: vid, title: "Stale", price: 100, qty: 1, image_url: null, stock: 5 }],
        discount: 0,
        ts: old,
      }));
    }, VAR_A);

    await authedPage.reload();
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await authedPage.waitForTimeout(800);

    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).not.toBeVisible({ timeout: 5000 });

    // Et localStorage doit avoir été nettoyé
    const after = await authedPage.evaluate(() => localStorage.getItem("nc_pos_cart_v1"));
    expect(after).toBeNull();
    console.log(`[T119][D] ✓ Panier > 24h ignoré et purgé`);
  });

  // ──────────────────────────────────────────────────────────────
  test("E. Stock — panier seedé dans localStorage → reload → bon visible", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });

    // 1ère visite pour pouvoir écrire dans localStorage (origin correct)
    await authedPage.goto("/dashboard/stock");
    await authedPage.waitForTimeout(500);

    // Seed un bon
    await authedPage.evaluate(({ vid, name }) => {
      localStorage.setItem("nc_stock_bon_v1", JSON.stringify({
        panier: [{
          variant_id: vid,
          display_name: name,
          product_title: name,
          barcode: "", image_url: "",
          qty_add: 1, purchase_price: 100, sell_price: 200,
          note: "", collections_titles_pick: "",
        }],
        poId: "PO-TEST-T119",
        ts: Date.now(),
      }));
    }, { vid: VAR_A, name: `T119 Persist A ${STAMP}` });

    await authedPage.reload();
    await authedPage.waitForTimeout(1500);

    // Le compteur "1 article(s)" doit apparaître
    await expect(authedPage.locator("text=/1\\s*article\\(s\\)/i").first()).toBeVisible({ timeout: 10000 });
    // Le poId restauré doit aussi apparaître dans le champ
    await expect(authedPage.locator('input[value="PO-TEST-T119"]')).toBeVisible({ timeout: 5000 });
    console.log(`[T119][E] ✓ Bon Stock restauré (compteur + poId)`);
  });
});
