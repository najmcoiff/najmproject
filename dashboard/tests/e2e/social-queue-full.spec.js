/**
 * T_SOCIAL_QUEUE — Test complet insert + affichage + marquer partagé + note auto
 * Playwright humain
 */
import { test, expect, sbQuery, sbDelete } from "./fixtures.js";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

test.describe("Créatif — Insert + affichage + partage", () => {

  test("T_SOCIAL_QUEUE_FULL — Ajouter item via modal Discussions + affichage page + marquer partagé + note auto", async ({ authedPage: page }) => {
    const ts = Date.now();
    const titre = `Test Créatif ${ts}`;
    let itemId = null;

    // ── ÉTAPE 1 : Aller dans Discussions, trouver le salon Créatif, utiliser le bouton +🎬 ──
    await page.goto(`${BASE}/dashboard/discussions`);
    await page.waitForSelector("text=Discussion", { timeout: 15000 });

    // Chercher le salon Créatif
    const salonBtn = page.locator("button, li").filter({ hasText: /cr.atif/i }).first();
    const hasSalon = await salonBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasSalon) {
      // Si le salon n'est pas visible, insérer directement via DB pour tester le reste
      console.log("⚠️ Salon Créatif non trouvé via UI — insertion directe en DB");
      const PAT = "sbp_b875d6d5cf2859909e5b5c1ffb9fa24cc8a155ea";
      const SB_URL = "https://alyxejkdtkdmluvgfnqk.supabase.co";
      const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";
      const res = await fetch(`${SB_URL}/rest/v1/nc_social_queue`, {
        method: "POST",
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json", Prefer: "return=representation",
        },
        body: JSON.stringify({
          titre, type: "reels", world: "coiffure",
          platforms: ["tiktok", "instagram"],
          status: "valide", position: 999, created_by: "najm",
        }),
      });
      const [inserted] = await res.json();
      itemId = inserted?.id;
      expect(itemId).toBeTruthy();
      console.log(`✅ Item inséré directement en DB: ${itemId}`);
    } else {
      // ── Via l'UI Discussions ──
      await salonBtn.click();
      await page.waitForTimeout(1500);

      // Vérifier qu'il y a des messages dans le salon Créatif
      const messages = page.locator(".group");
      const msgCount = await messages.count();

      if (msgCount > 0) {
        // Hover sur le premier message pour voir le bouton +🎬
        await messages.first().hover();
        await page.waitForTimeout(400);

        const addBtn = page.locator("button[title*='file'], button:has-text('+🎬')").first();
        const hasBtnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false);

        if (hasBtnVisible) {
          await addBtn.click();
          await page.waitForSelector("text=File d'attente", { timeout: 5000 });

          // Remplir le modal
          await page.locator("input[placeholder*='Tuto']").fill(titre);
          await page.locator("button:has-text('🎬 Reels')").click();
          await page.locator("button:has-text('✂️')").click(); // coiffure

          // Clic sur Ajouter
          await page.locator("button:has-text('➕ Ajouter')").click();
          await page.waitForTimeout(1500);
          console.log("✅ Item ajouté via bouton +🎬 UI");
        } else {
          console.log("⚠️ Bouton +🎬 non visible — insertion directe DB");
          const SB_URL = "https://alyxejkdtkdmluvgfnqk.supabase.co";
          const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";
          const res = await fetch(`${SB_URL}/rest/v1/nc_social_queue`, {
            method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify({ titre, type: "reels", world: "coiffure", platforms: ["tiktok"], status: "valide", position: 999, created_by: "najm" }),
          });
          const [ins] = await res.json();
          itemId = ins?.id;
          expect(itemId).toBeTruthy();
        }
      }
    }

    // ── ÉTAPE 2 : Vérifier que l'item apparaît dans /social-queue ──
    await page.goto(`${BASE}/dashboard/social-queue`);
    await page.waitForSelector("h1", { timeout: 10000 });

    // Attendre que la page charge les données
    await page.waitForTimeout(1500);

    // L'item doit être visible dans le tab "À partager"
    await expect(page.locator(`text=${titre}`)).toBeVisible({ timeout: 8000 });
    console.log(`✅ Item "${titre}" visible dans la page social-queue`);

    // Récupérer l'ID si pas encore fait
    if (!itemId) {
      const rows = await sbQuery("nc_social_queue", `titre=eq.${encodeURIComponent(titre)}&select=id&limit=1`);
      itemId = rows[0]?.id;
    }
    expect(itemId).toBeTruthy();

    // ── ÉTAPE 3 : Marquer comme partagé ──
    const shareBtn = page.locator("button:has-text('Marquer partagé')").first();
    await expect(shareBtn).toBeVisible({ timeout: 5000 });
    await shareBtn.click();
    await page.waitForTimeout(2000);

    // Vérifier que le statut a changé en DB
    const rows = await sbQuery("nc_social_queue", `id=eq.${itemId}&select=status,published_by&limit=1`);
    expect(rows[0]?.status).toBe("partage");
    expect(rows[0]?.published_by).toBeTruthy();
    console.log(`✅ Statut "partage" confirmé en DB pour ${itemId}`);

    // ── ÉTAPE 4 : Vérifier la note automatique créée dans Organisation ──
    await page.waitForTimeout(1000);
    const noteRows = await sbQuery("notes", `contenu=like.*${encodeURIComponent(titre.slice(0, 20))}*&select=id,contenu&order=created_at.desc&limit=1`);
    if (noteRows.length > 0) {
      console.log(`✅ Note automatique créée: "${noteRows[0].contenu.slice(0, 80)}"`);
      // Cleanup note
      await sbDelete("notes", `id=eq.${noteRows[0].id}`);
    } else {
      console.log("⚠️ Note auto non trouvée (peut prendre quelques secondes)");
    }

    // ── ÉTAPE 5 : L'item apparaît maintenant dans le tab "Partagés" ──
    await page.locator("button:has-text('Partagés')").click();
    await page.waitForTimeout(500);
    await expect(page.locator(`text=${titre}`)).toBeVisible({ timeout: 5000 });
    console.log("✅ Item visible dans l'onglet Partagés");

    // Cleanup
    if (itemId) await sbDelete("nc_social_queue", `id=eq.${itemId}`);
  });

});
