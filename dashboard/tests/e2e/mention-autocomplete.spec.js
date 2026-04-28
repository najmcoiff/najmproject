// tests/e2e/mention-autocomplete.spec.js
// Test humain : @mention autocomplete dans les discussions
import { test, expect, sbDelete, sbQuery } from "./fixtures.js";

// Nettoyage global : supprime les messages de test laissés par ce fichier
test.afterAll(async () => {
  try {
    const msgs = await sbQuery("messages", "contenu=ilike.*test+mention+Playwright+automatique*&select=id&limit=20");
    for (const m of (msgs || [])) {
      await sbDelete("messages", `id=eq.${m.id}`).catch(() => {});
    }
  } catch {}
});

test("@mention autocomplete — dropdown et message envoyé", async ({ authedPage: page }) => {
  await page.goto("/dashboard/discussions");

  // Attendre textarea + laisser nc_users se charger
  const textarea = page.locator("textarea").last();
  await textarea.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(2000); // nc_users est une requête async — laisser le temps
  await textarea.click();
  await page.waitForTimeout(300);

  // Taper @ pour déclencher le dropdown
  await page.keyboard.type("@");
  await page.waitForTimeout(1000);

  // Le dropdown doit apparaître
  const dropdown = page.locator("[data-mention-dropdown]");
  await expect(dropdown).toBeVisible({ timeout: 8000 });

  // Récupérer le premier utilisateur disponible
  const firstItem = page.locator("[data-mention-item]").first();
  await expect(firstItem).toBeVisible();
  const userNom = await firstItem.getAttribute("data-mention-item");
  console.log(`Sélection de @${userNom} dans le dropdown`);

  // Sélectionner via Tab (plus fiable que click dans les tests Playwright)
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);

  // Vérifier que le @nom est inséré dans le textarea
  const valeur = await textarea.inputValue();
  expect(valeur).toContain(`@${userNom}`);
  console.log(`✅ @${userNom} inséré dans le textarea : "${valeur}"`);

  // Compléter et envoyer
  await textarea.fill(`@${userNom} test mention Playwright automatique`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);

  // Le message doit apparaître avec le @nom mis en valeur
  const mention = page.locator(".font-bold.rounded").filter({ hasText: new RegExp(`@${userNom}`) }).last();
  await expect(mention).toBeVisible({ timeout: 8000 });

  console.log(`✅ Message avec @mention affiché avec succès`);
});

test("@mention filtrage au clavier — Escape ferme le dropdown", async ({ authedPage: page }) => {
  await page.goto("/dashboard/discussions");

  const textarea = page.locator("textarea").last();
  await textarea.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(2000); // nc_users async
  await textarea.click();

  // Taper @so pour filtrer (soumia, soheib, sofiane)
  await page.keyboard.type("@so");
  await page.waitForTimeout(1000);

  const dropdown = page.locator("[data-mention-dropdown]");
  await expect(dropdown).toBeVisible({ timeout: 8000 });

  // Ne doit montrer que les noms commençant par "so"
  const items = page.locator("[data-mention-item]");
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(13); // Pas tous les utilisateurs actifs

  // Navigation clavier ↓ et Échap
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await expect(dropdown).not.toBeVisible();

  console.log(`✅ Filtrage @mention : ${count} résultat(s) pour "@so", Échap ferme le dropdown`);
});
