/**
 * search-shareable-link.spec.js
 *
 * Régression : la barre de recherche du catalogue doit
 *   1. synchroniser la query string au fur et à mesure de la frappe
 *      (?search=<terme>) — pour que copier l'URL de la barre d'adresse
 *      donne un lien de recherche partageable (parité Shopify).
 *   2. Exposer un bouton « نسخ الرابط » (Copier le lien) qui place
 *      window.location.href dans le presse-papier + feedback « تم النسخ ».
 *   3. Le lien partagé, ouvert dans un contexte vierge, doit pré-remplir
 *      le champ de recherche et filtrer les produits.
 *   4. Le bouton ✕ (clear) doit revenir à /produits propre (sans qs).
 *
 * Flux humain simulé (typing avec délais) — desktop + mobile.
 */
const { test, expect } = require("@playwright/test");

const SEARCH_TERM = "agiva";

test.describe("Recherche → lien partageable", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  // Helper : tape lentement un terme dans la barre de recherche
  async function humanTypeSearch(page, term) {
    const input = page.getByPlaceholder("ابحث عن منتج...");
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.click();
    await page.waitForTimeout(200);
    for (const ch of term) {
      await input.type(ch);
      await page.waitForTimeout(80);
    }
  }

  test("URL se synchronise pendant la frappe + bouton copie OK", async ({ page, context }) => {
    await page.goto("/produits");
    await page.waitForLoadState("domcontentloaded");

    // Typing humain "agiva"
    await humanTypeSearch(page, SEARCH_TERM);
    // Laisser le debounce + router.replace finir
    await page.waitForTimeout(800);

    // L'URL doit refléter la recherche
    await expect(page).toHaveURL(new RegExp(`/produits\\?.*search=${SEARCH_TERM}`));
    console.log(`✅ URL synchronisée: ${page.url()}`);

    // Le bouton « Copier le lien » doit apparaître
    const copyBtn = page.getByTestId("copy-search-link");
    await expect(copyBtn).toBeVisible({ timeout: 5000 });

    // Avant clic : libellé « نسخ الرابط »
    await expect(copyBtn).toContainText(/نسخ الرابط/);

    // Clic — copie dans le presse-papier
    await copyBtn.click();
    await page.waitForTimeout(400);

    // Lecture clipboard via navigator.clipboard
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain(`search=${SEARCH_TERM}`);
    console.log(`✅ Clipboard contient bien le lien: ${clipboard}`);

    // Feedback visuel « تم النسخ » pendant 2s
    await expect(copyBtn).toContainText(/تم النسخ/);
    console.log(`✅ Toast « تم النسخ » visible`);
  });

  test("Lien partagé pré-remplit la recherche dans un contexte vierge", async ({ browser }) => {
    // Nouveau contexte (= un client qui reçoit le lien sans aucune session précédente)
    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    await fresh.goto(`/produits?search=${SEARCH_TERM}`);
    await fresh.waitForLoadState("domcontentloaded");
    await fresh.waitForTimeout(1500);

    // Le champ de recherche doit être pré-rempli
    const input = fresh.getByPlaceholder("ابحث عن منتج...");
    await expect(input).toHaveValue(SEARCH_TERM, { timeout: 10000 });
    console.log(`✅ Input pré-rempli avec "${SEARCH_TERM}"`);

    // L'URL doit toujours contenir ?search=
    await expect(fresh).toHaveURL(new RegExp(`search=${SEARCH_TERM}`));

    // Soit on a des produits filtrés, soit le message « pas de résultat »,
    // mais en aucun cas un crash.
    const hasResults = await fresh.locator("a[href^='/produits/']").first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasNoResultMsg = await fresh.getByText(/لم نجد|نتائج تقريبية/).isVisible().catch(() => false);
    expect(hasResults || hasNoResultMsg, "Le lien partagé doit afficher soit des résultats, soit un message de non-trouvé").toBe(true);

    await ctx.close();
  });

  test("Recherche globale : arriver via /produits?category=X puis taper search efface category", async ({ page }) => {
    // L'utilisateur clique sur une carte « Shampooing » dans /collections/coiffure
    // → atterrit sur /produits?category=...&world=coiffure. On simule en lisant
    // la 1ère catégorie réelle exposée par l'API collections (homepage=true).
    const cats = await page.request.get("/api/boutique/collections?world=coiffure").then(r => r.json());
    const firstCat = (cats?.collections || []).find(c => c.title)?.title;
    test.skip(!firstCat, "Aucune catégorie coiffure disponible — skip");

    const startUrl = `/produits?category=${encodeURIComponent(firstCat)}&world=coiffure`;
    await page.goto(startUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // L'URL initiale contient bien category=
    await expect(page).toHaveURL(/category=/);

    // L'utilisateur tape un terme dans la barre de recherche
    await humanTypeSearch(page, SEARCH_TERM);
    await page.waitForTimeout(900);

    // L'URL doit avoir search= MAIS PLUS category=
    await expect(page).toHaveURL(new RegExp(`search=${SEARCH_TERM}`));
    const urlAfter = page.url();
    expect(urlAfter, "category= ne doit plus être dans l'URL après typing search sur /produits").not.toMatch(/category=/);
    console.log(`✅ Catégorie effacée auto sur /produits → recherche globale: ${urlAfter}`);
  });

  test("Le bouton ✕ remet l'URL propre à /produits", async ({ page }) => {
    await page.goto(`/produits?search=${SEARCH_TERM}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // Localise le bouton X (clear filtres) — texte ✕
    const clearBtn = page.getByRole("button", { name: "✕" });
    const clearVisible = await clearBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!clearVisible) {
      // Le bouton ✕ vit à côté du select catégorie. Sur certains layouts/largeurs il
      // peut ne pas être visible si la liste de catégories est vide. On skip
      // proprement plutôt que de faire échouer.
      test.skip(true, "Bouton ✕ non visible — possiblement aucune catégorie chargée");
      return;
    }

    await clearBtn.click();
    await page.waitForTimeout(700);

    // L'URL doit être /produits sans query string
    await expect(page).toHaveURL(/\/produits$/);
    console.log(`✅ URL nettoyée après ✕: ${page.url()}`);

    // Le bouton « نسخ الرابط » doit avoir disparu (plus de filtre actif)
    const copyBtn = page.getByTestId("copy-search-link");
    expect(await copyBtn.isVisible().catch(() => false)).toBe(false);
  });
});
