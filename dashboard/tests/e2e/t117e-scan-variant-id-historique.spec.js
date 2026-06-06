/**
 * t117e-scan-variant-id-historique.spec.js — Playwright humain mobile
 *
 * Régression : "beaucoup d'articles ont leur code-barres qui a changé"
 * (utilisateur signalé 2026-06-06).
 *
 * Cause racine : /api/po/labels:42 mettait `r.variant_id` dans le champ
 * `barcode` au lieu de `r.barcode` → les étiquettes physiques imprimées
 * via /dashboard/barcodes encodent le variant_id Shopify (14 chiffres)
 * au lieu du vrai code-barres. Le scan POS cherchait dans v.barcode → miss.
 *
 * Fix livré :
 *  F1 — /api/po/labels:42 : `barcode: r.barcode || r.variant_id` (nouvelles
 *       étiquettes auront le vrai code).
 *  F2 — findVariants/exactCodeHits POS acceptent aussi v.variant_id (rétro-
 *       compat des étiquettes historiques déjà collées sur le stock).
 *  F3 — Stock recherche idem.
 *
 * Ce test simule un agent qui scanne une étiquette HISTORIQUE (encodant
 * le variant_id) :
 *   1. Crée un variant frais avec barcode "réel" + variant_id distinct
 *   2. Mock BarcodeDetector → renvoie le variant_id (cas étiquette historique)
 *   3. Vérifie que la modale affiche "Article identifié"
 *   4. Vérifie aussi que taper le variant_id dans le champ texte le trouve
 *   5. Vérifie qu'un scan du VRAI barcode marche toujours (non-régression)
 */
import { test, expect, sbInsert, sbDelete } from "./fixtures.js";

const STAMP        = Date.now().toString().slice(-9);
const TEST_VARIANT = `49998${STAMP}`; // simulate Shopify-style variant_id 14 chiffres
const REAL_BARCODE = `693${STAMP}3`;  // 13 chiffres EAN-13 plausible

async function installScannerMocks(page, scannedCode) {
  await page.addInitScript((code) => {
    window.__MOCK_SCAN_CODE = code;
    window.BarcodeDetector = class {
      constructor(opts) { this.formats = opts?.formats || []; }
      static async getSupportedFormats() { return ["ean_13", "upc_a", "code_128"]; }
      async detect() { return [{ rawValue: window.__MOCK_SCAN_CODE, format: "code_128" }]; }
    };
    if (!navigator.mediaDevices) navigator.mediaDevices = {};
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#222"; ctx.fillRect(0, 0, 320, 240);
      setInterval(() => {
        ctx.fillStyle = "#" + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0");
        ctx.fillRect(0,0,320,240);
      }, 100);
      return canvas.captureStream(15);
    };
  }, scannedCode);
}

test.describe("T117e — Scan étiquette historique (variant_id encodé)", () => {

  test.beforeAll(async () => {
    await sbInsert("nc_variants", {
      variant_id:         TEST_VARIANT,
      display_name:       `T117E Historique ${STAMP}`,
      product_title:      `T117E Historique ${STAMP}`,
      barcode:            REAL_BARCODE,
      sku:                null,
      price:              999,
      inventory_quantity: 4,
      status:             "active",
      synced_at:          new Date().toISOString(),
    });
    console.log(`[T117E] Variant créé : variant_id="${TEST_VARIANT}" barcode="${REAL_BARCODE}"`);
  });

  test.afterAll(async () => {
    await sbDelete("nc_variants", `variant_id=eq.${TEST_VARIANT}`);
    console.log(`[T117E] Variant nettoyé`);
  });

  test("Mobile 375 — scan caméra du variant_id (étiquette historique) trouve l'article", async ({ authedPage, context }) => {
    await context.grantPermissions(["camera"]);
    await authedPage.setViewportSize({ width: 375, height: 812 });

    await installScannerMocks(authedPage, TEST_VARIANT);
    await authedPage.goto("/dashboard/pos");
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await authedPage.waitForFunction(() => /\d+ articles/.test(document.body.textContent || ""),
      { timeout: 30000, polling: 600 }).catch(() => {});

    await authedPage.locator('[data-testid="pos-scan-btn"]').click();
    await expect(authedPage.locator('[data-testid="scanner-modal"]')).toBeVisible({ timeout: 8000 });

    // Modal doit afficher "Article identifié !" — preuve que findVariants
    // matche v.variant_id
    await expect(authedPage.locator("text=Article identifié !")).toBeVisible({ timeout: 15000 });
    console.log(`[T117E] ✓ variant_id "${TEST_VARIANT}" reconnu par scan caméra`);

    await authedPage.locator('[data-testid="scanner-add-to-cart"]').click();
    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).toBeVisible({ timeout: 5000 });
    await expect(floatCart).toContainText("1");
    console.log(`[T117E] ✓ Ajout panier OK`);
  });

  test("Mobile 375 — saisie clavier du variant_id trouve l'article", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await authedPage.goto("/dashboard/pos");
    const search = authedPage.locator('[data-testid="pos-search"]');
    await expect(search).toBeVisible({ timeout: 30000 });
    await authedPage.waitForFunction(() => /\d+ articles/.test(document.body.textContent || ""),
      { timeout: 30000, polling: 600 }).catch(() => {});

    await search.fill(TEST_VARIANT);
    const tiles = authedPage.locator('[data-testid="pos-result-item"]');
    await tiles.first().waitFor({ timeout: 10000 });
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);
    const firstText = await tiles.first().textContent();
    expect(firstText || "").toContain(`T117E Historique ${STAMP}`);
    console.log(`[T117E] ✓ Saisie clavier "${TEST_VARIANT}" → article retrouvé`);
  });

  test("Mobile 375 — non-régression : scan du VRAI barcode marche toujours", async ({ authedPage, context }) => {
    await context.grantPermissions(["camera"]);
    await authedPage.setViewportSize({ width: 375, height: 812 });

    await installScannerMocks(authedPage, REAL_BARCODE);
    await authedPage.goto("/dashboard/pos");
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await authedPage.waitForFunction(() => /\d+ articles/.test(document.body.textContent || ""),
      { timeout: 30000, polling: 600 }).catch(() => {});

    await authedPage.locator('[data-testid="pos-scan-btn"]').click();
    await expect(authedPage.locator('[data-testid="scanner-modal"]')).toBeVisible({ timeout: 8000 });
    await expect(authedPage.locator("text=Article identifié !")).toBeVisible({ timeout: 15000 });
    console.log(`[T117E] ✓ Vrai barcode "${REAL_BARCODE}" toujours scanné OK`);
  });
});
