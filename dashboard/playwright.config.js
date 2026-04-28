import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// Charger .env.e2e si présent
try {
  const env = readFileSync(resolve(process.cwd(), ".env.e2e"), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {}

const BASE_URL = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout:  45_000,
  expect:   { timeout: 15_000 },
  fullyParallel: false,
  retries:  1,
  workers:  1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
  ],

  use: {
    baseURL:    BASE_URL,
    trace:      "retain-on-failure",
    screenshot: "only-on-failure",
    video:      "retain-on-failure",
    headless:   true,
    locale:     "fr-FR",
    timezoneId: "Africa/Algiers",
  },

  projects: [
    { name: "setup", testMatch: "**/auth.setup.js" },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: ["**/auth.setup.js", "**/auth.spec.js"],
    },
    {
      name: "auth",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/auth.spec.js",
    },
  ],
});
