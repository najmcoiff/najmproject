/**
 * T_SOCIAL_DELETE — Suppression d'un item depuis la feuille créatif
 * Playwright humain — simule un owner qui supprime un item "valide" de la file
 */
import { test, expect, sbQuery, sbDelete } from "./fixtures.js";

const BASE = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";
const SB_URL = "https://alyxejkdtkdmluvgfnqk.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";

test.describe("Créatif — Suppression d'un item en file d'attente", () => {

  test("T_SOCIAL_DELETE — Owner supprime un item valide depuis la feuille créatif", async ({ authedPage: page }) => {
    const ts = Date.now();
    const titre = `Test Delete ${ts}`;
    let itemId = null;

    // ── ÉTAPE 1 : Insérer un item "valide" en DB (simule contenu en attente) ──
    const res = await fetch(`${SB_URL}/rest/v1/nc_social_queue`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        titre,
        type: "reels",
        world: "coiffure",
        platforms: ["tiktok", "instagram"],
        status: "valide",
        position: 999,
        created_by: "najm",
      }),
    });
    const [inserted] = await res.json();
    itemId = inserted?.id;
    expect(itemId).toBeTruthy();
    console.log(`✅ Item "valide" inséré en DB pour le test de suppression: ${itemId}`);

    // ── ÉTAPE 2 : Owner va sur la page social-queue ──
    await page.goto(`${BASE}/dashboard/social-queue`);
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.waitForTimeout(1500);

    // L'onglet "À partager" doit être actif par défaut
    await expect(page.locator("button:has-text('À partager')")).toBeVisible();

    // ── ÉTAPE 3 : Vérifier que notre item est visible dans la file ──
    await expect(page.locator(`text=${titre}`)).toBeVisible({ timeout: 8000 });
    console.log(`✅ Item "${titre}" visible dans l'onglet "À partager"`);

    // ── ÉTAPE 4 : Cliquer sur le bouton ✕ de suppression ──
    const itemCard = page.locator(`div[data-id="${itemId}"]`);
    await expect(itemCard).toBeVisible({ timeout: 5000 });

    const deleteBtn = itemCard.locator("button:has-text('✕')");
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();
    await page.waitForTimeout(1000);
    console.log("✅ Bouton ✕ cliqué — suppression déclenchée");

    // ── ÉTAPE 5 : L'item ne doit plus être visible dans l'UI ──
    await expect(page.locator(`text=${titre}`)).not.toBeVisible({ timeout: 5000 });
    console.log(`✅ Item "${titre}" disparu de l'UI après suppression`);

    // ── ÉTAPE 6 : Vérifier en DB que la ligne n'existe plus ──
    const rows = await sbQuery("nc_social_queue", `id=eq.${itemId}&select=id&limit=1`);
    expect(rows.length).toBe(0);
    console.log(`✅ Ligne supprimée confirmée en DB (0 résultat pour id=${itemId})`);

    // Cleanup de sécurité (au cas où le test échoue en cours de route)
    if (rows.length > 0) await sbDelete("nc_social_queue", `id=eq.${itemId}`);
    console.log("✅ T_SOCIAL_DELETE — Test complet réussi");
  });

});
