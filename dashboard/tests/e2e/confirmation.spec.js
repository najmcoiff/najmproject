/**
 * confirmation.spec.js — Test humain RÉEL page Confirmation
 *
 * UI réelle documentée :
 *  - Clic sur une carte commande → ouvre le panneau droit
 *  - Boutons décision : "✓ Confirmer" | "✕ Annuler" | "✎ Modifier"
 *  - Contact status : boutons pill ("joignable", "injoignable 1er tentative"…)
 *  - Confirmation client : select (options: "confirmé", "annulé", "colis gros"…)
 *  - Bouton save : "Enregistrer"
 *  - Badge dans liste : "CONFIRMÉ" (vert), "ANNULÉ" (rouge)
 */
import { test, expect, sbInsert, sbQuery, sbDelete, sbPatch } from "./fixtures.js";

const TEST_ID = `TEST_E2E_CONF_${Date.now()}`;

test.describe("Page Confirmation — actions agent réelles", () => {

  test.beforeAll(async () => {
    await sbInsert("nc_orders", {
      order_id:            TEST_ID,
      customer_name:       "Test E2E Agent",
      customer_phone:      "0500000000",
      wilaya:              "Alger",
      order_total:         "1500",
      order_source:        "online",
      confirmation_status: "nouveau",
      decision_status:     null,
      contact_status:      null,
      archived:            false,
      order_date:          new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_orders", `order_id=eq.${TEST_ID}`);
    await sbDelete("nc_events", `order_id=eq.${TEST_ID}`);
  });

  // ── Test 1 : page charge et affiche les commandes ────────────
  test("la page se charge et liste les commandes", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/confirmation");
    await expect(authedPage.getByText("Confirmation colis")).toBeVisible({ timeout: 20000 });
    await expect(authedPage.getByPlaceholder("Rechercher nom, tél, wilaya…")).toBeVisible();
  });

  // ── Test 2 : commande test visible ──────────────────────────
  test("la commande test est visible dans la liste", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/confirmation");
    await authedPage.waitForTimeout(3000);
    await expect(authedPage.getByText("Test E2E Agent").first()).toBeVisible({ timeout: 20000 });
  });

  // ── Test 3 : CONFIRMER — vrai clic, vrai save, vrai DB ──────
  test("CONFIRMER : clic bouton → badge CONFIRMÉ + DB decision_status=confirmer", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/confirmation");
    await authedPage.waitForTimeout(3000);

    // Cliquer sur la carte pour ouvrir le panneau de détail
    await authedPage.getByText("Test E2E Agent").first().click();
    await authedPage.waitForTimeout(1500);

    // Cliquer le bouton "✓ Confirmer"
    await authedPage.getByRole("button", { name: /✓ Confirmer/i }).click();
    await authedPage.waitForTimeout(500);

    // Cliquer "joignable" (contact status pill)
    await authedPage.getByRole("button", { name: "joignable" }).first().click();
    await authedPage.waitForTimeout(300);

    // Sélectionner "confirmé" dans le select Confirmation client
    await authedPage.locator("select").first().selectOption("confirmé");
    await authedPage.waitForTimeout(300);

    // Cliquer "Enregistrer"
    await authedPage.getByRole("button", { name: "Enregistrer" }).click();
    await authedPage.waitForTimeout(3000);

    // ✅ Vérification 1 : badge CONFIRMÉ dans la liste (la carte doit montrer le badge)
    const badge = authedPage.getByText("CONFIRMÉ").first();
    await expect(badge).toBeVisible({ timeout: 10000 });

    // ✅ Vérification 2 : nc_orders en DB
    const rows = await sbQuery("nc_orders", `order_id=eq.${TEST_ID}&select=decision_status,confirmation_status,contact_status`);
    expect(rows[0]?.decision_status, "decision_status doit être 'confirmer' en DB").toBe("confirmer");
    expect(rows[0]?.confirmation_status, "confirmation_status doit être 'confirmé'").toBe("confirmé");
  });

  // ── Test 4 : ANNULER avec motif ──────────────────────────────
  test("ANNULER : clic bouton + motif → badge ANNULÉ + DB decision_status=annuler", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/confirmation");
    await authedPage.waitForTimeout(3000);

    // Cliquer sur la carte
    await authedPage.getByText("Test E2E Agent").first().click();
    await authedPage.waitForTimeout(1500);

    // Cliquer "✕ Annuler"
    await authedPage.getByRole("button", { name: /✕ Annuler/i }).click();
    await authedPage.waitForTimeout(500);

    // Sélectionner un motif d'annulation (premier bouton visible parmi les raisons)
    const motifBtns = authedPage.locator("button").filter({ hasText: /refus_client|injoignable|doublon|mauvaise_adresse|faux numéro|produit_indisponible|autre/ });
    await motifBtns.first().click({ timeout: 5000 });
    await authedPage.waitForTimeout(300);

    // "joignable"
    await authedPage.getByRole("button", { name: "joignable" }).first().click();
    await authedPage.waitForTimeout(300);

    // Sélectionner "annulé" dans le select confirmation client
    await authedPage.locator("select").first().selectOption("annulé");

    // Enregistrer
    await authedPage.getByRole("button", { name: "Enregistrer" }).click();
    await authedPage.waitForTimeout(3000);

    // ✅ Vérification badge ANNULÉ
    await expect(authedPage.getByText("ANNULÉ").first()).toBeVisible({ timeout: 10000 });

    // ✅ Vérification DB
    const rows = await sbQuery("nc_orders", `order_id=eq.${TEST_ID}&select=decision_status`);
    expect(rows[0]?.decision_status).toBe("annuler");
  });

  // ── Test 5 : onglets filtrent correctement ───────────────────
  test("onglet Confirmés affiche uniquement les commandes confirmées", async ({ authedPage }) => {
    // S'assurer que notre commande est confirmée
    await sbPatch("nc_orders", `order_id=eq.${TEST_ID}`, { decision_status: "confirmer" });

    await authedPage.goto("/dashboard/confirmation");
    await authedPage.waitForTimeout(3000);

    // Cliquer sur "Confirmés"
    await authedPage.getByRole("button", { name: /^Confirmés?/i }).click();
    await authedPage.waitForTimeout(1500);

    // Notre commande DOIT être visible
    await expect(authedPage.getByText("Test E2E Agent").first()).toBeVisible({ timeout: 8000 });

    // Cliquer sur "Annulés"
    await authedPage.getByRole("button", { name: /^Annulés?/i }).click();
    await authedPage.waitForTimeout(1500);

    // Notre commande NE doit PAS être visible dans Annulés (elle est confirmée)
    const visible = await authedPage.getByText("Test E2E Agent").first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(visible, "Commande confirmée ne doit PAS apparaître dans onglet Annulés").toBe(false);
  });

  // ── Test 6 : logique doublon 24h ────────────────────────────
  test("doublon : même téléphone < 24h → badge ⚠️ DOUBLON, > 24h → pas de badge", async ({ authedPage }) => {
    const PHONE_DUP = "0600111222";
    const ID_A = `TEST_DUP_A_${Date.now()}`;
    const ID_B = `TEST_DUP_B_${Date.now()}`;
    const ID_C = `TEST_DUP_C_${Date.now()}`;   // même phone mais +3 jours

    // Deux commandes dans la fenêtre 24h (la seconde = maintenant, la première = -2h)
    const now    = new Date();
    const minus2h = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    // Troisième commande avec le même phone mais +3 jours dans le futur (simuler une commande ancienne)
    const minus3d = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    await sbInsert("nc_orders", { order_id: ID_A, customer_name: "DupA", customer_phone: PHONE_DUP, wilaya: "Alger", order_total: "500", order_source: "online", order_date: minus2h });
    await sbInsert("nc_orders", { order_id: ID_B, customer_name: "DupB", customer_phone: PHONE_DUP, wilaya: "Alger", order_total: "500", order_source: "online", order_date: now.toISOString() });
    await sbInsert("nc_orders", { order_id: ID_C, customer_name: "DupC", customer_phone: PHONE_DUP, wilaya: "Alger", order_total: "500", order_source: "online", order_date: minus3d });

    try {
      await authedPage.goto("/dashboard/confirmation");
      await authedPage.waitForTimeout(4000);

      // DupA et DupB sont dans la fenêtre 24h → doivent avoir le badge ⚠️
      const cardA = authedPage.getByText("DupA").first();
      await expect(cardA).toBeVisible({ timeout: 15000 });
      // Badge doublon présent sur DupA
      const dupBadge = authedPage.locator(".bg-purple-100").first();
      await expect(dupBadge).toBeVisible({ timeout: 5000 });

      // DupC est à -3j, hors fenêtre → PAS de badge doublon avec DupA/DupB
      // (DupA & DupB sont < 24h, DupC est isolé)
      const cardC = authedPage.getByText("DupC").first();
      await expect(cardC).toBeVisible({ timeout: 10000 });
      await cardC.click();
      await authedPage.waitForTimeout(1000);
      // Le panneau de détail ne doit PAS afficher "Commande potentiellement en doublon"
      const dupWarning = authedPage.getByText("Commande potentiellement en doublon");
      const visible = await dupWarning.isVisible().catch(() => false);
      expect(visible, "DupC (>24h) ne doit PAS être marqué doublon").toBe(false);
    } finally {
      await sbDelete("nc_orders", `order_id=eq.${ID_A}`);
      await sbDelete("nc_orders", `order_id=eq.${ID_B}`);
      await sbDelete("nc_orders", `order_id=eq.${ID_C}`);
    }
  });

  // ── Test 7 : doublon exclut les commandes clôturées (last=OUI) ──
  test("doublon : last=OUI exclut la commande de la détection", async ({ authedPage }) => {
    const PHONE_CLOT = "0700333444";
    const ID_CLOT  = `TEST_CLOT_${Date.now()}`;
    const ID_ACTIF = `TEST_ACTIF_${Date.now()}`;

    const now   = new Date().toISOString();
    const minus1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Une commande clôturée (last='OUI') + une commande active, même phone < 24h
    await sbInsert("nc_orders", { order_id: ID_CLOT,  customer_name: "ClotTest",  customer_phone: PHONE_CLOT, wilaya: "Oran", order_total: "800", order_source: "online", order_date: minus1h, last: "OUI" });
    await sbInsert("nc_orders", { order_id: ID_ACTIF, customer_name: "ActifTest", customer_phone: PHONE_CLOT, wilaya: "Oran", order_total: "800", order_source: "online", order_date: now });

    try {
      await authedPage.goto("/dashboard/confirmation");
      await authedPage.waitForTimeout(4000);

      // La commande active ne doit PAS être marquée doublon (son "partenaire" est clôturé)
      const cardActif = authedPage.getByText("ActifTest").first();
      await expect(cardActif).toBeVisible({ timeout: 15000 });
      await cardActif.click();
      await authedPage.waitForTimeout(1000);

      const dupWarning = authedPage.getByText("Commande potentiellement en doublon");
      const visible = await dupWarning.isVisible().catch(() => false);
      expect(visible, "Commande active dont l''autre est clôturée NE DOIT PAS être doublon").toBe(false);
    } finally {
      await sbDelete("nc_orders", `order_id=eq.${ID_CLOT}`);
      await sbDelete("nc_orders", `order_id=eq.${ID_ACTIF}`);
    }
  });

  // ── Test 8 (ex-6) : recherche filtre les résultats ────────────
  test("la recherche filtre les commandes par nom", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/confirmation");
    await authedPage.waitForTimeout(3000);

    const input = authedPage.getByPlaceholder("Rechercher nom, tél, wilaya…");
    await input.fill("Test E2E Agent");
    await authedPage.waitForTimeout(1000);
    await expect(authedPage.getByText("Test E2E Agent").first()).toBeVisible();

    // Recherche sans résultat
    await input.fill("XXXXXNONEXISTENT99999");
    await authedPage.waitForTimeout(1000);
    await expect(authedPage.getByText("Aucune commande")).toBeVisible({ timeout: 5000 });

    await input.fill("");
  });
});
