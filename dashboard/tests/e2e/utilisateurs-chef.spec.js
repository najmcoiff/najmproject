/**
 * utilisateurs-chef.spec.js
 * Régression : le compte "chef d'equipe" doit pouvoir ajouter un utilisateur
 * Bug corrigé : _checkOwner → _checkManager (autorise aussi "chef")
 *
 * Flux humain simulé :
 *   1. Connexion en tant que soheib (chef d'equipe réel)
 *   2. Navigation → /dashboard/utilisateurs
 *   3. Clic "Ajouter" → remplir le formulaire → "Créer l'utilisateur"
 *   4. Vérifier qu'aucun message "Session expirée" n'apparaît
 *   5. Vérifier que le toast "Utilisateur créé ✓" est visible
 *   6. Vérifier que l'utilisateur est bien dans nc_users (DB)
 *   7. Cleanup : désactiver le compte de test créé
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE    = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";
const SB_URL  = "https://alyxejkdtkdmluvgfnqk.supabase.co";
const SB_KEY  =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";

// Chef d'équipe existant en production
const CHEF_NOM      = "soheib";
const CHEF_PASSWORD = "soheib123";

// Compte de test à créer puis supprimer
const NEW_USER_NOM  = "test_newuser_playwright";
const NEW_USER_PWD  = "testpw2026!";

async function sbQuery(table, qs = "") {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${qs ? "?" + qs : ""}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return res.json();
}

async function cleanupTestUser(ownerToken) {
  if (!ownerToken) return;
  await fetch(`${BASE}/api/admin/users`, {
    method:  "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    body:    JSON.stringify({ nom: NEW_USER_NOM }),
  }).catch(() => {});
}

function loadOwnerToken() {
  try {
    const s = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), ".playwright-auth", "session.json"), "utf-8")
    );
    return s.token;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
test.describe("Chef d'équipe — gestion utilisateurs (bug fix)", () => {
  let ownerToken = null;

  test.beforeAll(async () => {
    ownerToken = loadOwnerToken();
    // Nettoyage préventif si un run précédent a laissé le compte
    await cleanupTestUser(ownerToken);
  });

  test.afterAll(async () => {
    await cleanupTestUser(ownerToken);
    console.log("🧹 Cleanup compte test terminé");
  });

  // ── Test 1 : chef d'équipe peut se connecter ────────────────
  test("soheib (chef d equipe) peut se connecter au dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Votre identifiant")).toBeVisible({ timeout: 15000 });

    await page.getByPlaceholder("Votre identifiant").fill(CHEF_NOM);
    await page.waitForTimeout(300);
    await page.getByPlaceholder("••••••••").fill(CHEF_PASSWORD);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Se connecter/i }).click();

    await page.waitForURL("**/dashboard**", { timeout: 20000 });
    await expect(page).toHaveURL(/dashboard/);
    console.log("✅ Connexion soheib (chef d'equipe) réussie");
  });

  // ── Test 2 : accès à la page utilisateurs ──────────────────
  test("chef d equipe voit la page gestion utilisateurs (pas 'Acces reserve')", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Votre identifiant").fill(CHEF_NOM);
    await page.getByPlaceholder("••••••••").fill(CHEF_PASSWORD);
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 20000 });

    await page.goto("/dashboard/utilisateurs");
    await page.waitForTimeout(2000);

    // Ne doit PAS voir "Accès réservé aux managers"
    const locked = page.getByText(/Accès réservé aux managers/i);
    const isLocked = await locked.isVisible().catch(() => false);
    expect(isLocked, "Chef d'équipe ne doit pas voir 'Accès réservé'").toBe(false);

    // Doit voir la page
    await expect(page.getByText(/Gestion des utilisateurs/i).first()).toBeVisible({ timeout: 10000 });
    console.log("✅ Chef d'equipe a accès à la page utilisateurs");
  });

  // ── Test 3 : AJOUTER un utilisateur — bug fix principal ────
  test("chef d equipe ajoute un utilisateur sans erreur 'Session expiree'", async ({ page }) => {
    // Login en tant que chef d'equipe
    await page.goto("/");
    await page.getByPlaceholder("Votre identifiant").fill(CHEF_NOM);
    await page.getByPlaceholder("••••••••").fill(CHEF_PASSWORD);
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 20000 });

    // Naviguer vers gestion utilisateurs
    await page.goto("/dashboard/utilisateurs");
    await expect(page.getByText(/Gestion des utilisateurs/i).first()).toBeVisible({ timeout: 15000 });

    // Clic "Ajouter"
    await page.getByRole("button", { name: /Ajouter/i }).click();
    await page.waitForTimeout(500);

    // Vérifier que le modal s'ouvre
    await expect(page.getByText(/Nouvel utilisateur/i).first()).toBeVisible({ timeout: 5000 });

    // Remplir : Nom
    await page.getByPlaceholder(/Ahmed Benali/i).fill(NEW_USER_NOM);
    await page.waitForTimeout(300);

    // Rôle : agent digital (chef d'equipe ne peut pas choisir owner)
    const roleSelect = page.locator("select").first();
    await roleSelect.selectOption("agent digital");
    await page.waitForTimeout(300);

    // Mot de passe
    await page.getByPlaceholder(/Mot de passe pour se connecter/i).fill(NEW_USER_PWD);
    await page.waitForTimeout(300);

    // Soumettre
    await page.getByRole("button", { name: /Créer l'utilisateur/i }).click();
    await page.waitForTimeout(4000);

    // ── Vérifier l'absence du message d'erreur ──────────────
    const errMsg = page.getByText(/Session expir/i);
    const hasErr = await errMsg.isVisible().catch(() => false);
    expect(hasErr, "❌ 'Session expirée' ne doit plus apparaître pour un chef d'equipe").toBe(false);

    // Toast de succès OU fermeture du modal = succès
    const toastOk = page.getByText(/Utilisateur créé/i);
    const toastVisible = await toastOk.isVisible({ timeout: 5000 }).catch(() => false);
    const modalGone  = !(await page.getByText(/Nouvel utilisateur/i).isVisible().catch(() => false));

    expect(toastVisible || modalGone,
      "L'utilisateur doit être créé : toast de succès ou fermeture du modal attendu"
    ).toBe(true);

    console.log(`✅ Chef d'equipe a créé '${NEW_USER_NOM}' sans erreur`);
  });

  // ── Test 4 : vérification base de données ────────────────────
  test("utilisateur cree par chef d equipe present dans nc_users", async () => {
    // Petit délai pour laisser la DB se synchroniser
    await new Promise(r => setTimeout(r, 1000));

    const rows = await sbQuery("nc_users", `nom=eq.${NEW_USER_NOM}&select=nom,role,active`);
    console.log("DB check nc_users:", JSON.stringify(rows));

    expect(Array.isArray(rows) && rows.length > 0,
      `L'utilisateur '${NEW_USER_NOM}' doit être dans nc_users après création`
    ).toBe(true);
    expect(rows[0].active, "L'utilisateur créé doit être actif").toBe(true);
    console.log(`✅ DB confirmé: '${NEW_USER_NOM}' actif (role: ${rows[0].role})`);
  });

  // ── Test 5 : connexion avec le compte nouvellement créé ─────
  test("login avec le compte cree par chef d equipe fonctionne", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Votre identifiant")).toBeVisible({ timeout: 15000 });

    // Connexion avec le nouveau compte créé par soheib
    await page.getByPlaceholder("Votre identifiant").fill(NEW_USER_NOM);
    await page.waitForTimeout(300);
    await page.getByPlaceholder("••••••••").fill(NEW_USER_PWD);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Se connecter/i }).click();

    // Doit rediriger vers le dashboard (pas d'erreur serveur)
    await page.waitForURL("**/dashboard**", { timeout: 20000 });
    await expect(page).toHaveURL(/dashboard/);

    // Vérifier qu'aucun message d'erreur n'apparaît
    const errToast = page.locator(".bg-red-600");
    const hasErr = await errToast.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasErr, "Aucune erreur ne doit apparaître lors de la connexion").toBe(false);

    console.log(`✅ Connexion avec '${NEW_USER_NOM}' (créé par chef d'equipe) réussie`);
  });

  // ── Test 7 : l'option 'owner' est masquée pour chef d'équipe ──
  test("option owner absente du select role pour chef d equipe", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Votre identifiant").fill(CHEF_NOM);
    await page.getByPlaceholder("••••••••").fill(CHEF_PASSWORD);
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 20000 });

    await page.goto("/dashboard/utilisateurs");
    await expect(page.getByText(/Gestion des utilisateurs/i).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /Ajouter/i }).click();
    await page.waitForTimeout(500);

    const roleSelect = page.locator("select").first();
    const options = await roleSelect.locator("option").allTextContents();
    const hasOwner = options.some(o => o.toLowerCase() === "owner");
    expect(hasOwner, "L'option 'owner' ne doit pas être disponible pour un chef d'equipe").toBe(false);
    console.log("✅ Option 'owner' correctement masquée pour chef d'equipe. Options:", options.join(", "));
  });
});
