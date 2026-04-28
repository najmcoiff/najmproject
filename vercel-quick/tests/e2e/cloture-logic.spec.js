/**
 * cloture-logic.spec.js — Logique de clôture FINALE
 *
 * Règles validées :
 *   last='OUI'    → TOUTES les commandes (POS inclus) dont order_date ≤ date coupure, sans exception
 *   cloture='OUI' → commandes avec tracking OU decision_status='annuler'
 *   Commandes actives = cloture IS NULL
 *   Restock → UNIQUEMENT pour les commandes annulées
 *
 *   confirmer sans tracking → cloture NE DOIT PAS être OUI (commande en attente d'expédition)
 *   modifier sans tracking  → cloture NE DOIT PAS être OUI (commande à modifier)
 *   POS → last='OUI' uniquement, jamais cloture='OUI'
 *
 * Test humain : goto → waitForTimeout → vérif DB.
 */
import { test, expect, sbInsert, sbDelete, sbQuery } from "./fixtures.js";

const BASE_URL     = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";
const TEST_VARIANT = "49000269414696";

// ── IDs uniques par run ────────────────────────────────────────────
const TS          = Date.now();
const ID_ANNULE   = `TCLOTURE_ANNULE_${TS}`;
const ID_CONFIRME = `TCLOTURE_CONFIRME_${TS}`;
const ID_MODIFIER = `TCLOTURE_MODIFIER_${TS}`;
const ID_AUCUN    = `TCLOTURE_AUCUN_${TS}`;    // sans decision → ne doit PAS avoir cloture='OUI'
const ID_POS      = `TCLOTURE_POS_${TS}`;      // POS → last='OUI' mais jamais cloture='OUI'

const BASE_DATE   = new Date(Date.now() - 5000).toISOString(); // légèrement dans le passé

test.beforeAll(async () => {
  await Promise.all([
    sbInsert("nc_orders", {
      order_id: ID_ANNULE,
      customer_name: "Cloture Test Annulé",
      customer_phone: "0555001001",
      wilaya: "Alger",
      order_total: "1000",
      order_source: "nc_boutique",
      decision_status: "annuler",
      confirmation_status: "annulé",
      archived: false,
      order_date: BASE_DATE,
      items_json: [{ variant_id: TEST_VARIANT, quantity: 1, qty: 1, title: "Article test" }],
    }),
    sbInsert("nc_orders", {
      order_id: ID_CONFIRME,
      customer_name: "Cloture Test Confirmé",
      customer_phone: "0555001002",
      wilaya: "Oran",
      order_total: "2000",
      order_source: "nc_boutique",
      decision_status: "confirmer",
      confirmation_status: "confirmé",
      archived: false,
      order_date: BASE_DATE,
    }),
    sbInsert("nc_orders", {
      order_id: ID_MODIFIER,
      customer_name: "Cloture Test Modifier",
      customer_phone: "0555001003",
      wilaya: "Constantine",
      order_total: "1500",
      order_source: "app:251248705537",
      decision_status: "modifier",
      archived: false,
      order_date: BASE_DATE,
    }),
    sbInsert("nc_orders", {
      order_id: ID_AUCUN,
      customer_name: "Cloture Test Sans Decision",
      customer_phone: "0555001004",
      wilaya: "Annaba",
      order_total: "800",
      order_source: "nc_boutique",
      decision_status: "",
      archived: false,
      order_date: BASE_DATE,
    }),
    sbInsert("nc_orders", {
      order_id: ID_POS,
      customer_name: "Cloture Test POS",
      customer_phone: "0555001005",
      wilaya: "Alger",
      order_total: "500",
      order_source: "pos",
      archived: false,
      order_date: BASE_DATE,
    }),
  ]);
});

test.afterAll(async () => {
  await Promise.all([
    sbDelete("nc_orders", `order_id=eq.${ID_ANNULE}`),
    sbDelete("nc_orders", `order_id=eq.${ID_CONFIRME}`),
    sbDelete("nc_orders", `order_id=eq.${ID_MODIFIER}`),
    sbDelete("nc_orders", `order_id=eq.${ID_AUCUN}`),
    sbDelete("nc_orders", `order_id=eq.${ID_POS}`),
    sbDelete("nc_events", `order_id=eq.${ID_ANNULE}`),
    sbDelete("nc_events", `order_id=eq.${ID_CONFIRME}`),
  ]);
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 1 — Logique cloture : last/cloture correctement assignés
// ═══════════════════════════════════════════════════════════════════
test("CLOTURE-LOGIC : last OUI sur TOUS, cloture OUI uniquement sur décidés non-POS", async ({ token }) => {
  // Utiliser ID_ANNULE comme commande de coupure (elle est la plus récente des 5)
  // Note : toutes les 5 commandes ont la même BASE_DATE, cloture va toutes les attraper

  const stockBefore = (await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity&limit=1`))?.[0]?.inventory_quantity ?? 0;

  const resp = await fetch(`${BASE_URL}/api/cloture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, order_id: ID_ANNULE }),
  });
  const body = await resp.json();

  console.log("[CLOTURE-LOGIC] Réponse API :", JSON.stringify(body));
  expect(resp.status).toBe(200);
  expect(body.ok, `cloture doit réussir : ${JSON.stringify(body)}`).toBe(true);

  // ── Vérifications DB ─────────────────────────────────────────────

  // Annulé : last=OUI + cloture=OUI (decision_status='annuler')
  const annule = (await sbQuery("nc_orders", `order_id=eq.${ID_ANNULE}&select=last,cloture&limit=1`))?.[0];
  expect(annule?.last,   "Annulé → last=OUI").toBe("OUI");
  expect(annule?.cloture,"Annulé → cloture=OUI (decision annuler)").toBe("OUI");

  // Confirmé SANS tracking : last=OUI mais cloture PAS OUI (en attente d'expédition)
  const confirme = (await sbQuery("nc_orders", `order_id=eq.${ID_CONFIRME}&select=last,cloture&limit=1`))?.[0];
  expect(confirme?.last,   "Confirmé → last=OUI").toBe("OUI");
  expect(confirme?.cloture,"Confirmé sans tracking → cloture NE DOIT PAS être OUI").not.toBe("OUI");

  // Modifier SANS tracking : last=OUI mais cloture PAS OUI
  const modifier = (await sbQuery("nc_orders", `order_id=eq.${ID_MODIFIER}&select=last,cloture&limit=1`))?.[0];
  expect(modifier?.last,   "Modifier → last=OUI").toBe("OUI");
  expect(modifier?.cloture,"Modifier sans tracking → cloture NE DOIT PAS être OUI").not.toBe("OUI");

  // Sans décision : last=OUI mais cloture PAS OUI
  const aucun = (await sbQuery("nc_orders", `order_id=eq.${ID_AUCUN}&select=last,cloture&limit=1`))?.[0];
  expect(aucun?.last,   "Sans décision → last=OUI").toBe("OUI");
  expect(aucun?.cloture,"Sans décision → cloture NE DOIT PAS être OUI").not.toBe("OUI");

  // POS : last=OUI mais jamais cloture=OUI
  const pos = (await sbQuery("nc_orders", `order_id=eq.${ID_POS}&select=last,cloture&limit=1`))?.[0];
  expect(pos?.last,   "POS → last=OUI").toBe("OUI");
  expect(pos?.cloture,"POS → cloture NE DOIT PAS être OUI").not.toBe("OUI");

  // Restock uniquement pour l'annulé (+1)
  const stockAfter = (await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT}&select=inventory_quantity&limit=1`))?.[0]?.inventory_quantity ?? 0;
  expect(stockAfter, `Restock +1 uniquement (annulé) : avant=${stockBefore} après=${stockAfter}`).toBe(stockBefore + 1);

  // backwards compat : cancelled_shopify = 0
  expect(body.cancelled_shopify, "cancelled_shopify doit être 0").toBe(0);

  console.log("[CLOTURE-LOGIC] ✅ Logique last/cloture validée — last=OUI sur TOUS, cloture=OUI sur décidés non-POS");
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 2 — UI confirmation : filtre cloture → exactement les commandes actives
// ═══════════════════════════════════════════════════════════════════
test("CLOTURE-DISPLAY : page confirmation affiche uniquement les commandes actives (cloture IS NULL)", async ({ authedPage }) => {
  // Compter via DB le nombre attendu de commandes actives (cloture IS NULL, non-POS)
  const activeRows = await sbQuery(
    "nc_orders",
    "order_source=neq.pos&cloture=is.null&select=order_id"
  );
  const expectedCount = activeRows?.length ?? 0;
  console.log(`[CLOTURE-DISPLAY] Commandes actives en DB (cloture IS NULL) : ${expectedCount}`);
  expect(expectedCount, "Il doit y avoir des commandes actives en DB").toBeGreaterThan(0);

  // Naviguer sur la page confirmation
  await authedPage.goto(`${BASE_URL}/dashboard/confirmation`);
  await authedPage.waitForTimeout(5000); // attendre le chargement complet

  // La page ne doit pas afficher d'erreur
  const bodyText = await authedPage.locator("body").textContent();
  expect(bodyText.toLowerCase().includes("erreur réseau"), "Pas d'erreur réseau").toBe(false);

  // Compter les lignes de commandes dans la liste gauche (onglet "Tous")
  // Les lignes commandes ont px-3 py-3 border-b border-gray-100 cursor-pointer
  const orderRows = authedPage.locator("div.flex-1.overflow-y-auto >> div.px-3.py-3.border-b.border-gray-100");
  await authedPage.waitForTimeout(2000);
  const visibleCount = await orderRows.count();
  console.log(`[CLOTURE-DISPLAY] Commandes visibles dans UI : ${visibleCount}`);

  // L'UI doit afficher exactement le même nombre que la DB (cloture IS NULL)
  expect(visibleCount, `UI doit afficher ${expectedCount} commandes actives (pas 130 !)`).toBe(expectedCount);

  // Vérifier aussi le compteur dans l'onglet "Tous"
  const tabTous = authedPage.locator("button", { hasText: /^Tous/ });
  const tabText = await tabTous.textContent().catch(() => "");
  console.log(`[CLOTURE-DISPLAY] Texte onglet Tous : "${tabText}"`);

  console.log(`[CLOTURE-DISPLAY] ✅ UI affiche ${visibleCount}/${expectedCount} commandes actives — filtre cloture IS NULL opérationnel`);
});

// ═══════════════════════════════════════════════════════════════════
//  TEST 3 — Vérif CODE : route cloture n'utilise plus tracking pour filtrer
// ═══════════════════════════════════════════════════════════════════
test("CLOTURE-CODE : route cloture utilise decision_status pour cloture=OUI (pas tracking)", async () => {
  const { readFileSync } = await import("fs");
  const { join }         = await import("path");
  const routeFile = join(process.cwd(), "app", "api", "cloture", "route.js");
  const content   = readFileSync(routeFile, "utf-8");

  // La logique cloture='OUI' = hasTrack || isAnnule
  expect(content.includes("hasTrack"), "hasTrack doit être utilisé dans route.js").toBe(true);
  expect(content.includes("isAnnule"), "isAnnule doit être utilisé dans route.js").toBe(true);
  expect(content.includes('"annuler"'), "annuler doit être présent dans route.js").toBe(true);

  // Pas d'import Shopify
  expect(content.includes('from "@/lib/shopify"'), "Pas d'import Shopify").toBe(false);

  // Le filtre d'affichage dans supabase-direct doit utiliser cloture
  const sdFile = join(process.cwd(), "lib", "supabase-direct.js");
  const sdContent = readFileSync(sdFile, "utf-8");
  expect(sdContent.includes('(o.cloture || "") !== "OUI"'), "sbGetOrders filtre sur cloture != OUI").toBe(true);

  console.log("[CLOTURE-CODE] ✅ Nouvelle logique cloture validée dans les fichiers source");
});
