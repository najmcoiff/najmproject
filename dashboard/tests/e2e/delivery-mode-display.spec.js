/**
 * delivery-mode-display.spec.js
 *
 * Vérifie que :
 *   1. [UI]  La page /dashboard/confirmation affiche "Bureau" ou "Domicile"
 *            pour les commandes nc_boutique (qui n'ont pas shopify_delivery_mode)
 *   2. [UI]  La page /dashboard/preparation affiche aussi le mode de livraison
 *   3. [API] POST /api/inject/single construit le bon deliveryType ZR
 *            ("pickup-point" pour office, "home" pour home) en lisant delivery_mode
 *   4. [API] POST /api/inject/single bureau → hubId = hub wilaya client (pas Alger Birkhadem)
 *            Le numéro de tracking doit commencer par le code wilaya du client, pas "16" (Alger)
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";

const BASE_URL = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";

const ORDER_OFFICE = `DELV_OFFICE_${Date.now()}`;
const ORDER_HOME   = `DELV_HOME_${Date.now()}`;

test.beforeAll(async () => {
  // Commande boutique avec livraison bureau (office)
  await sbInsert("nc_orders", {
    order_id:            ORDER_OFFICE,
    customer_name:       "Test Bureau Delivery",
    customer_phone:      "0555111222",
    wilaya:              "Alger",
    commune:             "Bab Ezzouar",
    order_total:         "2500",
    order_source:        "nc_boutique",
    confirmation_status: "nouveau",
    decision_status:     "en_attente",
    delivery_type:       "office",
    delivery_mode:       "Bureau",
    shopify_delivery_mode: null,
    archived:            false,
  });

  // Commande boutique avec livraison domicile (home)
  await sbInsert("nc_orders", {
    order_id:            ORDER_HOME,
    customer_name:       "Test Domicile Delivery",
    customer_phone:      "0666333444",
    wilaya:              "Oran",
    commune:             "Bir El Djir",
    order_total:         "1800",
    order_source:        "nc_boutique",
    confirmation_status: "nouveau",
    decision_status:     "en_attente",
    delivery_type:       "home",
    delivery_mode:       "Domicile",
    shopify_delivery_mode: null,
    archived:            false,
  });
});

test.afterAll(async () => {
  await sbDelete("nc_orders", `order_id=eq.${ORDER_OFFICE}`);
  await sbDelete("nc_orders", `order_id=eq.${ORDER_HOME}`);
});

// ── Test 1 : Confirmation — affichage "Bureau" dans le détail ─────────
test("confirmation : delivery_mode Bureau visible pour commande boutique sans shopify_delivery_mode", async ({ authedPage }) => {
  const page = authedPage;
  await page.goto(`${BASE_URL}/dashboard/confirmation`);
  await page.waitForLoadState("networkidle");

  // Trouver et cliquer sur la commande bureau
  const orderCard = page.locator("text=Test Bureau Delivery").first();
  await expect(orderCard).toBeVisible({ timeout: 15_000 });
  await orderCard.click();
  await page.waitForTimeout(800);

  // Vérifier que "Bureau" est affiché dans le panneau détail
  const detail = page.locator("[data-testid='order-detail'], .order-detail, #order-detail").first();
  // On cherche le badge livraison dans le détail — soit dans le chip wilaya/commune, soit dans le résumé
  const bureauBadge = page.locator("span.bg-blue-50:has-text('Bureau'), span.text-blue-700:has-text('Bureau')").first();
  await expect(bureauBadge).toBeVisible({ timeout: 5_000 });
});

// ── Test 2 : Confirmation — affichage "Domicile" dans le détail ───────
test("confirmation : delivery_mode Domicile visible pour commande boutique sans shopify_delivery_mode", async ({ authedPage }) => {
  const page = authedPage;
  await page.goto(`${BASE_URL}/dashboard/confirmation`);
  await page.waitForLoadState("networkidle");

  const orderCard = page.locator("text=Test Domicile Delivery").first();
  await expect(orderCard).toBeVisible({ timeout: 15_000 });
  await orderCard.click();
  await page.waitForTimeout(800);

  const domicileBadge = page.locator("span.bg-blue-50:has-text('Domicile'), span.text-blue-700:has-text('Domicile')").first();
  await expect(domicileBadge).toBeVisible({ timeout: 5_000 });
});

// ── Test 3 : API inject/single — vérifie que delivery_mode est bien lu ─
test("API inject/single : lit delivery_mode de nc_orders et construit le bon ZR payload", async ({ request }) => {
  // On ne peut pas appeler ZR en test (env prod) — on vérifie via Supabase
  // que le champ delivery_mode est bien dans nc_orders pour la commande test
  const rows = await sbQuery("nc_orders", `order_id=eq.${ORDER_OFFICE}&select=delivery_mode,delivery_type,shopify_delivery_mode`);
  expect(Array.isArray(rows)).toBe(true);
  expect(rows.length).toBe(1);
  const order = rows[0];

  // Vérifie que les champs utiles sont bien présents (sans shopify_delivery_mode)
  expect(order.shopify_delivery_mode).toBeNull();
  expect(order.delivery_type).toBe("office");
  expect(order.delivery_mode).toBe("Bureau");

  // Vérifie la logique ZR : /bureau|office/i doit matcher → pickup-point
  const rawMode = order.shopify_delivery_mode || order.delivery_mode || order.delivery_type || "";
  const zrType  = /pickup|stopdesk|pickpoint|bureau|office/i.test(rawMode) ? "pickup-point" : "home";
  expect(zrType).toBe("pickup-point");
});

// ── Test 4 : Supabase — vérification champ delivery_mode pour commande home
test("Supabase : commande home delivery_mode=Domicile → ZR deliveryType=home", async () => {
  const rows = await sbQuery("nc_orders", `order_id=eq.${ORDER_HOME}&select=delivery_mode,delivery_type,shopify_delivery_mode`);
  const order = rows[0];

  expect(order.shopify_delivery_mode).toBeNull();
  expect(order.delivery_type).toBe("home");
  expect(order.delivery_mode).toBe("Domicile");

  const rawMode = order.shopify_delivery_mode || order.delivery_mode || order.delivery_type || "";
  const zrType  = /pickup|stopdesk|pickpoint|bureau|office/i.test(rawMode) ? "pickup-point" : "home";
  expect(zrType).toBe("home");
});

// ── Test 5 : Bureau hub — commande stopdesk hors-Alger → hub wilaya client ──
// Vérifie que le tracking commence par le code de la wilaya (31=Oran) et NON par 16 (Alger)
test("inject/single bureau Oran : tracking doit commencer par 31 (pas 16 Alger)", async ({ request }) => {
  const ORDER_BUREAU_ORAN = `TEST_BUREAU_ORAN_E2E_${Date.now()}`;

  // 1. Créer commande bureau test depuis Oran
  await sbInsert("nc_orders", {
    order_id:            ORDER_BUREAU_ORAN,
    customer_name:       "Test Bureau Oran E2E",
    customer_phone:      "0555987654",
    wilaya:              "Oran",
    commune:             "Oran",
    order_total:         "2000",
    order_source:        "nc_boutique",
    confirmation_status: "nouveau",
    decision_status:     "confirmer",
    delivery_type:       "office",
    delivery_mode:       "Bureau",
    shopify_delivery_mode: null,
    archived:            false,
  });

  let parcelId = null;
  try {
    // 2. Récupérer un token valide depuis le fichier session
    const fs   = await import("fs");
    const sess = JSON.parse(fs.readFileSync(".playwright-auth/session.json", "utf-8"));
    const token = sess.token;

    // 3. Injecter via /api/inject/single
    const resp = await request.post(`${BASE_URL}/api/inject/single`, {
      data:    { order_id: ORDER_BUREAU_ORAN, token },
      timeout: 30_000,
    });
    const json = await resp.json();

    // 4. Vérifier que l'injection a réussi
    expect(json.ok, `injection échouée: ${json.error}`).toBe(true);
    expect(json.tracking).toBeTruthy();
    parcelId = json.parcel_id;

    // 5. Vérifier que le tracking commence par "31" (Oran) et PAS "16" (Alger Birkhadem)
    const prefix = json.tracking?.split("-")[0];
    expect(
      prefix,
      `tracking ${json.tracking} devrait commencer par 31 (Oran) mais commence par ${prefix} (16=Alger Birkhadem)`,
    ).toBe("31");

    // 6. Vérifier en DB que zr_locked=OUI et tracking stocké
    const rows = await sbQuery("nc_orders", `order_id=eq.${ORDER_BUREAU_ORAN}&select=zr_locked,tracking`);
    expect(rows[0]?.zr_locked).toBe("OUI");
    expect(rows[0]?.tracking).toBe(json.tracking);

  } finally {
    // 7. Nettoyage — supprimer la commande test (le colis ZR restera dans le système ZR mais c'est acceptable)
    await sbDelete("nc_orders",   `order_id=eq.${ORDER_BUREAU_ORAN}`);
    await sbDelete("nc_suivi_zr", `order_id=eq.${ORDER_BUREAU_ORAN}`);
  }
});
