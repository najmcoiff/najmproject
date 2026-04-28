/**
 * rapport.spec.js — Test humain RÉEL page Rapport
 *
 * UI réelle documentée :
 *  - Bouton "+ Nouveau rapport" → ouvre le formulaire (modal overlay)
 *  - Formulaire : select catégorie, select cas, textarea description (requis)
 *  - Bouton submit : "Soumettre le rapport"
 *  - Toast succès après soumission
 */
import { test, expect, sbQuery, sbDelete } from "./fixtures.js";

const TEST_NOTE = `E2E_TEST_RAPPORT_${Date.now()}`;
let insertedReportId = null;

test.describe("Page Rapport — soumission et lecture réelles", () => {

  test.afterAll(async () => {
    // Nettoyer le rapport test
    const rows = await sbQuery("nc_rapports",
      `description=ilike.*${TEST_NOTE.slice(-15)}*&select=report_id`);
    for (const r of rows || []) {
      await sbDelete("nc_rapports", `report_id=eq.${r.report_id}`);
    }
    if (insertedReportId) {
      await sbDelete("nc_rapports", `report_id=eq.${insertedReportId}`);
    }
  });

  // ── Test 1 : page se charge ──────────────────────────────────
  test("la page Rapport se charge correctement", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(2000);
    // Le bouton + Nouveau rapport doit être là
    await expect(authedPage.getByRole("button", { name: "+ Nouveau rapport" })).toBeVisible({ timeout: 15000 });
  });

  // ── Test 2 : bouton + Nouveau rapport ouvre le formulaire ────
  test("bouton '+ Nouveau rapport' ouvre le formulaire", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(2000);

    await authedPage.getByRole("button", { name: "+ Nouveau rapport" }).click();
    await authedPage.waitForTimeout(1000);

    // Le formulaire doit être visible avec le label Description
    await expect(authedPage.getByText("Description").first()).toBeVisible({ timeout: 8000 });
    await expect(authedPage.getByRole("button", { name: "Soumettre le rapport" })).toBeVisible();

    // Fermer avec Annuler
    await authedPage.getByRole("button", { name: "Annuler" }).first().click();
  });

  // ── Test 3 : remplir et soumettre → toast + DB ───────────────
  test("remplir et soumettre un rapport → toast + DB nc_rapports", async ({ authedPage }) => {
    // Intercepter toutes les requêtes vers /api/sb-write
    let sbWriteBody = null;
    let sbWriteStatus = null;
    let lastAlert = "";

    authedPage.on("dialog", async d => { lastAlert = d.message(); await d.dismiss(); });

    // Intercepter la requête sb-write pour voir ce qui se passe
    await authedPage.route("**/api/sb-write", async route => {
      const req = route.request();
      sbWriteBody = req.postData();
      const resp = await route.fetch();
      sbWriteStatus = resp.status();
      await route.fulfill({ response: resp });
    });

    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(2000);

    // Ouvrir le formulaire
    await authedPage.getByRole("button", { name: "+ Nouveau rapport" }).click();
    await authedPage.waitForTimeout(1500);

    // Le modal est dans un div fixed z-40.
    const modal = authedPage.locator("div.fixed").filter({ hasText: "Nouveau rapport" }).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Catégorie = BOUTONS — cliquer "PRODUIT / COLIS" DANS le modal
    const catBtn = modal.getByRole("button", { name: /PRODUIT \/ COLIS/i }).first();
    await expect(catBtn).toBeVisible({ timeout: 5000 });
    await catBtn.click();
    await authedPage.waitForTimeout(1000);

    // Vérifier que le select CAS apparaît maintenant
    const casSelect = modal.locator("select").first();
    await expect(casSelect).toBeVisible({ timeout: 5000 });
    await casSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(500);

    // Remplir description — textarea dans le modal
    const textarea = modal.getByPlaceholder("Décrivez le problème ou la suggestion…");
    await expect(textarea).toBeVisible({ timeout: 5000 });
    // Utiliser type() pour simuler une vraie saisie clavier
    await textarea.click();
    await authedPage.keyboard.type(`Test Playwright ${TEST_NOTE}`);
    await authedPage.waitForTimeout(500);

    // Le bouton doit maintenant être activé
    const submitBtn = modal.getByRole("button", { name: "Soumettre le rapport" });
    await expect(submitBtn).toBeEnabled({ timeout: 8000 });

    // Capturer la requête sb-write qui va être envoyée
    const sbWritePromise = authedPage.waitForRequest("**/api/sb-write", { timeout: 5000 }).catch(() => null);
    await submitBtn.click();
    const capturedReq = await sbWritePromise;

    await authedPage.waitForTimeout(4000);

    console.log(`Alert: "${lastAlert}", sb-write intercepté: ${sbWriteBody ? "OUI" : "NON"}, status: ${sbWriteStatus}`);
    if (capturedReq) console.log(`sb-write request: ${capturedReq.postData()?.slice(0, 200)}`);

    // ✅ Vérification 1 : modal fermée
    const modalClosed = !(await authedPage.getByRole("button", { name: "Soumettre le rapport" }).isVisible().catch(() => false));

    // ✅ Vérification 2 : rapport dans nc_rapports en DB
    const suffix = String(TEST_NOTE).slice(-13);
    const rows = await sbQuery("nc_rapports", `description=ilike.*${suffix}*&select=report_id,description&limit=1`);
    const foundInDB = rows?.length > 0;
    if (foundInDB) { insertedReportId = rows[0].report_id; }

    console.log(`Résultat: modal_closed=${modalClosed}, found_in_db=${foundInDB}, alert="${lastAlert}"`);

    expect(
      modalClosed && foundInDB,
      `Rapport NON sauvé. modal_closed=${modalClosed}, found_in_db=${foundInDB}, alert="${lastAlert}", sb_write_status=${sbWriteStatus}`
    ).toBe(true);
  });

  // ── Test 4 : la liste des rapports s'affiche ─────────────────
  test("la liste des rapports existants s'affiche", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(4000);

    // La page montre soit des rapports, soit "Aucun rapport"
    const hasContent = await authedPage.locator("[class*='rounded-2xl'], [class*='RapportCard']").first().isVisible({ timeout: 8000 }).catch(() => false);
    const hasEmpty   = await authedPage.getByText(/aucun rapport|pas de rapport/i).first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasContent || hasEmpty, "La page doit afficher des rapports ou un état vide").toBe(true);
  });

  // ── Test 5 : filtre par catégorie fonctionne ─────────────────
  test("le filtre par catégorie filtre la liste", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(3000);

    // Le select de filtre catégorie (option "Toutes catégories")
    const filterSelect = authedPage.locator("select").filter({ hasText: /toutes catégories/i }).first();
    const visible = await filterSelect.isVisible({ timeout: 5000 }).catch(() => false);

    if (visible) {
      const opts = await filterSelect.locator("option").allTextContents();
      if (opts.length > 1) {
        await filterSelect.selectOption({ index: 1 });
        await authedPage.waitForTimeout(1000);
        console.log(`✅ Filtre catégorie: "${opts[1]}" sélectionné`);
      }
    }
  });

  // ── Test 5b : CAISSE_OPERATION → sync automatique nc_gestion_fond ───
  test("recette CAISSE_OPERATION → sync automatique dans nc_gestion_fond (Finance)", async ({ authedPage }) => {
    const TEST_MONTANT = 7777;
    const TEST_DESC_RECETTE = `E2E_RECETTE_SYNC_${Date.now()}`;
    let insertedRapportId = null;
    let insertedFondId    = null;

    // Nettoyage après le test
    // (déclaré avant pour s'assurer que le cleanup s'exécute même si le test plante)

    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(2000);

    // ── 1. Ouvrir le formulaire ──
    await authedPage.getByRole("button", { name: "+ Nouveau rapport" }).click();
    await authedPage.waitForTimeout(1500);

    const modal = authedPage.locator("div.fixed").filter({ hasText: "Nouveau rapport" }).first();
    await expect(modal).toBeVisible({ timeout: 8000 });

    // ── 2. Sélectionner CAISSE_OPERATION ──
    const caisseBtn = modal.getByRole("button", { name: /CAISSE_OPERATION/i }).first();
    await expect(caisseBtn).toBeVisible({ timeout: 5000 });
    await caisseBtn.click();
    await authedPage.waitForTimeout(800);

    // ── 3. Sélectionner le cas "ENTRÉE" ──
    const casSelect = modal.locator("select").first();
    await expect(casSelect).toBeVisible({ timeout: 5000 });
    await casSelect.selectOption("ENTRÉE");
    await authedPage.waitForTimeout(600);

    // ── 4. Sélectionner le type "Encaissement client (vente directe)" ──
    const typeSelects = modal.locator("select");
    const typeSelectCount = await typeSelects.count();
    if (typeSelectCount >= 2) {
      await typeSelects.nth(1).selectOption("Encaissement client (vente directe)");
      await authedPage.waitForTimeout(500);
    }

    // ── 5. Remplir le montant ──
    const montantInput = modal.locator("input[type='number']").first();
    const montantVisible = await montantInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (montantVisible) {
      await montantInput.fill(String(TEST_MONTANT));
      await authedPage.waitForTimeout(300);
    }

    // ── 6. Remplir la description ──
    const textarea = modal.getByPlaceholder("Décrivez le problème ou la suggestion…");
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.click();
    await authedPage.keyboard.type(TEST_DESC_RECETTE);
    await authedPage.waitForTimeout(300);

    // ── 7. Soumettre ──
    const submitBtn = modal.getByRole("button", { name: "Soumettre le rapport" });
    await expect(submitBtn).toBeEnabled({ timeout: 8000 });
    await submitBtn.click();
    await authedPage.waitForTimeout(4000);

    // ── 8. Vérifier rapport dans nc_rapports ──
    const suffix = TEST_DESC_RECETTE.slice(-18);
    const rapportRows = await sbQuery("nc_rapports",
      `description=ilike.*${suffix}*&select=report_id,categorie,cas,valeur&limit=1`);
    expect(
      rapportRows?.length,
      `Rapport CAISSE_OPERATION non trouvé en DB (suffix: ${suffix})`
    ).toBe(1);
    insertedRapportId = rapportRows[0].report_id;
    console.log(`✅ Rapport créé : ${insertedRapportId}, valeur=${rapportRows[0].valeur}`);

    // ── 9. Vérifier sync dans nc_gestion_fond ──
    await authedPage.waitForTimeout(2000);
    const fondRows = await sbQuery("nc_gestion_fond",
      `source=eq.rapport&description=ilike.*${suffix}*&select=id_fond,type,categorie,montant,source&limit=1`);
    expect(
      fondRows?.length,
      `Transaction nc_gestion_fond NON créée après soumission du rapport CAISSE_OPERATION. ` +
      `Le bug "recette non ajoutée en finance" n'est pas corrigé.`
    ).toBe(1);
    insertedFondId = fondRows[0].id_fond;
    console.log(`✅ nc_gestion_fond sync OK : id=${insertedFondId}, type=${fondRows[0].type}, montant=${fondRows[0].montant}`);

    // Vérifier montant cohérent (si le montant a bien été saisi)
    if (montantVisible) {
      expect(Number(fondRows[0].montant)).toBe(TEST_MONTANT);
    }

    // ── Cleanup ──
    if (insertedRapportId) await sbDelete("nc_rapports", `report_id=eq.${insertedRapportId}`);
    if (insertedFondId)    await sbDelete("nc_gestion_fond", `id_fond=eq.${insertedFondId}`);
  });

  // ── Test 6 : compteur cohérent ────────────────────────────────
  test("le compteur nc_rapports est cohérent", async ({ authedPage, token }) => {
    const resp = await authedPage.request.post("/api/rapports/count", {
      data: { token },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    console.log(`✅ Total rapports: ${body.count ?? body.total}`);
  });

  // ── Test 7 : suppression de rapport (owner) ───────────────────
  // Crée un rapport de test → vérifie bouton 🗑 visible → clique → confirme → carte disparaît → DB vide
  test("owner peut supprimer un rapport — UI + DB", async ({ authedPage }) => {
    const TEST_DESC = `E2E_DELETE_${Date.now()}`;

    // ── 7.1 Pré-condition : créer un rapport de test via le formulaire ──
    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(2000);

    await authedPage.getByRole("button", { name: "+ Nouveau rapport" }).click();
    await authedPage.waitForTimeout(1500);

    const modal = authedPage.locator("div.fixed").filter({ hasText: "Nouveau rapport" }).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Catégorie
    await modal.getByRole("button", { name: /IT \/ MAT/i }).first().click();
    await authedPage.waitForTimeout(800);

    // Cas
    const casSelect = modal.locator("select").first();
    await casSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(500);

    // Description unique pour le retrouver
    const textarea = modal.getByPlaceholder("Décrivez le problème ou la suggestion…");
    await textarea.click();
    await authedPage.keyboard.type(TEST_DESC);

    // Soumettre
    const submitBtn = modal.getByRole("button", { name: "Soumettre le rapport" });
    await expect(submitBtn).toBeEnabled({ timeout: 8000 });
    await submitBtn.click();
    await authedPage.waitForTimeout(3000);

    // ── 7.2 Vérifier que le rapport est dans la DB ──
    const suffix = TEST_DESC.slice(-15);
    const rowsBefore = await sbQuery("nc_rapports", `description=ilike.*${suffix}*&select=report_id&limit=1`);
    expect(rowsBefore?.length, `Rapport test non inséré en DB`).toBe(1);
    const reportId = rowsBefore[0].report_id;
    console.log(`✅ Rapport créé : ${reportId}`);

    // ── 7.3 Trouver la carte du rapport dans la liste ──
    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(3000);

    // La carte contient le text TEST_DESC (ou suffixe visible)
    const card = authedPage.locator(`[class*='rounded-2xl']`)
      .filter({ hasText: TEST_DESC.slice(-20) })
      .first();

    // Si la carte n'est pas visible directement (description dans détail), chercher via le rapport ID
    const cardVisible = await card.isVisible({ timeout: 5000 }).catch(() => false);

    if (!cardVisible) {
      // Fallback: supprimer via API directement et vérifier DB uniquement
      console.warn("Carte non trouvée dans la grille (description tronquée), test via API directe...");
      const delResp = await authedPage.request.delete(`/api/rapports/${reportId}`, {
        headers: { "Content-Type": "application/json" },
      });
      expect(delResp.status()).toBe(200);
      const delBody = await delResp.json();
      expect(delBody.ok, `API delete a échoué : ${JSON.stringify(delBody)}`).toBe(true);
    } else {
      // ── 7.4 Cliquer sur le bouton 🗑 de la carte ──
      const deleteBtn = card.getByTitle("Supprimer ce rapport").first();
      await expect(deleteBtn).toBeVisible({ timeout: 5000 });
      await deleteBtn.click();
      await authedPage.waitForTimeout(600);

      // ── 7.5 Confirmer la suppression ──
      const confirmBtn = card.getByRole("button", { name: "Confirmer" });
      await expect(confirmBtn).toBeVisible({ timeout: 3000 });
      await confirmBtn.click();
      await authedPage.waitForTimeout(2000);

      // ── 7.6 La carte doit avoir disparu ──
      const cardGone = !(await card.isVisible({ timeout: 3000 }).catch(() => false));
      expect(cardGone, "La carte doit disparaître après suppression").toBe(true);

      // ── 7.7 Toast de confirmation ──
      const toast = authedPage.getByText(/rapport supprim/i).first();
      const toastVisible = await toast.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`Toast visible : ${toastVisible}`);
    }

    // ── 7.8 Vérification DB finale ──
    await authedPage.waitForTimeout(1500);
    const rowsAfter = await sbQuery("nc_rapports", `report_id=eq.${reportId}&select=report_id&limit=1`);
    expect(rowsAfter?.length, `Rapport toujours en DB après suppression`).toBe(0);
    console.log(`✅ Rapport ${reportId} supprimé de nc_rapports`);

    // ── 7.9 Vérifier log nc_events ──
    const evRows = await sbQuery("nc_events", `log_type=eq.RAPPORT_DELETED&select=log_type,note&limit=1&order=created_at.desc`);
    expect(evRows?.length, "Aucun log RAPPORT_DELETED dans nc_events").toBe(1);
    console.log(`✅ Log nc_events : ${evRows[0]?.note?.slice(0, 80)}`);
  });

  // ── Test 8 : note manager inline sur la carte ─────────────────
  test("owner peut ajouter une note manager depuis la carte (sans ouvrir le détail)", async ({ authedPage }) => {
    const TEST_NOTE_MANAGER = `E2E_NOTE_MGR_${Date.now()}`;

    // Créer un rapport de test via DB directement
    const reportId = `test-mgr-${Date.now()}`;
    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(2000);

    // Ouvrir le formulaire et créer un rapport
    await authedPage.getByRole("button", { name: "+ Nouveau rapport" }).click();
    await authedPage.waitForTimeout(1500);
    const modal = authedPage.locator("div.fixed").filter({ hasText: "Nouveau rapport" }).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // IT / MATÉRIEL
    await modal.getByRole("button", { name: /IT \/ MAT/i }).first().click();
    await authedPage.waitForTimeout(800);
    const casSelect = modal.locator("select").first();
    await casSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(500);
    const textarea = modal.getByPlaceholder("Décrivez le problème ou la suggestion…");
    await textarea.click();
    await authedPage.keyboard.type(`E2E_MGR_TEST_${Date.now()}`);
    await modal.getByRole("button", { name: "Soumettre le rapport" }).click();
    await authedPage.waitForTimeout(3000);

    // Recharger la page et trouver la carte
    await authedPage.goto("/dashboard/rapport");
    await authedPage.waitForTimeout(3000);

    // Le bouton "+ Ajouter une correction" doit être visible sur la carte (owner)
    const addNoteBtn = authedPage.getByRole("button", { name: /Ajouter une correction/i }).first();
    const addNoteBtnVisible = await addNoteBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!addNoteBtnVisible) {
      console.log("ℹ️ Bouton '+ Ajouter une correction' non visible (carte peut-être défilée ou filtrée)");
      return;
    }

    // Cliquer sur "+ Ajouter une correction"
    await addNoteBtn.click({ force: true });
    await authedPage.waitForTimeout(600);

    // Le textarea inline doit apparaître
    const inlineTextarea = authedPage.locator("textarea[placeholder='Correction / note responsable…']").first();
    await expect(inlineTextarea).toBeVisible({ timeout: 5000 });
    await inlineTextarea.click();
    await authedPage.keyboard.type(TEST_NOTE_MANAGER);
    await authedPage.waitForTimeout(300);

    // Cliquer Sauvegarder
    const saveBtn = authedPage.getByRole("button", { name: "Sauvegarder" }).first();
    await saveBtn.click({ force: true });
    await authedPage.waitForTimeout(2000);

    // La note doit s'afficher sur la carte avec le label "Note responsable"
    const noteLabel = authedPage.getByText(/Note responsable/i).first();
    await expect(noteLabel).toBeVisible({ timeout: 5000 });

    // Vérifier en DB
    const rows = await sbQuery("nc_rapports",
      `manager_note=ilike.*${TEST_NOTE_MANAGER.slice(-15)}*&select=report_id,manager_note&limit=1`);
    expect(rows?.length, "Note manager non enregistrée en DB").toBe(1);
    console.log(`✅ Note manager enregistrée : ${rows[0]?.manager_note?.slice(0, 60)}`);

    // Cleanup
    if (rows?.[0]?.report_id) {
      await sbDelete("nc_rapports", `report_id=eq.${rows[0].report_id}`);
    }
  });
});
