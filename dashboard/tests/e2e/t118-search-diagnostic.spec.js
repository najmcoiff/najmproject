/**
 * t118-search-diagnostic.spec.js — Diagnostic comparatif POS vs Stock
 *
 * Objectif : analyser pourquoi certains articles (ex: "daxter vert") ne
 * s'affichent pas dans la recherche POS, et identifier les écarts entre
 * la recherche POS (/dashboard/pos) et la recherche Stock (/dashboard/stock,
 * onglet "Bon de commande") qui utilisent toutes deux smartMatch().
 *
 * NE CORRIGE RIEN. Reporte les comportements observés pour validation.
 *
 * Scénarios :
 *   A) "daxter vert" — article existant en DB (variant_id=49000214659368,
 *      barcode=6135965000186, stock=3). Doit apparaître sur les DEUX écrans.
 *   B) "daxter"      — doit lister tous les Daxter (6 variants en DB).
 *   C) barcode "6135965000186" tapé au clavier — doit cibler Daxter vert.
 *   D) ordre des mots "vert daxter" — smartMatch est censé être ordre-insensible.
 *   E) avec faute "dakster" — le fuzzy doit rattraper.
 *   F) caractère parasite "daxter  vert" (double espace) — doit rester équivalent.
 *   G) "vert" seul — doit lister TOUS les articles "vert" (potentiel bruit).
 *   H) requête vague "noir" qui produit habituellement des faux positifs.
 *
 * Lancement contre prod :
 *   E2E_BASE_URL=https://najmcoiffdashboard.vercel.app \
 *     npx playwright test t118-search-diagnostic.spec.js --project=chromium
 *
 * Sortie : pour chaque scénario, on logge :
 *   - le nombre de résultats POS
 *   - le nombre de résultats Stock
 *   - les 5 premiers titres POS
 *   - les 5 premiers titres Stock
 *   - un verdict (présence du cas attendu, écart entre les deux)
 */
import { test, expect } from "./fixtures.js";

const SCENARIOS = [
  { query: "daxter vert",     expectInTop: "Daxter vert",  desc: "A. cas user signalé" },
  { query: "daxter",          expectInTop: "Daxter",        desc: "B. famille daxter" },
  { query: "6135965000186",   expectInTop: "Daxter vert",  desc: "C. barcode au clavier" },
  { query: "vert daxter",     expectInTop: "Daxter vert",  desc: "D. ordre inversé" },
  { query: "dakster vert",    expectInTop: "Daxter vert",  desc: "E. faute frappe (fuzzy)" },
  { query: "daxter  vert",    expectInTop: "Daxter vert",  desc: "F. double espace" },
  { query: "vert",            expectInTop: null,            desc: "G. mot seul (volume)" },
  { query: "noir",            expectInTop: null,            desc: "H. mot seul faux positif" },
];

async function getResultsPos(page, query) {
  const search = page.locator('[data-testid="pos-search"]');
  await expect(search).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => /\d+ articles/.test(document.body.textContent || ""),
    { timeout: 30000, polling: 600 }).catch(() => {});
  await search.click();
  await search.fill("");
  await search.fill(query);
  // Laisser le filtre se calculer
  await page.waitForTimeout(400);
  const tiles = page.locator('[data-testid="pos-result-item"]');
  const count = await tiles.count();
  const titles = [];
  for (let i = 0; i < Math.min(count, 5); i++) {
    const t = (await tiles.nth(i).textContent()) || "";
    titles.push(t.replace(/\s+/g, " ").trim().slice(0, 60));
  }
  return { count, titles };
}

async function getResultsStock(page, query) {
  // Stock = /dashboard/stock, premier onglet BonTab par défaut
  // L'input recherche est le premier input text de la page
  const input = page.locator('input[placeholder*="Rechercher"]').first();
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.click();
  await input.fill("");
  await input.fill(query);
  await page.waitForTimeout(400);
  // Items de résultat = divs cliquables sous l'input
  // On les compte par la présence de leur display_name dans la zone résultats.
  // Comme le composant n'a pas de testid, on utilise un sélecteur plus large
  const items = page.locator('div.flex.items-center.gap-3.px-4.py-3.border-b');
  const count = await items.count();
  const titles = [];
  for (let i = 0; i < Math.min(count, 5); i++) {
    const t = (await items.nth(i).textContent()) || "";
    titles.push(t.replace(/\s+/g, " ").trim().slice(0, 60));
  }
  return { count, titles };
}

test.describe("T118 — Diagnostic recherche POS vs Stock", () => {

  for (const sc of SCENARIOS) {
    test(`${sc.desc} : "${sc.query}"`, async ({ authedPage }) => {
      // ── POS ──────────────────────────────────────────────────
      await authedPage.goto("/dashboard/pos");
      const posRes = await getResultsPos(authedPage, sc.query);
      console.log(`[T118][POS]   "${sc.query}" → ${posRes.count} résultat(s)`);
      posRes.titles.forEach((t, i) => console.log(`            #${i+1}: ${t}`));

      // ── Stock ────────────────────────────────────────────────
      await authedPage.goto("/dashboard/stock");
      const stkRes = await getResultsStock(authedPage, sc.query);
      console.log(`[T118][STK]   "${sc.query}" → ${stkRes.count} résultat(s)`);
      stkRes.titles.forEach((t, i) => console.log(`            #${i+1}: ${t}`));

      // ── Comparaison ──────────────────────────────────────────
      if (sc.expectInTop) {
        const posHit = posRes.titles.some(t => t.toLowerCase().includes(sc.expectInTop.toLowerCase()));
        const stkHit = stkRes.titles.some(t => t.toLowerCase().includes(sc.expectInTop.toLowerCase()));
        console.log(`[T118][CMP]   attendu "${sc.expectInTop}" → POS:${posHit ? "✓" : "✗"} STK:${stkHit ? "✓" : "✗"}`);
        if (posHit !== stkHit) {
          console.log(`[T118][⚠ ÉCART] POS et Stock ne sont pas alignés sur "${sc.query}"`);
        }
      } else {
        console.log(`[T118][CMP]   volume POS=${posRes.count} STK=${stkRes.count} (différence : ${Math.abs(posRes.count - stkRes.count)})`);
      }
    });
  }
});
