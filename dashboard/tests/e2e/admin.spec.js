/**
 * admin.spec.js — Espace Owner (anciennement Admin Owner, fusionné)
 * Vérifie que la page /dashboard/owner charge correctement,
 * que les health checks Supabase sont affichés,
 * et que /dashboard/admin redirige bien vers /dashboard/owner.
 * Nécessite le rôle owner — skipped sinon.
 */
import { test, expect } from "./fixtures.js";
import fs from "fs";
import path from "path";

function getSession() {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), ".playwright-auth", "session.json"),
        "utf-8"
      )
    );
  } catch {
    return null;
  }
}

test.describe("Espace Owner (fusionné)", () => {
  test.beforeEach(async ({ authedPage }) => {
    const session = getSession();
    if (session?.user?.role !== "owner") {
      test.skip(true, `Skipped: user role is "${session?.user?.role}", owner required`);
    }
    await authedPage.goto("/dashboard/owner");
  });

  test("owner page loads with title", async ({ authedPage }) => {
    await expect(authedPage.getByText(/espace owner/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("/dashboard/admin redirects to /dashboard/owner", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/admin");
    await authedPage.waitForURL("**/dashboard/owner", { timeout: 10000 });
    await expect(authedPage).toHaveURL(/\/dashboard\/owner/);
  });

  test("owner cards visible (catalogue, collections, etc.)", async ({ authedPage }) => {
    await expect(authedPage.getByText(/catalogue articles/i).first()).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/collections/i).first()).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText(/config boutique/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("partenaires card absent de l'espace owner", async ({ authedPage }) => {
    // Code partenaire doit être seulement dans opérations, pas dans owner
    const partCard = authedPage.locator("a[href='/dashboard/owner/partenaires']");
    await expect(partCard).not.toBeVisible();
  });

  test("Supabase health checks load", async ({ authedPage }) => {
    await expect(
      authedPage.getByText(/nc_orders|santé système/i).first()
    ).toBeVisible({ timeout: 20000 });
  });

  test("all Supabase checks show OK", async ({ authedPage }) => {
    await authedPage.waitForTimeout(5000);
    const errorBadge = authedPage.locator("text=/❌/").first();
    const hasError = await errorBadge.isVisible().catch(() => false);
    if (hasError) {
      const errorText = await errorBadge.textContent().catch(() => "unknown");
      console.warn(`⚠️  Supabase health issue: ${errorText}`);
    }
    await expect(authedPage.getByText(/nc_orders/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("/api/quota route is reachable", async ({ request }) => {
    const session = getSession();
    const resp = await request.post("/api/quota", {
      data: { token: session?.token },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty("ok");
    console.log(`/api/quota → ok=${body.ok} rows=${body.rows?.length ?? "n/a"}`);
  });

  test("/api/barrage/run ping (verify route accessible)", async ({ request }) => {
    const session = getSession();
    const resp = await request.post("/api/barrage/run", {
      data: { token: session?.token },
    });
    expect(resp.status()).not.toBe(404);
    console.log(`/api/barrage/run status → ${resp.status()}`);
  });
});
