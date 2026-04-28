/**
 * catalogue-delete.spec.js — Test humain T113
 * Suppression définitive d'un article depuis le catalogue admin owner.
 *
 * Flux testé (simulant un vrai humain) :
 *  1. Insérer un article test dans nc_variants
 *  2. Naviguer vers /dashboard/owner/catalogue
 *  3. Rechercher l'article test
 *  4. Cliquer "Supprimer" sur l'article
 *  5. Vérifier que la modale s'affiche avec le bon texte
 *  6. Cliquer "Supprimer définitivement"
 *  7. Vérifier que l'article disparaît de la liste
 *  8. Vérifier via Supabase que l'article est bien supprimé en DB
 *  9. Vérifier que nc_events contient le log DELETE_ARTICLE
 */
import { test, expect, sbInsert, sbQuery, sbDelete } from "./fixtures.js";

const TEST_VARIANT_ID = `nc_e2e_del_${Date.now()}`;
const TEST_TITLE      = `E2E Article Suppression ${Date.now()}`;

test.describe("T113 — Suppression définitive article (owner)", () => {

  test.beforeAll(async () => {
    await sbInsert("nc_variants", {
      variant_id:         TEST_VARIANT_ID,
      product_id:         `nc_p_e2e_${Date.now()}`,
      product_title:      TEST_TITLE,
      display_name:       TEST_TITLE,
      price:              500,
      inventory_quantity: 10,
      status:             "active",
      world:              "coiffure",
      vendor:             "Test E2E",
      tags:               [],
      collections:        [],
      collection_ids:     [],
      updated_at:         new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    // Cleanup de sécurité — supprime l'article s'il n'a pas été supprimé par le test
    await sbDelete("nc_variants", `variant_id=eq.${TEST_VARIANT_ID}`).catch(() => {});
    await sbDelete("nc_events",   `action=eq.DELETE_ARTICLE&new_value=ilike.*${TEST_VARIANT_ID}*`).catch(() => {});
  });

  test("la page catalogue admin se charge", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await expect(authedPage.getByText("Stock articles")).toBeVisible({ timeout: 15000 });
  });

  test("le bouton Supprimer est visible sur chaque article", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(2000);
    const btnSupprimer = authedPage.locator('[data-testid="btn-supprimer"]').first();
    await expect(btnSupprimer).toBeVisible({ timeout: 10000 });
  });

  test("supprimer l'article test — modal + confirmation + disparition liste + vérif DB", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/catalogue");
    await authedPage.waitForTimeout(2000);

    // ── Rechercher l'article test ──────────────────────────────────
    const searchInput = authedPage.getByPlaceholder(/rechercher/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.click();
      await authedPage.keyboard.type(TEST_TITLE.slice(0, 20));
      await authedPage.waitForTimeout(1500);
    }

    // ── Vérifier que l'article est visible dans la liste ──────────
    await expect(authedPage.getByText(TEST_TITLE)).toBeVisible({ timeout: 10000 });

    // ── Clic sur "Supprimer" ───────────────────────────────────────
    const row = authedPage.locator("tr").filter({ hasText: TEST_TITLE });
    const btnSupprimer = row.locator('[data-testid="btn-supprimer"]');
    await btnSupprimer.click();
    await authedPage.waitForTimeout(500);

    // ── Vérifier que la modal s'affiche ───────────────────────────
    await expect(authedPage.getByText("Cette action est irréversible")).toBeVisible({ timeout: 5000 });
    // La modal affiche le titre entre guillemets — utiliser first() pour éviter le mode strict
    await expect(authedPage.getByText(new RegExp(TEST_TITLE.slice(0, 20))).first()).toBeVisible();

    // ── Cliquer "Supprimer définitivement" ────────────────────────
    await authedPage.locator('[data-testid="btn-confirmer-suppression"]').click();
    await authedPage.waitForTimeout(2000);

    // ── Vérifier que la modal est fermée + ligne du tableau disparue ──
    await expect(authedPage.getByText("Cette action est irréversible")).not.toBeVisible({ timeout: 8000 });
    // La ligne du tableau (tag <p>) ne doit plus exister
    await expect(authedPage.locator("table").getByText(TEST_TITLE)).not.toBeVisible({ timeout: 5000 });

    // ── Vérification DB : l'article n'existe plus dans nc_variants ─
    const rows = await sbQuery("nc_variants", `variant_id=eq.${TEST_VARIANT_ID}`);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
    console.log(`✅ Article ${TEST_VARIANT_ID} supprimé de nc_variants`);

    // ── Vérification log : nc_events contient DELETE_ARTICLE récent ──
    const logs = await sbQuery("nc_events", `log_type=eq.DELETE_ARTICLE&order=ts.desc&limit=5`);
    expect(Array.isArray(logs) && logs.length > 0).toBe(true);
    const recentLog = logs[0];
    expect(recentLog.log_type).toBe("DELETE_ARTICLE");
    console.log(`✅ Log DELETE_ARTICLE trouvé : actor=${recentLog.actor} ts=${recentLog.ts}`);
  });
});
