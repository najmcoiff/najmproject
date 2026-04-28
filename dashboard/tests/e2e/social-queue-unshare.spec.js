/**
 * T_SOCIAL_UNSHARE — Remettre un reels en file d'attente après partage accidentel
 * Playwright humain — simule un owner qui annule le partage d'un agent
 */
import { test, expect, sbQuery, sbDelete } from "./fixtures.js";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const SB_URL = "https://alyxejkdtkdmluvgfnqk.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";

test.describe("Créatif — Remettre en file (annulation partage accidentel)", () => {

  test("T_SOCIAL_UNSHARE — Owner remet un reels partagé par erreur dans la file d'attente", async ({ authedPage: page }) => {
    const ts = Date.now();
    const titre = `Test Unshare ${ts}`;
    let itemId = null;

    // ── ÉTAPE 1 : Insérer un item déjà "partage" en DB (simule abdennour qui a partagé par erreur) ──
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
        status: "partage",
        position: 999,
        created_by: "najm",
        published_by: "abdennour",
        published_at: new Date().toISOString(),
      }),
    });
    const [inserted] = await res.json();
    itemId = inserted?.id;
    expect(itemId).toBeTruthy();
    console.log(`✅ Item "partage" inséré en DB (simule erreur abdennour): ${itemId}`);

    // ── ÉTAPE 2 : Owner va sur la page social-queue ──
    await page.goto(`${BASE}/dashboard/social-queue`);
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.waitForTimeout(1500);

    // ── ÉTAPE 3 : Cliquer sur l'onglet "Partagés" ──
    await page.locator("button:has-text('Partagés')").click();
    await page.waitForTimeout(600);

    // L'item doit être visible dans cet onglet
    await expect(page.locator(`text=${titre}`)).toBeVisible({ timeout: 8000 });
    console.log(`✅ Item "${titre}" visible dans l'onglet Partagés`);

    // ── ÉTAPE 4 : Cliquer sur "↩ Remettre en file" du bon item ──
    // Trouver le bouton dans la carte qui contient le titre de notre item test
    const itemCard = page.locator(`div[data-id="${itemId}"]`);
    const unshareBtn = itemCard.locator(`[data-testid="unshare-btn"]`);
    await expect(unshareBtn).toBeVisible({ timeout: 5000 });

    // Attendre la réponse API avant de vérifier la DB
    const [unshareResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes("/api/social-queue/unshare") && res.status() === 200, { timeout: 15000 }),
      unshareBtn.click(),
    ]);
    const unshareData = await unshareResponse.json();
    console.log(`✅ API /api/social-queue/unshare répondu: ${JSON.stringify(unshareData)}`);
    await page.waitForTimeout(500);
    console.log("✅ Bouton '↩ Remettre en file' cliqué");

    // ── ÉTAPE 5 : Vérifier en DB que status = 'valide' et published_by/published_at vidés ──
    const rows = await sbQuery("nc_social_queue", `id=eq.${itemId}&select=status,published_by,published_at&limit=1`);
    expect(rows[0]?.status).toBe("valide");
    expect(rows[0]?.published_by).toBeFalsy();
    expect(rows[0]?.published_at).toBeFalsy();
    console.log(`✅ Statut remis à "valide" en DB — published_by et published_at effacés`);

    // ── ÉTAPE 6 : L'item doit maintenant apparaître dans l'onglet "À partager" ──
    await page.locator("button:has-text('À partager')").click();
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${titre}`)).toBeVisible({ timeout: 5000 });
    console.log(`✅ Item "${titre}" visible dans l'onglet "À partager" après remise en file`);

    // ── ÉTAPE 7 : L'item ne doit plus apparaître dans l'onglet "Partagés" ──
    await page.locator("button:has-text('Partagés')").click();
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${titre}`)).not.toBeVisible({ timeout: 3000 });
    console.log(`✅ Item "${titre}" absent de l'onglet "Partagés" après remise en file`);

    // Cleanup
    if (itemId) await sbDelete("nc_social_queue", `id=eq.${itemId}`);
    console.log("✅ T_SOCIAL_UNSHARE — Test complet réussi");
  });

});
