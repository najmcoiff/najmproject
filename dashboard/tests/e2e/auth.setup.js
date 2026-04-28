/**
 * auth.setup.js — Playwright global setup
 * Logs in via /api/auth/login, saves session to .playwright-auth/session.json
 * All authenticated test specs read this file via the `authedPage` fixture.
 */
import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const SESSION_FILE = path.join(process.cwd(), ".playwright-auth", "session.json");

setup("authenticate — save session for E2E tests", async ({ request }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;

  // Si la session existe déjà et que le token n'est pas expiré → réutiliser
  if (!username || !password) {
    try {
      const existing = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      const [payloadB64] = (existing.token || "").split(".");
      const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));
      if (payload.exp && payload.exp > Date.now()) {
        console.log(`✅ Auth setup: réutilisation session existante (${existing.user?.nom})`);
        return;
      }
    } catch { /* session absente ou invalide — continuer */ }
    throw new Error(
      "E2E_USERNAME and E2E_PASSWORD environment variables are required.\n" +
      "Set them in .env.e2e or export them before running tests."
    );
  }

  const resp = await request.post("/api/auth/login", {
    data: { username, password },
  });

  expect(resp.status(), "Login API should return 200").toBe(200);

  const body = await resp.json();
  expect(body.ok, `Login failed: ${body.error}`).toBe(true);
  expect(body.token, "Token should be present").toBeTruthy();

  // Persist session for test fixtures
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify({ token: body.token, user: body.user }, null, 2)
  );

  console.log(`✅ Auth setup: logged in as ${body.user?.nom} (${body.user?.role})`);
});
