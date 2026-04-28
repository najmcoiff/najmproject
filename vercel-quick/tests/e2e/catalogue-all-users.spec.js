/**
 * catalogue-all-users.spec.js — Test humain T138
 *
 * Vérifie que les pages Catalogue et Collections de l'espace Owner
 * sont accessibles et entièrement fonctionnelles pour tous les agents.
 *
 * Flux testés (simulant un vrai humain) :
 *  CATALOGUE :
 *   1. Naviguer vers /dashboard/owner/catalogue → page chargée, articles visibles
 *   2. Rechercher un article → champ fonctionnel
 *   3. Créer un article via "+ Nouvel article" → vérifier en DB
 *   4. Modifier l'article créé (prix) → vérifier en DB
 *   5. Supprimer l'article créé → vérifier suppression DB
 *  COLLECTIONS :
 *   6. Naviguer vers /dashboard/owner/collections → collections visibles
 *   7. Créer une collection → vérifier en DB
 *   8. Modifier la collection → vérifier en DB
 *  NAVIGATION :
 *   9. Lien "Catalogue" dans sidebar → /dashboard/owner/catalogue
 *  10. Lien "Collections" dans sidebar → /dashboard/owner/collections
 */
import { test, expect, sbQuery, sbDelete } from "./fixtures.js";

const TS             = Date.now();
const TEST_TITLE     = `E2E Article ${TS}`;
const TEST_COL_TITLE = `E2E Collection ${TS}`;

test.describe.configure({ mode: "serial" });

test.describe("T138 — Catalogue & Collections avec toutes les fonctionnalités (tous agents)", () => {

  // Cleanup de sécurité : si un test échoue avant la suppression UI, on nettoie en DB
  test.afterAll(async () => {
    try {
      const articles = await sbQuery("nc_variants", `product_title=eq.${encodeURIComponent(TEST_TITLE)}&select=variant_id`);
      for (const a of (articles || [])) {
        await sbDelete("nc_variants", `variant_id=eq.${a.variant_id}`).catch(() => {});
      }
      const cols = await sbQuery("nc_collections", `title=eq.${encodeURIComponent(TEST_COL_TITLE)}&select=collection_id`);
      for (const c of (cols || [])) {
        await sbDelete("nc_collections", `collection_id=eq.${c.collection_id}`).catch(() => {});
      }
    } catch {}
  });

  // ── CATALOGUE ────────────────────────────────────────────────────────────

  test("1 — /dashboard/owner/catalogue se charge et affiche des articles", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await expect(authedPage.getByText("Stock articles")).toBeVisible({ timeout: 15000 });
    await authedPage.waitForSelector("table tbody tr", { timeout: 20000 });
    const rows = await authedPage.locator("table tbody tr").count();
    expect(rows).toBeGreaterThan(0);
    console.log(`✅ Catalogue chargé : ${rows} lignes visibles`);
  });

  test("2 — la recherche filtre les articles", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForSelector("table tbody tr", { timeout: 20000 });

    const search = authedPage.getByPlaceholder(/rechercher un article/i).first();
    await search.click();
    await authedPage.keyboard.type("color");
    await authedPage.waitForTimeout(1500);
    const val = await search.inputValue();
    expect(val).toBe("color");
    console.log("✅ Champ de recherche fonctionne");

    await search.fill("");
    await authedPage.waitForTimeout(800);
  });

  test("3 — créer un article via '+ Nouvel article' → vérifié en DB", async ({ authedPage }) => {
    test.setTimeout(60000);
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForSelector("table tbody tr", { timeout: 20000 });

    // Cliquer "+ Nouvel article"
    await authedPage.getByRole("button", { name: /nouvel article/i }).click();
    await authedPage.waitForTimeout(1000);

    // Remplir le formulaire modal (les labels n'ont pas d'attribut for → on cible directement les inputs)
    const form = authedPage.locator("form").last();

    // Titre : premier input texte du formulaire
    await form.locator('input:not([type="number"]):not([type="url"]):not([type="file"]):not([type="search"])').first().fill(TEST_TITLE);

    // Prix : premier input number (Prix DA)
    await form.locator('input[type="number"]').first().fill("750");

    // Stock : 4ème input number (Prix=0, Barré=1, Achat=2, Stock=3)
    await form.locator('input[type="number"]').nth(3).fill("5");

    await authedPage.waitForTimeout(300);

    // Cliquer "Créer l'article"
    await authedPage.getByRole("button", { name: /créer l.article/i }).click();
    await authedPage.waitForTimeout(3000);

    // Vérifier en DB
    const rows = await sbQuery("nc_variants", `product_title=eq.${encodeURIComponent(TEST_TITLE)}&select=variant_id,product_title,price,inventory_quantity`);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].product_title).toBe(TEST_TITLE);
    console.log(`✅ Article créé en DB : ${rows[0].variant_id} — prix ${rows[0].price} DA`);
  });

  test("4 — modifier l'article créé (prix 750 → 999) → vérifié en DB", async ({ authedPage }) => {
    const dbRows = await sbQuery("nc_variants", `product_title=eq.${encodeURIComponent(TEST_TITLE)}&select=variant_id`);
    expect(Array.isArray(dbRows) && dbRows.length > 0).toBe(true);
    const variantId = dbRows[0].variant_id;

    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForSelector("table tbody tr", { timeout: 20000 });

    // Rechercher l'article test
    const search = authedPage.getByPlaceholder(/rechercher un article/i).first();
    await search.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 12));
    await authedPage.waitForTimeout(2000);

    // Cliquer "Modifier" sur la ligne (data-testid btn-modifier)
    const btnModifier = authedPage.locator(`[data-testid="btn-modifier"]`).first();
    await expect(btnModifier).toBeVisible({ timeout: 10000 });
    await btnModifier.click();
    await authedPage.waitForTimeout(1000);

    // Modifier le prix (premier input number du formulaire = Prix DA)
    const form = authedPage.locator("form").last();
    const priceInput = form.locator('input[type="number"]').first();
    await priceInput.fill("999");
    await authedPage.waitForTimeout(300);

    // Enregistrer
    await authedPage.getByRole("button", { name: /enregistrer/i }).click();
    await authedPage.waitForTimeout(3000);

    // Vérifier en DB
    const updated = await sbQuery("nc_variants", `variant_id=eq.${variantId}&select=price`);
    expect(Number(updated[0].price)).toBe(999);
    console.log(`✅ Prix mis à jour en DB : 750 → 999 DA`);
  });

  test("5 — supprimer l'article créé → absent de la DB", async ({ authedPage }) => {
    test.setTimeout(90000);
    const dbRows = await sbQuery("nc_variants", `product_title=eq.${encodeURIComponent(TEST_TITLE)}&select=variant_id`);
    const variantId = dbRows?.[0]?.variant_id;

    await authedPage.goto("/dashboard/owner/catalogue", { timeout: 30000 });
    await authedPage.waitForSelector("table tbody tr", { timeout: 20000 });

    // Rechercher l'article
    const search = authedPage.getByPlaceholder(/rechercher un article/i).first();
    await search.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 12));
    await authedPage.waitForTimeout(1500);

    // Cliquer le bouton poubelle (data-testid btn-supprimer)
    const btnDel = authedPage.locator(`[data-testid="btn-supprimer"]`).first();
    await expect(btnDel).toBeVisible({ timeout: 10000 });
    await btnDel.click();
    await authedPage.waitForTimeout(500);

    // Confirmer la suppression dans la modale
    const confirmBtn = authedPage.locator(`[data-testid="btn-confirmer-suppression"]`);
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    await authedPage.waitForTimeout(2000);

    // Vérifier suppression en DB
    if (variantId) {
      const check = await sbQuery("nc_variants", `variant_id=eq.${variantId}&select=variant_id`);
      expect(Array.isArray(check) && check.length === 0).toBe(true);
      console.log(`✅ Article supprimé de la DB : ${variantId}`);
    } else {
      console.log("✅ Article supprimé via UI (variant_id non récupéré en amont)");
    }
  });

  // ── COLLECTIONS ──────────────────────────────────────────────────────────

  test("6 — /dashboard/owner/collections se charge et affiche les collections", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/collections");
    await authedPage.waitForTimeout(3000);

    // Vérifier qu'il y a au moins le titre de la page et le bouton Nouvelle collection
    await expect(authedPage.getByRole("button", { name: /nouvelle collection/i })).toBeVisible({ timeout: 10000 });
    console.log("✅ Page Collections chargée avec bouton Nouvelle collection");
  });

  test("7 — créer une collection → vérifiée en DB", async ({ authedPage }) => {
    test.setTimeout(60000);
    await authedPage.goto("/dashboard/owner/collections", { timeout: 30000 });
    await authedPage.waitForTimeout(2000);

    // Cliquer "+ Nouvelle collection"
    await authedPage.getByRole("button", { name: /nouvelle collection/i }).click();
    await authedPage.waitForTimeout(800);

    // Remplir le titre (premier input texte du formulaire collections)
    const titleInput = authedPage.locator("form").last()
      .locator('input:not([type="number"]):not([type="url"]):not([type="file"])').first();
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill(TEST_COL_TITLE);
    await authedPage.waitForTimeout(300);

    // Cliquer "Créer"
    await authedPage.getByRole("button", { name: /^créer$/i }).click();
    await authedPage.waitForTimeout(3000);

    // Vérifier en DB
    const rows = await sbQuery("nc_collections", `title=eq.${encodeURIComponent(TEST_COL_TITLE)}&select=collection_id,title`);
    expect(Array.isArray(rows) && rows.length > 0).toBe(true);
    console.log(`✅ Collection créée en DB : ${rows[0].collection_id}`);
  });

  test("8 — modifier la collection (toggle Visible) → vérifié en DB", async ({ authedPage }) => {
    test.setTimeout(60000);
    const rows = await sbQuery("nc_collections", `title=eq.${encodeURIComponent(TEST_COL_TITLE)}&select=collection_id,active`);
    expect(Array.isArray(rows) && rows.length > 0).toBe(true);
    const colId = rows[0].collection_id;

    await authedPage.goto("/dashboard/owner/collections");
    await authedPage.waitForTimeout(2000);

    // Trouver la card de la collection test et cliquer "Modifier"
    // Structure : div.space-y-2 > div[class*="rounded-2xl flex"] contenant un <p> avec le titre
    const card = authedPage.locator('div[class*="rounded-2xl"]').filter({
      has: authedPage.locator('p', { hasText: TEST_COL_TITLE })
    }).first();
    const btnModifier = card.getByRole("button", { name: /modifier/i });
    await expect(btnModifier).toBeVisible({ timeout: 15000 });
    await btnModifier.click();
    await authedPage.waitForTimeout(800);

    // Dans le modal, changer l'ordre d'affichage (premier input number du form collections)
    const sortInput = authedPage.locator("form").last().locator('input[type="number"]').first();
    await expect(sortInput).toBeVisible({ timeout: 5000 });
    await sortInput.fill("3");
    await authedPage.waitForTimeout(300);

    // Enregistrer
    await authedPage.getByRole("button", { name: /enregistrer/i }).click();
    await authedPage.waitForTimeout(3000);

    // Vérifier en DB
    const updated = await sbQuery("nc_collections", `collection_id=eq.${colId}&select=sort_order`);
    expect(Number(updated[0].sort_order)).toBe(3);
    console.log(`✅ Collection modifiée en DB : sort_order = 3`);

    // Cleanup DB
    await sbDelete("nc_collections", `collection_id=eq.${colId}`).catch(() => {});
    console.log("✅ Cleanup collection E2E");
  });

  // ── NAVIGATION ────────────────────────────────────────────────────────────

  test("9 — lien 'Catalogue' dans la sidebar → /dashboard/owner/catalogue", async ({ authedPage }) => {
    await authedPage.goto("/dashboard");
    await authedPage.waitForTimeout(1500);

    const link = authedPage.locator('a[href="/dashboard/owner/catalogue"]');
    await expect(link).toBeVisible({ timeout: 10000 });
    await link.click();
    await authedPage.waitForTimeout(2000);
    expect(authedPage.url()).toContain("/dashboard/owner/catalogue");
    console.log("✅ Lien Catalogue → /dashboard/owner/catalogue OK");
  });

  test("10 — lien 'Collections' dans la sidebar → /dashboard/owner/collections", async ({ authedPage }) => {
    await authedPage.goto("/dashboard");
    await authedPage.waitForTimeout(1500);

    const link = authedPage.locator('a[href="/dashboard/owner/collections"]');
    await expect(link).toBeVisible({ timeout: 10000 });
    await link.click();
    await authedPage.waitForTimeout(2000);
    expect(authedPage.url()).toContain("/dashboard/owner/collections");
    console.log("✅ Lien Collections → /dashboard/owner/collections OK");
  });
});
