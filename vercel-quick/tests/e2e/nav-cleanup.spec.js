/**
 * nav-cleanup.spec.js — Test humain navigation dashboard
 *
 * Vérifie que :
 * 1. Stock + Collections dans le menu principal (tous agents)
 * 2. Utilisateurs dans le menu principal (owner + chef d'equipe)
 * 3. War Room + Campagnes absents du menu principal (owner seulement via Espace Owner)
 * 4. Le menu Owner contient War Room, Campagnes, Utilisateurs, Stock, Collections
 * 5. La page Owner affiche les cartes de raccourcis
 */
import { test, expect } from "./fixtures.js";

test.describe.configure({ mode: "serial" });

test.describe("Navigation allégée — T_NAV_CLEANUP", () => {

  // ── Test 1 : menu principal — Stock + Collections visibles, War Room / Campagnes absents ──
  test("NAV-1 : menu principal contient Stock/Collections/Utilisateurs mais pas War Room/Campagnes", async ({ authedPage }) => {
    await authedPage.goto("/dashboard");
    await authedPage.waitForTimeout(2000);

    // Attendre que la sidebar soit visible
    const sidebar = authedPage.locator("aside").first();
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Stock + Collections doivent être dans le menu principal (tous agents)
    await expect(sidebar.getByRole("link", { name: /^Stock$/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /^Collections$/ })).toBeVisible();

    // Utilisateurs doit être visible (connecté en owner)
    await expect(sidebar.getByRole("link", { name: /^Utilisateurs$/ })).toBeVisible();

    // War Room + Campagnes restent dans Espace Owner uniquement
    await expect(sidebar.getByRole("link", { name: /War Room/i })).not.toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Campagnes/i })).not.toBeVisible();

    // Ces liens de base doivent toujours être présents
    await expect(sidebar.getByRole("link", { name: /Confirmation/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Bon de commande/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Discussions/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Espace Owner/ })).toBeVisible();

    console.log("✅ Menu principal : Stock + Collections + Utilisateurs présents, War Room + Campagnes absents");
  });

  // ── Test 2 : navigation vers Espace Owner ───────────────────────────
  test("NAV-2 : clic Espace Owner ouvre l'espace owner", async ({ authedPage }) => {
    await authedPage.goto("/dashboard");
    await authedPage.waitForTimeout(2000);

    // Cliquer sur Espace Owner dans le menu principal
    await authedPage.getByRole("link", { name: /Espace Owner/ }).first().click();
    await authedPage.waitForTimeout(1500);
    await expect(authedPage).toHaveURL(/\/dashboard\/owner/, { timeout: 10000 });

    console.log("✅ Navigation vers Espace Owner réussie");
  });

  // ── Test 3 : menu Owner contient War Room, Utilisateurs, Stock, Collections ──
  test("NAV-3 : menu Owner contient War Room, Utilisateurs, Stock, Collections", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner");
    await authedPage.waitForTimeout(2000);

    // La sidebar owner est la deuxième (après la sidebar principale)
    const ownerSidebar = authedPage.locator("aside").nth(1);
    await expect(ownerSidebar).toBeVisible({ timeout: 15000 });

    // Ces items doivent être dans le menu owner
    await expect(ownerSidebar.getByRole("link", { name: /War Room/i })).toBeVisible();
    await expect(ownerSidebar.getByRole("link", { name: /Utilisateurs/i })).toBeVisible();
    await expect(ownerSidebar.getByRole("link", { name: /Stock/i })).toBeVisible();
    await expect(ownerSidebar.getByRole("link", { name: /Collections/i })).toBeVisible();

    // Documentation doit avoir été retiré
    await expect(ownerSidebar.getByRole("link", { name: /Documentation/ })).not.toBeVisible();

    console.log("✅ Menu Owner: War Room + Utilisateurs + Stock + Collections présents, Documentation absent");
  });

  // ── Test 4 : page Owner affiche les cartes ──────────────────────────
  test("NAV-4 : page Owner affiche les cartes War Room et Utilisateurs", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner");
    await authedPage.waitForTimeout(2000);

    // Les cartes doivent être visibles dans le contenu principal
    await expect(authedPage.getByText("War Room").first()).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText("Utilisateurs").first()).toBeVisible();

    console.log("✅ Page Owner: cartes War Room + Utilisateurs visibles");
  });

  // ── Test 5 : clic War Room navigue correctement ─────────────────────
  test("NAV-5 : clic War Room dans menu owner navigue vers /owner/marketing", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner");
    await authedPage.waitForTimeout(2000);

    const ownerSidebar = authedPage.locator("aside").nth(1);
    await expect(ownerSidebar).toBeVisible({ timeout: 15000 });

    // Simuler clic humain sur War Room
    await ownerSidebar.getByRole("link", { name: /War Room/i }).click();
    await authedPage.waitForTimeout(1500);
    await expect(authedPage).toHaveURL(/\/dashboard\/owner\/marketing/, { timeout: 10000 });

    console.log("✅ War Room → /dashboard/owner/marketing ✓");
  });

  // ── Test 6 : clic Utilisateurs navigue correctement ─────────────────
  test("NAV-6 : clic Utilisateurs dans menu owner navigue vers /utilisateurs", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner");
    await authedPage.waitForTimeout(2000);

    const ownerSidebar = authedPage.locator("aside").nth(1);
    await expect(ownerSidebar).toBeVisible({ timeout: 15000 });

    await ownerSidebar.getByRole("link", { name: /Utilisateurs/ }).click();
    await authedPage.waitForTimeout(1500);
    await expect(authedPage).toHaveURL(/\/dashboard\/utilisateurs/, { timeout: 10000 });

    console.log("✅ Utilisateurs → /dashboard/utilisateurs ✓");
  });

});
