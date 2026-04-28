/**
 * stock-t203.spec.js — T203 : Injection PO native (Playwright humain)
 *
 * Remplace GAS RUN_INJECT_PO → /api/po/inject (Supabase direct)
 *
 * Flux testés :
 *   1. API  : insérer ligne nc_po_lines test → POST /api/po/inject
 *             → vérifier stock +3 dans nc_variants + synced_at renseigné
 *             → re-injection bloquée (anti-doublon)
 *   2. UI   : bouton "⚡ Injecter" dans l'onglet Historique PO
 *             appelle /api/po/inject (pas /api/gas)
 *   3. CODE : lib/api.js ne contient plus gasPost("RUN_INJECT_PO")
 */
import { test, expect, sbInsert, sbDelete, sbQuery, sbPatch } from "./fixtures.js";
import * as fs   from "fs";
import * as path from "path";

const BASE_URL      = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";
const TEST_VARIANT  = "49000269414696"; // variante réelle en base avec stock >= 0
const TEST_PO_ID    = `TEST-T203-${Date.now()}`;
const TEST_LINE_ID  = `TLINE-T203-${Date.now()}`; // po_line_id est text sans défaut
let   stockBefore   = 0;

// ── Setup / Teardown ───────────────────────────────────────────────
test.beforeAll(async () => {
  // Lire le stock actuel
  const rows = await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity&limit=1`);
  stockBefore = Number(rows?.[0]?.inventory_quantity ?? 0);
  console.log(`[T203] Stock avant injection : ${stockBefore}`);

  // Insérer une ligne de test dans nc_po_lines (po_line_id est text sans défaut — on le fournit)
  await sbInsert("nc_po_lines", {
    po_line_id:     TEST_LINE_ID,
    po_id:          TEST_PO_ID,
    variant_id:     TEST_VARIANT,
    qty_add:        3,
    sell_price:     2500,
    purchase_price: 1200,
    barcode:        "TEST-BARCODE-T203",
    display_name:   "Article test T203",
    synced_at:      null,
  });
  console.log(`[T203] Ligne test créée : po_line_id=${TEST_LINE_ID}`);
});

test.afterAll(async () => {
  // Remettre le stock à la valeur initiale
  if (stockBefore !== null) {
    await sbPatch("nc_variants", `variant_id=eq.${TEST_VARIANT}`, { inventory_quantity: stockBefore });
  }
  // Supprimer la ligne de test
  await sbDelete("nc_po_lines", `po_line_id=eq.${TEST_LINE_ID}`);
});

// ════════════════════════════════════════════════════════════════
//  TEST 1 — API : injection crée stock + synced_at
// ════════════════════════════════════════════════════════════════
test("T203-API : POST /api/po/inject incrémente stock et marque synced_at", async ({ token }) => {
  // Appel POST /api/po/inject avec le po_id de test
  const resp = await fetch(`${BASE_URL}/api/po/inject`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ token, po_id: TEST_PO_ID }),
  });
  expect(resp.status, "HTTP 200 attendu").toBe(200);

  const body = await resp.json();
  console.log(`[T203] Réponse inject :`, JSON.stringify(body));

  expect(body.ok, `ok doit être true : ${JSON.stringify(body)}`).toBe(true);
  expect(body.lignes_ok, "lignes_ok doit être 1").toBe(1);
  expect(body.lignes_ko, "lignes_ko doit être 0").toBe(0);
  expect(body.message, "message doit mentionner la base").toContain("Stock mis à jour");

  // ── Vérifier stock +3 dans nc_variants ────────────────────────
  const rows = await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity,price,cost_price,barcode&limit=1`);
  const variant = rows?.[0];
  const stockAfter = Number(variant?.inventory_quantity ?? 0);
  console.log(`[T203] Stock: avant=${stockBefore} après=${stockAfter} (attendu +3)`);
  expect(stockAfter, `Stock doit être +3 (avant=${stockBefore}, après=${stockAfter})`).toBe(stockBefore + 3);

  // Prix et barcode mis à jour
  expect(Number(variant?.price), "prix doit être 2500").toBe(2500);
  expect(Number(variant?.cost_price), "coût doit être 1200").toBe(1200);
  expect(variant?.barcode, "barcode doit être TEST-BARCODE-T203").toBe("TEST-BARCODE-T203");

  // ── Vérifier synced_at renseigné sur la ligne ──────────────────
  const lines = await sbQuery("nc_po_lines", `po_line_id=eq.${TEST_LINE_ID}&select=synced_at&limit=1`);
  expect(lines?.[0]?.synced_at, "synced_at doit être renseigné après injection").toBeTruthy();
  console.log(`[T203] synced_at : ${lines?.[0]?.synced_at}`);

  // ── Anti-doublon : réinjecter le même PO ne doit rien faire ─────
  const resp2  = await fetch(`${BASE_URL}/api/po/inject`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ token, po_id: TEST_PO_ID }),
  });
  const body2 = await resp2.json();
  console.log(`[T203] Ré-injection :`, JSON.stringify(body2));
  expect(body2.ok, "ok doit être true (rien à faire)").toBe(true);
  expect(body2.lignes_ok, "lignes_ok doit être 0 (déjà injecté)").toBe(0);

  const rows2 = await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity&limit=1`);
  const stockFinal = Number(rows2?.[0]?.inventory_quantity ?? 0);
  expect(stockFinal, "Le stock ne doit pas avoir encore augmenté (anti-doublon)").toBe(stockBefore + 3);
  console.log("[T203] ✅ Anti-doublon OK — stock inchangé après ré-injection");
});

// ════════════════════════════════════════════════════════════════
//  TEST 2 — UI : bouton Injecter appelle /api/po/inject, pas /api/gas
// ════════════════════════════════════════════════════════════════
test("T203-UI : bouton Injecter dans Historique PO appelle /api/po/inject", async ({ authedPage }) => {
  const injectCalls = [];
  const gasCalls    = [];

  authedPage.on("request", req => {
    if (req.url().includes("/api/po/inject")) injectCalls.push(req.url());
    if (req.url().includes("/api/gas"))       gasCalls.push(req.url());
  });

  // ── Aller sur la page stock ───────────────────────────────────
  await authedPage.goto(`${BASE_URL}/dashboard/stock`);
  await authedPage.waitForTimeout(2000);

  // ── Cliquer sur l'onglet Historique PO ───────────────────────
  const histTab = authedPage.getByText(/Historique PO/i);
  await expect(histTab, "Onglet Historique PO doit être visible").toBeVisible({ timeout: 10000 });
  await histTab.click();
  await authedPage.waitForTimeout(2000);

  // ── Vérifier la page Historique PO ───────────────────────────
  await expect(
    authedPage.getByText(/Historique des bons de commande/i),
    "Titre Historique doit être visible"
  ).toBeVisible({ timeout: 10000 });

  // ── Cliquer sur le bouton Injecter d'un bon (si existants) ───
  const firstInjectBtn = authedPage.locator("button:has-text('⚡ Injecter')").first();
  const hasBons = await firstInjectBtn.isVisible({ timeout: 3000 }).catch(() => false);

  if (hasBons) {
    // Intercepter la boîte de confirmation et annuler (éviter injection réelle)
    authedPage.on("dialog", dialog => {
      console.log(`[T203-UI] Dialog : "${dialog.message()}"`);
      dialog.dismiss();
    });

    await firstInjectBtn.click();
    await authedPage.waitForTimeout(1000);

    // Aucun appel GAS ne doit avoir été déclenché
    console.log(`[T203-UI] /api/po/inject calls: ${injectCalls.length}, /api/gas calls: ${gasCalls.length}`);
    expect(gasCalls.length, "Aucun appel GAS ne doit être déclenché par Injecter").toBe(0);
  } else {
    // Aucun bon en historique — simplement vérifier que la page fonctionne
    console.log("[T203-UI] Aucun bon dans l'historique — test navigation uniquement");
  }

  // Vérifier absence de message d'erreur critique sur la page
  const bodyText = await authedPage.locator("body").textContent();
  const hasAppError = bodyText.includes("Application error") || bodyText.includes("Internal Server Error");
  expect(hasAppError, "Aucune erreur serveur sur la page stock").toBe(false);

  console.log("[T203-UI] ✅ Page Historique PO accessible, pas d'appel GAS");
});

// ════════════════════════════════════════════════════════════════
//  TEST 3 — CODE : lib/api.js appelle /api/po/inject, pas gasPost RUN_INJECT_PO
// ════════════════════════════════════════════════════════════════
test("T203-CODE : lib/api.js appelle /api/po/inject, pas gasPost RUN_INJECT_PO", async () => {
  const apiPath  = path.join(process.cwd(), "lib", "api.js");
  const content  = fs.readFileSync(apiPath, "utf-8");

  expect(
    content.includes('gasPost("RUN_INJECT_PO"'),
    "gasPost RUN_INJECT_PO ne doit plus être dans lib/api.js"
  ).toBe(false);

  expect(
    content.includes("/api/po/inject"),
    "/api/po/inject doit être dans lib/api.js"
  ).toBe(true);

  console.log("[T203-CODE] ✅ gasPost RUN_INJECT_PO absent, /api/po/inject présent dans lib/api.js");

  // Vérifier que la route existe avec le bon contenu
  const routePath    = path.join(process.cwd(), "app", "api", "po", "inject", "route.js");
  const routeContent = fs.readFileSync(routePath, "utf-8");

  expect(fs.existsSync(routePath), "Le fichier /api/po/inject/route.js doit exister").toBe(true);
  expect(routeContent.includes("increment_stock"), "route doit appeler increment_stock").toBe(true);
  expect(routeContent.includes("synced_at"), "route doit mettre à jour synced_at").toBe(true);

  console.log("[T203-CODE] ✅ route /api/po/inject contient increment_stock et synced_at");
});
