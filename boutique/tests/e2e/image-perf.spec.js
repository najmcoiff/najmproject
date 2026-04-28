// image-perf.spec.js — T_IMG_PERF : Images produit (unoptimized — Supabase CDN direct)
// images.unoptimized=true dans next.config.mjs : Vercel retournait 402 sur /_next/image
// Les images sont servies directement depuis Supabase Storage CDN
const { test, expect } = require('@playwright/test');

test.describe('T_IMG_PERF — Images boutique (Supabase CDN direct)', () => {

  test('PERF-1 : Images produits présentes dans le catalogue', async ({ page }) => {
    await page.goto('/collections/coiffure', { timeout: 60000 });
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 20000 });
    await page.waitForTimeout(1500);

    const productImages = page.locator('[data-testid="product-card"] img');
    const count = await productImages.count();
    expect(count).toBeGreaterThan(0);

    // Les images doivent pointer vers Supabase Storage
    const firstSrc = await productImages.first().getAttribute('src');
    expect(firstSrc).toBeTruthy();
    expect(firstSrc).toContain('supabase.co');
  });

  test('PERF-2 : Images produits chargent correctement (naturalWidth > 0)', async ({ page }) => {
    await page.goto('/collections/coiffure');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const productImages = page.locator('[data-testid="product-card"] img');
    const count = await productImages.count();
    expect(count).toBeGreaterThan(0);

    // Vérifier que la première image est bien chargée (naturalWidth > 0)
    const naturalWidth = await productImages.first().evaluate((img) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('PERF-3 : Images présentes sur la page collections', async ({ page }) => {
    await page.goto('/collections/coiffure');
    await page.waitForTimeout(3000);

    const allImgs = page.locator('img');
    const cnt = await allImgs.count();
    expect(cnt).toBeGreaterThan(0);
  });

  test('PERF-4 : Image principale fiche produit visible et chargée', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.waitForTimeout(800);

    const firstLink = page.locator('[data-testid="product-card"] a').first();
    const href = await firstLink.getAttribute('href');
    expect(href).toBeTruthy();

    await page.goto(href);
    await page.waitForSelector('[data-testid="product-image"]', { timeout: 12000 });
    await page.waitForTimeout(1000);

    const img = page.locator('[data-testid="product-image"]');
    await expect(img).toBeVisible();

    // L'image doit pointer vers Supabase Storage
    const src = await img.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toContain('supabase.co');

    // L'image doit être réellement chargée (naturalWidth > 0)
    const naturalWidth = await img.evaluate((el) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('PERF-5 : Images hors-fold sont lazy-loaded', async ({ page }) => {
    await page.goto('/collections/coiffure');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const productImages = page.locator('[data-testid="product-card"] img');
    const count = await productImages.count();

    if (count > 8) {
      const ninthImg = productImages.nth(8);
      const loading = await ninthImg.getAttribute('loading');
      expect(loading).toBe('lazy');
    }
  });

  test('PERF-6 : Toutes les images fiche produit pointent vers Supabase', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const firstLink = page.locator('[data-testid="product-card"] a').first();
    const href = await firstLink.getAttribute('href');
    await page.goto(href);

    await page.waitForSelector('[data-testid="product-image"]', { timeout: 12000 });
    await page.waitForTimeout(600);

    const allImgs = page.locator('img[src*="supabase.co"]');
    const cnt = await allImgs.count();
    expect(cnt).toBeGreaterThan(0);
  });

  test('PERF-7 : Zoom lightbox — image chargée correctement', async ({ page }) => {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const firstLink = page.locator('[data-testid="product-card"] a').first();
    const href = await firstLink.getAttribute('href');
    await page.goto(href);

    await page.waitForSelector('[data-testid="product-image"]', { timeout: 12000 });
    await page.waitForTimeout(600);

    const container = page.locator('[data-testid="product-image-container"]');
    await expect(container).toBeVisible();
    await container.click();

    const modal = page.locator('[data-testid="zoom-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const zoomImg = page.locator('[data-testid="zoom-image"]');
    await expect(zoomImg).toBeVisible();

    // L'image zoom doit être chargée (naturalWidth > 0)
    const naturalWidth = await zoomImg.evaluate((el) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);

    await page.locator('[data-testid="zoom-close"]').click();
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

});
