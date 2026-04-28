/**
 * utilisateurs-chef-self-password.spec.js
 * Régression : un chef d'équipe DOIT pouvoir modifier SON PROPRE mot de passe.
 *
 * Bug initial : `canModify(targetUser)` retournait false dès que
 * `targetUser.nom === session.nom`, ce qui masquait aussi le bouton 🔑.
 * Fix : `canChangePassword(targetUser)` autorise self ; `canModify` reste
 * strict (pas de changement de rôle / pas de désactivation sur soi-même).
 *
 * Flux humain simulé (compte chef temporaire — jamais touche soheib) :
 *   1. beforeAll : owner crée un chef d'équipe jetable via /api/admin/users
 *   2. Le chef se connecte via le formulaire (typing humain + delays)
 *   3. Navigue vers /dashboard/utilisateurs
 *   4. Sa propre ligne est marquée "Vous" → 🔑 visible, ✏️ et 🗑️ absents
 *   5. Clique 🔑 → remplit nouveau mdp + confirmation → Enregistrer
 *   6. Toast "Mot de passe mis à jour ✓"
 *   7. Logout (clear localStorage) → relogin avec le NOUVEAU mdp → /dashboard
 *   8. afterAll : owner désactive le compte chef temporaire
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE   = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";
const SB_URL = "https://alyxejkdtkdmluvgfnqk.supabase.co";
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";

const TEMP_CHEF_NOM   = "test_chef_selfpwd_pw";
const TEMP_CHEF_PWD_1 = "chefpw2026!";
const TEMP_CHEF_PWD_2 = "newpw2026?changed";
const TEMP_CHEF_ROLE  = "chef d'equipe";

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

async function createTempChef(ownerToken, password) {
  if (!ownerToken) throw new Error("Owner token absent (.playwright-auth/session.json)");
  const res = await fetch(`${BASE}/api/admin/users`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    body:    JSON.stringify({ nom: TEMP_CHEF_NOM, role: TEMP_CHEF_ROLE, password }),
  });
  return res.json();
}

async function deleteTempChef(ownerToken) {
  if (!ownerToken) return;
  await fetch(`${BASE}/api/admin/users`, {
    method:  "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    body:    JSON.stringify({ nom: TEMP_CHEF_NOM }),
  }).catch(() => {});
}

async function sbQuery(table, qs = "") {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${qs ? "?" + qs : ""}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return res.json();
}

async function humanLogin(page, nom, password) {
  await page.goto("/");
  await expect(page.getByPlaceholder("Votre identifiant")).toBeVisible({ timeout: 15000 });

  await page.getByPlaceholder("Votre identifiant").fill(nom);
  await page.waitForTimeout(350);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /Se connecter/i }).click();

  await page.waitForURL("**/dashboard**", { timeout: 20000 });
}

async function logout(page) {
  await page.evaluate(() => {
    try { localStorage.removeItem("nc_session"); } catch {}
    try { sessionStorage.removeItem("nc_session"); } catch {}
  });
}

// ────────────────────────────────────────────────────────────────
test.describe("Chef d'équipe — self-password (bug fix)", () => {
  let ownerToken = null;

  test.beforeAll(async () => {
    ownerToken = loadOwnerToken();
    expect(ownerToken, "Owner token requis dans .playwright-auth/session.json").toBeTruthy();

    // Nettoyage préventif au cas où un run précédent ait laissé le compte
    await deleteTempChef(ownerToken);
    await new Promise(r => setTimeout(r, 500));

    const created = await createTempChef(ownerToken, TEMP_CHEF_PWD_1);
    expect(created.ok, `Création chef temporaire échouée: ${created.error}`).toBe(true);
    console.log(`✅ Chef temporaire créé : ${TEMP_CHEF_NOM} (${TEMP_CHEF_ROLE})`);
  });

  test.afterAll(async () => {
    await deleteTempChef(ownerToken);
    console.log(`🧹 Cleanup : ${TEMP_CHEF_NOM} désactivé`);
  });

  // ── Test 1 : le chef temp peut se connecter avec son mdp initial ──
  test("chef temporaire peut se connecter avec son mot de passe initial", async ({ page }) => {
    await humanLogin(page, TEMP_CHEF_NOM, TEMP_CHEF_PWD_1);
    await expect(page).toHaveURL(/dashboard/);
    console.log(`✅ Connexion ${TEMP_CHEF_NOM} OK avec mdp initial`);
  });

  // ── Test 2 : sur sa propre ligne, 🔑 visible mais pas ✏️/🗑️ ──
  test("propre ligne — bouton 🔑 visible, ✏️ et 🗑️ absents", async ({ page }) => {
    await humanLogin(page, TEMP_CHEF_NOM, TEMP_CHEF_PWD_1);

    await page.goto("/dashboard/utilisateurs");
    await expect(page.getByText(/Gestion des utilisateurs/i).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);

    // Filtre sur son propre nom pour cibler la ligne
    await page.getByPlaceholder(/Rechercher par nom ou rôle/i).fill(TEMP_CHEF_NOM);
    await page.waitForTimeout(500);

    // La ligne doit afficher le badge "Vous"
    await expect(page.getByText("Vous").first()).toBeVisible({ timeout: 5000 });

    // 🔑 doit être présent sur sa ligne (le fix)
    const pwdBtn = page.getByTitle("Changer le mot de passe");
    await expect(pwdBtn).toBeVisible({ timeout: 5000 });

    // ✏️ et 🗑️ ne doivent PAS apparaître pour soi-même
    const roleBtn   = page.getByTitle("Modifier le rôle");
    const deleteBtn = page.getByTitle("Désactiver l'utilisateur");
    expect(await roleBtn.count(),   "✏️ Modifier le rôle ne doit pas apparaître sur soi").toBe(0);
    expect(await deleteBtn.count(), "🗑️ Désactiver ne doit pas apparaître sur soi").toBe(0);

    console.log("✅ UI auto-row : 🔑 visible, ✏️/🗑️ correctement masqués");
  });

  // ── Test 3 : le chef change son propre mot de passe via la modal ──
  test("chef d equipe change son propre mot de passe (cas principal)", async ({ page }) => {
    await humanLogin(page, TEMP_CHEF_NOM, TEMP_CHEF_PWD_1);

    await page.goto("/dashboard/utilisateurs");
    await expect(page.getByText(/Gestion des utilisateurs/i).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);

    // Cibler sa ligne
    await page.getByPlaceholder(/Rechercher par nom ou rôle/i).fill(TEMP_CHEF_NOM);
    await page.waitForTimeout(500);

    // Ouvrir la modal mot de passe
    await page.getByTitle("Changer le mot de passe").click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/Modifier le mot de passe/i)).toBeVisible({ timeout: 5000 });

    // Remplir nouveau mdp + confirmation (typing humain)
    const inputs = page.locator("input[type='password']");
    await inputs.nth(0).fill(TEMP_CHEF_PWD_2);
    await page.waitForTimeout(250);
    await inputs.nth(1).fill(TEMP_CHEF_PWD_2);
    await page.waitForTimeout(250);

    // Soumettre
    await page.getByRole("button", { name: /Enregistrer/i }).click();
    await page.waitForTimeout(2500);

    // Pas de message d'erreur "Non autorisé" / "Session expirée"
    const errAuth = page.getByText(/Non autoris|Session expir/i);
    expect(await errAuth.isVisible().catch(() => false),
      "Aucun rejet 403/Session expirée attendu pour self-password").toBe(false);

    // Toast de succès OU fermeture de la modal = succès
    const toastOk   = page.getByText(/Mot de passe mis à jour/i);
    const toastSeen = await toastOk.isVisible({ timeout: 5000 }).catch(() => false);
    const modalGone = !(await page.getByText(/Modifier le mot de passe/i).isVisible().catch(() => false));

    expect(toastSeen || modalGone,
      "Toast de succès OU fermeture de modal attendu après enregistrement"
    ).toBe(true);

    console.log("✅ Self-password change effectué côté UI");
  });

  // ── Test 4 : reconnexion avec le NOUVEAU mot de passe ─────────────
  test("reconnexion avec le nouveau mot de passe fonctionne", async ({ page }) => {
    // Petit délai pour laisser Supabase Auth se synchroniser
    await new Promise(r => setTimeout(r, 1500));

    // S'assurer qu'on n'a pas de session résiduelle
    await page.goto("/");
    await logout(page);
    await page.reload();

    await page.getByPlaceholder("Votre identifiant").fill(TEMP_CHEF_NOM);
    await page.waitForTimeout(350);
    await page.getByPlaceholder("••••••••").fill(TEMP_CHEF_PWD_2);
    await page.waitForTimeout(350);
    await page.getByRole("button", { name: /Se connecter/i }).click();

    await page.waitForURL("**/dashboard**", { timeout: 20000 });
    await expect(page).toHaveURL(/dashboard/);

    // Aucun toast d'erreur rouge
    const errToast = page.locator(".bg-red-600");
    const hasErr   = await errToast.isVisible({ timeout: 1500 }).catch(() => false);
    expect(hasErr, "Aucun toast d'erreur attendu après login avec nouveau mdp").toBe(false);

    console.log(`✅ Reconnexion avec le NOUVEAU mdp réussie pour ${TEMP_CHEF_NOM}`);
  });

  // ── Test 5 : DB cohérent (le compte est toujours actif) ───────────
  test("le compte chef est toujours actif dans nc_users", async () => {
    const rows = await sbQuery(
      "nc_users",
      `nom=eq.${TEMP_CHEF_NOM}&select=nom,role,active`
    );
    console.log("DB check:", JSON.stringify(rows));
    expect(Array.isArray(rows) && rows.length > 0,
      `${TEMP_CHEF_NOM} doit exister dans nc_users`).toBe(true);
    expect(rows[0].active, "Compte doit rester actif après self-password change").toBe(true);
    expect((rows[0].role || "").toLowerCase()).toContain("chef");
  });
});
