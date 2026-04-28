/**
 * campaigns-removed.spec.js — Test humain suppression page Campagnes
 *
 * Vérifie que :
 * 1. /dashboard/owner/campaigns retourne 404 (page supprimée)
 * 2. Le menu Owner ne contient plus "Campagnes"
 * 3. La page Owner ne contient plus la carte "Campagnes"
 * 4. War Room est toujours accessible et fonctionnel
 */
import { test, expect } from "./fixtures.js";

test.describe.configure({ mode: "serial" });

test.describe("Suppression page Campagnes — T_CAMPAIGNS_REMOVED", () => {

  // ── Test 1 : /dashboard/owner/campaigns → 404 ───────────────────────
  test("CAM-1 : /dashboard/owner/campaigns affiche une page 404", async ({ authedPage }) => {
    const resp = await authedPage.goto("/dashboard/owner/campaigns");
    await authedPage.waitForTimeout(1500);

    // La page doit être une 404 (Next.js _not-found) ou rediriger
    const url = authedPage.url();
    const bodyText = await authedPage.locator("body").innerText();

    // Soit la réponse HTTP est 404, soit le contenu indique que la page n'existe pas
    const is404 = (resp && resp.status() === 404) ||
                  bodyText.includes("404") ||
                  bodyText.includes("not found") ||
                  bodyText.includes("Not Found") ||
                  bodyText.includes("page introuvable") ||
                  url.includes("_not-found");

    expect(is404, `La page campaigns devrait retourner 404, URL: ${url}`).toBe(true);
    console.log(`✅ /dashboard/owner/campaigns → 404 confirmé (status: ${resp?.status()}, url: ${url})`);
  });

  // ── Test 2 : menu Owner n'affiche plus Campagnes ─────────────────────
  test("CAM-2 : menu Owner ne contient plus le lien Campagnes", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner");
    await authedPage.waitForTimeout(2000);

    const ownerSidebar = authedPage.locator("aside").nth(1);
    await expect(ownerSidebar).toBeVisible({ timeout: 15000 });

    // Campagnes ne doit plus être dans le menu
    await expect(ownerSidebar.getByRole("link", { name: /Campagnes/i })).not.toBeVisible();

    // War Room doit toujours être là
    await expect(ownerSidebar.getByRole("link", { name: /War Room/i })).toBeVisible();

    console.log("✅ Menu Owner: Campagnes absent, War Room présent");
  });

  // ── Test 3 : page Owner n'affiche plus la carte Campagnes ───────────
  test("CAM-3 : page Owner ne contient plus la carte Campagnes", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner");
    await authedPage.waitForTimeout(2000);

    // La carte Campagnes ne doit plus exister dans les raccourcis
    const campagnesCards = authedPage.locator("a[href='/dashboard/owner/campaigns']");
    await expect(campagnesCards).toHaveCount(0);

    // La carte War Room doit toujours être présente (first = sidebar nav)
    await expect(authedPage.locator("a[href='/dashboard/owner/marketing']").first()).toBeVisible();

    console.log("✅ Page Owner: carte Campagnes supprimée, carte War Room présente");
  });

  // ── Test 4 : War Room toujours accessible ───────────────────────────
  test("CAM-4 : War Room toujours accessible via menu Owner", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner");
    await authedPage.waitForTimeout(2000);

    const ownerSidebar = authedPage.locator("aside").nth(1);
    await expect(ownerSidebar).toBeVisible({ timeout: 15000 });

    // Cliquer sur War Room
    await ownerSidebar.getByRole("link", { name: /War Room/i }).click();
    await authedPage.waitForTimeout(1500);

    await expect(authedPage).toHaveURL(/\/dashboard\/owner\/marketing/, { timeout: 10000 });

    // La page War Room doit se charger sans erreur
    const heading = authedPage.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    console.log("✅ War Room accessible et chargé correctement");
  });

});
