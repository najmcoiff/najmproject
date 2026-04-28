// banner-text.spec.js — Vérification texte banner supérieur
// Vérifie que le texte "منتجات أصلية" apparaît bien dans le banner de la page d'accueil

const { test, expect } = require('@playwright/test');

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://www.najmcoiff.com';

test('banner supérieur contient منتجات أصلية', async ({ page }) => {
  // Naviguer sur la page d'accueil comme un vrai utilisateur
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Vérifier que le texte arabe correct est présent dans le banner
  const bannerText = await page.locator('text=منتجات أصلية').first();
  await expect(bannerText).toBeVisible();

  // Vérifier que l'ancien texte n'est plus présent
  const oldText = page.locator('text=منتج أصلي مضمون');
  await expect(oldText).toHaveCount(0);
});
