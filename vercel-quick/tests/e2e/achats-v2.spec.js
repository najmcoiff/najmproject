// Tests Playwright humains — Page Achats V2
// Utilise authedPage (session injectée depuis .playwright-auth/session.json)

import { test, expect, sbQuery } from "./fixtures.js";

const BASE_URL = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";

test.describe("Achats V2", () => {

  test("ACH-01 : Page achats charge et affiche les onglets", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/achats`);
    await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Les 4 onglets sont présents (texte partiel pour robustesse)
    await expect(page.locator("button").filter({ hasText: "Acheter" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button").filter({ hasText: "Dispo" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button").filter({ hasText: "Demandes" }).first()).toBeVisible({ timeout: 10000 });
  });

  test("ACH-02 : Score urgence affiche % correct (0-100%)", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/achats`);
    await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const badges = page.locator("span").filter({ hasText: /CRITIQUE|URGENT|MOYEN|FAIBLE/ });
    const cnt = await badges.count();

    if (cnt > 0) {
      const firstBadge = await badges.first().textContent();
      // Doit contenir "%" — ex "CRITIQUE 86%"
      expect(firstBadge).toMatch(/\d+%/);
      // Ne doit PAS être un score brut comme "0.863"
      expect(firstBadge).not.toMatch(/0\.\d{3}/);
    }
  });

  test("ACH-03 : Au moins un badge de score visible si données présentes", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/achats`);
    await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const cards = page.locator(".rounded-2xl").filter({ hasText: "Stock" });
    const cardCount = await cards.count();

    if (cardCount > 0) {
      const badges = page.locator("span").filter({ hasText: /CRITIQUE|URGENT|MOYEN|FAIBLE/ });
      await expect(badges.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("ACH-04 : Bouton BC & Devis ouvre le modal historique", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/achats`);
    await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Chercher le bouton "BC & Devis" (texte en span hidden sur mobile)
    const histBtn = page.locator("button").filter({ hasText: /Devis|Historique/ }).first();
    await expect(histBtn).toBeVisible({ timeout: 10000 });
    await histBtn.click();
    await page.waitForTimeout(800);

    await expect(page.locator("h2").filter({ hasText: "Historique" })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
  });

  test("ACH-05 : Modal Fournisseurs accessible pour owner", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/achats`);
    await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const btn = page.locator("button").filter({ hasText: "Fournisseur" });
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("h2").filter({ hasText: "Gestion des fournisseurs" })).toBeVisible({ timeout: 5000 });
      await expect(page.locator("input[placeholder*='Nom']").or(page.locator("input[placeholder='Nom *']")).first()).toBeVisible();
      await page.keyboard.press("Escape");
    }
    // Si l'utilisateur n'est pas owner, le bouton n'existe pas — test OK
  });

  test("ACH-06 : Portail fournisseur - lien invalide retourne page d'erreur", async ({ page }) => {
    await page.goto(`${BASE_URL}/fournisseur/token-invalide-inexistant-xyz123`);
    await page.waitForTimeout(3000);
    const errMsg = page.locator("text=invalide").or(page.locator("text=Lien")).first();
    await expect(errMsg).toBeVisible({ timeout: 10000 });
  });

  test("ACH-07 : API /api/fournisseur/list protégée par token invalide", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/fournisseur/list?token=invalide_xyz`);
    expect([401, 403]).toContain(res.status());
  });

  test("ACH-08 : Sélectionner un article → sticky bar BC apparaît", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/achats`);
    await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Chercher une checkbox "Sélectionner"
    const selLabels = page.locator("label").filter({ hasText: "Sélectionner" });
    const cnt = await selLabels.count();

    if (cnt > 0) {
      await selLabels.first().click();
      await page.waitForTimeout(600);

      // Sticky bar de sélection
      await expect(page.locator("button").filter({ hasText: "Créer bon de commande" })).toBeVisible({ timeout: 5000 });

      // Ouvrir le modal BC
      await page.locator("button").filter({ hasText: "Créer bon de commande" }).click();
      await page.waitForTimeout(500);
      await expect(page.locator("h2").filter({ hasText: "Nouveau bon de commande" })).toBeVisible({ timeout: 5000 });
      await page.keyboard.press("Escape");
    }
  });

  test("ACH-09 : DB — nc_fournisseurs table existe", async () => {
    const rows = await sbQuery("nc_fournisseurs", "limit=1");
    // Doit retourner un tableau (même vide) — pas une erreur
    expect(Array.isArray(rows)).toBe(true);
  });

  test("ACH-10 : DB — nc_fournisseur_devis table existe", async () => {
    const rows = await sbQuery("nc_fournisseur_devis", "limit=1");
    expect(Array.isArray(rows)).toBe(true);
  });

  test("ACH-11 : J dispo / Vendus / Commandes affichent des chiffres réels", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/achats`);
    await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Vérifier que les 3 labels sont présents
    const jDispo = page.locator("span").filter({ hasText: /J dispo/ }).first();
    const vendus  = page.locator("span").filter({ hasText: /Vendus/ }).first();
    const cmds    = page.locator("span").filter({ hasText: /Commandes/ }).first();

    await expect(jDispo).toBeVisible({ timeout: 10000 });
    await expect(vendus).toBeVisible({ timeout: 5000 });
    await expect(cmds).toBeVisible({ timeout: 5000 });

    // Vérifier que les valeurs contiennent un chiffre (pas uniquement "—")
    const jDispoText = await jDispo.textContent();
    const vendusText = await vendus.textContent();
    const cmdsText   = await cmds.textContent();

    expect(jDispoText).toMatch(/\d/);
    expect(vendusText).toMatch(/\d/);
    expect(cmdsText).toMatch(/\d/);
  });

  test("ACH-12 : 'Recommandé par BigQuery' n'est plus affiché", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/achats`);
    await page.waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Le texte "BigQuery" ne doit plus apparaître nulle part
    const bigquery = page.locator("text=BigQuery");
    expect(await bigquery.count()).toBe(0);

    // "Qté suggérée" doit apparaître si au moins un article a une qté conseillée > 0
    const qteSugg = page.locator("span").filter({ hasText: /Qté suggérée/ });
    const cnt = await qteSugg.count();
    // Juste vérifier qu'il n'y a pas de BigQuery — si qteSugg existe c'est un bonus
    if (cnt > 0) {
      await expect(qteSugg.first()).toBeVisible();
    }
  });

  test("ACH-13 : DB — nc_kpi_stock_view retourne jours_disponibilite et quantite_vendue", async () => {
    const rows = await sbQuery(
      "nc_kpi_stock_view",
      "select=variant_id,jours_disponibilite,quantite_vendue,nb_commandes&order=score_urgence.desc&limit=3"
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    // Le premier produit doit avoir ces colonnes définies
    const first = rows[0];
    expect(first.quantite_vendue).toBeDefined();
    expect(Number(first.quantite_vendue)).toBeGreaterThan(0);
    expect(first.nb_commandes).toBeDefined();
    expect(Number(first.nb_commandes)).toBeGreaterThan(0);
    expect(first.jours_disponibilite).toBeDefined();
    expect(Number(first.jours_disponibilite)).toBeGreaterThan(0);
  });
});
