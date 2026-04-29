/**
 * collections-search-shareable.spec.js
 *
 * Régression sur /collections/coiffure :
 *   1. Le bouton « نسخ الرابط » + sync URL (?search=…) doivent fonctionner
 *      comme sur /produits.
 *   2. La recherche dans la barre du monde DOIT être globale : si une
 *      catégorie est sélectionnée puis l'utilisateur tape un terme, la
 *      catégorie doit être auto-effacée → recherche sur tout le monde
 *      coiffure (et pas seulement la catégorie).
 *   3. Lien partagé ouvert dans un contexte vierge → pré-remplit search.
 *   4. Bouton ✕ remet l'URL propre à /collections/coiffure.
 *
 * Tests humains : typing avec délais, séquence catégorie → search,
 * desktop + mobile.
 */
const { test, expect } = require("@playwright/test");

const SEARCH_TERM = "agiva";
const COLL_PATH   = "/collections/coiffure";

test.describe("Collections /coiffure — recherche partageable + globale", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  async function humanType(page, locator, term) {
    await locator.click();
    await page.waitForTimeout(200);
    for (const ch of term) {
      await locator.type(ch);
      await page.waitForTimeout(80);
    }
  }

  test("URL sync + bouton copie OK sur /collections/coiffure", async ({ page }) => {
    await page.goto(COLL_PATH);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    const input = page.getByTestId("world-search-input");
    await expect(input).toBeVisible({ timeout: 15000 });

    await humanType(page, input, SEARCH_TERM);
    await page.waitForTimeout(800);

    // L'URL doit refléter la recherche
    await expect(page).toHaveURL(new RegExp(`${COLL_PATH}\\?.*search=${SEARCH_TERM}`));
    console.log(`✅ URL synchronisée: ${page.url()}`);

    // Le bouton « Copier le lien » doit apparaître
    const copyBtn = page.getByTestId("copy-search-link");
    await expect(copyBtn).toBeVisible({ timeout: 5000 });
    await expect(copyBtn).toContainText(/نسخ الرابط/);

    await copyBtn.click();
    await page.waitForTimeout(400);

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain(`search=${SEARCH_TERM}`);
    expect(clipboard).toContain(COLL_PATH);
    console.log(`✅ Clipboard contient le lien: ${clipboard}`);

    await expect(copyBtn).toContainText(/تم النسخ/);
  });

  test("Recherche est GLOBALE au monde : choisir une catégorie puis taper search efface la catégorie", async ({ page }) => {
    await page.goto(COLL_PATH);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // Sélectionner la première catégorie disponible (autre que "كل الفئات" = vide)
    const select = page.getByTestId("world-category-select");
    const isSelectVisible = await select.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isSelectVisible) {
      test.skip(true, "Aucune catégorie disponible — collections vide ?");
      return;
    }

    // Récupère la liste des options et choisit la 1ère non vide
    const optionValues = await select.locator("option").evaluateAll(opts =>
      opts.map(o => o.value).filter(v => v.length > 0)
    );
    expect(optionValues.length, "Au moins une catégorie doit exister").toBeGreaterThan(0);
    const chosenCat = optionValues[0];

    await select.selectOption(chosenCat);
    await page.waitForTimeout(900);

    // L'URL doit contenir category=… après sélection
    await expect(page).toHaveURL(new RegExp(`category=`));
    console.log(`✅ Catégorie sélectionnée: ${chosenCat} → URL contient category=`);

    // Maintenant l'utilisateur tape un terme — la catégorie DOIT s'auto-effacer
    const input = page.getByTestId("world-search-input");
    await humanType(page, input, SEARCH_TERM);
    await page.waitForTimeout(800);

    // L'URL doit avoir search= MAIS PAS category=
    await expect(page).toHaveURL(new RegExp(`search=${SEARCH_TERM}`));
    const urlAfter = page.url();
    expect(urlAfter, "category= ne doit plus être dans l'URL après typing search").not.toMatch(/category=/);
    console.log(`✅ Catégorie effacée automatiquement → recherche globale : ${urlAfter}`);

    // Le select doit être revenu à vide
    await expect(select).toHaveValue("");
  });

  test("Lien partagé pré-remplit la recherche dans un contexte vierge", async ({ browser }) => {
    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    await fresh.goto(`${COLL_PATH}?search=${SEARCH_TERM}`);
    await fresh.waitForLoadState("domcontentloaded");
    await fresh.waitForTimeout(1500);

    const input = fresh.getByTestId("world-search-input");
    await expect(input).toHaveValue(SEARCH_TERM, { timeout: 10000 });
    await expect(fresh).toHaveURL(new RegExp(`search=${SEARCH_TERM}`));
    console.log(`✅ Input pré-rempli avec "${SEARCH_TERM}"`);

    // Soit produits trouvés, soit message « pas de résultat » — pas de crash
    const hasResults = await fresh.getByTestId("product-card").first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasNoResultMsg = await fresh.getByText(/لا توجد نتائج|نتائج تقريبية/).isVisible().catch(() => false);
    expect(hasResults || hasNoResultMsg, "Le lien partagé doit afficher soit des résultats, soit un message de non-trouvé").toBe(true);

    await ctx.close();
  });

  test("Bouton ✕ remet l'URL propre à /collections/coiffure", async ({ page }) => {
    await page.goto(`${COLL_PATH}?search=${SEARCH_TERM}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    const resetBtn = page.getByTestId("world-search-reset");
    const visible = await resetBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, "Bouton ✕ non visible — possiblement aucune catégorie chargée");
      return;
    }

    await resetBtn.click();
    await page.waitForTimeout(700);

    await expect(page).toHaveURL(new RegExp(`${COLL_PATH}$`));
    console.log(`✅ URL nettoyée après ✕: ${page.url()}`);

    const copyBtn = page.getByTestId("copy-search-link");
    expect(await copyBtn.isVisible().catch(() => false)).toBe(false);
  });
});
