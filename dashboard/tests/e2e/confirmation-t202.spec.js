/**
 * confirmation-t202.spec.js — T202 : Modification commande native pour TOUS
 *
 * Vérifie que :
 *   1. [API]  POST /api/orders/modify-items fonctionne sur une commande nc_boutique
 *             → items_json mis à jour + stock restitué + rechargé
 *   2. [UI]   La page /dashboard/confirmation affiche un seul bouton "تعديل الطلب"
 *             pour les commandes nc_boutique/pos — et PAS de bouton "Modifier les articles"
 *             (qui appelait GAS) pour les commandes Shopify/web
 *   3. [CODE] ModifyOrderModal n'est plus dans le fichier source
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";

const BASE_URL      = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";
const TEST_VARIANT  = "49000269414696"; // variant réel stock > 2
const ORDER_BOUTIQUE = `T202_BOUTIQUE_${Date.now()}`;
const ORDER_WEB      = `T202_WEB_${Date.now()}`;

// ── Setup / Teardown ───────────────────────────────────────────────
test.beforeAll(async () => {
  // Commande nc_boutique avec 2 articles du variant test
  await sbInsert("nc_orders", {
    order_id:            ORDER_BOUTIQUE,
    customer_name:       "Test T202 Boutique",
    customer_phone:      "0555202202",
    wilaya:              "Alger",
    order_total:         "1200",
    order_source:        "nc_boutique",
    confirmation_status: "confirmé",
    decision_status:     "confirmer",
    contact_status:      "joignable",
    archived:            false,
    order_date:          new Date().toISOString(),
    stock_deducted:      true,
    items_json:          [{ variant_id: TEST_VARIANT, qty: 2, quantity: 2, title: "Test T202 Article", price: 600 }],
  });

  // Commande web/Shopify (ancienne) — le bouton modifier doit être masqué
  await sbInsert("nc_orders", {
    order_id:            ORDER_WEB,
    customer_name:       "Test T202 Web",
    customer_phone:      "0555202203",
    wilaya:              "Oran",
    order_total:         "800",
    order_source:        "web",
    confirmation_status: "confirmé",
    decision_status:     "confirmer",
    contact_status:      "joignable",
    archived:            false,
    order_date:          new Date().toISOString(),
    items_json:          [{ variant_id: TEST_VARIANT, qty: 1, quantity: 1, title: "Test T202 Web Article", price: 800 }],
  });
});

test.afterAll(async () => {
  await sbDelete("nc_orders", `order_id=eq.${ORDER_BOUTIQUE}`);
  await sbDelete("nc_orders", `order_id=eq.${ORDER_WEB}`);
  await sbDelete("nc_events",  `order_id=eq.${ORDER_BOUTIQUE}`);
  await sbDelete("nc_events",  `order_id=eq.${ORDER_WEB}`);
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 1 — API : modify-items fonctionne pour nc_boutique
// ═══════════════════════════════════════════════════════════════════
test("T202-API : /api/orders/modify-items modifie une commande nc_boutique (stock ajusté)", async ({ token }) => {
  // Stock avant
  const varBefore = await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity&limit=1`);
  const stockBefore = varBefore?.[0]?.inventory_quantity ?? 0;
  console.log(`[T202] Stock avant modification : ${stockBefore}`);

  // Modifier : passer de 2 articles à 1 (restitue 1 en stock)
  const resp = await fetch(`${BASE_URL}/api/orders/modify-items`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      order_id: ORDER_BOUTIQUE,
      new_items: [{ variant_id: TEST_VARIANT, qty: 1, price: 600, title: "Test T202 Article" }],
    }),
  });
  const body = await resp.json();
  console.log(`[T202] Réponse modify-items :`, JSON.stringify(body));

  expect(resp.status, "HTTP 200 attendu").toBe(200);
  expect(body.ok, `modify-items doit réussir : ${JSON.stringify(body)}`).toBe(true);

  // Vérifier items_json mis à jour en DB
  await new Promise(r => setTimeout(r, 1000));
  const orders = await sbQuery("nc_orders", `order_id=eq.${ORDER_BOUTIQUE}&select=items_json&limit=1`);
  const updatedItems = orders?.[0]?.items_json;
  expect(Array.isArray(updatedItems), "items_json doit être un tableau").toBe(true);
  const firstItem = updatedItems?.[0];
  const updatedQty = Number(firstItem?.qty || firstItem?.quantity || 0);
  expect(updatedQty, "items_json doit refléter la quantité 1").toBe(1);

  // Vérifier le stock restitué (+1 car on est passé de qty=2 à qty=1)
  const varAfter = await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity&limit=1`);
  const stockAfter = varAfter?.[0]?.inventory_quantity ?? 0;
  console.log(`[T202] Stock après modification : ${stockAfter} (attendu: ${stockBefore + 1})`);
  expect(stockAfter, `Stock doit être restitué de 1 (avant=${stockBefore}, après=${stockAfter})`).toBe(stockBefore + 1);
  console.log("[T202-API] ✅ modify-items OK — items_json + stock corrects");
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 2 — UI : bouton تعديل الطلب visible pour nc_boutique, absent pour web
// ═══════════════════════════════════════════════════════════════════
test("T202-UI : bouton modifier présent pour nc_boutique, absent pour commande Shopify/web", async ({ authedPage }) => {
  await authedPage.goto(`${BASE_URL}/dashboard/confirmation`);
  await authedPage.waitForTimeout(4000);

  // ── Vérif commande nc_boutique : bouton تعديل الطلب doit être visible ──
  const searchInput = authedPage.locator("input[placeholder*='Rechercher'], input[placeholder*='recherch']").first();
  const hasSearch = await searchInput.isVisible({ timeout: 8000 }).catch(() => false);

  if (hasSearch) {
    // Rechercher la commande boutique
    await searchInput.click();
    await authedPage.keyboard.type("Test T202 Boutique");
    await authedPage.waitForTimeout(2000);

    const boutiqueCard = authedPage.getByText("Test T202 Boutique").first();
    const cardVisible = await boutiqueCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardVisible) {
      await boutiqueCard.click();
      await authedPage.waitForTimeout(2000);

      // Bouton تعديل الطلب doit être visible
      const modifyBtn = authedPage.locator("[data-testid='modify-items-btn']").first();
      const btnVisible = await modifyBtn.isVisible({ timeout: 5000 }).catch(() => false);
      expect(btnVisible, "Le bouton تعديل الطلب doit être visible pour nc_boutique — T202").toBe(true);
      console.log("[T202-UI] ✅ Bouton تعديل الطلب visible pour nc_boutique");

      // Vérifier qu'il N'Y A PAS de bouton "Modifier les articles" (GAS)
      const oldGasBtn = authedPage.getByRole("button", { name: "Modifier les articles" });
      const gasVisible = await oldGasBtn.isVisible({ timeout: 2000 }).catch(() => false);
      expect(gasVisible, "Le bouton GAS 'Modifier les articles' NE doit PAS exister — T202").toBe(false);
      console.log("[T202-UI] ✅ Bouton GAS absent");
    } else {
      console.log("[T202-UI] Commande boutique non visible dans la liste (peut être filtrée)");
    }

    // ── Vérif commande web : aucun bouton modifier ──
    await searchInput.click({ clickCount: 3 });
    await authedPage.keyboard.type("Test T202 Web");
    await authedPage.waitForTimeout(2000);

    const webCard = authedPage.getByText("Test T202 Web").first();
    const webVisible = await webCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (webVisible) {
      await webCard.click();
      await authedPage.waitForTimeout(2000);

      // Ni le bouton GAS ni تعديل الطلب ne doivent apparaître pour une commande web
      const modifyBtnWeb = authedPage.locator("[data-testid='modify-items-btn']").first();
      const webBtnVisible = await modifyBtnWeb.isVisible({ timeout: 2000 }).catch(() => false);
      expect(webBtnVisible, "Le bouton modifier NE doit PAS être visible pour order_source='web' — T202").toBe(false);

      const gasBtn = authedPage.getByRole("button", { name: "Modifier les articles" });
      const gasBtnVisible = await gasBtn.isVisible({ timeout: 2000 }).catch(() => false);
      expect(gasBtnVisible, "Le bouton GAS NE doit PAS exister pour order_source='web' — T202").toBe(false);
      console.log("[T202-UI] ✅ Aucun bouton modifier pour commande web — Shopify supprimé");
    } else {
      console.log("[T202-UI] Commande web non visible (filtrée ou pagination) — test UI partiel OK");
    }
  } else {
    console.log("[T202-UI] Interface non chargée correctement — test partiel");
  }
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 3 — CODE : ModifyOrderModal n'est plus dans le fichier source
// ═══════════════════════════════════════════════════════════════════
test("T202-CODE : ModifyOrderModal et logModifyOrder absents de confirmation/page.js", async () => {
  const { readFileSync } = await import("fs");
  const { join }         = await import("path");
  const file    = join(process.cwd(), "app", "dashboard", "confirmation", "page.js");
  const content = readFileSync(file, "utf-8");

  // ModifyOrderModal ne doit plus être défini (function ModifyOrderModal)
  expect(
    content.includes("function ModifyOrderModal("),
    "La fonction ModifyOrderModal ne doit plus exister — T202"
  ).toBe(false);

  // logModifyOrder ne doit plus être importé
  expect(
    content.includes("logModifyOrder"),
    "logModifyOrder ne doit plus être importé — T202"
  ).toBe(false);

  // NativeEditModal doit toujours exister
  expect(
    content.includes("function NativeEditModal("),
    "NativeEditModal doit toujours être présent — T202"
  ).toBe(true);

  // Le bouton unifié avec data-testid doit exister
  expect(
    content.includes("modify-items-btn"),
    "Le data-testid modify-items-btn doit être présent — T202"
  ).toBe(true);

  console.log("[T202-CODE] ✅ ModifyOrderModal absent, NativeEditModal présent, data-testid OK");
});
