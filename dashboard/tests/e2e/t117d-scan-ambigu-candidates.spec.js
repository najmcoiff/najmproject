/**
 * t117d-scan-ambigu-candidates.spec.js — Scan ambigu (P6)
 *
 * Plusieurs variants peuvent partager un même barcode (cas réel : Bandido
 * 6/150ML et 3/500ML partagent 872009288376 ; 2 variants "Rasoir classique"
 * partagent 1234567890128). Avant ce fix, findVariant() prenait le premier
 * trouvé arbitrairement. Maintenant, le scanner affiche un panneau
 * "candidates" qui liste tous les variants matchés avec leur stock, l'agent
 * choisit explicitement.
 *
 * Ce test :
 *  - Crée 3 variants partageant le même barcode (stock différents)
 *  - Mock BarcodeDetector pour scanner ce code
 *  - Vérifie l'apparition du panneau scanner-candidates avec 3 items
 *  - Sélectionne le variant en stock>0 → preview classique apparaît
 *  - Ajoute au panier, vérifie compteur
 */
import { test, expect, sbInsert, sbDelete } from "./fixtures.js";

const STAMP = Date.now().toString().slice(-9);
const SHARED_BARCODE = `99${STAMP}`; // 11 chiffres, peu de chances de collider
const VARIANT_IDS = [
  `nc_test_t117d_${STAMP}_a`,
  `nc_test_t117d_${STAMP}_b`,
  `nc_test_t117d_${STAMP}_c`,
];

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

test.describe("T117d — Scan ambigu : plusieurs variants partagent un barcode", () => {

  test.beforeAll(async () => {
    // 3 variants : 2 en rupture + 1 en stock, partageant SHARED_BARCODE
    await sbInsert("nc_variants", {
      variant_id: VARIANT_IDS[0],
      display_name: `T117D ZERO ${STAMP}`,
      product_title: `T117D ZERO ${STAMP}`,
      barcode: SHARED_BARCODE,
      price: 100,
      inventory_quantity: 0,
      status: "active",
      synced_at: new Date().toISOString(),
    });
    await sbInsert("nc_variants", {
      variant_id: VARIANT_IDS[1],
      display_name: `T117D STOCK ${STAMP}`,
      product_title: `T117D STOCK ${STAMP}`,
      barcode: SHARED_BARCODE,
      price: 200,
      inventory_quantity: 5,
      status: "active",
      synced_at: new Date().toISOString(),
    });
    await sbInsert("nc_variants", {
      variant_id: VARIANT_IDS[2],
      display_name: `T117D NEG ${STAMP}`,
      product_title: `T117D NEG ${STAMP}`,
      barcode: SHARED_BARCODE,
      price: 300,
      inventory_quantity: -1,
      status: "active",
      synced_at: new Date().toISOString(),
    });
    console.log(`[T117D] 3 variants créés avec barcode partagé "${SHARED_BARCODE}"`);
  });

  test.afterAll(async () => {
    for (const id of VARIANT_IDS) {
      await sbDelete("nc_variants", `variant_id=eq.${id}`);
    }
    console.log(`[T117D] Variants nettoyés`);
  });

  test("Mobile 375 — scanner ambigu → panneau candidates → choix → panier", async ({ authedPage, context }) => {
    await context.grantPermissions(["camera"]);
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await installScannerMocks(authedPage, SHARED_BARCODE);

    await authedPage.goto("/dashboard/pos");
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await authedPage.waitForFunction(() => /\d+ articles/.test(document.body.textContent || ""),
      { timeout: 30000, polling: 600 }).catch(() => {});

    // Ouvrir scanner
    await authedPage.locator('[data-testid="pos-scan-btn"]').click();
    await expect(authedPage.locator('[data-testid="scanner-modal"]')).toBeVisible({ timeout: 8000 });

    // Panneau candidates doit apparaître (≥ 3 items partagent ce code)
    const panel = authedPage.locator('[data-testid="scanner-candidates"]');
    await expect(panel).toBeVisible({ timeout: 15000 });
    console.log(`[T117D] ✓ Panneau candidates affiché (scan ambigu détecté)`);

    const items = authedPage.locator('[data-testid="scanner-candidate-item"]');
    const count = await items.count();
    console.log(`[T117D] ${count} candidat(s) listé(s)`);
    expect(count).toBeGreaterThanOrEqual(3);

    // Le premier candidat doit être celui en stock > 0 (tri stock>0 d'abord)
    const firstText = await items.first().textContent();
    expect(firstText || "").toContain(`T117D STOCK ${STAMP}`);
    expect(firstText || "").toContain("Stock 5");
    console.log(`[T117D] ✓ Premier candidat = stock>0 (T117D STOCK)`);

    // Sélectionner le variant en stock
    await items.first().click();

    // Preview classique apparaît
    await expect(authedPage.locator("text=Article identifié !")).toBeVisible({ timeout: 5000 });
    console.log(`[T117D] ✓ Preview du variant sélectionné`);

    // Ajout au panier
    await authedPage.locator('[data-testid="scanner-add-to-cart"]').click();
    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).toBeVisible({ timeout: 5000 });
    await expect(floatCart).toContainText("1");
    console.log(`[T117D] ✓ Article ajouté au panier`);
  });
});
