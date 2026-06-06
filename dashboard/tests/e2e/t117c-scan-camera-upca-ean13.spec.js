/**
 * t117c-scan-camera-upca-ean13.spec.js — Playwright humain mobile
 *
 * Régression réelle (2026-06-06) : un agent scanne le code-barres
 * physique `872009288376` (UPC-A 12 chiffres) sur "Bandido gel 6/150ML"
 * et la modale POS affiche "Article introuvable" alors que le barcode
 * est bien en DB.
 *
 * Cause : le BarcodeDetector Chrome décode un UPC-A imprimé comme
 * EAN-13 en préfixant un `0` → `rawValue = "0872009288376"`.
 * Notre normalizeCode() retire les séparateurs mais pas les leading
 * zeros, donc `0872009288376 !== 872009288376` → introuvable.
 *
 * Fix : codesMatch() compare aussi `stripLeadingZeros(stored) ===
 * stripLeadingZeros(scanned)` (UPC-A ↔ EAN-13).
 *
 * Ce test :
 *  - Crée un variant frais avec barcode UPC-A 12 chiffres
 *  - Mocke window.BarcodeDetector pour qu'il retourne la version
 *    EAN-13 13 chiffres (avec leading 0) comme le ferait Chrome
 *  - Mocke navigator.mediaDevices.getUserMedia + HTMLVideoElement
 *    pour court-circuiter la dépendance caméra physique
 *  - Ouvre le scanner POS, vérifie que la modale affiche le bon
 *    article et permet l'ajout au panier
 *
 * Lancement contre prod :
 *   E2E_BASE_URL=https://najmcoiffdashboard.vercel.app \
 *     npx playwright test t117c-scan-camera-upca-ean13.spec.js --project=chromium
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";

const STAMP        = Date.now().toString().slice(-9);
const TEST_VARIANT = `nc_test_t117c_${STAMP}`;
// Barcode en DB : 12 chiffres UPC-A (cas réel utilisateur)
const UPCA_STORED   = `87200${STAMP}`.slice(0, 12).padEnd(12, "0");
// Code "décodé par la caméra" : EAN-13 avec leading 0 ajouté par Chrome
const EAN13_SCANNED = "0" + UPCA_STORED;

async function installScannerMocks(page, scannedCode) {
  await page.addInitScript((code) => {
    // 1) BarcodeDetector mock : retourne immédiatement le code injecté
    window.__MOCK_SCAN_CODE = code;
    window.BarcodeDetector = class {
      constructor(opts) { this.formats = opts?.formats || []; }
      static async getSupportedFormats() { return ["ean_13", "upc_a", "code_128"]; }
      async detect() {
        return [{ rawValue: window.__MOCK_SCAN_CODE, format: "ean_13" }];
      }
    };

    // 2) Forcer HTMLVideoElement.readyState >= 2 pour que le scan loop
    //    s'exécute (sinon il boucle indéfiniment en attendant la vidéo)
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
      configurable: true,
      get() { return 4; }, // HAVE_ENOUGH_DATA
    });

    // 3) Auto-dispatch "playing" event sur play() pour que la modale
    //    appelle setReady(true) + startScan()
    HTMLMediaElement.prototype.play = function () {
      setTimeout(() => this.dispatchEvent(new Event("playing")), 30);
      return Promise.resolve();
    };

    // 4) Mock getUserMedia → fake MediaStream sans vraie caméra
    if (!navigator.mediaDevices) navigator.mediaDevices = {};
    navigator.mediaDevices.getUserMedia = async () => ({
      getTracks: () => [{ stop: () => {}, kind: "video", enabled: true, readyState: "live" }],
      active: true,
    });
  }, scannedCode);
}

test.describe("T117c — Scan caméra UPC-A 12 chiffres décodé en EAN-13 13 chiffres", () => {

  test.beforeAll(async () => {
    await sbInsert("nc_variants", {
      variant_id:         TEST_VARIANT,
      display_name:       `T117C Bandido Test ${STAMP}`,
      product_title:      `T117C Bandido Test ${STAMP}`,
      barcode:            UPCA_STORED,         // 12 chiffres UPC-A
      sku:                null,
      price:              1500,
      inventory_quantity: 7,
      status:             "active",
      synced_at:          new Date().toISOString(),
    });
    console.log(`[T117C] Variant créé : ${TEST_VARIANT} barcode UPC-A "${UPCA_STORED}"`);
    console.log(`[T117C] Code que la caméra renverra : EAN-13 "${EAN13_SCANNED}"`);
  });

  test.afterAll(async () => {
    await sbDelete("nc_variants", `variant_id=eq.${TEST_VARIANT}`);
    console.log(`[T117C] Variant nettoyé`);
  });

  test("Mobile 375 — le scan caméra trouve l'article malgré le leading 0", async ({ authedPage, context }) => {
    await context.grantPermissions(["camera"]);
    await authedPage.setViewportSize({ width: 375, height: 812 });

    // Installer les mocks AVANT navigation
    await installScannerMocks(authedPage, EAN13_SCANNED);

    await authedPage.goto("/dashboard/pos");
    const search = authedPage.locator('[data-testid="pos-search"]');
    await expect(search).toBeVisible({ timeout: 30000 });

    // Attendre que le catalogue soit chargé
    await authedPage.waitForFunction(() => {
      const txt = document.body.textContent || "";
      return /\d+ articles/.test(txt);
    }, { timeout: 30000, polling: 600 }).catch(() => {});

    // Cliquer sur le bouton scanner caméra
    await authedPage.locator('[data-testid="pos-scan-btn"]').click();
    const modal = authedPage.locator('[data-testid="scanner-modal"]');
    await expect(modal).toBeVisible({ timeout: 8000 });
    console.log(`[T117C] Scanner ouvert, mock retournera "${EAN13_SCANNED}"`);

    // La modale doit afficher "Article identifié" — preuve que findVariant
    // a matché 12 chiffres DB vs 13 chiffres scan grâce au strip leading 0
    await expect(authedPage.locator("text=Article identifié")).toBeVisible({ timeout: 15000 });
    console.log(`[T117C] ✓ Article identifié dans la modale scanner`);

    // Le nom du produit test doit apparaître dans la modale
    await expect(modal).toContainText(`T117C Bandido Test ${STAMP}`);

    // Cliquer "Ajouter au panier"
    await authedPage.locator('[data-testid="scanner-add-to-cart"]').click();

    // Modale fermée, badge panier mobile visible avec compteur = 1
    await expect(modal).not.toBeVisible({ timeout: 5000 });
    const floatCart = authedPage.locator('[data-testid="pos-float-cart-btn"]');
    await expect(floatCart).toBeVisible({ timeout: 5000 });
    await expect(floatCart).toContainText("1");
    console.log(`[T117C] ✓ Article ajouté au panier après scan caméra`);
  });

  test("Mobile 375 — scan d'un code INVALIDE affiche bien 'introuvable'", async ({ authedPage, context }) => {
    await context.grantPermissions(["camera"]);
    await authedPage.setViewportSize({ width: 375, height: 812 });

    // Mock retourne un code aléatoire qui n'existe pas
    const fakeCode = "9999999" + STAMP;
    await installScannerMocks(authedPage, fakeCode);

    await authedPage.goto("/dashboard/pos");
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });
    await authedPage.waitForFunction(() => /\d+ articles/.test(document.body.textContent || ""),
      { timeout: 30000, polling: 600 }).catch(() => {});

    await authedPage.locator('[data-testid="pos-scan-btn"]').click();
    const modal = authedPage.locator('[data-testid="scanner-modal"]');
    await expect(modal).toBeVisible({ timeout: 8000 });

    // "Article introuvable" doit s'afficher (vérifie qu'on ne fait pas
    // de faux match dû à un strip leading 0 trop agressif)
    await expect(authedPage.locator("text=Article introuvable")).toBeVisible({ timeout: 15000 });
    console.log(`[T117C] ✓ Code inconnu "${fakeCode}" → 'introuvable' (pas de faux positif)`);
  });
});
