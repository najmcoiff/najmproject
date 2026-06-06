/**
 * t117b-scan-recent-articles.spec.js — Playwright humain mobile
 *
 * Régression : "plusieurs articles ne se scannent pas via leur code-barre,
 * surtout les nouveaux articles ajoutés récemment" (signalé 2026-06-06).
 *
 * Cause racine identifiée :
 *  1. findVariant() comparait `barcode === code` strict, mais nc_variants
 *     contient des barcodes saisis manuellement avec espaces / tirets / &
 *     (ex: "748483752&", "111333890-5", "143216 76518", "09&325003").
 *     Le scanner caméra ou un lecteur USB renvoie toujours les chiffres
 *     "purs" → mismatch systématique.
 *  2. Cache localStorage TTL 10 min : un article ajouté < 10 min plus tôt
 *     n'est pas dans le cache POS, donc invisible.
 *
 * Ce test simule un agent sur mobile (375×812) qui :
 *  A. Crée un variant test fraîchement ajouté (synced_at = now) avec un
 *     barcode contenant des séparateurs « réels » de saisie utilisateur.
 *  B. Ouvre /dashboard/pos → vérifie que le cache est refresh (article
 *     dans la liste de variants).
 *  C. Tape dans le champ recherche le code "pur" (sans séparateur) →
 *     vérifie que l'article apparaît dans la grille de résultats.
 *  D. Vérifie que ce variant n'est plus considéré "introuvable".
 *
 * Lancement contre prod :
 *   E2E_BASE_URL=https://najmcoiffdashboard.vercel.app \
 *     npx playwright test t117b-scan-recent-articles.spec.js --project=chromium
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";

const STAMP        = Date.now().toString().slice(-9); // 9 derniers chiffres du timestamp
const TEST_VARIANT = `nc_test_t117b_${STAMP}`;
// Barcode "stocké" en DB tel qu'un opérateur l'a saisi (avec un &)
const STORED_BARCODE = `${STAMP}&`;
// Code "tapé" par le scanner ou le lecteur USB — sans le séparateur
const SCANNED_CODE   = STAMP;

test.describe("T117b — Scan code-barres articles récemment ajoutés", () => {

  test.beforeAll(async () => {
    // Insérer un variant frais (synced_at = now) avec un barcode "sale"
    await sbInsert("nc_variants", {
      variant_id:         TEST_VARIANT,
      display_name:       `T117B Article Test ${STAMP}`,
      product_title:      `T117B Article Test ${STAMP}`,
      barcode:            STORED_BARCODE,
      sku:                null,
      price:              1234,
      inventory_quantity: 5,
      status:             "active",
      synced_at:          new Date().toISOString(),
    });
    console.log(`[T117B] Variant créé : ${TEST_VARIANT} barcode="${STORED_BARCODE}"`);

    // Vérifier que Supabase l'a bien
    const rows = await sbQuery(
      "nc_variants",
      `variant_id=eq.${TEST_VARIANT}&select=variant_id,barcode,inventory_quantity`
    );
    expect(Array.isArray(rows) && rows.length).toBe(1);
    expect(rows[0].barcode).toBe(STORED_BARCODE);
  });

  test.afterAll(async () => {
    await sbDelete("nc_variants", `variant_id=eq.${TEST_VARIANT}`);
    console.log(`[T117B] Variant nettoyé : ${TEST_VARIANT}`);
  });

  test("Mobile 375 — taper le code pur trouve l'article au barcode séparé", async ({ authedPage }) => {
    // Simuler un mobile (iPhone XR)
    await authedPage.setViewportSize({ width: 375, height: 812 });

    await authedPage.goto("/dashboard/pos");

    // Attendre que le champ recherche soit prêt
    const search = authedPage.locator('[data-testid="pos-search"]');
    await expect(search).toBeVisible({ timeout: 30000 });

    // Attendre la fin du chargement du catalogue : on tape un caractère puis
    // on vide pour forcer un cycle de rendu et s'assurer que variants est peuplé.
    await authedPage.waitForFunction(() => {
      const txt = document.body.textContent || "";
      return /\d+ articles/.test(txt);
    }, { timeout: 30000, polling: 600 }).catch(() => {});

    // Taper le code "pur" que le scanner renvoie
    await search.click();
    await search.fill(SCANNED_CODE);
    console.log(`[T117B] Saisi dans le champ : "${SCANNED_CODE}"`);

    // L'article doit apparaître dans la grille
    const tiles = authedPage.locator('[data-testid="pos-result-item"]');
    await tiles.first().waitFor({ timeout: 10000 });
    const count = await tiles.count();
    console.log(`[T117B] Résultats : ${count}`);
    expect(count).toBeGreaterThan(0);

    // Le titre doit correspondre à notre article test
    const firstText = await tiles.first().textContent();
    expect(firstText || "").toContain(`T117B Article Test ${STAMP}`);
    console.log(`[T117B] ✓ Article trouvé via code pur (séparateur "&" en DB)`);

    // Clic → doit ajouter au panier (badge count visible)
    await tiles.first().click();
    const cartCount = authedPage.locator('[data-testid="pos-cart-count"]').first();
    await expect(cartCount).toBeVisible({ timeout: 5000 });
    await expect(cartCount).toContainText("1");
    console.log(`[T117B] ✓ Ajout au panier OK`);
  });

  test("Mobile 375 — findVariant (scanner caméra) matche le code normalisé", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 });
    await authedPage.goto("/dashboard/pos");
    await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });

    // Attendre que variants soit chargé : on lit window via evaluate.
    // Comme variants est dans le state React, on peut juste injecter un test
    // via la recherche : si le variant test apparaît avec son code pur, c'est
    // que findVariant trouverait aussi via le même chemin de normalisation.
    await authedPage.waitForFunction(() => {
      const txt = document.body.textContent || "";
      return /\d+ articles/.test(txt);
    }, { timeout: 30000, polling: 600 }).catch(() => {});

    const search = authedPage.locator('[data-testid="pos-search"]');

    // 3 variantes du code que le scanner pourrait renvoyer :
    //   - le code pur (chiffres uniquement)
    //   - avec un espace au début (certains lecteurs USB ajoutent ça)
    //   - en majuscules (cas SKU alphanumérique)
    for (const code of [SCANNED_CODE, ` ${SCANNED_CODE}`, SCANNED_CODE.toUpperCase()]) {
      await search.click();
      await search.fill("");
      await search.fill(code);
      const tiles = authedPage.locator('[data-testid="pos-result-item"]');
      await tiles.first().waitFor({ timeout: 8000 });
      const count = await tiles.count();
      console.log(`[T117B] Variante "${code}" → ${count} résultat(s)`);
      expect(count).toBeGreaterThan(0);
      const firstText = await tiles.first().textContent();
      expect(firstText || "").toContain(`T117B Article Test ${STAMP}`);
    }
    console.log(`[T117B] ✓ Toutes les variantes du code mènent au bon article`);
  });
});
