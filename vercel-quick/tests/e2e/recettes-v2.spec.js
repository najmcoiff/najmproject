/**
 * recettes-v2.spec.js — Tests Playwright humain pour le système recettes v2
 *
 * Couvre :
 * 1. GET /api/recettes → retourne la structure correcte pour une date
 * 2. POST /api/recettes → crée une déclaration dans nc_recettes_v2
 * 3. POST /api/recettes/verify → marque la recette vérifiée + insère dans nc_gestion_fond
 * 4. UI : page Finance onglet Recettes se charge, affiche navigation de dates
 */
import { test, expect, sbQuery, sbDelete } from "./fixtures.js";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://najmcoiffdashboard.vercel.app";
const TODAY = new Date().toLocaleDateString("fr-CA", { timeZone: "Africa/Algiers" });
const TEST_AGENT = "e2e_test_agent";
let createdRecetteId = null;

test.describe("Système Recettes V2", () => {

  test.afterAll(async () => {
    // Nettoyage DB
    if (createdRecetteId) {
      await sbDelete("nc_recettes_v2", `id=eq.${createdRecetteId}`);
    }
    // Nettoyer les transactions gestion_fond créées par le test
    const fondRows = await sbQuery("nc_gestion_fond", `agent=eq.${TEST_AGENT}&source=eq.recette_depot`);
    for (const r of fondRows || []) {
      await sbDelete("nc_gestion_fond", `id_fond=eq.${encodeURIComponent(r.id_fond)}`);
    }
    // Nettoyage nc_events
    const evRows = await sbQuery("nc_events", `log_type=in.(RECETTE_DECLAREE,RECETTE_VERIFIEE)&extra->>agent=eq.${TEST_AGENT}`);
    for (const r of evRows || []) {
      await sbDelete("nc_events", `event_id=eq.${r.event_id}`);
    }
  });

  // ── Test 1 : GET /api/recettes sans token → 401 ──────────────────
  test("GET /api/recettes sans token retourne 401", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/recettes?date=${TODAY}`);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(res.status()).toBe(401);
  });

  // ── Test 2 : GET /api/recettes avec token valide ──────────────────
  test("GET /api/recettes avec token retourne la structure correcte", async ({ authedPage, request }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");
    const session = JSON.parse(
      await authedPage.evaluate(() => sessionStorage.getItem("nc_session") || "{}")
    );
    const token = session.token;

    const res = await request.get(`${BASE_URL}/api/recettes?token=${token}&date=${TODAY}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("recettes");
    expect(body).toHaveProperty("agentsPos");
    expect(body).toHaveProperty("posTotal");
    expect(body).toHaveProperty("date", TODAY);
    expect(Array.isArray(body.recettes)).toBe(true);
  });

  // ── Test 3 : POST /api/recettes → créer une déclaration ──────────
  test("POST /api/recettes crée une déclaration dans nc_recettes_v2", async ({ authedPage, request }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");
    const session = JSON.parse(
      await authedPage.evaluate(() => sessionStorage.getItem("nc_session") || "{}")
    );
    const token = session.token;

    const res = await request.post(`${BASE_URL}/api/recettes`, {
      data: {
        token,
        agent:          TEST_AGENT,
        date_recette:   TODAY,
        montant_declare: 12345,
        notes:          "Test E2E recette v2",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recette).toBeDefined();
    expect(body.recette.agent).toBe(TEST_AGENT);
    expect(Number(body.recette.montant_declare)).toBe(12345);
    expect(body.recette.verified).toBe(false);
    createdRecetteId = body.recette.id;

    // Vérifier en DB
    const dbRows = await sbQuery("nc_recettes_v2", `id=eq.${createdRecetteId}`);
    expect(dbRows).toHaveLength(1);
    expect(Number(dbRows[0].montant_declare)).toBe(12345);
  });

  // ── Test 4 : POST /api/recettes/verify → vérification ───────────
  test("POST /api/recettes/verify marque la recette et insère dans nc_gestion_fond", async ({ authedPage, request }) => {
    if (!createdRecetteId) {
      test.skip(true, "Test 3 n'a pas créé de recette");
      return;
    }
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");
    const session = JSON.parse(
      await authedPage.evaluate(() => sessionStorage.getItem("nc_session") || "{}")
    );
    const token = session.token;

    const res = await request.post(`${BASE_URL}/api/recettes/verify`, {
      data: { token, recette_id: createdRecetteId },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recette.verified).toBe(true);
    expect(body.recette.verified_by).toBeTruthy();
    expect(body.fond_id).toBeTruthy();

    // Vérifier la recette en DB
    const dbRec = await sbQuery("nc_recettes_v2", `id=eq.${createdRecetteId}`);
    expect(dbRec[0].verified).toBe(true);
    expect(dbRec[0].fond_id).toBeTruthy();

    // Vérifier l'ajout dans gestion_fond
    const fondRows = await sbQuery("nc_gestion_fond", `id_fond=eq.${encodeURIComponent(body.fond_id)}`);
    expect(fondRows).toHaveLength(1);
    expect(fondRows[0].type).toBe("ENTRÉE");
    expect(Number(fondRows[0].montant)).toBe(12345);
  });

  // ── Test 5 : POST /api/recettes/verify doublon → 409 ─────────────
  test("Vérifier deux fois la même recette retourne 409", async ({ authedPage, request }) => {
    if (!createdRecetteId) {
      test.skip(true, "Test 3 n'a pas créé de recette");
      return;
    }
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");
    const session = JSON.parse(
      await authedPage.evaluate(() => sessionStorage.getItem("nc_session") || "{}")
    );
    const token = session.token;

    const res = await request.post(`${BASE_URL}/api/recettes/verify`, {
      data: { token, recette_id: createdRecetteId },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  // ── Test 6 : UI — onglet Recettes se charge ───────────────────────
  test("Onglet Recettes de Finance affiche la navigation de dates", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");

    // Cliquer sur l'onglet Recettes
    const recettesTab = authedPage.locator("button", { hasText: "Recettes" });
    await expect(recettesTab).toBeVisible();
    await recettesTab.click();
    await authedPage.waitForTimeout(1500);

    // Vérifier la navigation date
    const navButtons = authedPage.locator("button", { hasText: "‹" });
    await expect(navButtons.first()).toBeVisible();

    // Vérifier que "Aujourd'hui" est affiché
    const todayLabel = authedPage.locator("text=Aujourd'hui");
    await expect(todayLabel.first()).toBeVisible();

    // Vérifier les KPIs du jour
    const totalPOS = authedPage.locator("text=Total POS réel");
    await expect(totalPOS).toBeVisible();

    const totalDeclare = authedPage.locator("text=Total déclaré");
    await expect(totalDeclare).toBeVisible();

    // Vérifier que le bouton "Déclarer" est présent
    const declareBtn = authedPage.locator("button", { hasText: "Déclarer" }).first();
    await expect(declareBtn).toBeVisible();
  });

  // ── Test 7 : Navigation date précédente ──────────────────────────
  test("Navigation vers la date précédente fonctionne", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");

    const recettesTab = authedPage.locator("button", { hasText: "Recettes" });
    await recettesTab.click();
    await authedPage.waitForTimeout(1500);

    // Cliquer sur le bouton précédent
    const prevBtn = authedPage.locator("button", { hasText: "‹" }).first();
    await prevBtn.click();
    await authedPage.waitForTimeout(1000);

    // Vérifier que le bouton "Aujourd'hui" apparaît maintenant
    const todayBtn = authedPage.locator("button", { hasText: "Aujourd'hui" });
    await expect(todayBtn).toBeVisible();

    // Revenir à aujourd'hui
    await todayBtn.click();
    await authedPage.waitForTimeout(500);
    await expect(authedPage.locator("text=Aujourd'hui").first()).toBeVisible();
  });

  // ── Test 8 : UI — bouton Déclarer ouvre le modal ─────────────────
  test("Bouton Déclarer ouvre le modal de déclaration", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");

    // Aller sur l'onglet Recettes
    await authedPage.locator("button", { hasText: "Recettes" }).click();
    await authedPage.waitForTimeout(1500);

    // Cliquer sur le bouton "+ Déclarer" dans le header
    const declareBtn = authedPage.locator("button", { hasText: "Déclarer" }).first();
    await expect(declareBtn).toBeVisible();
    await declareBtn.click();
    await authedPage.waitForTimeout(500);

    // Vérifier que le modal s'ouvre
    const modal = authedPage.locator("text=Déclarer une recette");
    await expect(modal).toBeVisible();

    // Vérifier les champs du formulaire
    const agentInput = authedPage.locator("input[placeholder='ex: farouk']");
    await expect(agentInput).toBeVisible();

    const montantInput = authedPage.locator("input[placeholder='ex: 15000']");
    await expect(montantInput).toBeVisible();

    // Fermer le modal
    await authedPage.locator("button", { hasText: "Annuler" }).click();
    await authedPage.waitForTimeout(300);
    await expect(modal).not.toBeVisible();
  });

  // ── Test 9 : UI humain — déclarer une recette via le formulaire ───
  test("Déclarer une recette via le formulaire UI et vérifier en DB", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");

    // Aller sur l'onglet Recettes
    await authedPage.locator("button", { hasText: "Recettes" }).click();
    await authedPage.waitForTimeout(1500);

    // Ouvrir le modal de déclaration
    const declareBtn = authedPage.locator("button", { hasText: "Déclarer" }).first();
    await declareBtn.click();
    await authedPage.waitForTimeout(500);

    // Remplir le formulaire
    const agentInput = authedPage.locator("input[placeholder='ex: farouk']");
    await agentInput.fill("");
    await agentInput.type("e2e_ui_agent");

    const montantInput = authedPage.locator("input[placeholder='ex: 15000']");
    await montantInput.fill("");
    await montantInput.type("9999");

    const notesInput = authedPage.locator("textarea").first();
    if (await notesInput.isVisible()) {
      await notesInput.fill("Test E2E UI declaration");
    }

    // Soumettre
    await authedPage.locator("button[type='submit']", { hasText: "Déclarer" }).click();
    await authedPage.waitForTimeout(2000);

    // Le modal doit se fermer après succès
    await expect(authedPage.locator("text=Déclarer une recette")).not.toBeVisible();

    // Vérifier en DB que la recette existe
    const dbRows = await sbQuery("nc_recettes_v2", `agent=eq.e2e_ui_agent&date_recette=eq.${TODAY}`);
    expect(dbRows.length).toBeGreaterThanOrEqual(1);
    expect(Number(dbRows[0].montant_declare)).toBe(9999);

    // Nettoyage
    for (const r of dbRows) {
      await sbDelete("nc_recettes_v2", `id=eq.${r.id}`);
    }
  });

  // ── Test 10 : UI — bouton Déclarer dans AgentPosCard ─────────────
  test("Bouton Déclarer dans AgentPosCard pré-remplit le formulaire", async ({ authedPage }) => {
    await authedPage.goto(`${BASE_URL}/dashboard/finance`);
    await authedPage.waitForLoadState("networkidle");

    // Aller sur l'onglet Recettes
    await authedPage.locator("button", { hasText: "Recettes" }).click();
    await authedPage.waitForTimeout(2000);

    // Vérifier qu'il y a au moins une carte AgentPosCard (agents avec POS non déclarés)
    // Le badge "Non déclaré" est dans un span avec bg-amber-200
    const nonDeclareCards = authedPage.locator("span.bg-amber-200", { hasText: "Non déclaré" });
    const count = await nonDeclareCards.count();

    if (count > 0) {
      // Cibler spécifiquement le bouton "Déclarer" dans la première AgentPosCard
      // (qui est à fond amber-50, pas indigo comme le header)
      const firstCard = authedPage.locator("div.bg-amber-50").first();
      await expect(firstCard).toBeVisible();
      const agentDeclareBtn = firstCard.locator("button", { hasText: "Déclarer" });
      await expect(agentDeclareBtn).toBeVisible();
      await agentDeclareBtn.click();
      await authedPage.waitForTimeout(500);

      // Vérifier que le modal s'ouvre avec le nom de l'agent pré-rempli
      const modal = authedPage.locator("text=Déclarer une recette");
      await expect(modal).toBeVisible();

      // Le champ agent doit être pré-rempli
      const agentInput = authedPage.locator("input[placeholder='ex: farouk']");
      const agentVal = await agentInput.inputValue();
      expect(agentVal.length).toBeGreaterThan(0);

      // Le montant doit être pré-rempli avec le total POS (> 0)
      const montantInput = authedPage.locator("input[placeholder='ex: 15000']");
      const montantVal = await montantInput.inputValue();
      expect(Number(montantVal)).toBeGreaterThan(0);

      // Fermer sans soumettre
      await authedPage.locator("button", { hasText: "Annuler" }).click();
      await authedPage.waitForTimeout(300);
    } else {
      // Pas d'agents non déclarés aujourd'hui — test skipped gracefully
      console.log("Aucun agent non déclaré aujourd'hui — test skipped");
    }
  });

});
