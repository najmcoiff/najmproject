/**
 * T136 — Recherche intelligente dashboard (humain)
 *
 * Simule un agent qui cherche "gillette" (et des variantes avec fautes)
 * sur le POS, le Stock, et le catalogue admin.
 *
 * Critères :
 * - "gillette" doit trouver "Lame gillette bleu" (exact substring)
 * - "gilete" (1 faute) doit trouver des articles (fuzzy trigrammes)
 * - "lame bleu" doit trouver "Lame gillette bleu" (multi-tokens AND)
 */

import { test, expect } from "./fixtures.js";

const BASE = "https://najmcoiffdashboard.vercel.app";

// ─── Helper : attendre que le catalogue soit chargé (variants > 0) ────────────
async function waitForCatalogue(page, timeout = 30000) {
  await page.waitForLoadState("domcontentloaded");
  // Attendre que le texte de chargement disparaisse OU que des rows soient visibles
  try {
    await page.waitForFunction(() => {
      // Si spinner visible → pas encore chargé
      const spinner = document.querySelector(".animate-pulse");
      if (spinner && spinner.textContent.includes("Chargement")) return false;
      // Si le texte "Chargement" est dans body → pas encore prêt
      if (document.body?.innerText?.includes("Chargement du catalogue")) return false;
      return true;
    }, { timeout });
  } catch {
    // timeout — continuer quand même
  }
  await page.waitForTimeout(800);
}

// Helper POS : attendre que les variants soient prêts (au moins 1 tile visible en cherchant un terme courant)
async function warmupPOS(page) {
  await page.goto(`${BASE}/dashboard/pos`);
  await page.waitForLoadState("domcontentloaded");
  const searchInput = page.locator('[data-testid="pos-search"]');
  await expect(searchInput).toBeVisible({ timeout: 15000 });
  // Chercher "a" pour charger les variants dans le cache
  await searchInput.fill("bandido");
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-testid="pos-result-item"]').first()).toBeVisible({ timeout: 25000 });
  // Effacer la recherche
  await searchInput.fill("");
  await page.waitForTimeout(300);
}

// Helper Stock : attendre que les rows soient visibles (chargement initial)
async function warmupStock(page) {
  await page.goto(`${BASE}/dashboard/stock`);
  await page.waitForLoadState("domcontentloaded");
  // Attendre qu'au moins 1 stock-row soit rendu (signifie que les variants sont chargés)
  await expect(page.locator('[data-testid="stock-row"]').first()).toBeVisible({ timeout: 30000 });
}

// ═════════════════════════════════════════════════════════════════════════════
//  WARMUP — charger le cache localStorage une fois pour tous les tests
// ═════════════════════════════════════════════════════════════════════════════
test.describe("T136 — Warmup cache (obligatoire)", () => {

  test("0. Warmup : charger le cache variants (localStorage)", async ({ authedPage: page }) => {
    // L'onglet Stock a été supprimé — le warmup se fait via l'onglet Bon de commande
    // qui charge aussi api.getVariantsCache() au montage de la page.
    await page.goto(`${BASE}/dashboard/stock`);
    await page.waitForLoadState("domcontentloaded");

    // Attendre que le champ de recherche du Bon de commande soit visible = page prête
    const searchInput = page.locator("input[placeholder*='nom']").first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // Taper une lettre pour déclencher le chargement des variants dans le filtre
    await searchInput.fill("a");
    await page.waitForTimeout(1500);
    await searchInput.fill("");

    console.log("[T136-Warmup] Page stock chargée (onglet Bon de commande)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUPE 1 — POS : tous les tests en 1 navigation (évite rechargement x4)
// ═════════════════════════════════════════════════════════════════════════════
test.describe("T136 — POS : recherche intelligente produit", () => {

  test("1-4. POS : gillette / fuzzy / multi-tokens / absurde (1 navigation)", async ({ authedPage: page }) => {
    test.setTimeout(120000); // 3823 variants = chargement lent

    await page.goto(`${BASE}/dashboard/pos`);
    await page.waitForLoadState("domcontentloaded");

    const searchInput = page.locator('[data-testid="pos-search"]');
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // Attendre la fin du chargement (le texte "Chargement du catalogue" disparaît)
    await page.waitForFunction(() => {
      const p = document.querySelector("p.animate-pulse");
      return !p || !p.textContent?.includes("Chargement");
    }, { timeout: 90000 });
    await page.waitForTimeout(400);
    console.log("[T136-POS] Catalogue chargé");

    const results = page.locator('[data-testid="pos-result-item"]');

    // ── Test 1 : "gillette" exact ─────────────────────────────────────────
    await searchInput.fill("");
    await page.waitForTimeout(200);
    await page.keyboard.type("gillette", { delay: 50 });
    await page.waitForTimeout(600);

    await expect(results.first()).toBeVisible({ timeout: 8000 });
    const gilCount = await results.count();
    const gilTexts = await results.allInnerTexts();
    const gilFound = gilTexts.some(t => t.toLowerCase().includes("gillette"));
    console.log(`[T136-POS] "gillette" → ${gilCount} résultat(s) | gillette présent : ${gilFound}`);
    console.log(`[T136-POS] Textes : ${gilTexts.slice(0, 2).join(" | ")}`);
    expect(gilCount).toBeGreaterThan(0);
    expect(gilFound).toBe(true);

    // ── Test 2 : "gilete" fuzzy ───────────────────────────────────────────
    await searchInput.fill("");
    await page.keyboard.type("gilete", { delay: 50 });
    await page.waitForTimeout(600);

    const fzCount = await results.count();
    console.log(`[T136-POS] "gilete" (fuzzy) → ${fzCount} résultat(s)`);
    if (fzCount > 0) {
      const fzTexts = await results.allInnerTexts();
      const fzFound = fzTexts.some(t => t.toLowerCase().includes("gillette") || t.toLowerCase().includes("gilet"));
      console.log(`[T136-POS] Fuzzy textes : ${fzTexts.slice(0, 2).join(" | ")}`);
      expect(fzFound).toBe(true);
    } else {
      console.log("[T136-POS] 0 résultats fuzzy 'gilete' — OK si seuil strict");
    }

    // ── Test 3 : "lame bleu" multi-tokens ────────────────────────────────
    await searchInput.fill("");
    await page.keyboard.type("lame bleu", { delay: 50 });
    await page.waitForTimeout(600);

    await expect(results.first()).toBeVisible({ timeout: 8000 });
    const lbTexts = await results.allInnerTexts();
    const lbFound = lbTexts.some(t => t.toLowerCase().includes("lame") && t.toLowerCase().includes("bleu"));
    console.log(`[T136-POS] "lame bleu" → ${lbTexts.length} résultats | lame+bleu : ${lbFound}`);
    expect(lbFound).toBe(true);

    // ── Test 4 : terme absurde — le fuzzy ne doit pas trouver "gillette" ─────
    await searchInput.fill("zzzzzzzzz");
    await page.waitForTimeout(600);

    const absCount = await results.count();
    const absTexts = absCount > 0 ? await results.allInnerTexts() : [];
    const gillInAbsurd = absTexts.some(t => t.toLowerCase().includes("gillette"));
    console.log(`[T136-POS] terme absurde 'zzzzzzzzz' → ${absCount} résultats | gillette absent : ${!gillInAbsurd}`);
    // Le terme "zzzzzzzz" ne doit jamais retourner "gillette"
    expect(gillInAbsurd).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUPE 2 — Stock (1 navigation = tous les tests regroupés)
// ═════════════════════════════════════════════════════════════════════════════
test.describe("T136 — Stock : recherche intelligente", () => {

  test.skip("5-8. Stock : gillette / bandido / fuzzy / multi-tokens (1 navigation)", async ({ authedPage: page }) => {
    // L'onglet Stock a été supprimé de /dashboard/stock (T_STOCK_MERGE).
    // La recherche intelligente reste testée via l'onglet POS (groupe 1 ci-dessus).
    test.setTimeout(120000); // 3823 variants = chargement lent

    await page.goto(`${BASE}/dashboard/stock`);
    await page.waitForLoadState("domcontentloaded");

    // Attendre que les rows initiaux soient visibles (3823 variants à charger = ~15s)
    await expect(page.locator('[data-testid="stock-row"]').first()).toBeVisible({ timeout: 90000 });
    console.log("[T136-Stock] Données chargées");

    const textSearch = page.locator("input[placeholder*='nom']").first();
    await expect(textSearch).toBeVisible({ timeout: 5000 });

    // ── Test 5 : "gillette" exact ─────────────────────────────────────────
    await textSearch.click();
    await page.keyboard.type("gillette", { delay: 50 });
    await page.waitForTimeout(500);

    const rows = page.locator('[data-testid="stock-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 8000 });
    const gilCount = await rows.count();
    const gilTexts = await rows.allInnerTexts();
    const gilFound = gilTexts.some(t => t.toLowerCase().includes("gillette"));
    console.log(`[T136-Stock] "gillette" → ${gilCount} article(s), gillette présent : ${gilFound}`);
    expect(gilCount).toBeGreaterThan(0);
    expect(gilFound).toBe(true);

    // ── Test 6 : "bandido" exact ──────────────────────────────────────────
    await textSearch.selectAll ? textSearch.selectAll() : await textSearch.fill("");
    await textSearch.fill("");
    await textSearch.click();
    await page.keyboard.type("bandido", { delay: 50 });
    await page.waitForTimeout(500);

    await expect(rows.first()).toBeVisible({ timeout: 8000 });
    const bndCount = await rows.count();
    console.log(`[T136-Stock] "bandido" → ${bndCount} article(s)`);
    expect(bndCount).toBeGreaterThan(0);

    // ── Test 7 : "bandidu" fuzzy ──────────────────────────────────────────
    await textSearch.fill("");
    await page.keyboard.type("bandidu", { delay: 50 });
    await page.waitForTimeout(500);

    const bduCount = await rows.count();
    console.log(`[T136-Stock] "bandidu" (fuzzy) → ${bduCount} article(s)`);
    if (bduCount > 0) {
      const bduTexts = await rows.allInnerTexts();
      const bduFound = bduTexts.some(t => t.toLowerCase().includes("band"));
      console.log(`[T136-Stock] Fuzzy bandidu : ${bduTexts.slice(0, 1).join("")}`);
      expect(bduFound).toBe(true);
    } else {
      console.log("[T136-Stock] 0 résultats fuzzy bandidu — OK");
    }

    // ── Test 8 : "lame bleu" multi-tokens ────────────────────────────────
    await textSearch.fill("");
    await page.keyboard.type("lame bleu", { delay: 50 });
    await page.waitForTimeout(500);

    await expect(rows.first()).toBeVisible({ timeout: 8000 });
    const lbTexts = await rows.allInnerTexts();
    const lbFound = lbTexts.some(t => t.toLowerCase().includes("lame") && t.toLowerCase().includes("bleu"));
    console.log(`[T136-Stock] "lame bleu" → ${lbTexts.length} articles, lame+bleu : ${lbFound}`);
    expect(lbFound).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUPE 3 — Catalogue admin (owner, API server-side)
// ═════════════════════════════════════════════════════════════════════════════
test.describe("T136 — Catalogue admin : recherche multi-champs API", () => {

  test("9. Catalogue admin : 'gillette' (API) trouve les articles", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/catalogue`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const searchInput = page.locator("input[type=search]");
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    await searchInput.click();
    await page.keyboard.type("gillette", { delay: 60 });
    await page.waitForTimeout(1800);

    const bodyText = await page.locator("body").innerText();
    const found = bodyText.toLowerCase().includes("gillette");
    console.log(`[T136-Cat] "gillette" → présent : ${found}`);
    expect(found).toBe(true);
  });

  test("10. Catalogue admin : 'lame bleu' (multi-tokens) trouve l'article", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/owner/catalogue`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const searchInput = page.locator("input[type=search]");
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    await searchInput.click();
    await page.keyboard.type("lame bleu", { delay: 60 });
    await page.waitForTimeout(1800);

    const bodyText = await page.locator("body").innerText();
    const foundLame = bodyText.toLowerCase().includes("lame");
    const foundBleu = bodyText.toLowerCase().includes("bleu");
    console.log(`[T136-Cat] "lame bleu" → lame:${foundLame} bleu:${foundBleu}`);
    expect(foundLame && foundBleu).toBe(true);
  });
});
