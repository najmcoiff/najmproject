/**
 * Test: PWA Icon Fix
 * Vérifie que le manifest.json déclare les bonnes icônes avec les bonnes dimensions
 * et que les fichiers d'icônes sont accessibles sur prod.
 */
const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://najmcoiffdashboard.vercel.app';

test('manifest.json - icônes correctement dimensionnées et séparées', async ({ page }) => {
  const res = await page.goto(`${BASE_URL}/manifest.json`);
  expect(res.status()).toBe(200);

  const manifest = await res.json();

  // Doit avoir 3 icônes
  expect(manifest.icons).toHaveLength(3);

  // icon-192.png - purpose "any"
  const icon192 = manifest.icons.find(i => i.sizes === '192x192');
  expect(icon192).toBeTruthy();
  expect(icon192.src).toContain('icon-192.png');
  expect(icon192.purpose).toBe('any');

  // icon-512.png - purpose "any"
  const icon512any = manifest.icons.find(i => i.src.includes('icon-512.png'));
  expect(icon512any).toBeTruthy();
  expect(icon512any.purpose).toBe('any');

  // icon-maskable-512.png - purpose "maskable" séparé
  const iconMaskable = manifest.icons.find(i => i.src.includes('icon-maskable-512.png'));
  expect(iconMaskable).toBeTruthy();
  expect(iconMaskable.purpose).toBe('maskable');
  expect(iconMaskable.sizes).toBe('512x512');

  // Aucune icône ne doit déclarer "maskable" avec logo.png directement
  const badMaskable = manifest.icons.find(i => i.src === '/logo.png' && i.purpose && i.purpose.includes('maskable'));
  expect(badMaskable).toBeUndefined();
});

test('icon-192.png accessible avec content-type PNG', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/icon-192.png`);
  expect(res.status()).toBe(200);
  const contentType = res.headers()['content-type'];
  expect(contentType).toContain('image/png');
  // Vérifier la taille du body (un PNG 192x192 fait > 1Ko)
  const body = await res.body();
  expect(body.length).toBeGreaterThan(1000);
});

test('icon-512.png accessible avec content-type PNG', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/icon-512.png`);
  expect(res.status()).toBe(200);
  const contentType = res.headers()['content-type'];
  expect(contentType).toContain('image/png');
  const body = await res.body();
  expect(body.length).toBeGreaterThan(5000);
});

test('icon-maskable-512.png accessible avec content-type PNG', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/icon-maskable-512.png`);
  expect(res.status()).toBe(200);
  const contentType = res.headers()['content-type'];
  expect(contentType).toContain('image/png');
  const body = await res.body();
  expect(body.length).toBeGreaterThan(5000);
});

test('layout.js - apple-touch-icon pointe vers icon-192.png', async ({ page }) => {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForTimeout(2000);

  // Vérifier que le apple-touch-icon est bien icon-192.png
  const appleTouchIcon = await page.evaluate(() => {
    const link = document.querySelector('link[rel="apple-touch-icon"]');
    return link ? link.getAttribute('href') : null;
  });
  expect(appleTouchIcon).toContain('icon-192.png');
});
