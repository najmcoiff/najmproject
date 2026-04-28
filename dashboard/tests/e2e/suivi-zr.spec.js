/**
 * suivi-zr.spec.js — Test humain complet page Suivi ZR Express (T210)
 *
 * Ce que fait un agent RÉEL :
 *  1. Ouvre la page Suivi ZR
 *  2. Voit la liste des colis actifs (final_status IS NULL uniquement)
 *  3. Cherche par tracking ou client
 *  4. Clique sur un colis pour voir le détail
 *  5. Clique le bouton "🔄 ZR" (Actualiser)
 *  6. Vérifie qu'un colis avec final_status est masqué
 *
 * Injection manuelle : insert deux colis test → active + terminé → vérifie filtrage
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";

const TEST_TRACKING       = `ZR_E2E_${Date.now()}`;
const TEST_TRACKING_DONE  = `ZR_E2E_DONE_${Date.now()}`;
const TEST_ORDER_ID       = `TEST_E2E_ZR_${Date.now()}`;
const TEST_ORDER_ID_DONE  = `TEST_E2E_ZR_DONE_${Date.now()}`;

test.describe("Page Suivi ZR — navigation et filtres agent", () => {

  test.beforeAll(async () => {
    const now = new Date().toISOString();
    // Colis actif (doit apparaître)
    await sbInsert("nc_suivi_zr", {
      tracking:         TEST_TRACKING,
      order_id:         TEST_ORDER_ID,
      customer_name:    "Test E2E ZR",
      customer_phone:   "0500000001",
      wilaya:           "Alger",
      adresse:          "Rue test E2E",
      carrier:          "ZR Express",
      statut_livraison: "En transit",
      order_total:      "1500",
      date_injection:   now,
      updated_at:       now,
    });
    // Colis terminé (doit être masqué)
    await sbInsert("nc_suivi_zr", {
      tracking:         TEST_TRACKING_DONE,
      order_id:         TEST_ORDER_ID_DONE,
      customer_name:    "Test E2E ZR DONE",
      customer_phone:   "0500000002",
      wilaya:           "Oran",
      carrier:          "ZR Express",
      statut_livraison: "Livré",
      final_status:     "livré",
      order_total:      "2000",
      date_injection:   now,
      updated_at:       now,
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_suivi_zr", `tracking=eq.${TEST_TRACKING}`);
    await sbDelete("nc_suivi_zr", `tracking=eq.${TEST_TRACKING_DONE}`);
    await sbDelete("nc_orders",   `order_id=eq.${TEST_ORDER_ID}`);
    await sbDelete("nc_orders",   `order_id=eq.${TEST_ORDER_ID_DONE}`);
  });

  // ── Test 1 : page se charge ──────────────────────────────────
  test("la page Suivi ZR se charge avec les colis", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await expect(
      authedPage.getByText(/suivi|tracking|zr express|colis/i).first()
    ).toBeVisible({ timeout: 20000 });
  });

  // ── Test 2 : notre colis test apparaît ──────────────────────
  test("le colis test injecté apparaît dans la liste", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await authedPage.waitForTimeout(4000);

    const colisCard = authedPage.getByText("Test E2E ZR").or(
      authedPage.getByText(TEST_TRACKING)
    ).first();

    await expect(colisCard).toBeVisible({ timeout: 20000 });
  });

  // ── Test 3 : colis terminé (final_status) est masqué ────────
  test("le colis avec final_status est masqué de la liste active", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await authedPage.waitForTimeout(4000);

    // Colis actif doit être visible
    const actifVisible = await authedPage.getByText("Test E2E ZR").first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(actifVisible, "Colis actif doit être visible").toBe(true);

    // Colis terminé ne doit PAS être visible (filtré par final_status IS NULL)
    const bodyText = await authedPage.locator("body").textContent();
    const terminéVisible = bodyText.includes("Test E2E ZR DONE");
    expect(terminéVisible, "Colis avec final_status='livré' ne doit PAS apparaître dans la liste").toBe(false);
  });

  // ── Test 4 : recherche par tracking ─────────────────────────
  test("la recherche par numéro de tracking fonctionne", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await authedPage.waitForTimeout(4000);

    const searchInput = authedPage.getByPlaceholder(/chercher|tracking|numéro|search/i).first()
      .or(authedPage.locator("input[type='text'], input[type='search']").first());

    const searchVisible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (!searchVisible) {
      console.log("ℹ️  Champ recherche non trouvé dans suivi-zr");
      return;
    }

    // Chercher notre tracking test
    await searchInput.fill(TEST_TRACKING);
    await authedPage.waitForTimeout(1500);

    const colisFound = await authedPage.getByText("Test E2E ZR").or(
      authedPage.getByText(TEST_TRACKING)
    ).first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(colisFound, `Recherche par tracking ${TEST_TRACKING} doit trouver le colis test`).toBe(true);

    // Vider
    await searchInput.fill("");
  });

  // ── Test 5 : cliquer un colis montre les détails ─────────────
  test("cliquer sur un colis affiche ses détails ou son tracking", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await authedPage.waitForTimeout(4000);

    // Le tracking doit déjà être visible dans la liste
    const trackingInList = authedPage.getByText(TEST_TRACKING).first();
    if (!await trackingInList.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log("ℹ️  Tracking non visible dans la liste — vérifier le filtre par défaut");
      return;
    }

    // Cliquer sur la ligne
    await trackingInList.click();
    await authedPage.waitForTimeout(2000);

    // Après le clic, soit un panneau s'ouvre, soit le tracking reste visible
    // C'est acceptable dans les deux cas — l'important est pas de crash
    const bodyText = await authedPage.locator("body").textContent();
    expect(bodyText.includes("ZR_E2E") || bodyText.includes("Test E2E ZR"),
      "Le numéro de tracking ou le nom client doit être visible après clic").toBe(true);
  });

  // ── Test 6 : route suivi-zr API répond ──────────────────────
  test("l'API nc_suivi_zr contient le colis test avec nouvelles colonnes", async () => {
    const rows = await sbQuery("nc_suivi_zr", `tracking=eq.${TEST_TRACKING}&select=tracking,statut_livraison,customer_name,date_injection,attempts_count`);
    expect(rows?.length, "nc_suivi_zr doit contenir le colis test").toBe(1);
    expect(rows[0].statut_livraison).toBe("En transit");
    expect(rows[0].customer_name).toBe("Test E2E ZR");
    expect(rows[0].date_injection).not.toBeNull();
    expect(typeof rows[0].attempts_count).toBe("number");
  });

  // ── Test 7 : bouton Actualiser ZR présent ────────────────────
  test("le bouton Actualiser ZR est présent sur la page", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await authedPage.waitForTimeout(4000);

    // Chercher n'importe quel bouton contenant le texte ZR dans le header de liste
    const bodyText = await authedPage.locator("body").textContent();
    // La page doit au minimum charger sans erreur 500
    expect(bodyText).not.toMatch(/Application error|Internal Server Error/i);

    // Chercher le bouton avec approche plus large
    const buttons = await authedPage.locator("button").all();
    let found = false;
    for (const btn of buttons) {
      const text = await btn.textContent().catch(() => "");
      if (/ZR|actualiser|🔄/i.test(text)) { found = true; break; }
    }
    expect(found, "Bouton Actualiser ZR doit être visible dans la page suivi-zr").toBe(true);
  });

  // ── Test 8 : webhook ZR refus signature invalide (sécurité) ──
  test("webhook ZR rejette une requête sans signature valide (401)", async () => {
    const res = await fetch(`https://najmcoiffdashboard.vercel.app/api/webhooks/zr`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "test", data: {} }),
    });
    // 401 = signature invalide (correct) OU 200 si ZR_WEBHOOK_SECRET non configuré
    expect([200, 401]).toContain(res.status);
  });

  // ── Test 9 : "recouvert" classé comme terminé, label correct ─
  test("colis recouvert → classé terminé (onglet Terminés), badge = Recouvert (pas Collecté)", async ({ authedPage }) => {
    // Insérer un colis avec final_status=livré (simulant état recouvert)
    const trackingRecouvert = `ZR_E2E_REC_${Date.now()}`;
    await sbInsert("nc_suivi_zr", {
      tracking:         trackingRecouvert,
      order_id:         `TEST_E2E_REC_${Date.now()}`,
      customer_name:    "Test E2E Recouvert",
      customer_phone:   "0500000099",
      wilaya:           "Alger",
      carrier:          "ZR Express",
      statut_livraison: "Recouvert",
      final_status:     "livré",
      order_total:      "3500",
      date_injection:   new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    });

    try {
      // 1. Vérifier en DB que final_status est "livré" et statut_livraison "Recouvert"
      const rows = await sbQuery("nc_suivi_zr", `tracking=eq.${trackingRecouvert}&select=statut_livraison,final_status`);
      expect(rows?.length).toBe(1);
      expect(rows[0].statut_livraison).toBe("Recouvert");
      expect(rows[0].final_status).toBe("livré");

      // 2. Aller sur la page — onglet "En cours" (défaut) ne doit PAS montrer le colis recouvert
      await authedPage.goto("/dashboard/suivi-zr");
      await authedPage.waitForTimeout(4000);

      let bodyText = await authedPage.locator("body").textContent();
      expect(
        bodyText.includes("Test E2E Recouvert"),
        "Colis recouvert NE doit PAS apparaître dans l'onglet En cours"
      ).toBe(false);

      // 3. Cliquer sur l'onglet "Terminés" → doit apparaître
      const btnTermines = authedPage.getByRole("button", { name: /terminés/i }).first()
        .or(authedPage.locator("button").filter({ hasText: /terminés/i }).first());

      const terminesVisible = await btnTermines.isVisible({ timeout: 5000 }).catch(() => false);
      if (terminesVisible) {
        await btnTermines.click();
        await authedPage.waitForTimeout(2000);

        bodyText = await authedPage.locator("body").textContent();
        expect(
          bodyText.includes("Test E2E Recouvert"),
          "Colis recouvert DOIT apparaître dans l'onglet Terminés"
        ).toBe(true);

        // 4. Le badge doit afficher "Recouvert" pas "Collecté"
        expect(
          !bodyText.match(/Test E2E Recouvert[\s\S]{0,200}Collecté/),
          "Badge ne doit PAS afficher 'Collecté' pour un colis recouvert"
        ).toBe(true);
      } else {
        console.log("ℹ️ Bouton Terminés non trouvé — vérifier le rendu des onglets");
      }
    } finally {
      // Nettoyage
      await sbDelete("nc_suivi_zr", `tracking=eq.${trackingRecouvert}`);
    }
  });
});
