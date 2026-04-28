// playwright.config.js — nc-boutique
// Référence : docs/boutique/TROUBLESHOOT.md pour les erreurs courantes
// Usage : npx playwright test (depuis nc-boutique/)

const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-DZ',
    timezoneId: 'Africa/Algiers',
  },

  projects: [
    {
      name: 'Mobile Chrome (375px)',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Démarrer le serveur Next.js si pas déjà lancé
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev -- --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
