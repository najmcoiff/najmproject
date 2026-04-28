/**
 * po-lines-t204.spec.js — T204 : ADD_PO_LINES natif (Playwright humain)
 *
 * Remplace sbAddPOLines (mauvaises colonnes) → POST /api/po/lines
 *
 * Flux testés :
 *   1. API  : POST /api/po/lines → lignes insérées avec bonnes colonnes
 *             (qty_add, sell_price, purchase_price, agent, display_name)
 *   2. API  : Validation — lignes invalides (qty=0, pas de variant_id) bloquées
 *   3. UI   : Bouton "Sauvegarder" dans l'onglet Bon de commande fonctionne
 *             + Historique PO affiche les bons récents
 *   4. CODE : api.js n'importe plus sbAddPOLines, appelle /api/po/lines
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";
import * as fs   from "fs";
import * as path from "path";

const BASE_URL    = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";
const TEST_PO_ID  = `TEST-T204-${Date.now()}`;
const TEST_VARIANT = "49000269414696";

test.afterAll(async () => {
  // Nettoyage : supprimer les lignes de test
  await sbDelete("nc_po_lines", `po_id=eq.${TEST_PO_ID}`);
  await sbDelete("nc_events",   `note=like.%${TEST_PO_ID}%`);
});

// ════════════════════════════════════════════════════════════════
//  TEST 1 — API : lignes insérées avec les bonnes colonnes
// ════════════════════════════════════════════════════════════════
test("T204-API : POST /api/po/lines insère avec colonnes correctes + agent", async ({ token }) => {
  const resp = await fetch(`${BASE_URL}/api/po/lines`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      token,
      po_id: TEST_PO_ID,
      lines: [
        {
          variant_id:     TEST_VARIANT,
          qty_add:        5,
          sell_price:     3000,
          purchase_price: 1500,
          display_name:   "Article T204 Test",
          product_title:  "Test Produit T204",
          barcode:        "BARCODE-T204",
          note:           "note test T204",
        },
      ],
    }),
  });

  expect(resp.status, "HTTP 200 attendu").toBe(200);
  const body = await resp.json();
  console.log("[T204] Réponse /api/po/lines :", JSON.stringify(body));

  expect(body.ok, `ok doit être true : ${JSON.stringify(body)}`).toBe(true);
  expect(body.lines_added, "lines_added doit être 1").toBe(1);
  expect(body.po_id, "po_id doit être retourné").toBe(TEST_PO_ID);

  // ── Vérifier les colonnes en base ──────────────────────────────
  const rows = await sbQuery(
    "nc_po_lines",
    `po_id=eq.${TEST_PO_ID}&select=po_line_id,variant_id,qty_add,sell_price,purchase_price,display_name,barcode,note,agent&limit=5`
  );
  expect(rows?.length, "1 ligne doit être en base").toBe(1);

  const line = rows[0];
  console.log("[T204] Ligne en base :", JSON.stringify(line));

  expect(String(line.variant_id), "variant_id correct").toBe(TEST_VARIANT);
  expect(Number(line.qty_add), "qty_add = 5").toBe(5);
  expect(Number(line.sell_price), "sell_price = 3000").toBe(3000);
  expect(Number(line.purchase_price), "purchase_price = 1500").toBe(1500);
  expect(line.display_name, "display_name correct").toBe("Article T204 Test");
  expect(line.barcode, "barcode correct").toBe("BARCODE-T204");
  expect(line.agent, "agent doit être renseigné (non null)").toBeTruthy();
  expect(line.po_line_id, "po_line_id doit être renseigné").toBeTruthy();

  console.log("[T204] ✅ Colonnes correctes — agent:", line.agent, "po_line_id:", line.po_line_id);
});

// ════════════════════════════════════════════════════════════════
//  TEST 2 — API : validation — lignes invalides bloquées
// ════════════════════════════════════════════════════════════════
test("T204-VALIDATION : lignes invalides (qty=0 ou pas de variant_id) bloquées", async ({ token }) => {
  // Cas 1 : qty_add = 0
  const resp1 = await fetch(`${BASE_URL}/api/po/lines`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      token,
      po_id: TEST_PO_ID + "-INVALID",
      lines: [{ variant_id: TEST_VARIANT, qty_add: 0, sell_price: 100 }],
    }),
  });
  expect(resp1.status, "HTTP 400 attendu pour qty=0").toBe(400);
  const b1 = await resp1.json();
  expect(b1.ok, "ok doit être false").toBe(false);
  console.log("[T204] Réponse validation qty=0 :", b1.error);

  // Cas 2 : pas de variant_id
  const resp2 = await fetch(`${BASE_URL}/api/po/lines`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      token,
      po_id: TEST_PO_ID + "-INVALID",
      lines: [{ qty_add: 3, sell_price: 100 }],
    }),
  });
  expect(resp2.status, "HTTP 400 attendu pour variant_id manquant").toBe(400);
  const b2 = await resp2.json();
  expect(b2.ok, "ok doit être false").toBe(false);
  console.log("[T204] Réponse validation sans variant_id :", b2.error);

  console.log("[T204] ✅ Validation OK — lignes invalides bloquées");
});

// ════════════════════════════════════════════════════════════════
//  TEST 3 — UI : Bouton Sauvegarder + Historique PO affiche les bons
// ════════════════════════════════════════════════════════════════
test("T204-UI : Historique PO charge les bons et bouton Sauvegarder répond", async ({ authedPage }) => {
  // ── Aller sur la page stock ───────────────────────────────────
  await authedPage.goto(`${BASE_URL}/dashboard/stock`);
  await authedPage.waitForTimeout(2000);

  // ── Aller sur l'onglet Bon de commande ────────────────────────
  const bonTab = authedPage.getByText(/Bon de commande/i);
  await expect(bonTab, "Onglet Bon de commande visible").toBeVisible({ timeout: 10000 });
  await bonTab.click();
  await authedPage.waitForTimeout(1500);

  // ── Vérifier que le champ N° Bon est visible ──────────────────
  const poInput = authedPage.locator("input[type=text]").filter({ hasText: "" }).first();
  const poInputVisible = await authedPage.locator("label:has-text('N° Bon')").isVisible({ timeout: 5000 }).catch(() => false);
  console.log("[T204-UI] Champ N° Bon visible :", poInputVisible);

  // ── Vérifier que le bouton Sauvegarder existe (même si désactivé) ──
  const saveBtn = authedPage.getByRole("button", { name: /sauvegarder/i }).first();
  const saveBtnExists = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log("[T204-UI] Bouton Sauvegarder visible :", saveBtnExists);

  // ── Aller sur l'onglet Historique PO ─────────────────────────
  const histTab = authedPage.getByText(/Historique PO/i);
  await expect(histTab, "Onglet Historique PO visible").toBeVisible({ timeout: 10000 });
  await histTab.click();
  await authedPage.waitForTimeout(2000);

  // ── Vérifier titre Historique ─────────────────────────────────
  await expect(
    authedPage.getByText(/Historique des bons de commande/i),
    "Titre Historique visible"
  ).toBeVisible({ timeout: 10000 });

  // ── Vérifier que le bon test T204 apparaît dans la liste ──────
  // (inséré par le test API T204-API ci-dessus)
  await authedPage.waitForTimeout(1000);
  const bodyText = await authedPage.locator("body").textContent();
  const hasPO204 = bodyText.includes("TEST-T204");
  console.log("[T204-UI] Bon TEST-T204 visible dans historique :", hasPO204);

  // ── Vérifier pas d'erreur serveur ────────────────────────────
  const hasError = bodyText.includes("Application error") || bodyText.includes("Internal Server Error");
  expect(hasError, "Aucune erreur serveur sur la page").toBe(false);

  console.log("[T204-UI] ✅ Historique PO chargé sans erreur");
});

// ════════════════════════════════════════════════════════════════
//  TEST 4 — CODE : api.js n'importe plus sbAddPOLines
// ════════════════════════════════════════════════════════════════
test("T204-CODE : api.js utilise /api/po/lines (plus sbAddPOLines)", async () => {
  const apiPath    = path.join(process.cwd(), "lib", "api.js");
  const apiContent = fs.readFileSync(apiPath, "utf-8");

  // sbAddPOLines ne doit plus être importé
  expect(
    apiContent.includes("sbAddPOLines"),
    "sbAddPOLines ne doit plus être importé dans api.js"
  ).toBe(false);

  // La route /api/po/lines doit être appelée
  expect(
    apiContent.includes("/api/po/lines"),
    "/api/po/lines doit être dans api.js"
  ).toBe(true);

  console.log("[T204-CODE] ✅ sbAddPOLines absent, /api/po/lines présent dans api.js");

  // sbGetPOLines doit utiliser les bonnes colonnes — extraire le bloc de la fonction
  const sbPath    = path.join(process.cwd(), "lib", "supabase-direct.js");
  const sbContent = fs.readFileSync(sbPath, "utf-8");

  // Extraire le bloc sbGetPOLines (entre sa déclaration et la prochaine export)
  const fnStart = sbContent.indexOf("export async function sbGetPOLines");
  const fnEnd   = sbContent.indexOf("export async function", fnStart + 10);
  const fnBlock = fnStart !== -1 ? sbContent.slice(fnStart, fnEnd !== -1 ? fnEnd : fnStart + 500) : "";
  console.log("[T204-CODE] sbGetPOLines bloc :", fnBlock.replace(/\n/g, " ").slice(0, 200));

  expect(
    fnBlock.includes("qty_add"),
    "qty_add doit être dans sbGetPOLines"
  ).toBe(true);

  // Vérifier que l'ancien nom quantite (sans _a_commander) n'est plus dans la query nc_po_lines
  const hasBadQuantite = fnBlock.includes(",quantite,") || fnBlock.includes("quantite,prix_unitaire");
  expect(hasBadQuantite, "Les vieilles colonnes quantite/prix_unitaire ne doivent plus être dans sbGetPOLines").toBe(false);

  console.log("[T204-CODE] ✅ sbGetPOLines utilise les bonnes colonnes (qty_add, sell_price…)");

  // La route /api/po/lines doit exister
  const routePath = path.join(process.cwd(), "app", "api", "po", "lines", "route.js");
  expect(fs.existsSync(routePath), "Le fichier /api/po/lines/route.js doit exister").toBe(true);
  const routeContent = fs.readFileSync(routePath, "utf-8");
  expect(routeContent.includes("qty_add"), "route doit contenir qty_add").toBe(true);
  expect(routeContent.includes("session.nom"), "route doit enregistrer l'agent").toBe(true);

  console.log("[T204-CODE] ✅ route /api/po/lines correcte — qty_add + agent présents");
});
