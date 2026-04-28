// product-zoom.spec.js — T135 : Zoom photo produit (lightbox)
// Simule un vrai humain : navigation → clic image → zoom → fermeture
const { test, expect } = require('@playwright/test');

test.describe('T135 — Zoom photo produit', () => {

  async function getFirstProductSlug(page) {
    await page.goto('/produits');
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 10000 });
    // Le link est un <a> à l'intérieur du data-testid="product-card"
    const firstLink = page.locator('[data-testid="product-card"] a').first();
    await firstLink.waitFor({ state: 'visible' });
    const href = await firstLink.getAttribute('href');
    return href; // ex: /produits/some-slug
  }

  test('T135-1 : Fiche produit affiche le conteneur image', async ({ page }) => {
    const href = await getFirstProductSlug(page);
    await page.goto(href);
    await page.waitForSelector('[data-testid="product-image-container"]', { timeout: 10000 });
    const container = page.locator('[data-testid="product-image-container"]');
    await expect(container).toBeVisible();
  });

  test('T135-2 : Clic sur l\'image ouvre la lightbox', async ({ page }) => {
    const href = await getFirstProductSlug(page);
    await page.goto(href);

    // Attendre le conteneur image (présent dès que les données produit chargent)
    await page.waitForSelector('[data-testid="product-image-container"]', { timeout: 12000 });
    const imageContainer = page.locator('[data-testid="product-image-container"]');
    await expect(imageContainer).toBeVisible();
    // Attendre que l'image Next.js soit rendue (Next.js Image optimise en dev — plus lent qu'un <img> natif)
    await page.waitForSelector('[data-testid="product-image"]', { timeout: 15000 });

    // Simuler un vrai clic humain sur l'image
    await page.waitForTimeout(500);
    await imageContainer.click();

    // La lightbox doit s'ouvrir
    const modal = page.locator('[data-testid="zoom-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Attendre que l'image se charge (naturalWidth > 0 — src direct Supabase CDN)
    await page.waitForTimeout(800);
    const zoomImage = page.locator('[data-testid="zoom-image"]');
    await expect(zoomImage).toBeVisible({ timeout: 8000 });
  });

  test('T135-3 : Bouton X ferme la lightbox', async ({ page }) => {
    const href = await getFirstProductSlug(page);
    await page.goto(href);

    await page.waitForSelector('[data-testid="product-image"]', { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.locator('[data-testid="product-image-container"]').click();

    const modal = page.locator('[data-testid="zoom-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Cliquer sur le bouton fermer
    const closeBtn = page.locator('[data-testid="zoom-close"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Le modal doit être fermé
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('T135-4 : Touche ESC ferme la lightbox (Desktop)', async ({ page }) => {
    const href = await getFirstProductSlug(page);
    await page.goto(href);

    await page.waitForSelector('[data-testid="product-image"]', { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.locator('[data-testid="product-image-container"]').click();

    const modal = page.locator('[data-testid="zoom-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Appuyer sur Escape
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('T135-5 : Clic fond ferme la lightbox', async ({ page }) => {
    const href = await getFirstProductSlug(page);
    await page.goto(href);

    await page.waitForSelector('[data-testid="product-image"]', { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.locator('[data-testid="product-image-container"]').click();

    const modal = page.locator('[data-testid="zoom-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Cliquer sur le fond (pas l'image) pour fermer
    await modal.click({ position: { x: 10, y: 10 } });
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('T135-LOAD : Image fiche produit réellement chargée (naturalWidth > 0)', async ({ page }) => {
    const href = await getFirstProductSlug(page);
    await page.goto(href);

    await page.waitForSelector('[data-testid="product-image"]', { timeout: 12000 });
    await page.waitForTimeout(1500);

    const img = page.locator('[data-testid="product-image"]');
    await expect(img).toBeVisible();

    // L'image doit pointer vers Supabase Storage (pas /_next/image — unoptimized=true)
    const src = await img.getAttribute('src');
    expect(src).toContain('supabase.co');

    // L'image doit être réellement chargée — naturalWidth > 0
    const naturalWidth = await img.evaluate((el) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('T135-6 : Zoom fonctionne sur mobile (375px)', async ({ page }) => {
    const href = await getFirstProductSlug(page);
    await page.goto(href);

    await page.waitForSelector('[data-testid="product-image"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Clic sur l'image (tap sur mobile, click sur desktop)
    const container = page.locator('[data-testid="product-image-container"]');
    try {
      await container.tap();
    } catch {
      await container.click();
    }

    const modal = page.locator('[data-testid="zoom-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // L'image zoomée doit être visible
    await expect(page.locator('[data-testid="zoom-image"]')).toBeVisible();

    // Fermer
    const closeBtn = page.locator('[data-testid="zoom-close"]');
    try {
      await closeBtn.tap();
    } catch {
      await closeBtn.click();
    }
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});
