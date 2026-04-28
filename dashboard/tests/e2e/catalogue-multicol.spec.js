/**
 * catalogue-multicol.spec.js — Test humain T115
 * Multi-collections : assigner plusieurs collections à un article depuis le catalogue admin.
 *
 * Flux testé (simulant un vrai humain owner) :
 *  1. Insérer un article test dans nc_variants (0 collections)
 *  2. Insérer 2 collections test dans nc_collections
 *  3. Naviguer vers /dashboard/owner/catalogue
 *  4. Rechercher l'article test
 *  5. Cliquer "Modifier"
 *  6. Cocher 2 collections via les checkboxes
 *  7. Enregistrer
 *  8. Vérifier en DB que collection_ids contient les 2 IDs
 *  9. Vérifier que collections_titles contient les 2 titres
 * 10. CLEANUP
 */
import { test, expect, sbInsert, sbQuery, sbDelete } from "./fixtures.js";

const TS             = Date.now();
const TEST_VARIANT_ID = `nc_e2e_mc_${TS}`;
const TEST_TITLE      = `E2E Multi-Col ${TS}`;
const TEST_COL_ID_1   = `nc_col_e2e_1_${TS}`;
const TEST_COL_ID_2   = `nc_col_e2e_2_${TS}`;
const TEST_COL_TITLE_1 = `Collection E2E Alpha ${TS}`;
const TEST_COL_TITLE_2 = `Collection E2E Beta ${TS}`;

test.describe.configure({ mode: "serial" });

test.describe("T115 — Multi-collections catalogue admin (owner)", () => {

  test.beforeAll(async () => {
    // Insérer article test
    await sbInsert("nc_variants", {
      variant_id:         TEST_VARIANT_ID,
      product_id:         `nc_p_mc_${TS}`,
      product_title:      TEST_TITLE,
      display_name:       TEST_TITLE,
      price:              800,
      inventory_quantity: 5,
      status:             "active",
      world:              "coiffure",
      vendor:             "Test E2E",
      tags:               [],
      collections:        [],
      collection_ids:     [],
      collections_titles: "",
      updated_at:         new Date().toISOString(),
    });

    // Insérer 2 collections test
    await sbInsert("nc_collections", {
      collection_id:    TEST_COL_ID_1,
      title:            TEST_COL_TITLE_1,
      handle:           `e2e-alpha-${TS}`,
      world:            "coiffure",
      show_in_filter:   true,
      show_on_homepage: false,
    });
    await sbInsert("nc_collections", {
      collection_id:    TEST_COL_ID_2,
      title:            TEST_COL_TITLE_2,
      handle:           `e2e-beta-${TS}`,
      world:            "coiffure",
      show_in_filter:   true,
      show_on_homepage: false,
    });
  });

  test.afterAll(async () => {
    await sbDelete("nc_variants",   `variant_id=eq.${TEST_VARIANT_ID}`).catch(() => {});
    await sbDelete("nc_collections", `collection_id=eq.${TEST_COL_ID_1}`).catch(() => {});
    await sbDelete("nc_collections", `collection_id=eq.${TEST_COL_ID_2}`).catch(() => {});
  });

  test("la page catalogue admin se charge", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await expect(authedPage.getByText("Stock articles")).toBeVisible({ timeout: 15000 });
  });

  test("les checkboxes de collections sont présentes dans le formulaire d'édition", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    // Attendre que les collections soient chargées (fetch async sur mount)
    await authedPage.waitForTimeout(3000);

    // Rechercher l'article test
    const searchInput = authedPage.getByPlaceholder(/rechercher/i).first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(2000);

    // Vérifier que l'article est visible
    await expect(authedPage.getByText(TEST_TITLE).first()).toBeVisible({ timeout: 10000 });

    // Ouvrir le formulaire d'édition
    const row = authedPage.locator("tr").filter({ hasText: TEST_TITLE });
    await row.locator('[data-testid="btn-modifier"]').click();
    await authedPage.waitForTimeout(1500);

    // Vérifier que les checkboxes des collections test sont présentes (scroll si nécessaire)
    const col1Check = authedPage.locator(`[data-testid="col-check-${TEST_COL_ID_1}"]`);
    const col2Check = authedPage.locator(`[data-testid="col-check-${TEST_COL_ID_2}"]`);

    // Scroll into view (in case the collections list is scrollable)
    await col1Check.scrollIntoViewIfNeeded({ timeout: 10000 });
    await expect(col1Check).toBeVisible({ timeout: 5000 });

    await col2Check.scrollIntoViewIfNeeded({ timeout: 5000 });
    await expect(col2Check).toBeVisible({ timeout: 5000 });

    // Les 2 sont décochées au départ
    await expect(col1Check).not.toBeChecked();
    await expect(col2Check).not.toBeChecked();
    console.log("✅ Checkboxes collections présentes et décochées");

    // Fermer le modal
    await authedPage.getByRole("button", { name: "✕" }).click();
  });

  test("cocher 2 collections + enregistrer → DB collection_ids contient les 2 IDs", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(3000);

    // Rechercher l'article test
    const searchInput = authedPage.getByPlaceholder(/rechercher/i).first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(2000);

    await expect(authedPage.getByText(TEST_TITLE).first()).toBeVisible({ timeout: 10000 });

    // Ouvrir le formulaire d'édition
    const row = authedPage.locator("tr").filter({ hasText: TEST_TITLE });
    await row.locator('[data-testid="btn-modifier"]').click();
    await authedPage.waitForTimeout(1500);

    // ── Cocher collection 1 ─────────────────────────────────────────
    const col1Check = authedPage.locator(`[data-testid="col-check-${TEST_COL_ID_1}"]`);
    await col1Check.scrollIntoViewIfNeeded({ timeout: 8000 });
    await col1Check.click();
    await authedPage.waitForTimeout(300);
    await expect(col1Check).toBeChecked();
    console.log(`✅ Collection 1 cochée : ${TEST_COL_TITLE_1}`);

    // ── Cocher collection 2 ─────────────────────────────────────────
    const col2Check = authedPage.locator(`[data-testid="col-check-${TEST_COL_ID_2}"]`);
    await col2Check.scrollIntoViewIfNeeded({ timeout: 5000 });
    await col2Check.click();
    await authedPage.waitForTimeout(300);
    await expect(col2Check).toBeChecked();
    console.log(`✅ Collection 2 cochée : ${TEST_COL_TITLE_2}`);

    // ── Enregistrer ─────────────────────────────────────────────────
    await authedPage.getByRole("button", { name: "Enregistrer" }).click();
    await authedPage.waitForTimeout(3000);

    // ── Vérification DB ─────────────────────────────────────────────
    const rows = await sbQuery(
      "nc_variants",
      `variant_id=eq.${TEST_VARIANT_ID}&select=collection_ids,collections,collections_titles`
    );
    expect(Array.isArray(rows) && rows.length > 0).toBe(true);

    const saved = rows[0];
    console.log("DB collection_ids:", JSON.stringify(saved.collection_ids));
    console.log("DB collections_titles:", saved.collections_titles);

    // collection_ids doit contenir les 2 IDs
    expect(Array.isArray(saved.collection_ids)).toBe(true);
    expect(saved.collection_ids).toContain(TEST_COL_ID_1);
    expect(saved.collection_ids).toContain(TEST_COL_ID_2);

    // collections_titles doit contenir les 2 titres
    expect(saved.collections_titles).toContain(TEST_COL_TITLE_1.slice(0, 20));
    expect(saved.collections_titles).toContain(TEST_COL_TITLE_2.slice(0, 20));

    console.log("✅ DB confirmée : 2 collections enregistrées");
  });

  test("décocher une collection + enregistrer → DB collection_ids ne contient plus cet ID", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(2000);

    // Rechercher l'article test
    const searchInput = authedPage.getByPlaceholder(/rechercher/i).first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(1500);

    await expect(authedPage.getByText(TEST_TITLE).first()).toBeVisible({ timeout: 10000 });

    // Ouvrir le formulaire d'édition
    const row = authedPage.locator("tr").filter({ hasText: TEST_TITLE });
    await row.locator('[data-testid="btn-modifier"]').click();
    await authedPage.waitForTimeout(1000);

    // Collection 1 devrait être cochée (sauvegardée précédemment)
    const col1Check = authedPage.locator(`[data-testid="col-check-${TEST_COL_ID_1}"]`);
    await expect(col1Check).toBeChecked({ timeout: 5000 });

    // ── Décocher collection 1 ───────────────────────────────────────
    await col1Check.click();
    await authedPage.waitForTimeout(300);
    await expect(col1Check).not.toBeChecked();
    console.log("✅ Collection 1 décochée");

    // ── Enregistrer ─────────────────────────────────────────────────
    await authedPage.getByRole("button", { name: "Enregistrer" }).click();
    await authedPage.waitForTimeout(3000);

    // ── Vérification DB ─────────────────────────────────────────────
    const rows = await sbQuery(
      "nc_variants",
      `variant_id=eq.${TEST_VARIANT_ID}&select=collection_ids,collections_titles`
    );
    const saved = rows[0];

    // collection_ids NE doit PAS contenir l'ID 1, mais doit encore contenir l'ID 2
    expect(saved.collection_ids).not.toContain(TEST_COL_ID_1);
    expect(saved.collection_ids).toContain(TEST_COL_ID_2);
    console.log("✅ DB confirmée : collection 1 retirée, collection 2 conservée");
  });

  test("le compteur de collections sélectionnées s'affiche correctement", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(2000);

    const searchInput = authedPage.getByPlaceholder(/rechercher/i).first();
    await searchInput.click();
    await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
    await authedPage.waitForTimeout(1500);

    const row = authedPage.locator("tr").filter({ hasText: TEST_TITLE });
    await row.locator('[data-testid="btn-modifier"]').click();
    await authedPage.waitForTimeout(1000);

    // Le label "Collections" doit afficher "(1 sélectionnée)" (car 1 collection reste cochée)
    await expect(authedPage.getByText(/sélectionnée/i)).toBeVisible({ timeout: 5000 });
    console.log("✅ Compteur collections sélectionnées visible");

    await authedPage.getByRole("button", { name: "✕" }).click();
  });
});
