/**
 * cloture-t201.spec.js — Clôture V2 (sans order_id, logique archived)
 *
 * Vérifie que :
 *   1. POST /api/cloture ne requiert plus order_id et fonctionne sans Shopify
 *   2. Une commande annulée (decision_status='annuler') est archivée + stock restitué
 *   3. Une commande avec tracking est archivée (sans restock)
 *   4. Les commandes actives (sans tracking, non annulées) ne sont PAS archivées
 *   5. L'UI page Opérations affiche le bouton sans picker de commande
 *
 * Test humain : vrai navigateur, goto → click → waitForTimeout → vérif DB.
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";

const BASE_URL     = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";
const TEST_VARIANT = "49000269414696";
const TS           = Date.now();
const ORDER_ANNULE  = `T201_ANNULE_${TS}`;
const ORDER_TRACK   = `T201_TRACK_${TS}`;
const ORDER_ACTIVE  = `T201_ACTIVE_${TS}`;

// ── Setup / Teardown ───────────────────────────────────────────────
test.beforeAll(async () => {
  await sbInsert("nc_orders", {
    order_id:        ORDER_ANNULE,
    customer_name:   "Test T201 Annulé",
    customer_phone:  "0555201201",
    wilaya:          "Alger",
    order_total:     "1500",
    order_source:    "nc_boutique",
    decision_status: "annuler",
    archived:        false,
    order_date:      new Date().toISOString(),
    items_json:      [{ variant_id: TEST_VARIANT, quantity: 1, qty: 1, title: "Test T201 Article" }],
  });
  await sbInsert("nc_orders", {
    order_id:        ORDER_TRACK,
    customer_name:   "Test T201 Tracking",
    customer_phone:  "0555201202",
    wilaya:          "Oran",
    order_total:     "2000",
    order_source:    "nc_boutique",
    decision_status: "confirmer",
    tracking:        "16-TESTTRACK-ZR",
    archived:        false,
    order_date:      new Date().toISOString(),
    items_json:      [{ variant_id: TEST_VARIANT, quantity: 1, qty: 1, title: "Test T201 Tracking Article" }],
  });
  await sbInsert("nc_orders", {
    order_id:        ORDER_ACTIVE,
    customer_name:   "Test T201 Actif",
    customer_phone:  "0555201203",
    wilaya:          "Constantine",
    order_total:     "1000",
    order_source:    "nc_boutique",
    decision_status: "confirmer",
    archived:        false,
    order_date:      new Date().toISOString(),
    items_json:      [{ variant_id: TEST_VARIANT, quantity: 1, qty: 1, title: "Test T201 Actif Article" }],
  });
});

test.afterAll(async () => {
  for (const id of [ORDER_ANNULE, ORDER_TRACK, ORDER_ACTIVE]) {
    await sbDelete("nc_orders", `order_id=eq.${id}`);
    await sbDelete("nc_events", `order_id=eq.${id}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 1 — API : clôture sans order_id, vérifie archived + restock
// ═══════════════════════════════════════════════════════════════════
test("T201-API : POST /api/cloture sans order_id archive et restitue le stock", async ({ token }) => {
  test.setTimeout(90000);
  const variantsBefore = await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity&limit=1`);
  const stockBefore = variantsBefore?.[0]?.inventory_quantity ?? 0;
  console.log(`[T201] Stock avant clôture : ${stockBefore}`);

  const resp = await fetch(`${BASE_URL}/api/cloture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const body = await resp.json();

  console.log(`[T201] Réponse cloture :`, JSON.stringify(body));
  expect(resp.status, "HTTP 200 attendu").toBe(200);
  expect(body.ok, `cloture doit réussir : ${JSON.stringify(body)}`).toBe(true);
  expect(body.cancelled_shopify, "cancelled_shopify doit être 0").toBe(0);
  expect(body.cancelled_count, "au moins 1 annulée traitée").toBeGreaterThanOrEqual(1);

  // Commande annulée → archived=true + restocked=true
  const ordersAnnule = await sbQuery("nc_orders", `order_id=eq.${ORDER_ANNULE}&select=archived,restocked&limit=1`);
  expect(ordersAnnule?.[0]?.archived, "commande annulée doit être archived=true").toBe(true);
  expect(ordersAnnule?.[0]?.restocked, "commande annulée doit être restocked=true").toBe(true);

  // Stock restitué (+1)
  const variantsAfter = await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity&limit=1`);
  const stockAfter = variantsAfter?.[0]?.inventory_quantity ?? 0;
  console.log(`[T201] Stock après clôture : ${stockAfter}`);
  expect(stockAfter, `Stock doit avoir augmenté (avant=${stockBefore}, après=${stockAfter})`).toBeGreaterThanOrEqual(stockBefore + 1);

  // Log ORDER_CANCELLED créé
  await new Promise(r => setTimeout(r, 1500));
  const events = await sbQuery("nc_events", `order_id=eq.${ORDER_ANNULE}&log_type=eq.ORDER_CANCELLED&limit=1`);
  expect(events?.length, "Log ORDER_CANCELLED doit exister").toBeGreaterThan(0);

  // Commande avec tracking → archived=true (sans restocked)
  const ordersTrack = await sbQuery("nc_orders", `order_id=eq.${ORDER_TRACK}&select=archived,restocked&limit=1`);
  expect(ordersTrack?.[0]?.archived, "commande avec tracking doit être archived=true").toBe(true);
  expect(ordersTrack?.[0]?.restocked, "commande avec tracking ne doit pas être restocked").toBe(false);

  // Commande active → PAS archivée
  const ordersActive = await sbQuery("nc_orders", `order_id=eq.${ORDER_ACTIVE}&select=archived&limit=1`);
  expect(ordersActive?.[0]?.archived, "commande active ne doit PAS être archivée").toBe(false);

  console.log("[T201-API] ✅ Clôture V2 : archived correct, restock correct, commande active préservée");
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 2 — UI : page Opérations — bouton direct sans picker
// ═══════════════════════════════════════════════════════════════════
test("T201-UI : page /dashboard/operations affiche clôture sans picker de commande", async ({ authedPage }) => {
  await authedPage.goto(`${BASE_URL}/dashboard/operations`);
  await authedPage.waitForTimeout(3000);

  // Section Clôture visible (label dans la carte)
  const clotureLabel = authedPage.getByText(/clôture journée/i).first();
  await expect(clotureLabel).toBeVisible({ timeout: 15000 });
  console.log("[T201-UI] Section Clôture visible");

  // Ouvrir la carte — le bouton toggle de la carte clôture dit "Ouvrir"
  // La clôture est la première OpCard, donc premier bouton "Ouvrir"
  const openBtn = authedPage.getByRole("button", { name: "Ouvrir" }).first();
  await expect(openBtn).toBeVisible({ timeout: 10000 });
  await openBtn.click();
  await authedPage.waitForTimeout(2000);
  console.log("[T201-UI] Carte clôture ouverte via bouton Ouvrir");

  // Vérifier qu'il n'y a PAS de champ de recherche de commande de coupure
  const picker = authedPage.locator("input[placeholder*='coupure']");
  const pickerVisible = await picker.isVisible({ timeout: 2000 }).catch(() => false);
  expect(pickerVisible, "Il ne doit PAS y avoir de picker de commande de coupure").toBe(false);
  console.log("[T201-UI] ✅ Pas de picker de commande — correct");

  // Bouton Lancer la clôture est directement visible et activé
  const clotureBtn = authedPage.locator("button").filter({ hasText: /lancer la clôture journée/i }).first();
  await expect(clotureBtn).toBeVisible({ timeout: 15000 });
  const isDisabled = await clotureBtn.isDisabled();
  expect(isDisabled, "Le bouton clôture ne doit PAS être désactivé").toBe(false);
  console.log("[T201-UI] ✅ Bouton Lancer la clôture visible et actif");
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 3 — CODE : pas de import shopify dans cloture/route.js
// ═══════════════════════════════════════════════════════════════════
test("T201-CODE : cloture/route.js ne contient plus d'import shopify ni order_id requis", async () => {
  const { readFileSync } = await import("fs");
  const { join }         = await import("path");
  const routeFile = join(process.cwd(), "app", "api", "cloture", "route.js");
  const content   = readFileSync(routeFile, "utf-8");

  expect(content.includes('from "@/lib/shopify"'), "pas d'import shopify").toBe(false);
  expect(content.includes("increment_stock"), "increment_stock doit être présent").toBe(true);
  expect(content.includes("archived"), "archived doit être utilisé").toBe(true);
  expect(content.includes("restocked"), "restocked doit être utilisé").toBe(true);

  console.log("[T201-CODE] ✅ Route cloture V2 conforme");
});
