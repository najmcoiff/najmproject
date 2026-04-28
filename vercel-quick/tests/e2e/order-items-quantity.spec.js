/**
 * order-items-quantity.spec.js
 *
 * Régression : la quantité des articles était toujours 1 car items_json stocke
 * la clé "qty" (et non "quantity") et sbGetOrderItems lisait it.quantity || 1.
 * Fix : lire it.qty || it.quantity dans supabase-direct.js.
 *
 * Ce test insère une commande avec items_json contenant qty > 1,
 * ouvre la vue Confirmation, sélectionne la commande et vérifie que
 * "Qté : 3" apparaît (pas "Qté : 1").
 * Idem pour Préparation.
 */
import { test, expect, sbInsert, sbDelete } from "./fixtures.js";

const TEST_ID = `TEST_QTY_${Date.now()}`;

const TEST_ITEMS = [
  {
    variant_id: "49000269414696",
    title:      "Bandido aqua wax gris 6",
    qty:        3,
    price:      2500,
    image_url:  null,
  },
  {
    variant_id: "49000176615720",
    title:      "Tondeuse kiepe 6315",
    qty:        2,
    price:      11500,
    image_url:  null,
  },
];

test.describe("Quantité articles — régression qty vs quantity", () => {

  test.beforeAll(async () => {
    await sbInsert("nc_orders", {
      order_id:            TEST_ID,
      customer_name:       "Test Quantité Articles",
      customer_phone:      "0511000999",
      wilaya:              "Alger",
      order_total:         "30500",
      order_source:        "nc_boutique",
      confirmation_status: "nouveau",
      decision_status:     null,
      contact_status:      null,
      archived:            false,
      order_date:          new Date().toISOString(),
      items_json:          TEST_ITEMS,
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_orders", `order_id=eq.${TEST_ID}`);
  });

  // ── Confirmation : quantité correcte ────────────────────────────
  test("Confirmation — les articles affichent Qté 3 et Qté 2 (pas 1)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/confirmation");
    await authedPage.waitForTimeout(4000);

    // Trouver et cliquer la commande test
    const card = authedPage.getByText("Test Quantité Articles").first();
    await expect(card).toBeVisible({ timeout: 25000 });
    await card.click();
    await authedPage.waitForTimeout(3000);

    // Attendre le chargement des articles (spinner disparaît)
    await authedPage.waitForTimeout(2000);

    // Vérifier que "Qté : 3" apparaît dans le panneau droit
    await expect(authedPage.getByText(/Qté\s*:\s*3/i).first()).toBeVisible({ timeout: 15000 });

    // Vérifier que "Qté : 2" apparaît également
    await expect(authedPage.getByText(/Qté\s*:\s*2/i).first()).toBeVisible({ timeout: 5000 });

    // Vérifier que "Qté : 1" N'apparaît PAS (bug régressé)
    const hasQte1 = await authedPage.getByText(/Qté\s*:\s*1/i).count();
    expect(hasQte1, "Qté : 1 ne doit pas apparaître — les vraies quantités sont 3 et 2").toBe(0);
  });

  // ── Préparation : quantité correcte ─────────────────────────────
  // La page préparation affiche les quantités sous la forme "× 3" (badge orange)
  test("Préparation — les articles affichent × 3 et × 2 (pas × 1)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(4000);

    // Trouver et cliquer la commande test
    const card = authedPage.getByText("Test Quantité Articles").first();
    await expect(card).toBeVisible({ timeout: 25000 });
    await card.click();
    await authedPage.waitForTimeout(3000);

    // Attendre le chargement des articles
    await authedPage.waitForTimeout(2000);

    // La page préparation affiche "× 3" dans un badge orange pour les quantités
    await expect(authedPage.getByText(/×\s*3/).first()).toBeVisible({ timeout: 15000 });

    // Vérifier que "× 2" apparaît également
    await expect(authedPage.getByText(/×\s*2/).first()).toBeVisible({ timeout: 5000 });

    // Vérifier que "× 1" N'apparaît PAS (bug régressé) pour nos articles (qty=3 et qty=2)
    const badgeItems = authedPage.locator('[data-testid="prep-item-card"] span').filter({ hasText: /×\s*1$/ });
    const count1 = await badgeItems.count();
    expect(count1, "Aucun article ne doit avoir × 1 — les vraies quantités sont 3 et 2").toBe(0);
  });

});
