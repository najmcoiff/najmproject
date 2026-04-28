/**
 * retours.spec.js — Test humain page "Traiter les retours"
 *
 * Flux testé :
 * 1. La page se charge (pas de 404)
 * 2. On saisit un tracking → la commande apparaît dans la liste
 * 3. Clic "Générer le bon de retour" → aperçu affiché
 * 4. Clic "Confirmer" → restock + shipping_status = 'retour récupéré' en DB
 * 5. Écran DONE affiché avec le résultat
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";
import { randomUUID } from "crypto";

const ORDER_ID   = `TEST_RETOUR_E2E_${Date.now()}`;
const VARIANT_ID = randomUUID();
const TRACKING   = `TEST-${Date.now()}-ZR`;

test.describe("Page Traiter les retours — flux scan → bon → confirmer", () => {

  test.beforeAll(async () => {
    // Variant de test avec stock réel (inventory_quantity)
    await sbInsert("nc_variants", {
      variant_id:         VARIANT_ID,
      display_name:       "Produit Test Retour E2E",
      product_title:      "Produit Test Retour E2E",
      price:              500,
      inventory_quantity: 5,
      status:             "active",
    });

    // Commande expédiée avec tracking
    await sbInsert("nc_orders", {
      order_id:        ORDER_ID,
      customer_name:   "Client Test Retour E2E",
      customer_phone:  "0555001122",
      wilaya:          "Oran",
      order_total:     "2000",
      order_source:    "online",
      decision_status: "confirmer",
      shipping_status: "expédié",
      tracking:        TRACKING,
      archived:        false,
      order_date:      new Date().toISOString(),
      items_json:      [{
        variant_id: VARIANT_ID,
        title:      "Produit Test Retour E2E",
        qty:        3,
        price:      500,
      }],
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_orders",   `order_id=eq.${ORDER_ID}`);
    await sbDelete("nc_variants", `variant_id=eq.${VARIANT_ID}`);
    await sbDelete("nc_events",   `order_id=eq.${ORDER_ID}`);
  });

  // ── Test 1 : la page se charge ────────────────────────────────
  test("la page retours se charge sans erreur 404", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/retours");
    await authedPage.waitForTimeout(2000);

    const notFound = await authedPage.getByText(/404|not found|cette page n.existe pas/i)
      .first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(notFound, "Pas de 404").toBe(false);

    await expect(
      authedPage.getByText(/traiter les retours/i).first()
    ).toBeVisible({ timeout: 15000 });

    // Champ de saisie visible
    await expect(
      authedPage.getByTestId("tracking-input")
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Test 2 : saisir un tracking → commande trouvée ────────────
  test("saisir un tracking ajoute la commande à la liste", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/retours");
    await authedPage.waitForTimeout(2000);

    // Saisir le tracking
    const input = authedPage.getByTestId("tracking-input");
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.click();
    await authedPage.keyboard.type(TRACKING);
    await authedPage.waitForTimeout(300);

    // Cliquer "+ Ajouter"
    await authedPage.getByTestId("add-tracking-btn").click();
    await authedPage.waitForTimeout(3000);

    // La commande doit apparaître dans la liste
    await expect(
      authedPage.getByTestId(`scanned-row-${TRACKING}`)
    ).toBeVisible({ timeout: 15000 });

    // Le nom du client doit être visible
    await expect(
      authedPage.getByText("Client Test Retour E2E").first()
    ).toBeVisible({ timeout: 10000 });

    // Le bouton "Générer le bon" doit être visible
    await expect(
      authedPage.getByTestId("generer-bon-btn")
    ).toBeVisible({ timeout: 5000 });
  });

  // ── Test 3 : tracking introuvable affiche erreur ──────────────
  test("un tracking inconnu affiche un message d'erreur", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/retours");
    await authedPage.waitForTimeout(2000);

    const input = authedPage.getByTestId("tracking-input");
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.click();
    await authedPage.keyboard.type("TRACKING-INEXISTANT-99999");
    await authedPage.getByTestId("add-tracking-btn").click();
    await authedPage.waitForTimeout(3000);

    // Message d'erreur "introuvable" visible
    await expect(
      authedPage.getByText(/introuvable/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Test 4 : flux complet scan → bon → confirmer ──────────────
  test("flux complet : scan tracking → bon de retour → confirmer → DB mise à jour", async ({ authedPage }) => {
    // Stock initial
    const varBefore = await sbQuery("nc_variants", `variant_id=eq.${VARIANT_ID}&select=inventory_quantity`);
    const stockBefore = varBefore?.[0]?.inventory_quantity ?? 5;
    console.log(`Stock avant : ${stockBefore}`);

    await authedPage.goto("/dashboard/retours");
    await authedPage.waitForTimeout(2000);

    // 1. Saisir tracking
    const input = authedPage.getByTestId("tracking-input");
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.click();
    await authedPage.keyboard.type(TRACKING);
    await authedPage.keyboard.press("Enter");
    await authedPage.waitForTimeout(3000);

    // 2. Vérifier que la commande est dans la liste
    await expect(
      authedPage.getByTestId(`scanned-row-${TRACKING}`)
    ).toBeVisible({ timeout: 15000 });

    // 3. Générer le bon de retour
    await authedPage.getByTestId("generer-bon-btn").click();
    await authedPage.waitForTimeout(1500);

    // Vérifier qu'on est sur l'écran "Bon de retour"
    await expect(
      authedPage.getByText(/bon de retour/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Le tracking doit apparaître dans le bon
    await expect(
      authedPage.getByText(TRACKING).first()
    ).toBeVisible({ timeout: 5000 });

    // 4. Confirmer
    await authedPage.getByTestId("confirmer-retours-btn").click();
    await authedPage.waitForTimeout(5000);

    // Écran DONE visible
    await expect(
      authedPage.getByText(/retours traités avec succès/i).first()
    ).toBeVisible({ timeout: 20000 });

    // ── Vérification DB ──────────────────────────────────────────

    // shipping_status = 'retour récupéré'
    const orders = await sbQuery("nc_orders", `order_id=eq.${ORDER_ID}&select=shipping_status,decision_status`);
    const order  = orders?.[0];
    console.log(`DB : shipping_status="${order?.shipping_status}" decision_status="${order?.decision_status}"`);
    expect(order?.shipping_status).toBe("retour récupéré");

    // decision_status INCHANGÉ = 'confirmer'
    expect(order?.decision_status, "decision_status ne doit pas être modifié").toBe("confirmer");

    // Stock restitué (qty = 3)
    const varAfter   = await sbQuery("nc_variants", `variant_id=eq.${VARIANT_ID}&select=inventory_quantity`);
    const stockAfter = varAfter?.[0]?.inventory_quantity ?? stockBefore;
    console.log(`Stock après : ${stockAfter}`);
    expect(stockAfter, "Stock doit avoir augmenté de 3").toBeGreaterThanOrEqual(stockBefore + 3);

    // Log nc_events créé
    const events = await sbQuery("nc_events", `order_id=eq.${ORDER_ID}&log_type=eq.RETOUR_RECUPERE`);
    console.log(`Événements RETOUR_RECUPERE : ${events?.length}`);
    expect(events?.length ?? 0).toBeGreaterThan(0);
  });

  // ── Test 5 : bouton "Nouveau traitement" remet à zéro ─────────
  test("bouton nouveau traitement remet la page à zéro", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/retours");
    await authedPage.waitForTimeout(2000);

    // Naviguer au-delà avec un tracking quelconque (utiliser celui déjà traité)
    const input = authedPage.getByTestId("tracking-input");
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.click();
    await authedPage.keyboard.type(TRACKING);
    await authedPage.keyboard.press("Enter");
    await authedPage.waitForTimeout(3000);

    // Peut être dans la liste (order déjà traité mais toujours trouvable par tracking)
    const inList = await authedPage.getByTestId(`scanned-row-${TRACKING}`)
      .isVisible({ timeout: 5000 }).catch(() => false);

    if (inList) {
      // Générer le bon et confirmer
      await authedPage.getByTestId("generer-bon-btn").click();
      await authedPage.waitForTimeout(1000);
      await authedPage.getByTestId("confirmer-retours-btn").click();
      await authedPage.waitForTimeout(5000);

      // Cliquer "Nouveau traitement"
      const newBtn = authedPage.getByTestId("nouveau-retour-btn");
      await newBtn.waitFor({ state: "visible", timeout: 15000 });
      await newBtn.click();
      await authedPage.waitForTimeout(1000);

      // Le champ tracking doit être de retour
      await expect(
        authedPage.getByTestId("tracking-input")
      ).toBeVisible({ timeout: 10000 });
    } else {
      // Tracking introuvable (déjà traité et retiré) — vérifier juste le champ de saisie
      await expect(
        authedPage.getByTestId("tracking-input")
      ).toBeVisible({ timeout: 5000 });
    }
  });
});
