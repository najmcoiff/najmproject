/**
 * T_NOTE_TASKS — Checkboxes dans les notes
 * Playwright humain — simule un vrai agent
 */
import { test, expect, sbQuery, sbDelete } from "./fixtures.js";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

test.describe("Organisation — Checkboxes dans les notes", () => {

  test("T_NOTE_TASKS — Créer une note avec 2 tâches et vérifier en DB", async ({ authedPage: page }) => {
    const ts = Date.now();
    const noteTitle = `Note tâches ${ts}`;
    const task1 = `Tâche A ${ts}`;
    const task2 = `Tâche B ${ts}`;
    let noteId = null;

    await page.goto(`${BASE}/dashboard/organisation`);
    await page.waitForSelector("button:has-text('+ Note')", { timeout: 15000 });

    // Ouvrir modal création
    await page.locator("button:has-text('+ Note')").first().click();
    await page.waitForSelector("textarea", { timeout: 5000 });

    // Saisir le contenu
    await page.locator("textarea").first().fill(noteTitle);

    // Ajouter tâche 1
    await page.locator("input[placeholder*='tâche']").fill(task1);
    await page.locator("input[placeholder*='tâche']").press("Enter");
    await page.waitForTimeout(400);

    // Ajouter tâche 2
    await page.locator("input[placeholder*='tâche']").fill(task2);
    await page.locator("button:has-text('+')").last().click();
    await page.waitForTimeout(400);

    // Vérifier que les tâches sont dans le modal
    await expect(page.locator(`text=${task1}`).first()).toBeVisible();
    await expect(page.locator(`text=${task2}`).first()).toBeVisible();

    // Soumettre
    await page.locator("button:has-text('Créer la note')").click();
    await page.waitForTimeout(2000);

    // Vérifier en DB via REST
    const rows = await sbQuery("notes", `contenu=eq.${encodeURIComponent(noteTitle)}&select=id,checkboxes&order=created_at.desc&limit=1`);
    expect(rows.length).toBeGreaterThan(0);
    noteId = rows[0].id;
    const cbs = rows[0].checkboxes;
    expect(Array.isArray(cbs)).toBeTruthy();
    expect(cbs.length).toBe(2);
    expect(cbs.some(c => c.text === task1)).toBeTruthy();
    expect(cbs.some(c => c.text === task2)).toBeTruthy();
    console.log(`✅ T_NOTE_TASKS : note créée avec ${cbs.length} tâches en DB (noteId=${noteId})`);

    // Cleanup
    if (noteId) await sbDelete("notes", `id=eq.${noteId}`);
  });

});
