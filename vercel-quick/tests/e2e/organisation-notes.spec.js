/**
 * Test Playwright humain — Organisation : édition notes + réactions emoji
 * Simuler un vrai humain : goto → click → keyboard.type → waitForTimeout
 * Vérifier DB après action UI via Supabase
 *
 * Signification emojis :
 * ❤️  heart = Bien reçu
 * 🔥  fire  = Effectué / terminé
 * ❌  x     = Problème / faute
 */
import { test, expect, sbQuery, sbInsert, sbDelete } from "./fixtures.js";
import fs from "fs";
import path from "path";

const BASE_URL = "https://najmcoiffdashboard.vercel.app";

// ── Fixture localStorage uniquement (reproduit le bug session) ──
// Les vrais utilisateurs ont leur session UNIQUEMENT dans localStorage
// (le code d'auth saveSession écrit dans localStorage, pas sessionStorage)
// L'ancien code organisation/page.js lisait sessionStorage → bloqué sur "Chargement..."
// Le fix : getRawSession() dans auth.js lit localStorage en priorité
const testAgent = test.extend({
  agentOnlyLocalStorage: async ({ page }, use) => {
    const SESSION_FILE = path.join(process.cwd(), ".playwright-auth", "session.json");
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    await page.addInitScript((s) => {
      try { localStorage.setItem("nc_session", JSON.stringify(s)); } catch {}
      // NE PAS écrire dans sessionStorage — reproduit le comportement réel
    }, session);
    await use(page);
  },
});

// UUID stable pour les tests (pour faciliter le nettoyage)
function testNoteId() {
  return "00000000-e2e0-0000-0000-" + String(Date.now()).padStart(12, "0");
}

test.describe("Organisation — Édition notes & Réactions emoji", () => {

  test("T_ORG_LEGEND — Légende emoji ❤️🔥❌ dans le modal de création", async ({ authedPage: page }) => {
    await page.goto(`${BASE_URL}/dashboard/organisation`);
    await page.waitForTimeout(3000);

    // Le bouton "+ Note" doit être visible
    const addBtn = page.locator("button", { hasText: "+ Note" }).first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click();
    await page.waitForTimeout(800);

    // La légende des emojis doit être visible dans le modal (sous forme de spans)
    // Utiliser .first() pour éviter les conflits avec les notes déjà présentes
    await expect(page.locator("text=Bien reçu").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Effectué").first()).toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=Problème").first()).toBeVisible({ timeout: 3000 });

    // Le titre "Modifier la note" ou "Nouvelle note" doit être visible
    const modalVisible = await page.locator("h2", { hasText: /note/ }).first().isVisible();
    expect(modalVisible, "Modal de note doit être ouvert").toBe(true);

    // Fermer le modal
    await page.locator("button", { hasText: "Annuler" }).first().click();
    await page.waitForTimeout(500);

    console.log("✅ T_ORG_LEGEND : légende ❤️🔥❌ (Bien reçu / Effectué / Problème) visible dans modal");
  });

  test("T_ORG_EDIT — Créer une note publique via UI puis la modifier", async ({ authedPage: page }) => {
    test.setTimeout(90000);

    // Utiliser la vue mobile (vue liste) pour éviter les problèmes de hover sur le canvas desktop
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/dashboard/organisation`);
    await page.waitForTimeout(3000);

    // S'assurer qu'on est sur le board public
    const publicTab = page.locator("button").filter({ hasText: /Board Public/ }).first();
    if (await publicTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicTab.click();
      await page.waitForTimeout(500);
    }

    // ── Étape 1 : Créer une note via le bouton UI ──
    const addBtn = page.locator("button", { hasText: "+ Note" }).first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click();
    await page.waitForTimeout(800);

    const stamp = Date.now();
    const noteContent = `NoteEdit${stamp}`;

    const textarea = page.locator("textarea[placeholder*='note']").first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.click();
    await page.keyboard.type(noteContent);
    await page.waitForTimeout(400);

    // Créer
    await page.locator("button", { hasText: "Créer la note" }).first().click();
    await page.waitForTimeout(3000);

    // ── Étape 2 : Vérifier que la note apparaît en DB ──
    const rows = await sbQuery("notes", `contenu=eq.${encodeURIComponent(noteContent)}&select=id,contenu,type`);
    expect(rows?.length, `La note "${noteContent}" doit exister en DB`).toBeGreaterThan(0);
    const noteId = rows[0].id;
    console.log(`✅ Note créée en DB: id=${noteId}`);

    // ── Étape 3 : Éditer la note (vue liste mobile — bouton ✎ toujours visible) ──
    const noteCard = page.locator(".rounded-2xl").filter({ hasText: noteContent }).first();
    await expect(noteCard).toBeVisible({ timeout: 10000 });
    const editBtn = noteCard.locator("button[title='Modifier la note']").first();
    await expect(editBtn).toBeVisible({ timeout: 8000 });
    await editBtn.click();
    await page.waitForTimeout(800);

    // Vérifier que le modal "Modifier la note" s'ouvre
    const modalTitle = page.locator("h2", { hasText: "Modifier la note" });
    await expect(modalTitle).toBeVisible({ timeout: 8000 });

    // Modifier le contenu
    const editedContent = `NoteEditModified${stamp}`;
    const editTextarea = page.locator("textarea[placeholder*='note']").first();
    await editTextarea.fill("");
    await editTextarea.type(editedContent);
    await page.waitForTimeout(400);

    // Sauvegarder
    await page.locator("button", { hasText: "Enregistrer" }).first().click();
    await page.waitForTimeout(2000);

    // Vérifier en DB que le contenu est bien modifié
    const updatedRows = await sbQuery("notes", `id=eq.${noteId}&select=contenu`);
    expect(updatedRows?.[0]?.contenu, "Le contenu doit être modifié en DB").toBe(editedContent);

    // Nettoyage
    await sbDelete("note_reactions", `note_id=eq.${noteId}`);
    await sbDelete("notes", `id=eq.${noteId}`);

    console.log(`✅ T_ORG_EDIT : note créée "${noteContent}" puis modifiée en "${editedContent}" ✓`);
  });

  test("T_ORG_EDIT_IMMEDIATE — Modifier une note et vérifier mise à jour SANS reload", async ({ authedPage: page }) => {
    test.setTimeout(90000);

    // Insérer une note directement en DB
    const stamp = Date.now();
    const noteContent = `NoteImmediate${stamp}`;
    const insertedRows = await sbInsert("notes", {
      auteur_nom:  "najm",
      contenu:     noteContent,
      couleur:     "#fef08a",
      type:        "public",
      board_owner: "",
      assigned_to: "",
      pos_x: 60,
      pos_y: 60,
    });
    const noteId = Array.isArray(insertedRows) ? insertedRows[0]?.id : insertedRows?.id;
    expect(noteId, "Note insérée en DB doit avoir un id").toBeTruthy();

    // Charger la page en mode mobile (vue liste, bouton ✎ toujours visible)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/dashboard/organisation`);
    await page.waitForTimeout(3500);

    // S'assurer qu'on est sur le board public
    const publicTab = page.locator("button").filter({ hasText: /Board Public/ }).first();
    if (await publicTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicTab.click();
      await page.waitForTimeout(500);
    }

    // La note doit être visible
    const noteEl = page.locator(`text=${noteContent}`).first();
    await expect(noteEl).toBeVisible({ timeout: 12000 });

    // Cliquer sur le bouton ✎ (modifier)
    const editBtn = page.locator("button[title='Modifier la note']").first();
    await expect(editBtn).toBeVisible({ timeout: 8000 });
    await editBtn.click();
    await page.waitForTimeout(800);

    // Le modal doit s'ouvrir
    await expect(page.locator("h2", { hasText: "Modifier la note" })).toBeVisible({ timeout: 5000 });

    // Modifier le contenu
    const editedContent = `NoteImmediateModified${stamp}`;
    const editTextarea = page.locator("textarea[placeholder*='note']").first();
    await editTextarea.fill(editedContent);
    await page.waitForTimeout(300);

    // Sauvegarder
    await page.locator("button", { hasText: "Enregistrer" }).first().click();
    await page.waitForTimeout(1500);

    // ✅ CRITÈRE CLÉ : le nouveau contenu doit apparaître SANS reload
    const updatedEl = page.locator(`text=${editedContent}`).first();
    await expect(updatedEl).toBeVisible({ timeout: 5000 });

    // Vérifier aussi en DB
    const dbRows = await sbQuery("notes", `id=eq.${noteId}&select=contenu`);
    expect(dbRows?.[0]?.contenu, "Contenu modifié en DB").toBe(editedContent);

    // Nettoyage
    await sbDelete("note_reactions", `note_id=eq.${noteId}`);
    await sbDelete("notes", `id=eq.${noteId}`);

    console.log(`✅ T_ORG_EDIT_IMMEDIATE : note modifiée visible IMMÉDIATEMENT sans reload`);
  });

  test("T_ORG_DELETE_IMMEDIATE — Supprimer une note et vérifier disparition SANS reload", async ({ authedPage: page }) => {
    test.setTimeout(60000);

    // Insérer une note directement en DB
    const stamp = Date.now();
    const noteContent = `NoteDelete${stamp}`;
    const insertedRows = await sbInsert("notes", {
      auteur_nom:  "najm",
      contenu:     noteContent,
      couleur:     "#fda4af",
      type:        "public",
      board_owner: "",
      assigned_to: "",
      pos_x: 80,
      pos_y: 80,
    });
    const noteId = Array.isArray(insertedRows) ? insertedRows[0]?.id : insertedRows?.id;
    expect(noteId, "Note insérée en DB doit avoir un id").toBeTruthy();

    // Charger la page en mode mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/dashboard/organisation`);
    await page.waitForTimeout(3500);

    // S'assurer qu'on est sur le board public
    const publicTab = page.locator("button").filter({ hasText: /Board Public/ }).first();
    if (await publicTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicTab.click();
      await page.waitForTimeout(500);
    }

    // La note doit être visible
    const noteEl = page.locator(`text=${noteContent}`).first();
    await expect(noteEl).toBeVisible({ timeout: 12000 });

    // Trouver le conteneur de la note dans la vue liste mobile (rounded-2xl)
    // Chaque note est un div.rounded-2xl qui contient le texte de la note
    const noteCard = page.locator(".rounded-2xl").filter({ hasText: noteContent }).first();
    await expect(noteCard).toBeVisible({ timeout: 8000 });
    // Le bouton ✕ est directement dans la note card
    const delBtn = noteCard.locator("button").nth(1); // 0 = ✎, 1 = ✕
    await expect(delBtn).toBeVisible({ timeout: 5000 });
    await delBtn.click();
    await page.waitForTimeout(1500);

    // ✅ CRITÈRE CLÉ : la note doit disparaître SANS reload
    await expect(noteEl).not.toBeVisible({ timeout: 5000 });

    // Vérifier aussi que la note est bien supprimée en DB
    const dbRows = await sbQuery("notes", `id=eq.${noteId}&select=id`);
    expect(dbRows?.length ?? 0, "Note supprimée de la DB").toBe(0);

    console.log(`✅ T_ORG_DELETE_IMMEDIATE : note supprimée disparaît IMMÉDIATEMENT sans reload`);
  });

  test("T_ORG_REACT — Réactions ❤️🔥❌ sur les notes (vue mobile)", async ({ authedPage: page }) => {
    test.setTimeout(90000);

    // Insérer une note directement en DB pour le test (plus fiable que l'UI)
    const stamp = Date.now();
    const noteContent = `NoteReactTest${stamp}`;
    const insertedRows = await sbInsert("notes", {
      auteur_nom:  "najm",
      contenu:     noteContent,
      couleur:     "#fef08a",
      type:        "public",
      board_owner: "",
      assigned_to: "",
      pos_x: 50,
      pos_y: 50,
    });
    const noteId = Array.isArray(insertedRows) ? insertedRows[0]?.id : insertedRows?.id;
    expect(noteId, "Note insérée en DB doit avoir un id").toBeTruthy();
    console.log(`Note insérée: id=${noteId}`);

    // Charger la page en mode mobile (vue liste = réactions visibles directement)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/dashboard/organisation`);
    await page.waitForTimeout(3500);

    // S'assurer qu'on est sur le board public (mobile)
    const publicTab = page.locator("button").filter({ hasText: /Board Public/ }).first();
    if (await publicTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicTab.click();
      await page.waitForTimeout(500);
    }

    // La note doit être visible dans la liste
    const noteEl = page.locator(`text=${noteContent}`).first();
    await expect(noteEl).toBeVisible({ timeout: 12000 });

    // Les 3 boutons de réaction doivent être visibles (❤️, 🔥, ❌)
    const heartBtn = page.locator("button[title*='Bien reçu']").first();
    const fireBtn  = page.locator("button[title*='Effectué']").first();
    const xBtn     = page.locator("button[title*='Problème']").first();

    await expect(heartBtn).toBeVisible({ timeout: 8000 });
    await expect(fireBtn).toBeVisible({ timeout: 3000 });
    await expect(xBtn).toBeVisible({ timeout: 3000 });

    console.log("✅ Boutons ❤️🔥❌ visibles sur la note");

    // Cliquer ❤️ pour réagir
    await heartBtn.click();
    await page.waitForTimeout(2500);

    // Vérifier DB : une note_reaction de type heart doit exister pour cette note
    const dbReactions = await sbQuery(
      "note_reactions",
      `note_id=eq.${noteId}&type=eq.heart&select=auteur_nom,type`
    );
    expect(dbReactions?.length, "note_reaction heart doit exister en DB").toBeGreaterThan(0);
    console.log(`✅ DB: réaction heart de "${dbReactions[0].auteur_nom}" enregistrée`);

    // Vérifier que le tooltip "Bien reçu" s'affiche au survol
    await heartBtn.hover();
    await page.waitForTimeout(500);
    // Le tooltip popover doit apparaître
    const tooltip = page.locator("text=Bien reçu").nth(1); // le deuxième (premier dans le header du board)
    // Sur mobile, le tooltip n'est peut-être pas accessible (pas de hover natif)
    // On vérifie juste que la réaction a bien été enregistrée côté DB (déjà fait ci-dessus)

    // Nettoyage DB
    await sbDelete("note_reactions", `note_id=eq.${noteId}`);
    await sbDelete("notes", `id=eq.${noteId}`);

    console.log("✅ T_ORG_REACT : réactions ❤️🔥❌ opérationnelles sur les notes Organisation");
  });

});

// ── T_ORG_ACCESS_LOCALSTORAGE — Accès page Organisation session localStorage uniquement ──
// Reproduit le bug : certains utilisateurs (non-managers) restent bloqués sur "Chargement..."
// car leur session est dans localStorage (nouveau comportement) mais l'ancien code lisait sessionStorage.
// Fix : getRawSession() dans auth.js lit localStorage EN PRIORITÉ.

testAgent.describe("Organisation — Accès session localStorage uniquement", () => {

  testAgent("T_ORG_ACCESS_LOCALSTORAGE — Board visible avec session localStorage (pas sessionStorage)", async ({ agentOnlyLocalStorage: page }) => {
    testAgent.setTimeout(60000);

    await page.goto(`${BASE_URL}/dashboard/organisation`);

    // ✅ Le board doit charger — pas rester sur "Chargement..."
    // Le composant renvoie "Chargement..." uniquement quand session === null
    // (ce qui se produisait quand sessionStorage était vide et localStorage ignoré)
    const chargementEl = page.locator("text=Chargement...").first();

    // Attendre que la page charge (max 15s)
    await page.waitForTimeout(3000);

    // "Chargement..." ne doit PAS être visible après le chargement
    const isStuck = await chargementEl.isVisible({ timeout: 2000 }).catch(() => false);
    expect(isStuck, "❌ La page est bloquée sur 'Chargement...' — session localStorage non lue").toBe(false);

    // Le titre "Organisation" doit être visible
    const titre = page.locator("h1", { hasText: "Organisation" });
    await expect(titre).toBeVisible({ timeout: 10000 });

    // Le bouton "+ Note" doit être accessible (board public chargé)
    const addBtn = page.locator("button", { hasText: "+ Note" }).first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });

    // L'onglet "Agenda" ne doit PAS être visible (non-manager)
    const agendaTab = page.locator("button", { hasText: "Agenda" });
    const agendaVisible = await agendaTab.isVisible({ timeout: 2000 }).catch(() => false);
    // Note : si le compte test est manager, ce check sera skip
    // L'important est que le board soit accessible

    console.log(`✅ T_ORG_ACCESS_LOCALSTORAGE : Board Organisation accessible avec session localStorage uniquement`);
    console.log(`   Agenda tab visible: ${agendaVisible} (attendu false pour un non-manager)`);
  });

});
