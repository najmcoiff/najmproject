/**
 * Test Playwright humain — Agenda : Événements à dates précises
 *
 * Scénarios couverts :
 * 1. DP-1 : Créer un événement "dates précises" → vérifier affichage via multi-date picker
 * 2. DP-2 : L'événement apparaît UNIQUEMENT sur les dates spécifiées (pas les autres jours)
 * 3. DP-3 : L'événement s'affiche correctement en vue jour pour une date spécifiée
 */
import { test, expect, sbQuery, sbInsert, sbDelete } from "./fixtures.js";

const BASE_URL = "https://najmcoiffdashboard.vercel.app";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function deleteByTitle(titre) {
  const rows = await sbQuery("evenements", `select=id&titre=eq.${encodeURIComponent(titre)}`);
  if (Array.isArray(rows)) {
    for (const r of rows) await sbDelete("evenements", `id=eq.${r.id}`);
  }
}

test.describe("Agenda — Dates précises", () => {

  test("DP-1 — Créer un événement dates précises via le multi-date picker", async ({ authedPage: page }) => {
    const titre = "DatePrec E2E DP1 " + Date.now();
    const today = todayStr();
    const tomorrow = tomorrowStr();

    try {
      await page.goto(`${BASE_URL}/dashboard/organisation`);
      await page.waitForTimeout(3000);

      // Aller à l'agenda
      const agendaTab = page.locator("button", { hasText: "Agenda" });
      await expect(agendaTab).toBeVisible({ timeout: 15000 });
      await agendaTab.click();
      await page.waitForTimeout(1000);

      // Ouvrir le modal "+ Événement"
      await page.locator("button", { hasText: "+ Événement" }).click();
      await page.waitForTimeout(600);

      // Remplir le titre
      const titreInput = page.locator("input[placeholder*='Réunion']").first();
      await expect(titreInput).toBeVisible({ timeout: 5000 });
      await titreInput.fill(titre);
      await page.waitForTimeout(200);

      // Sélectionner "Dates précises"
      const recurrenceSelect = page.locator("select").first();
      await recurrenceSelect.selectOption("dates_precises");
      await page.waitForTimeout(500);

      // Le multi-date picker doit apparaître (label "Dates de l'événement")
      const dateLabel = page.locator("text=Dates de l'événement");
      await expect(dateLabel).toBeVisible({ timeout: 3000 });

      // Le premier input date doit être visible
      const dateInputs = page.locator("input[type='date']");
      await expect(dateInputs.first()).toBeVisible({ timeout: 3000 });

      // Définir la première date = aujourd'hui
      await dateInputs.first().fill(today);
      await page.waitForTimeout(200);

      // Ajouter une deuxième date
      const addBtn = page.locator("button", { hasText: "+ Ajouter" });
      await expect(addBtn).toBeVisible({ timeout: 3000 });
      await addBtn.click();
      await page.waitForTimeout(300);

      // Remplir la deuxième date = demain
      const allDateInputs = page.locator("input[type='date']");
      const count = await allDateInputs.count();
      expect(count).toBeGreaterThanOrEqual(2);
      await allDateInputs.nth(count - 1).fill(tomorrow);
      await page.waitForTimeout(200);

      // Vérifier le compteur "2 dates"
      await expect(page.locator("text=2 dates")).toBeVisible({ timeout: 3000 });

      // Soumettre
      const createBtn = page.locator("button[type='submit']", { hasText: "Créer" });
      await createBtn.click();
      await page.waitForTimeout(2500);

      // Vérifier en DB
      const rows = await sbQuery(
        "evenements",
        `select=id,recurrence,recurrence_data,date_debut&titre=eq.${encodeURIComponent(titre)}&order=created_at.desc&limit=1`
      );
      expect(Array.isArray(rows) && rows.length >= 1, "Événement créé en DB").toBe(true);
      const ev = rows[0];
      expect(ev.recurrence).toBe("dates_precises");
      expect(ev.recurrence_data?.dates).toBeDefined();
      expect(ev.recurrence_data.dates).toContain(today);
      expect(ev.recurrence_data.dates).toContain(tomorrow);
      // date_debut doit être la plus ancienne = today
      expect(ev.date_debut).toBe(today);

    } finally {
      await deleteByTitle(titre);
    }
  });

  test("DP-2 — L'événement dates précises s'affiche UNIQUEMENT sur les dates spécifiées", async ({ authedPage: page }) => {
    const titre = "DatePrec E2E DP2 " + Date.now();
    const today = todayStr();

    // Créer directement en DB avec dates = [today]
    const ev = await sbInsert("evenements", {
      auteur_nom: "najm",
      titre,
      description: "Test E2E",
      couleur: "#ef4444",
      date_debut: today,
      date_fin: today,
      heure_debut: "10:00",
      heure_fin: "11:00",
      recurrence: "dates_precises",
      recurrence_data: { dates: [today] },
      terminee: false,
      completions: {},
    });
    const evId = Array.isArray(ev) ? ev[0]?.id : ev?.id;
    expect(evId, "Événement créé en DB").toBeTruthy();

    try {
      await page.goto(`${BASE_URL}/dashboard/organisation`);
      await page.waitForTimeout(3000);

      const agendaTab = page.locator("button", { hasText: "Agenda" });
      await expect(agendaTab).toBeVisible({ timeout: 15000 });
      await agendaTab.click();
      await page.waitForTimeout(1000);

      // En vue mois, l'événement doit apparaître sur la cellule d'aujourd'hui
      // Trouver l'EventBar dans la vue mois qui contient le titre
      await expect(page.locator(`text=${titre}`).first()).toBeVisible({ timeout: 10000 });

      // Vérifier en vue Jour (aujourd'hui) : l'événement doit être visible
      const jourBtn = page.locator("button", { hasText: "Jour" });
      await jourBtn.click();
      await page.waitForTimeout(1200);
      await expect(page.locator(`text=${titre}`).first()).toBeVisible({ timeout: 8000 });

      // Naviguer vers hier → l'événement ne doit PAS apparaître (dates_precises = seulement aujourd'hui)
      const prevBtn = page.locator("button[class*='rounded-full']", { hasText: "‹" }).first();
      await prevBtn.click();
      await page.waitForTimeout(1200);
      const evtYesterday = page.locator(`text=${titre}`);
      const countYesterday = await evtYesterday.count();
      expect(countYesterday).toBe(0);

    } finally {
      await sbDelete("evenements", `id=eq.${evId}`);
    }
  });

  test("DP-3 — Vue jour : l'événement dates précises est coché correctement par date", async ({ authedPage: page }) => {
    const titre = "DatePrec E2E DP3 " + Date.now();
    const today = todayStr();
    const tomorrow = tomorrowStr();

    // Créer avec 2 dates (today + tomorrow)
    const ev = await sbInsert("evenements", {
      auteur_nom: "najm",
      titre,
      description: "Test DP3",
      couleur: "#8b5cf6",
      date_debut: today,
      date_fin: tomorrow,
      heure_debut: "14:00",
      heure_fin: "15:00",
      recurrence: "dates_precises",
      recurrence_data: { dates: [today, tomorrow] },
      terminee: false,
      completions: {},
    });
    const evId = Array.isArray(ev) ? ev[0]?.id : ev?.id;
    expect(evId, "Événement créé en DB").toBeTruthy();

    try {
      await page.goto(`${BASE_URL}/dashboard/organisation`);
      await page.waitForTimeout(3000);

      const agendaTab = page.locator("button", { hasText: "Agenda" });
      await expect(agendaTab).toBeVisible({ timeout: 15000 });
      await agendaTab.click();
      await page.waitForTimeout(1000);

      // Vue Jour pour aujourd'hui
      const jourBtn = page.locator("button", { hasText: "Jour" });
      await jourBtn.click();
      await page.waitForTimeout(1200);

      // L'événement doit apparaître
      await expect(page.locator(`text=${titre}`).first()).toBeVisible({ timeout: 10000 });

      // Cocher l'événement pour aujourd'hui
      const eventBlock = page.locator(".rounded-xl.overflow-hidden.shadow-sm", { hasText: titre }).first();
      const checkBtn = eventBlock.locator("[data-check]").first();
      await checkBtn.click();
      await page.waitForTimeout(1500);

      // Vérifier en DB : completions[today] = true, terminee = false (événement récurrent)
      const rows = await sbQuery("evenements", `select=terminee,completions&id=eq.${evId}`);
      expect(Array.isArray(rows) && rows.length === 1).toBe(true);
      expect(rows[0].terminee).toBeFalsy();
      expect((rows[0].completions || {})[today]).toBe(true);

      // Aller au lendemain → même événement présent mais DÉCOCHÉ
      const nextBtn = page.locator("button[class*='rounded-full']", { hasText: "›" }).first();
      await nextBtn.click();
      await page.waitForTimeout(1200);

      await expect(page.locator(`text=${titre}`).first()).toBeVisible({ timeout: 8000 });

      // La checkbox du lendemain doit être décochée
      const eventBlockTomorrow = page.locator(".rounded-xl.overflow-hidden.shadow-sm", { hasText: titre }).first();
      const checkBtnTomorrow = eventBlockTomorrow.locator("[data-check]").first();
      const bgTomorrow = await checkBtnTomorrow.evaluate(el => el.style.backgroundColor).catch(() => "");
      expect(bgTomorrow).toBe("transparent");

      // Vérifier en DB : completions[tomorrow] ne doit PAS être true
      const rows2 = await sbQuery("evenements", `select=completions&id=eq.${evId}`);
      const completions2 = rows2[0]?.completions || {};
      expect(completions2[tomorrow]).toBeFalsy();

    } finally {
      await sbDelete("evenements", `id=eq.${evId}`);
    }
  });

});
