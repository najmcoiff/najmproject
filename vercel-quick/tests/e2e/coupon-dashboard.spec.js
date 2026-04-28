/**
 * coupon-dashboard.spec.js — T130
 *
 * Vérifie que les commandes nc_boutique avec un code promo affichent :
 *  1. L'emoji 🏷️ dans la carte de la liste
 *  2. Le badge "Code promo : CODE" + montant remise dans le panneau détail
 *
 * Simule un vrai humain : goto → waitForTimeout → click → assertions DB
 */
import { test, expect, sbInsert, sbQuery, sbDelete } from "./fixtures.js";

const TEST_ID       = `TEST_COUPON_${Date.now()}`;
const COUPON_CODE   = "TEST05";
const COUPON_DISC   = 250;

test.describe("T130 — Coupon code visible dans le dashboard confirmation", () => {

  test.beforeAll(async () => {
    await sbInsert("nc_orders", {
      order_id:            TEST_ID,
      order_name:          `NC-TEST-COUPON`,
      customer_name:       "Coupon Test Client",
      customer_phone:      "0601020304",
      wilaya:              "Alger",
      order_total:         3750,
      total_price:         3750,
      order_source:        "nc_boutique",
      confirmation_status: "nouveau",
      decision_status:     null,
      contact_status:      null,
      archived:            false,
      coupon_code:         COUPON_CODE,
      coupon_discount:     COUPON_DISC,
      order_date:          new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_orders", `order_id=eq.${TEST_ID}`);
    await sbDelete("nc_events",  `order_id=eq.${TEST_ID}`);
  });

  // ── Test 1 : icône 🏷️ sur la carte dans la liste ──────────────
  test("icône 🏷️ apparaît sur la carte commande avec coupon", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/confirmation");

    // Attendre que la liste soit chargée (au moins une carte visible)
    await authedPage.waitForSelector("div.border-b", { timeout: 20000 });
    await authedPage.waitForTimeout(2000);

    // Chercher la commande test dans la liste
    const card = authedPage.getByText("Coupon Test Client").first();
    await expect(card).toBeVisible({ timeout: 20000 });

    // Le parent de la carte doit contenir l'emoji 🏷️ dans sa ligne
    const cardRow = authedPage.locator("div").filter({ hasText: "Coupon Test Client" }).first();
    await expect(cardRow).toContainText("🏷️", { timeout: 10000 });
  });

  // ── Test 2 : badge coupon dans le panneau détail ──────────────
  test("panneau détail affiche le code promo et la remise", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/confirmation");
    await authedPage.waitForTimeout(3000);

    // Cliquer sur la carte pour ouvrir le panneau droit
    await authedPage.getByText("Coupon Test Client").first().click();
    await authedPage.waitForTimeout(1500);

    // Le panneau doit afficher "Code promo :" + le code (exact match sur le span badge)
    await expect(authedPage.getByText(/Code promo/i)).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText(COUPON_CODE, { exact: true })).toBeVisible({ timeout: 5000 });

    // Le montant de la remise doit s'afficher (badge -250 DA)
    await expect(authedPage.getByText(/-250\s*DA/)).toBeVisible({ timeout: 5000 });
  });

  // ── Test 3 : vérification DB — coupon_code bien stocké ────────
  test("coupon_code et coupon_discount correctement stockés en DB", async () => {
    const rows = await sbQuery(
      "nc_orders",
      `order_id=eq.${TEST_ID}&select=coupon_code,coupon_discount`
    );
    expect(rows[0]?.coupon_code,    "coupon_code doit être TEST05").toBe(COUPON_CODE);
    expect(Number(rows[0]?.coupon_discount), "coupon_discount doit être 250").toBe(COUPON_DISC);
  });

  // ── Test 4 : commande SANS coupon — panneau détail sans "Code promo" ────
  test("commande sans coupon : panneau détail n'affiche pas de Code promo", async ({ authedPage }) => {
    // Insérer une commande sans coupon pour vérification croisée
    const noCoId = `TEST_NO_COUPON_${Date.now()}`;
    await sbInsert("nc_orders", {
      order_id:            noCoId,
      order_name:          "NC-TEST-NOCOUPON",
      customer_name:       "SansCoupon Zetest",
      customer_phone:      "0609080706",
      wilaya:              "Oran",
      order_total:         2000,
      order_source:        "nc_boutique",
      confirmation_status: "nouveau",
      archived:            false,
      coupon_code:         null,
      coupon_discount:     null,
      order_date:          new Date().toISOString(),
    });

    try {
      await authedPage.goto("/dashboard/confirmation");
      await authedPage.waitForTimeout(3000);

      // Cliquer sur la commande sans coupon
      await authedPage.getByText("SansCoupon Zetest").first().click();
      await authedPage.waitForTimeout(1500);

      // Le panneau détail NE doit PAS afficher "Code promo"
      // On vérifie que dans le panneau détail visible, le texte "Code promo" est absent
      const detailPanel = authedPage.locator(".max-w-2xl").first();
      await expect(detailPanel).toBeVisible({ timeout: 8000 });
      await expect(detailPanel.getByText(/Code promo/i)).not.toBeVisible({ timeout: 3000 });
    } finally {
      await sbDelete("nc_orders", `order_id=eq.${noCoId}`);
    }
  });

});
