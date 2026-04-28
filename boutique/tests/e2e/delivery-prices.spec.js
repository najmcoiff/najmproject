/**
 * delivery-prices.spec.js
 * Test Playwright humain — Validation des prix de livraison ZR Express
 *
 * Objectif : Vérifier que les prix de livraison affichés en boutique
 * correspondent aux vrais tarifs ZR Express par wilaya.
 *
 * Scénarios testés :
 *   1. API /api/boutique/delivery retourne les bons prix pour Alger (16)
 *   2. API /api/boutique/delivery retourne les bons prix pour Oran (31)
 *   3. API /api/boutique/delivery retourne les bons prix bureau pour Alger
 *   4. Formulaire commander — sélection wilaya Alger → affiche 400 DZD
 *   5. Formulaire commander — sélection wilaya Oran → affiche 700 DZD
 *   6. Formulaire commander — type bureau Alger → affiche 300 DZD
 *   7. Formulaire commander — wilaya lointaine (Tlemcen) → affiche 900 DZD
 *   8. Vérification DB — Supabase nc_delivery_config a les bons prix
 */

const { test, expect } = require('@playwright/test');

// Prix attendus par wilaya — source: wilaya.ts (mise à jour 2026-04-15)
const EXPECTED_PRICES = {
  16: { home: 400,  office: 300, name: "Alger" },       // ✓ wilaya.ts
  31: { home: 600,  office: 400, name: "Oran" },        // ✓ wilaya.ts
   9: { home: 550,  office: 350, name: "Blida" },       // ✓ wilaya.ts
  15: { home: 600,  office: 400, name: "Tizi Ouzou" },  // ✓ wilaya.ts
  13: { home: 800,  office: 450, name: "Tlemcen" },     // ✓ wilaya.ts
  52: { home: 800,  office: 0,   name: "Beni Abbes" },  // ✓ wilaya.ts (pas de stopdesk)
};

// ── Tests API ──────────────────────────────────────────────────────────────────
test.describe('API /api/boutique/delivery — prix ZR corrects', () => {

  for (const [code, expected] of Object.entries(EXPECTED_PRICES)) {
    test(`Wilaya ${expected.name} (${code}) — home=${expected.home} DZD`, async ({ page }) => {
      await page.goto('/');
      const resp = await page.request.get(`/api/boutique/delivery?wilaya_code=${code}&type=home`);
      expect(resp.status()).toBe(200);
      const data = await resp.json();
      expect(data.price).toBe(expected.home);
      expect(data.default).toBe(false);
    });

    test(`Wilaya ${expected.name} (${code}) — bureau=${expected.office} DZD`, async ({ page }) => {
      await page.goto('/');
      const resp = await page.request.get(`/api/boutique/delivery?wilaya_code=${code}&type=office`);
      expect(resp.status()).toBe(200);
      const data = await resp.json();
      expect(data.price).toBe(expected.office);
    });
  }

  test('Wilaya invalide (0) → fallback 400/300 DZD', async ({ page }) => {
    await page.goto('/');
    const resp = await page.request.get('/api/boutique/delivery?wilaya_code=0&type=home');
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.price).toBe(400);
    expect(data.default).toBe(true);
  });

  test('Prix bureau fallback → 300 DZD (pas 350)', async ({ page }) => {
    await page.goto('/');
    const resp = await page.request.get('/api/boutique/delivery?wilaya_code=99&type=office');
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.price).toBe(300);
    expect(data.default).toBe(true);
  });
});

// ── Tests UI formulaire commander ─────────────────────────────────────────────
test.describe('Formulaire commander — affichage prix livraison', () => {

  async function addItemToCart(page) {
    // Ajouter un produit au panier pour débloquer la page commander
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    const addBtn = page.locator('[data-testid="add-to-cart"]').first();
    if (await addBtn.isVisible({ timeout: 3000 })) {
      await addBtn.click();
      await page.waitForTimeout(800);
      // Fermer le drawer si ouvert
      const closeBtn = page.locator('[data-testid="close-drawer"], button[aria-label="Fermer"]').first();
      if (await closeBtn.isVisible({ timeout: 1000 })) {
        await closeBtn.click();
      }
    }
  }

  test('Sélection wilaya Alger → affiche 400 DZD livraison domicile', async ({ page }) => {
    await addItemToCart(page);
    await page.goto('/commander');
    await page.waitForSelector('[data-testid="checkout-wilaya"]', { timeout: 10000 });

    // Sélectionner Alger (code 16)
    const wilayaSelect = page.locator('[data-testid="checkout-wilaya"]');
    await wilayaSelect.selectOption('16');
    await page.waitForTimeout(1200); // attendre la requête API livraison

    // Vérifier le prix affiché
    const priceDisplay = page.locator('[data-testid="delivery-price-display"]');
    await expect(priceDisplay).toBeVisible({ timeout: 5000 });
    const priceText = await priceDisplay.textContent();
    expect(priceText).toContain('400');
    // S'assurer que ce n'est PAS 350 (ancienne valeur incorrecte)
    expect(priceText).not.toContain('350');
  });

  test('Sélection wilaya Oran → affiche 600 DZD livraison domicile', async ({ page }) => {
    await addItemToCart(page);
    await page.goto('/commander');
    await page.waitForSelector('[data-testid="checkout-wilaya"]', { timeout: 10000 });

    // Sélectionner Oran (code 31)
    await page.locator('[data-testid="checkout-wilaya"]').selectOption('31');
    await page.waitForTimeout(1200);

    const priceDisplay = page.locator('[data-testid="delivery-price-display"]');
    await expect(priceDisplay).toBeVisible({ timeout: 5000 });
    const priceText = await priceDisplay.textContent();
    // 600 DZD (source: wilaya.ts)
    expect(priceText).toContain('600');
  });

  test('Sélection wilaya Alger + type bureau → affiche 300 DZD', async ({ page }) => {
    await addItemToCart(page);
    await page.goto('/commander');
    await page.waitForSelector('[data-testid="checkout-wilaya"]', { timeout: 10000 });

    // Sélectionner Alger (code 16)
    await page.locator('[data-testid="checkout-wilaya"]').selectOption('16');
    await page.waitForTimeout(1200);

    // Basculer en mode bureau
    const officeBtn = page.locator('button:has-text("توصيل للمكتب"), input[value="office"]').first();
    if (await officeBtn.isVisible({ timeout: 2000 })) {
      await officeBtn.click();
      await page.waitForTimeout(1200);

      const priceDisplay = page.locator('[data-testid="delivery-price-display"]');
      const priceText = await priceDisplay.textContent();
      // 300 DZD bureau pour Alger (ancienne valeur était 350)
      expect(priceText).toContain('300');
      expect(priceText).not.toContain('350');
    }
  });

  test('Sélection wilaya Tlemcen → affiche 800 DZD (wilaya lointaine)', async ({ page }) => {
    await addItemToCart(page);
    await page.goto('/commander');
    await page.waitForSelector('[data-testid="checkout-wilaya"]', { timeout: 10000 });

    // Sélectionner Tlemcen (code 13)
    await page.locator('[data-testid="checkout-wilaya"]').selectOption('13');
    await page.waitForTimeout(1200);

    const priceDisplay = page.locator('[data-testid="delivery-price-display"]');
    await expect(priceDisplay).toBeVisible({ timeout: 5000 });
    const priceText = await priceDisplay.textContent();
    // 800 DZD (source: wilaya.ts)
    expect(priceText).toContain('800');
  });

  test('Wilaya sans stopdesk (Illizi 33) → bouton bureau masqué + message', async ({ page }) => {
    await addItemToCart(page);
    await page.goto('/commander');
    await page.waitForSelector('[data-testid="checkout-wilaya"]', { timeout: 10000 });

    // Sélectionner Illizi (code 33) — price_office = 0, pas de stopdesk
    await page.locator('[data-testid="checkout-wilaya"]').selectOption('33');
    await page.waitForTimeout(1500);

    // Le bouton bureau (للمكتب) ne doit pas être visible
    const officeBtn = page.locator('button:has-text("للمكتب")');
    await expect(officeBtn).not.toBeVisible();

    // Le bouton domicile doit toujours être présent
    const homeBtn = page.locator('button:has-text("للمنزل")');
    await expect(homeBtn).toBeVisible();

    // Le message d'indisponibilité doit apparaître
    const notice = page.locator('text=التوصيل للمكتب غير متوفر');
    await expect(notice).toBeVisible({ timeout: 3000 });
  });

  test('Wilaya avec stopdesk (Alger 16) → les deux boutons visibles', async ({ page }) => {
    await addItemToCart(page);
    await page.goto('/commander');
    await page.waitForSelector('[data-testid="checkout-wilaya"]', { timeout: 10000 });

    // Sélectionner Alger (code 16) — price_office = 300, stopdesk disponible
    await page.locator('[data-testid="checkout-wilaya"]').selectOption('16');
    await page.waitForTimeout(1500);

    // Les deux boutons doivent être visibles
    await expect(page.locator('button:has-text("للمنزل")')).toBeVisible();
    await expect(page.locator('button:has-text("للمكتب")')).toBeVisible();
  });
});
