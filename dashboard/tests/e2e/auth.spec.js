/**
 * auth.spec.js — Test humain Login / Logout
 *
 * Tests sans session sauvegardée — teste le flux de connexion UI complet.
 */
import { test, expect } from "@playwright/test";

const USERNAME = process.env.E2E_USERNAME || "najm";
const PASSWORD = process.env.E2E_PASSWORD || "admin123";

test.describe("Authentification — login / logout humain", () => {

  // ── Test 1 : la page de login s'affiche correctement ────────
  test("la page de login s'affiche avec tous les champs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Najm/i, { timeout: 15000 });
    await expect(page.getByPlaceholder("Votre identifiant")).toBeVisible();
    await expect(page.getByPlaceholder("••••••••")).toBeVisible();
    await expect(page.getByRole("button", { name: /Se connecter/i })).toBeVisible();
  });

  // ── Test 2 : mauvais mot de passe → erreur visible ──────────
  test("mauvais mot de passe affiche une erreur visible", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Votre identifiant").fill(USERNAME);
    await page.getByPlaceholder("••••••••").fill("MAUVAIS_MDP_TEST_XYZ");
    await page.getByRole("button", { name: /Se connecter/i }).click();

    // Attendre que le bouton redevienne actif (requête terminée)
    await expect(page.getByRole("button", { name: /Se connecter/i })).toBeEnabled({ timeout: 12000 });

    // Un message d'erreur doit être visible — le toast bg-red-600
    const toastRed = page.locator(".bg-red-600").first();
    await expect(toastRed).toBeVisible({ timeout: 8000 });

    // On doit rester sur la page de login
    await expect(page).toHaveURL("/");
  });

  // ── Test 3 : identifiant inexistant → erreur ─────────────────
  test("identifiant inexistant affiche une erreur", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Votre identifiant").fill("AGENT_INEXISTANT_XYZ99");
    await page.getByPlaceholder("••••••••").fill("password");
    await page.getByRole("button", { name: /Se connecter/i }).click();

    await expect(page.getByRole("button", { name: /Se connecter/i })).toBeEnabled({ timeout: 12000 });
    const errorMsg = page.getByText(/incorrect|invalide|mot de passe|identifiant/i).first();
    await expect(errorMsg).toBeVisible({ timeout: 8000 });
  });

  // ── Test 4 : connexion correcte → redirige vers dashboard ───
  test("connexion correcte redirige vers le dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Votre identifiant").fill(USERNAME);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: /Se connecter/i }).click();

    // Redirection vers /dashboard
    await page.waitForURL("**/dashboard**", { timeout: 20000 });
    await expect(page).toHaveURL(/dashboard/);

    // La sidebar / header du dashboard est visible
    await expect(
      page.getByText(/Najm Coiff|dashboard|NajmCoiff/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Test 5 : session persistante — rechargement reste loggé ──
  test("rechargement de page reste authentifié", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Votre identifiant").fill(USERNAME);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 20000 });

    // Recharger la page
    await page.reload();
    await page.waitForTimeout(2000);

    // Doit rester sur le dashboard, pas redirigé vers login
    const onDashboard = page.url().includes("dashboard");
    const onLogin = page.url() === page.url().replace(/\/dashboard.*/, "/");
    console.log(`Après reload: URL=${page.url()}`);
    expect(onDashboard || !onLogin, "Doit rester authentifié après reload").toBe(true);
  });

  // ── Test 6 : déconnexion redirige vers login ─────────────────
  test("déconnexion redirige vers la page de login", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Votre identifiant").fill(USERNAME);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 20000 });

    // Trouver et cliquer le bouton de déconnexion
    const logoutBtn = page.getByText(/déconnexion|logout|se déconnecter/i).first()
      .or(page.getByRole("button", { name: /déconnexion|logout/i }).first());

    await expect(logoutBtn).toBeVisible({ timeout: 8000 });
    await logoutBtn.click();

    // Doit revenir sur la page login
    await page.waitForURL("/", { timeout: 10000 });
    await expect(page.getByPlaceholder("Votre identifiant")).toBeVisible({ timeout: 8000 });
  });
});
