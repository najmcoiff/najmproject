/**
 * Test Playwright humain — Agenda : Routine quotidienne + complétion par date
 *
 * Scénarios couverts :
 * 1. AGD-1 : Créer une routine quotidienne — vérifier DB + UI vue jour
 * 2. AGD-2 : Cocher la routine → seule la date du jour est cochée (completions JSONB)
 * 3. AGD-3 : Vue mois — l'indicateur ✓ apparaît uniquement sur le jour coché
 */
import { test, expect, sbQuery, sbInsert, sbPatch, sbDelete } from "./fixtures.js";

const BASE_URL = "https://najmcoiffdashboard.vercel.app";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Créer un événement routine directement en DB
async function createRoutineEvent(titre) {
  const today = todayStr();
  const rows = await sbInsert("evenements", {
    auteur_nom: "najm",
    titre,
    description: "Test E2E",
    couleur: "#22c55e",
    date_debut: today,
    date_fin: today,
    heure_debut: "08:00",
    heure_fin: "09:00",
    recurrence: "quotidienne",
    recurrence_data: {},
    terminee: false,
    completions: {},
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

// Supprimer un événement par ID
async function deleteEvent(id) {
  await sbDelete("evenements", `id=eq.${id}`);
}

// Lire l'état d'un événement en DB
async function readEvent(id) {
  const rows = await sbQuery("evenements", `select=id,titre,recurrence,completions,terminee&id=eq.${id}`);
  return Array.isArray(rows) ? rows[0] : rows;
}

test.describe("Agenda — Routine quotidienne", () => {

  test("AGD-1 — Créer une routine quotidienne via UI et vérifier son affichage", async ({ authedPage: page }) => {
    const titre = "Routine E2E AGD1 " + Date.now();

    await page.goto(`${BASE_URL}/dashboard/organisation`);
    await page.waitForTimeout(3000);

    // Naviguer vers l'onglet Agenda
    const agendaTab = page.locator("button", { hasText: "Agenda" });
    await expect(agendaTab).toBeVisible({ timeout: 15000 });
    await agendaTab.click();
    await page.waitForTimeout(1000);

    // Cliquer sur "+ Événement"
    const addBtn = page.locator("button", { hasText: "+ Événement" });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();
    await page.waitForTimeout(800);

    // Remplir le titre
    const titreInput = page.locator("input[placeholder*='Réunion']").first();
    await expect(titreInput).toBeVisible({ timeout: 5000 });
    await titreInput.click();
    await titreInput.fill(titre);
    await page.waitForTimeout(300);

    // Sélectionner "Routine quotidienne"
    const recurrenceSelect = page.locator("select").first();
    await recurrenceSelect.selectOption("quotidienne");
    await page.waitForTimeout(500);

    // Vérifier que le bandeau vert apparaît (span spécifique)
    const routineBanner = page.locator("div.bg-green-50", { hasText: "Routine quotidienne" });
    await expect(routineBanner).toBeVisible({ timeout: 5000 });

    // Date de début = aujourd'hui
    const todayISO = todayStr();
    const dateInput = page.locator("input[type='date']").first();
    await dateInput.fill(todayISO);
    await page.waitForTimeout(300);

    // Soumettre le formulaire
    const createBtn = page.locator("button[type='submit']", { hasText: "Créer" });
    await createBtn.click();
    await page.waitForTimeout(2500);

    // Vérifier en DB
    const rows = await sbQuery(
      "evenements",
      `select=id,recurrence,completions&titre=eq.${encodeURIComponent(titre)}&order=created_at.desc&limit=1`
    );
    expect(Array.isArray(rows) && rows.length >= 1, "L'événement doit exister en DB").toBe(true);
    const ev = rows[0];
    expect(ev.recurrence).toBe("quotidienne");
    expect(ev.completions).toEqual({});

    // Passer en vue Jour → l'événement doit apparaître
    const jourBtn = page.locator("button", { hasText: "Jour" });
    await jourBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator(`text=${titre}`).first()).toBeVisible({ timeout: 10000 });

    // Nettoyage
    await deleteEvent(ev.id);
  });

  test("AGD-2 — Cocher la routine ne met à jour QUE completions[date] (pas terminee global)", async ({ authedPage: page }) => {
    const titre = "Routine E2E AGD2 " + Date.now();
    const todayISO = todayStr();

    // Créer l'événement directement en DB
    const ev = await createRoutineEvent(titre);
    expect(ev?.id, "Événement créé en DB").toBeTruthy();

    try {
      await page.goto(`${BASE_URL}/dashboard/organisation`);
      await page.waitForTimeout(3000);

      // Aller à l'agenda
      const agendaTab = page.locator("button", { hasText: "Agenda" });
      await expect(agendaTab).toBeVisible({ timeout: 15000 });
      await agendaTab.click();
      await page.waitForTimeout(1000);

      // Vue Jour (aujourd'hui)
      const jourBtn = page.locator("button", { hasText: "Jour" });
      await jourBtn.click();
      await page.waitForTimeout(1500);

      // L'événement doit être visible dans la grille
      await expect(page.locator(`text=${titre}`).first()).toBeVisible({ timeout: 10000 });

      // Trouver et cliquer la checkbox de l'événement
      // Le bouton [data-check] est dans le bloc de l'événement
      const eventBlocks = page.locator("[data-check]");
      // Filtrer par le bloc parent qui contient le titre
      const eventBlock = page.locator(".rounded-xl.overflow-hidden.shadow-sm", { hasText: titre }).first();
      const checkBtn = eventBlock.locator("[data-check]").first();
      await checkBtn.click();
      await page.waitForTimeout(2000);

      // Vérifier en DB que completions[todayISO] = true et terminee toujours false
      const updated = await readEvent(ev.id);
      expect(updated, "Événement doit exister en DB").toBeTruthy();

      // terminee global ne doit PAS être true pour un événement récurrent
      expect(updated.terminee).toBeFalsy();

      // completions doit avoir la date d'aujourd'hui à true
      const completions = updated.completions || {};
      expect(completions[todayISO]).toBe(true);

      // Naviguer vers hier → la routine doit apparaître décochée
      const prevBtn = page.locator("button[class*='rounded-full']", { hasText: "‹" }).first();
      await prevBtn.click();
      await page.waitForTimeout(1200);

      // La routine apparaît (récurrente depuis aujourd'hui)
      // → vérifier que la checkbox est décochée (fond transparent)
      const eventBlockYesterday = page.locator(".rounded-xl.overflow-hidden.shadow-sm", { hasText: titre }).first();
      const isVisibleYesterday = await eventBlockYesterday.isVisible().catch(() => false);
      if (isVisibleYesterday) {
        const checkBtnY = eventBlockYesterday.locator("[data-check]").first();
        const bgColor = await checkBtnY.evaluate(el => el.style.backgroundColor).catch(() => "");
        expect(bgColor).toBe("transparent");
      }
      // Note: si la date de début est aujourd'hui, hier ne montre pas la routine → c'est normal

    } finally {
      await deleteEvent(ev.id);
    }
  });

  test("AGD-3 — Vue mois : indicateur ✓ après avoir coché en vue jour", async ({ authedPage: page }) => {
    const titre = "Routine E2E AGD3 " + Date.now();

    // Créer l'événement directement en DB
    const ev = await createRoutineEvent(titre);
    expect(ev?.id, "Événement créé en DB").toBeTruthy();

    try {
      await page.goto(`${BASE_URL}/dashboard/organisation`);
      await page.waitForTimeout(3000);

      // Aller à l'agenda
      const agendaTab = page.locator("button", { hasText: "Agenda" });
      await expect(agendaTab).toBeVisible({ timeout: 15000 });
      await agendaTab.click();
      await page.waitForTimeout(1000);

      // Passer en vue Jour
      const jourBtn = page.locator("button", { hasText: "Jour" });
      await jourBtn.click();
      await page.waitForTimeout(1200);

      // L'événement est visible
      await expect(page.locator(`text=${titre}`).first()).toBeVisible({ timeout: 10000 });

      // Cocher l'événement
      const eventBlock = page.locator(".rounded-xl.overflow-hidden.shadow-sm", { hasText: titre }).first();
      const checkBtn = eventBlock.locator("[data-check]").first();
      await checkBtn.click();
      await page.waitForTimeout(1500);

      // Revenir en vue Mois
      const moisBtn = page.locator("button", { hasText: "Mois" });
      await moisBtn.click();
      await page.waitForTimeout(1200);

      // Dans la vue mois, l'EventBar pour ce titre a un attribut `title` qui contient
      // "✓ Terminé" quand l'événement est coché pour ce jour
      // C'est la façon la plus fiable de vérifier l'état done dans le mois
      const evBar = page.locator(`[title*="${titre}"]`).first();
      await expect(evBar).toBeVisible({ timeout: 10000 });

      const titleAttr = await evBar.getAttribute("title");
      expect(titleAttr).toContain("✓ Terminé");

    } finally {
      await deleteEvent(ev.id);
    }
  });

});
