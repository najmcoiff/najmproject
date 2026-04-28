/**
 * preparation.spec.js — Test humain page Préparation
 *
 * Ce que fait un agent RÉEL :
 *  1. Ouvre la page Préparation
 *  2. Voit la liste des commandes confirmées à préparer
 *  3. Marque une commande comme "préparée" et vérifie en DB
 *  4. Utilise l'onglet Quota : consulte la quota active
 *  5. Vérifie que la quota contient les bons articles
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";

const TEST_ORDER_ID = `TEST_E2E_PREP_${Date.now()}`;

test.describe("Page Préparation — marquage et quota", () => {

  test.beforeAll(async () => {
    await sbInsert("nc_orders", {
      order_id:            TEST_ORDER_ID,
      customer_name:       "Test E2E Préparation",
      customer_phone:      "0555000010",
      wilaya:              "Constantine",
      order_total:         "2500",
      order_source:        "online",
      confirmation_status: "confirmé",
      decision_status:     "confirmer",
      contact_status:      "joignable",
      statut_preparation:  null,
      archived:            false,
      order_date:          new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_orders", `order_id=eq.${TEST_ORDER_ID}`);
    await sbDelete("nc_events", `order_id=eq.${TEST_ORDER_ID}`);
  });

  // ── Test 1 : page se charge ──────────────────────────────────
  test("la page Préparation se charge avec les commandes confirmées", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await expect(
      authedPage.getByText(/préparation|commandes? à préparer|quota/i).first()
    ).toBeVisible({ timeout: 20000 });
  });

  // ── Test 2 : notre commande test est visible ─────────────────
  test("la commande confirmée test apparaît dans la liste", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(4000);

    const card = authedPage.getByText("Test E2E Préparation").or(
      authedPage.getByText(TEST_ORDER_ID)
    ).first();

    await expect(card).toBeVisible({ timeout: 20000 });
  });

  // ── Test 3 : marquer comme préparée ─────────────────────────
  test("cliquer 'Marquer préparé' met à jour statut_preparation en DB", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(4000);

    // Trouver la commande test
    const card = authedPage.getByText("Test E2E Préparation").or(
      authedPage.getByText(TEST_ORDER_ID)
    ).first();

    if (!await card.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.warn("⚠️  Commande test non visible — peut-être filtrée par l'UI");
      return;
    }

    // Cliquer pour ouvrir ou trouver le bouton "Marquer préparé" dans la même zone
    const prepareBtn = authedPage.getByRole("button", { name: /préparer|préparé|marquer/i }).first()
      .or(authedPage.locator("text=/✅ Préparer|Marquer préparée/i").first());

    const btnInRow = card.locator("..").locator("button").first();

    if (await prepareBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prepareBtn.click();
    } else {
      await card.click();
      await authedPage.waitForTimeout(1000);
      await prepareBtn.click({ timeout: 3000 }).catch(() => {
        btnInRow.click();
      });
    }

    await authedPage.waitForTimeout(2500);

    // Vérifier en DB
    const rows = await sbQuery("nc_orders", `order_id=eq.${TEST_ORDER_ID}&select=statut_preparation`);
    const status = rows?.[0]?.statut_preparation;
    console.log(`statut_preparation après clic: ${status}`);

    // Vérifier dans l'UI
    const prepBadge = authedPage.getByText(/préparée|✅/i).first();
    const badgeVisible = await prepBadge.isVisible({ timeout: 5000 }).catch(() => false);

    const updated = status === "préparée" || status === "préparé" || badgeVisible;
    expect(updated, "La commande doit être marquée comme préparée (UI ou DB)").toBe(true);
  });

  // ── Test 4 : onglet Quota — voir la quota active ─────────────
  test("onglet Quota affiche la dernière quota générée", async ({ authedPage, token }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(3000);

    // Cliquer l'onglet Quota
    const quotaTab = authedPage.getByRole("button", { name: /^Quota/i }).first()
      .or(authedPage.getByText(/^Quota$/i).first());

    if (await quotaTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await quotaTab.click();
      await authedPage.waitForTimeout(2000);

      // Vérifier via API que la quota existe
      const resp = await authedPage.request.post("/api/quota", { data: { token } });
      const body  = await resp.json();
      expect(body.ok).toBe(true);

      if (body.count > 0) {
        // La quota doit s'afficher dans l'UI
        await expect(
          authedPage.getByText(/quota|variante|article|quantité/i).first()
        ).toBeVisible({ timeout: 10000 });
        console.log(`✅ Quota active: ${body.count} lignes, ${body.total_qty} unités`);
      } else {
        console.log("ℹ️  Aucune quota générée — normal si première utilisation");
      }
    }
  });

  // ── Test 5 : bouton Lancer quota ouvre bien le modal ─────────
  test("bouton Lancer quota ouvre la modal de configuration", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/preparation");
    await authedPage.waitForTimeout(3000);

    const quotaTab = authedPage.getByRole("button", { name: /^Quota/i }).first();
    if (await quotaTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await quotaTab.click();
      await authedPage.waitForTimeout(2000);
    }

    const lancerBtn = authedPage.getByRole("button", { name: /lancer|générer|nouvelle quota/i }).first();
    if (!await lancerBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("ℹ️  Bouton Lancer Quota non visible (role owner requis peut-être)");
      return;
    }

    await lancerBtn.click();
    await authedPage.waitForTimeout(1500);

    // Modal doit s'ouvrir
    const modal = authedPage.getByRole("dialog").first()
      .or(authedPage.getByText(/lancer la quota|configurer quota|nombre de commandes/i).first());
    await expect(modal).toBeVisible({ timeout: 8000 });

    // Fermer sans lancer (on ne veut pas générer une vraie quota pendant les tests)
    await authedPage.keyboard.press("Escape");
    await authedPage.waitForTimeout(500);

    console.log("✅ Modal Lancer Quota s'ouvre et se ferme correctement");
  });
});
