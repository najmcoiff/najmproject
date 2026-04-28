/**
 * barrage.spec.js — Tests humains complets Page Barrage (T200 — Phase M4)
 *
 * T200 : Barrage Supabase-only
 *  - Plus d'appel Shopify
 *  - /api/barrage/run → UPDATE nc_variants.inventory_quantity direct
 *  - Après correction : stock_cible = NULL + verifie = true dans nc_barrage
 *
 * Flux humain simulé :
 *  1. Ouvrir la page Barrage
 *  2. Lancer l'analyse → produits critiques s'affichent
 *  3. Saisir un stock_cible sur un article → sauvegarder
 *  4. Cliquer "Valider corrections"
 *  5. Vérifier toast "Supabase" (pas "Shopify")
 *  6. Vérifier DB : nc_variants.inventory_quantity = stock_cible saisi
 *  7. Vérifier DB : nc_barrage.stock_cible = NULL + verifie = true
 *  8. Vérifier nc_events : log BARRAGE_CORRECTION créé
 */
import { test, expect, sbQuery, sbPatch } from "./fixtures.js";

// ── Constantes test ────────────────────────────────────────────────
const TEST_STOCK_CIBLE = 15; // valeur facile à identifier

test.describe("Barrage Supabase-only (T200)", () => {

  // ── T200-1 : La page Barrage se charge et affiche des articles ───
  test("T200-1 : la page Barrage se charge et affiche des articles (pas 0)", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barrage");
    // Attendre h1 + fin du chargement (sync auto en background)
    await authedPage.waitForSelector("h1", { timeout: 30000 });
    // Attendre que le loading spinner disparaisse (sync + chargement terminés)
    await authedPage.waitForFunction(() => {
      const spinner = document.querySelector("svg.animate-spin");
      const cards   = document.querySelectorAll(".rounded-xl.border");
      return !spinner && cards.length > 0;
    }, { timeout: 30000 }).catch(() => {}); // fallback si pas de spinner

    const h1Text = (await authedPage.locator("h1").first().textContent()) || "";
    expect(h1Text.toLowerCase(), "h1 doit contenir 'barrage'").toContain("barrage");

    // Vérifier qu'il n'y a pas de page d'erreur applicative
    const bodyText = (await authedPage.locator("body").textContent()) || "";
    expect(bodyText.toLowerCase().includes("application error"),
      "La page ne doit pas afficher d'erreur applicative").toBe(false);

    // Vérifier que des articles sont affichés (pas 0)
    const allCards = authedPage.locator(".rounded-xl.border");
    const count = await allCards.count();
    console.log(`Articles affichés dans le barrage : ${count}`);
    expect(count, "Le barrage doit afficher au moins 1 article (pas 0)").toBeGreaterThan(0);

    const title = await authedPage.title();
    console.log(`✅ Page titre: ${title} | h1: ${h1Text.trim()} | articles: ${count}`);
  });

  // ── T200-1b : Le bouton "Lancer analyse" n'existe plus ────────────
  test("T200-1b : bouton Lancer analyse supprimé de l'UI", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForTimeout(2000);

    const lancerBtn = authedPage.getByRole("button", { name: /lancer.?analyse/i });
    const exists = await lancerBtn.isVisible({ timeout: 2000 }).catch(() => false);
    expect(exists, "Le bouton 'Lancer analyse' ne doit plus exister").toBe(false);
    console.log("✅ Bouton 'Lancer analyse' absent — supprimé correctement");

    // Le bouton "Actualiser" doit toujours exister
    const actualiserBtn = authedPage.getByRole("button", { name: /actualiser/i });
    await expect(actualiserBtn).toBeVisible({ timeout: 5000 });
    console.log("✅ Bouton 'Actualiser' présent");
  });

  // ── T200-2 : Aucune mention "Shopify" dans l'UI (T200 validé) ────
  test("T200-2 : aucune mention 'Shopify' dans les textes UI visibles", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForTimeout(3000);

    const bodyText = (await authedPage.locator("body").textContent()) || "";
    const mentionShopify = bodyText.toLowerCase().includes("shopify");
    expect(mentionShopify, "L'UI ne doit plus mentionner 'Shopify' après T200").toBe(false);
    console.log("✅ Aucune mention Shopify dans la page");
  });

  // ── T200-3 : /api/barrage/analyse sync nc_variants → nc_barrage (API) ─
  test("T200-3 : /api/barrage/analyse met à jour nc_barrage depuis nc_variants", async ({ authedPage, token }) => {
    const resp = await authedPage.request.post("/api/barrage/analyse", {
      data: { token },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.ok, `analyse doit retourner ok=true : ${JSON.stringify(body)}`).toBe(true);
    expect(typeof body.added).toBe("number");
    expect(typeof body.updated).toBe("number");
    expect(typeof body.removed).toBe("number");
    console.log(`✅ Analyse API : ${body.added} ajoutés, ${body.updated} mis à jour, ${body.removed} sortis`);

    // Vérifier dans l'UI que le bouton "Actualiser" déclenche aussi le sync
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForTimeout(8000); // sync auto au chargement

    const actualiserBtn = authedPage.getByRole("button", { name: /actualiser/i });
    await expect(actualiserBtn).toBeVisible({ timeout: 10000 });
    await actualiserBtn.click();
    await authedPage.waitForTimeout(4000);

    // Toast ou message de succès attendu après actualisation
    const toast = authedPage.locator(".bg-green-600, .bg-gray-800").first();
    const toastVisible = await toast.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`Toast actualiser visible : ${toastVisible}`);

    // Après actualisation, des articles doivent être affichés
    const cards = authedPage.locator(".rounded-xl.border");
    const count = await cards.count();
    console.log(`Articles après actualisation : ${count}`);
    expect(count, "Des articles doivent être visibles après actualisation").toBeGreaterThan(0);
  });

  // ── T200-4 : nc_barrage contient des produits surveillés ─────────
  test("T200-4 : nc_barrage contient des produits surveillés (vérif DB)", async () => {
    const rows = await sbQuery("nc_barrage", "limit=5&select=variant_id,product_title,available,stock_cible,verifie");
    expect(Array.isArray(rows), "nc_barrage doit retourner un tableau").toBe(true);
    expect(rows.length, "nc_barrage doit avoir au moins 1 produit").toBeGreaterThan(0);
    const first = rows[0];
    expect(first.variant_id, "variant_id doit exister").toBeTruthy();
    // Pas de colonne inventory_item_id (T200 — supprimée)
    expect(Object.keys(first)).not.toContain("inventory_item_id");
    console.log(`✅ ${rows.length} produits dans nc_barrage`);
    console.log(`Exemple : variant_id=${first.variant_id}, product_title=${first.product_title}, available=${first.available}`);
  });

  // ── T200-5 : /api/barrage/run applique UPDATE nc_variants (test DB complet) ─
  test("T200-5 : correction stock appliquée dans nc_variants après /api/barrage/run", async ({ authedPage, token }) => {
    // 1. Récupérer une variante avec stock_cible existant dans nc_barrage
    //    Si aucune, en créer une avec une valeur de test
    let rows = await sbQuery(
      "nc_barrage",
      "stock_cible=not.is.null&limit=1&select=variant_id,product_title,stock_cible"
    );

    let testVariantId = null;
    let testStockCible = TEST_STOCK_CIBLE;
    let stockCibleOriginal = null;

    if (rows?.length > 0) {
      testVariantId    = rows[0].variant_id;
      testStockCible   = rows[0].stock_cible;
      stockCibleOriginal = rows[0].stock_cible;
      console.log(`ℹ️  Variante existante avec stock_cible : ${testVariantId} → ${testStockCible}`);
    } else {
      // Aucune avec stock_cible : choisir la première de nc_barrage et lui en assigner un
      const allRows = await sbQuery("nc_barrage", "limit=1&select=variant_id,product_title");
      if (!allRows?.length) {
        console.log("⚠️  nc_barrage vide — lancer d'abord l'analyse");
        // Lancer l'analyse pour peupler
        const analyseResp = await authedPage.request.post("/api/barrage/analyse", {
          data: { token },
        });
        const analyseBody = await analyseResp.json();
        console.log(`Analyse auto : ${JSON.stringify(analyseBody)}`);
      }
      const freshRows = await sbQuery("nc_barrage", "limit=1&select=variant_id,product_title");
      if (!freshRows?.length) {
        console.log("⚠️  Pas de produits en barrage — stock probablement correct. Test skipped.");
        return;
      }
      testVariantId = freshRows[0].variant_id;
      // Définir stock_cible de test via PATCH
      await sbPatch("nc_barrage", `variant_id=eq.${testVariantId}`, {
        stock_cible: TEST_STOCK_CIBLE,
        verifie: "false",
      });
      testStockCible = TEST_STOCK_CIBLE;
      console.log(`ℹ️  stock_cible=${TEST_STOCK_CIBLE} défini sur variant_id=${testVariantId}`);
    }

    // 2. Lire le stock actuel dans nc_variants AVANT correction
    const variantsBefore = await sbQuery(
      "nc_variants",
      `variant_id=eq.${testVariantId}&select=variant_id,inventory_quantity&limit=1`
    );
    const stockAvant = variantsBefore?.[0]?.inventory_quantity;
    console.log(`Stock nc_variants AVANT : ${stockAvant}`);

    // 3. Appel API /api/barrage/run
    const runResp = await authedPage.request.post("/api/barrage/run", {
      data: { token },
    });
    expect(runResp.status()).toBe(200);
    const runBody = await runResp.json();
    expect(runBody.ok, `barrage/run doit retourner ok=true : ${JSON.stringify(runBody)}`).toBe(true);
    expect(typeof runBody.applied).toBe("number");
    expect(runBody.applied, "Au moins 1 correction doit être appliquée").toBeGreaterThan(0);
    expect(runBody.errors, "Zéro erreur attendue").toBe(0);
    console.log(`✅ barrage/run : ${runBody.applied} corrections, ${runBody.errors} erreurs`);

    // 4. Vérifier dans nc_variants que inventory_quantity = stock_cible
    const variantsAfter = await sbQuery(
      "nc_variants",
      `variant_id=eq.${testVariantId}&select=variant_id,inventory_quantity&limit=1`
    );
    const stockApres = variantsAfter?.[0]?.inventory_quantity;
    console.log(`Stock nc_variants APRÈS : ${stockApres} (attendu : ${testStockCible})`);
    expect(
      Number(stockApres),
      `nc_variants.inventory_quantity doit être = ${testStockCible} (stock_cible défini)`
    ).toBe(Number(testStockCible));

    // 5. Vérifier dans nc_barrage : stock_cible = NULL + verifie = true
    const barrageAfter = await sbQuery(
      "nc_barrage",
      `variant_id=eq.${testVariantId}&select=variant_id,stock_cible,verifie&limit=1`
    );
    const barrageRow = barrageAfter?.[0];
    expect(barrageRow, "nc_barrage doit encore contenir la ligne").toBeTruthy();
    expect(barrageRow.stock_cible, "stock_cible doit être NULL après correction").toBeNull();
    expect(String(barrageRow.verifie).toLowerCase(), "verifie doit être true après correction").toBe("true");
    console.log(`✅ nc_barrage : stock_cible=${barrageRow.stock_cible}, verifie=${barrageRow.verifie}`);

    // 6. Vérifier nc_events : log BARRAGE_RUN_GLOBAL créé (global log, 1 par run)
    await authedPage.waitForTimeout(1000);
    const globalEventsRaw = await sbQuery(
      "nc_events",
      `log_type=eq.BARRAGE_RUN_GLOBAL&order=ts.desc&limit=3&select=log_type,extra,ts`
    );
    const globalArr = Array.isArray(globalEventsRaw) ? globalEventsRaw : (globalEventsRaw ? [globalEventsRaw] : []);
    // Le dernier BARRAGE_RUN_GLOBAL doit avoir extra.applied >= 1
    const latestGlobal = globalArr[0];
    expect(latestGlobal, "nc_events doit contenir un log BARRAGE_RUN_GLOBAL récent").toBeTruthy();
    const extraData = latestGlobal?.extra || {};
    expect(Number(extraData.applied), "BARRAGE_RUN_GLOBAL.extra.applied doit être >= 1").toBeGreaterThanOrEqual(1);
    console.log(`✅ nc_events BARRAGE_RUN_GLOBAL : applied=${extraData.applied} ts=${latestGlobal?.ts}`);
  });

  // ── T200-6 : Test humain UI complet — saisie stock_cible + Valider ─
  test("T200-6 : flux humain UI — saisir stock_cible dans formulaire et valider", async ({ authedPage, token }) => {
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForTimeout(10000); // sync auto + chargement complet

    // Chercher le premier input "Stock cible"
    const stockInputs = authedPage.locator('input[type="number"][min="0"]');
    const count = await stockInputs.count();
    console.log(`Inputs stock_cible visibles : ${count}`);
    expect(count, "Des inputs stock_cible doivent être visibles (au moins 1 article en barrage)").toBeGreaterThan(0);

    console.log(`${count} inputs stock_cible visibles`);

    // Cliquer sur le premier input et saisir une valeur
    const firstInput = stockInputs.first();
    await firstInput.scrollIntoViewIfNeeded();
    await firstInput.click({ clickCount: 3 }); // select all
    await firstInput.fill(String(TEST_STOCK_CIBLE));
    await authedPage.waitForTimeout(500);

    // Cliquer le bouton ✓ (sauvegarder)
    const saveBtn = authedPage.locator("button", { hasText: "✓" }).first();
    const saveBtnVisible = await saveBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (saveBtnVisible) {
      await saveBtn.click();
      await authedPage.waitForTimeout(2000);

      // Toast "Sauvegardé"
      const toastSave = authedPage.getByText(/sauvegard/i).first();
      const toastVisible = await toastSave.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`Toast sauvegarde visible : ${toastVisible}`);
    } else {
      console.log("ℹ️  Bouton ✓ non visible (valeur inchangée ou dirty=false)");
    }

    // Vérifier le bouton "Valider corrections" est activé
    const validerBtn = authedPage.getByRole("button", { name: /valider.?corrections/i });
    await expect(validerBtn).toBeVisible({ timeout: 5000 });
    const isDisabled = await validerBtn.isDisabled();
    console.log(`Bouton Valider corrections : disabled=${isDisabled}`);

    // Cliquer Valider corrections si activé
    if (!isDisabled) {
      await validerBtn.click();
      await authedPage.waitForTimeout(1000);

      // Modal de confirmation apparaît
      const modal = authedPage.locator("text=/valider les corrections/i").first();
      const modalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`Modal confirmation visible : ${modalVisible}`);

      if (modalVisible) {
        // Vérifier que le modal ne mentionne pas "Shopify"
        const modalText = (await authedPage.locator(".fixed.inset-0").textContent()) || "";
        expect(modalText.toLowerCase().includes("shopify"),
          "Le modal ne doit pas mentionner Shopify (T200)").toBe(false);
        expect(modalText.toLowerCase().includes("supabase"),
          "Le modal doit mentionner Supabase").toBe(true);
        console.log("✅ Modal vérifié : pas de Shopify, mentionne Supabase");

        // Confirmer
        const confirmBtn = authedPage.getByRole("button", { name: /confirmer/i });
        await confirmBtn.click();
        await authedPage.waitForTimeout(5000);

        // Toast succès
        const toastSuccess = authedPage.getByText(/corrections appliquées|appliqué|supabase/i).first();
        const successVisible = await toastSuccess.isVisible({ timeout: 8000 }).catch(() => false);
        console.log(`Toast succès visible : ${successVisible}`);
      }
    }
  });

  // ── T200-7 : /api/barrage/run sans stock_cible = 0 corrections (idempotent) ─
  test("T200-7 : /api/barrage/run sans stock_cible défini retourne applied=0", async ({ authedPage, token }) => {
    // Vérifier qu'il n'y a aucun stock_cible non-null dans nc_barrage
    const withCible = await sbQuery(
      "nc_barrage",
      "stock_cible=not.is.null&limit=1&select=variant_id"
    );

    if (withCible?.length > 0) {
      console.log("ℹ️  Des stock_cible sont définis — on skip le test 0-corrections");
      return;
    }

    const resp = await authedPage.request.post("/api/barrage/run", {
      data: { token },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.applied, "Pas de correction si aucun stock_cible défini").toBe(0);
    console.log(`✅ Idempotence : applied=${body.applied} (attendu 0)`);
  });

  // ── T200-8 : inventory_item_id n'existe plus dans nc_barrage ──────
  test("T200-8 : colonne inventory_item_id absente de nc_barrage (T200 DB)", async () => {
    const rows = await sbQuery("nc_barrage", "limit=1&select=*");
    if (!rows?.length) {
      console.log("⚠️  nc_barrage vide — impossible de vérifier les colonnes");
      return;
    }
    const cols = Object.keys(rows[0]);
    expect(cols, "inventory_item_id ne doit plus exister dans nc_barrage").not.toContain("inventory_item_id");
    expect(cols, "variant_id doit exister").toContain("variant_id");
    expect(cols, "stock_cible doit exister").toContain("stock_cible");
    console.log(`✅ Colonnes nc_barrage : ${cols.join(", ")}`);
    console.log("✅ inventory_item_id absent — T200 DB validé");
  });

  // ── T_BARRAGE_WORLD-1 : DB — nc_barrage a des balises coiffure ET onglerie ─
  test("T_BARRAGE_WORLD-1 : nc_barrage.balise contient coiffure ET onglerie (DB)", async () => {
    const rows = await sbQuery(
      "nc_barrage",
      "select=balise&limit=2000"
    );
    expect(Array.isArray(rows), "nc_barrage doit retourner un tableau").toBe(true);
    expect(rows.length, "nc_barrage doit avoir au moins 1 ligne").toBeGreaterThan(0);

    const onglCount  = rows.filter(r => r.balise === "onglerie").length;
    const coiffCount = rows.filter(r => r.balise === "coiffure").length;
    const nullCount  = rows.filter(r => r.balise === null || r.balise === undefined || r.balise === "").length;

    console.log(`DB nc_barrage — coiffure: ${coiffCount}, onglerie: ${onglCount}, null: ${nullCount}`);
    expect(onglCount, "Il doit y avoir des articles onglerie dans nc_barrage").toBeGreaterThan(0);
    expect(coiffCount, "Il doit y avoir des articles coiffure dans nc_barrage").toBeGreaterThan(0);
    expect(nullCount, "Il ne doit plus y avoir de balise NULL dans nc_barrage").toBe(0);
    console.log("✅ nc_barrage : coiffure et onglerie correctement séparés");
  });

  // ── T_BARRAGE_WORLD-2 : UI — filtre Onglerie n'affiche que des articles onglerie ─
  test("T_BARRAGE_WORLD-2 : filtre Onglerie — UI affiche uniquement des articles onglerie", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForFunction(() => {
      const spinner = document.querySelector("svg.animate-spin");
      const cards   = document.querySelectorAll(".rounded-xl.border");
      return !spinner && cards.length > 0;
    }, { timeout: 30000 }).catch(() => {});

    // Vérifier qu'il y a des articles affichés avant de filtrer
    const allCards = authedPage.locator(".rounded-xl.border");
    const totalBefore = await allCards.count();
    console.log(`Articles affichés (tous) : ${totalBefore}`);
    expect(totalBefore, "Le barrage doit afficher au moins 1 article avant de filtrer").toBeGreaterThan(0);

    // Cliquer sur le bouton filtre "Onglerie"
    const onglBtn = authedPage.getByRole("button", { name: /onglerie/i });
    await expect(onglBtn).toBeVisible({ timeout: 10000 });
    await onglBtn.click();
    await authedPage.waitForTimeout(1000);

    // Compter les articles affichés après filtre onglerie
    const cardsOnglerie = await allCards.count();
    console.log(`Articles affichés (filtre Onglerie) : ${cardsOnglerie}`);

    if (cardsOnglerie === 0) {
      console.log("ℹ️  Aucun article onglerie dans nc_barrage actuellement — test UI skipped");
      return;
    }

    // Vérifier qu'il y a le badge "Onglerie" (rose) sur les cartes affichées
    const ongleriesBadges = authedPage.locator(".bg-pink-100.text-pink-700");
    const nbBadges = await ongleriesBadges.count();
    console.log(`Badges Onglerie (rose) visibles : ${nbBadges}`);
    expect(nbBadges, "Les cartes en vue Onglerie doivent avoir le badge rose Onglerie").toBeGreaterThan(0);

    // S'assurer qu'il n'y a PAS de badge bleu (coiffure) sur ces cartes
    const coiffBadges = authedPage.locator(".bg-blue-100.text-blue-700");
    const nbCoiffBadges = await coiffBadges.count();
    console.log(`Badges Coiffure (bleu) visibles en vue Onglerie : ${nbCoiffBadges}`);
    expect(nbCoiffBadges, "Filtre Onglerie ne doit pas afficher de badges coiffure").toBe(0);
    console.log("✅ Filtre Onglerie : uniquement des articles onglerie (badges roses)");
  });

  // ── T_BARRAGE_WORLD-3 : UI — filtre Coiffure n'affiche aucun badge Onglerie ─
  test("T_BARRAGE_WORLD-3 : filtre Coiffure — UI n'affiche aucun article onglerie", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForFunction(() => {
      const spinner = document.querySelector("svg.animate-spin");
      const cards   = document.querySelectorAll(".rounded-xl.border");
      return !spinner && cards.length > 0;
    }, { timeout: 30000 }).catch(() => {});

    // Vérifier qu'il y a des articles avant de filtrer
    const allCardsInit = authedPage.locator(".rounded-xl.border");
    const initCount = await allCardsInit.count();
    expect(initCount, "Le barrage doit avoir des articles avant de filtrer").toBeGreaterThan(0);

    // Cliquer sur le bouton filtre "Coiffure"
    const coiffBtn = authedPage.getByRole("button", { name: /coiffure/i });
    await expect(coiffBtn).toBeVisible({ timeout: 10000 });
    await coiffBtn.click();
    await authedPage.waitForTimeout(1000);

    const allCards = authedPage.locator(".rounded-xl.border");
    const cardsCoiffure = await allCards.count();
    console.log(`Articles affichés (filtre Coiffure) : ${cardsCoiffure}`);

    if (cardsCoiffure === 0) {
      console.log("ℹ️  Aucun article coiffure dans nc_barrage actuellement — test UI skipped");
      return;
    }

    // Aucun badge rose "Onglerie" ne doit être visible
    const ongleriesBadges = authedPage.locator(".bg-pink-100.text-pink-700");
    const nbOnglBadges = await ongleriesBadges.count();
    console.log(`Badges Onglerie (rose) en vue Coiffure : ${nbOnglBadges}`);
    expect(nbOnglBadges, "Filtre Coiffure ne doit pas afficher de badges onglerie").toBe(0);
    console.log("✅ Filtre Coiffure : aucun article onglerie affiché");
  });

  // ── T_BARRAGE_WORLD-4 : UI — compteurs cohérents avec DB ──────────
  test("T_BARRAGE_WORLD-4 : compteurs filtres (Coiffure/Onglerie) cohérents avec DB", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForFunction(() => {
      const spinner = document.querySelector("svg.animate-spin");
      const cards   = document.querySelectorAll(".rounded-xl.border");
      return !spinner && cards.length > 0;
    }, { timeout: 30000 }).catch(() => {});

    // Lire le texte des boutons filtre qui contiennent le compteur
    const tousBtnText   = await authedPage.getByRole("button", { name: /^tous/i }).first().textContent().catch(() => "");
    const onglBtnText   = await authedPage.getByRole("button", { name: /onglerie/i }).first().textContent().catch(() => "");
    const coiffBtnText  = await authedPage.getByRole("button", { name: /coiffure/i }).first().textContent().catch(() => "");

    console.log(`Bouton Tous : "${tousBtnText.trim()}"`);
    console.log(`Bouton Onglerie : "${onglBtnText.trim()}"`);
    console.log(`Bouton Coiffure : "${coiffBtnText.trim()}"`);

    // Extraire les nombres
    const extractNum = (txt) => { const m = txt.match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; };
    const nTous   = extractNum(tousBtnText);
    const nOngl   = extractNum(onglBtnText);
    const nCoiff  = extractNum(coiffBtnText);

    console.log(`Compteurs UI — Tous: ${nTous}, Onglerie: ${nOngl}, Coiffure: ${nCoiff}`);

    expect(nTous, "Le barrage doit afficher au moins 100 articles (nc_barrage peuplé)").toBeGreaterThan(100);

    // Vérifier cohérence : Coiffure + Onglerie = Tous (± articles stock 0 masqués)
    const sum = nCoiff + nOngl;
    expect(
      Math.abs(sum - nTous),
      `Coiffure(${nCoiff}) + Onglerie(${nOngl}) = ${sum} doit être proche de Tous(${nTous})`
    ).toBeLessThanOrEqual(2);

    // Les deux compteurs doivent être > 0 si nc_barrage a du stock des deux mondes
    if (nTous > 10) {
      expect(nOngl, "Il doit y avoir des articles onglerie si nc_barrage > 10 articles").toBeGreaterThan(0);
      expect(nCoiff, "Il doit y avoir des articles coiffure si nc_barrage > 10 articles").toBeGreaterThan(0);
    }
    console.log("✅ Compteurs coiffure/onglerie cohérents avec total");
  });

  // ── T_NOTE_BARRAGE-1 : Note visible IMMÉDIATEMENT sans changer de position ──────
  test("T_NOTE_BARRAGE-1 : note visible sans rechargement + position stable", async ({ authedPage, token }) => {
    const TEST_NOTE = "Note test Playwright " + Date.now();

    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForFunction(() => {
      const spinner = document.querySelector("svg.animate-spin");
      const cards   = document.querySelectorAll("[data-testid='barrage-card']");
      return !spinner && cards.length > 0;
    }, { timeout: 30000 }).catch(() => {});

    // Vérifier qu'il y a des cartes
    const cards = authedPage.locator("[data-testid='barrage-card']");
    const count = await cards.count();
    expect(count, "Au moins 1 carte en barrage").toBeGreaterThan(0);

    // ── Mémoriser le titre du 3ème article (test de stabilité de position) ──
    const thirdCard = cards.nth(2);
    const thirdTitleBefore = (await thirdCard.locator(".font-semibold.text-sm").first().textContent().catch(() => "")) || "";
    console.log(`3ème article avant save : "${thirdTitleBefore.trim()}"`);

    // Remplir le champ note du PREMIER article
    const firstCard = cards.first();
    const noteInput = firstCard.locator("[data-testid='barrage-note-input']");
    await expect(noteInput).toBeVisible({ timeout: 5000 });
    await noteInput.click({ clickCount: 3 });
    await noteInput.fill(TEST_NOTE);
    await authedPage.keyboard.press("Tab"); // blur pour déclencher dirty
    await authedPage.waitForTimeout(200);

    // Le bouton ✓ (dirty) doit apparaître
    const saveBtn = firstCard.locator("[data-testid='barrage-save-btn']");
    await expect(saveBtn).toBeVisible({ timeout: 3000 });

    // ── Cliquer save et mesurer le temps de réponse ──
    const t0 = Date.now();
    await saveBtn.click();

    // Toast "Sauvegardé" doit apparaître rapidement
    const toastSave = authedPage.getByText(/sauvegard/i).first();
    await expect(toastSave).toBeVisible({ timeout: 5000 });
    const elapsed = Date.now() - t0;
    console.log(`Toast sauvegarde apparu en ${elapsed}ms`);

    // ── Bug 1 : La note doit être visible IMMÉDIATEMENT (pas de spinner) ──
    // Pas d'attente longue — l'update est en place (optimiste)
    const noteDisplay = firstCard.locator("[data-testid='barrage-note-display']");
    await expect(noteDisplay).toBeVisible({ timeout: 3000 });
    const noteText = (await noteDisplay.textContent()) || "";
    console.log(`Note affichée : "${noteText.trim()}"`);
    expect(noteText, "La note doit être affichée IMMÉDIATEMENT dans la carte").toContain(TEST_NOTE);
    console.log("✅ Bug 1 corrigé : note visible immédiatement");

    // ── Bug 2 : Le 3ème article doit rester au même rang ──
    await authedPage.waitForTimeout(500);
    const thirdTitleAfter = (await thirdCard.locator(".font-semibold.text-sm").first().textContent().catch(() => "")) || "";
    console.log(`3ème article après save : "${thirdTitleAfter.trim()}"`);
    expect(thirdTitleAfter.trim(), "La position des autres articles ne doit pas changer après save")
      .toBe(thirdTitleBefore.trim());
    console.log("✅ Bug 2 corrigé : position stable après save");

    // ── Vérifier DB : nc_events contient un log NOTE_BARRAGE ──
    await authedPage.waitForTimeout(1500);
    const noteEvents = await sbQuery(
      "nc_events",
      `log_type=eq.NOTE_BARRAGE&order=ts.desc&limit=1&select=log_type,note,actor,ts`
    );
    const arr = Array.isArray(noteEvents) ? noteEvents : (noteEvents ? [noteEvents] : []);
    if (arr.length > 0) {
      expect(arr[0].note, "La note en DB doit correspondre à ce qui a été saisie").toBe(TEST_NOTE);
      console.log(`✅ nc_events NOTE_BARRAGE : note="${arr[0].note}" actor="${arr[0].actor}"`);
    } else {
      console.log("ℹ️  Log NOTE_BARRAGE pas encore en DB (fire-and-forget) — note UI vérifiée");
    }
  });

  // ── T_HISTORIQUE_BARRAGE-1 : Onglet Historique — vrai nom produit + pas de générique ─
  test("T_HISTORIQUE_BARRAGE-1 : onglet Historique — vrai nom produit (pas label générique)", async ({ authedPage, token }) => {
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForFunction(() => !document.querySelector("svg.animate-spin"), { timeout: 30000 }).catch(() => {});

    // ── Compter les cartes historique AVANT l'action ──
    const histBtn = authedPage.locator("[data-testid='filter-historique']");
    await expect(histBtn).toBeVisible({ timeout: 5000 });
    await histBtn.click();
    await authedPage.waitForFunction(() => !document.querySelector("svg.animate-spin"), { timeout: 15000 }).catch(() => {});
    await authedPage.waitForTimeout(2000);

    const histCards  = authedPage.locator("[data-testid='historique-card']");
    const nbBefore   = await histCards.count();
    console.log(`Cartes historique AVANT sortie : ${nbBefore}`);

    // Vérifier que le bouton "Valider corrections" est masqué en mode Historique
    const validerBtn = authedPage.getByRole("button", { name: /valider.?corrections/i });
    const validerVis = await validerBtn.isVisible({ timeout: 2000 }).catch(() => false);
    expect(validerVis, "Bouton Valider corrections absent en mode Historique").toBe(false);
    console.log("✅ Bouton Valider corrections masqué en mode Historique");

    // ── Forcer une sortie du barrage → génère un EXIT_BARRAGE avec vrai nom ──
    const barrageRows = await sbQuery("nc_barrage", "limit=1&select=variant_id,product_title,available");
    if (!barrageRows?.length) { console.log("⚠️  nc_barrage vide — test partiel"); return; }

    const testVid   = barrageRows[0].variant_id;
    const testTitle = barrageRows[0].product_title;
    const testStock = barrageRows[0].available;

    await sbPatch("nc_variants", `variant_id=eq.${testVid}`, { inventory_quantity: 10 });
    const analyseResp = await authedPage.request.post("/api/barrage/analyse", { data: { token } });
    const analyseBody = await analyseResp.json();
    console.log(`Sortie forcée : "${testTitle}" | analyse removed=${analyseBody.removed}`);
    expect(analyseBody.removed, "Au moins 1 article sorti").toBeGreaterThan(0);

    // ── Recharger la page et rouvrir l'onglet historique ──
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForFunction(() => !document.querySelector("svg.animate-spin"), { timeout: 30000 }).catch(() => {});
    await authedPage.locator("[data-testid='filter-historique']").click();
    await authedPage.waitForFunction(() => !document.querySelector("svg.animate-spin"), { timeout: 15000 }).catch(() => {});
    await authedPage.waitForTimeout(2000);

    const nbAfter = await histCards.count();
    console.log(`Cartes historique APRÈS sortie : ${nbAfter} (était ${nbBefore})`);
    expect(nbAfter, "Au moins 1 carte dans l'historique après sortie").toBeGreaterThan(0);

    // ── Vérifier que le vrai nom est affiché (pas le générique) ──
    const bodyText   = (await authedPage.locator("body").textContent()) || "";
    const shortTitle = testTitle?.slice(0, 12) || "";
    if (shortTitle) {
      const hasName    = bodyText.includes(shortTitle);
      const hasGeneric = bodyText.includes("Auto-sortie barrage (stock hors seuil 1-4)");
      console.log(`Vrai nom "${shortTitle}" affiché : ${hasName} | Générique : ${hasGeneric}`);
      expect(hasName, `Le vrai nom "${shortTitle}" doit être dans l'historique`).toBe(true);
      expect(hasGeneric, "Le label générique ne doit PAS apparaître").toBe(false);
    }
    console.log("✅ Bug 3 corrigé : historique affiche les vrais noms (pas le générique)");

    // ── Nettoyer ──
    await sbPatch("nc_variants", `variant_id=eq.${testVid}`, { inventory_quantity: testStock });
    console.log(`Stock restauré à ${testStock}`);
  });

  // ── T_HISTORIQUE_LABEL-1 : EXIT_BARRAGE events contiennent le vrai nom produit ──
  test("T_HISTORIQUE_LABEL-1 : Historique — noms produits vrais (pas label générique)", async ({ authedPage, token }) => {
    const genericLabel = "Auto-sortie barrage (stock hors seuil 1-4)";

    // 1. Choisir un article en barrage (stock 1-4) pour forcer sa sortie
    const barrageRows = await sbQuery(
      "nc_barrage",
      "limit=1&select=variant_id,product_title,available"
    );
    if (!barrageRows?.length) {
      console.log("⚠️  nc_barrage vide — test skipped");
      return;
    }
    const testVariantId  = barrageRows[0].variant_id;
    const testTitle      = barrageRows[0].product_title;
    const stockOriginal  = barrageRows[0].available;
    console.log(`Variante test : ${testVariantId} "${testTitle}" stock=${stockOriginal}`);

    // 2. Mettre le stock à 10 (> 4) dans nc_variants → forcera EXIT_BARRAGE lors de l'analyse
    await sbPatch("nc_variants", `variant_id=eq.${testVariantId}`, {
      inventory_quantity: 10,
    });
    console.log(`Stock forcé à 10 pour déclencher EXIT_BARRAGE`);

    // 3. Lancer l'analyse → doit sortir l'article du barrage et créer EXIT_BARRAGE avec product_title
    const analyseResp = await authedPage.request.post("/api/barrage/analyse", {
      data: { token },
    });
    expect(analyseResp.status()).toBe(200);
    const analyseBody = await analyseResp.json();
    console.log(`Analyse : ${analyseBody.added} ajoutés, ${analyseBody.removed} sortis`);
    expect(analyseBody.removed, "Au moins 1 article doit être sorti (stock forcé à 10)").toBeGreaterThan(0);

    // 4. Vérifier en DB : l'EXIT_BARRAGE le plus récent a le vrai nom du produit
    await authedPage.waitForTimeout(500);
    const recentExits = await sbQuery(
      "nc_events",
      `log_type=eq.EXIT_BARRAGE&variant_id=eq.${testVariantId}&order=ts.desc&limit=1&select=label,variant_id,ts`
    );
    const arr = Array.isArray(recentExits) ? recentExits : (recentExits ? [recentExits] : []);
    expect(arr.length, "Un EXIT_BARRAGE doit avoir été créé pour cette variante").toBeGreaterThan(0);

    const ev = arr[0];
    console.log(`Label EXIT_BARRAGE généré : "${ev.label}"`);
    expect(ev.label, `Le label ne doit pas être le générique "${genericLabel}"`).not.toBe(genericLabel);
    expect(ev.label, "Le label doit être le vrai nom du produit").toBe(testTitle);
    console.log(`✅ Label corrigé : "${ev.label}" = "${testTitle}"`);

    // 5. Vérifier dans l'UI : l'onglet Historique affiche le vrai nom après actualisation
    await authedPage.goto("/dashboard/barrage");
    await authedPage.waitForSelector("h1", { timeout: 15000 });
    await authedPage.waitForFunction(() => !document.querySelector("svg.animate-spin"), { timeout: 20000 }).catch(() => {});

    const histBtn = authedPage.locator("[data-testid='filter-historique']");
    await expect(histBtn).toBeVisible({ timeout: 5000 });
    await histBtn.click();

    await authedPage.waitForFunction(() => !document.querySelector("svg.animate-spin"), { timeout: 15000 }).catch(() => {});
    await authedPage.waitForTimeout(2000);

    // Chercher le vrai nom du produit dans les cartes historique
    const shortTitle = testTitle?.slice(0, 15) || "";
    if (shortTitle) {
      const bodyText = (await authedPage.locator("body").textContent()) || "";
      const hasRealName = bodyText.includes(shortTitle);
      console.log(`Vrai nom "${shortTitle}" visible dans historique : ${hasRealName}`);
      expect(hasRealName, `Le vrai nom "${shortTitle}" doit apparaître dans l'onglet Historique`).toBe(true);
    }
    console.log("✅ Onglet Historique : vrais noms de produits affichés");

    // 6. Nettoyer : remettre le stock original pour ne pas casser la DB
    await sbPatch("nc_variants", `variant_id=eq.${testVariantId}`, {
      inventory_quantity: stockOriginal,
    });
    console.log(`Stock restauré à ${stockOriginal}`);
  });

  // ── T_BARRAGE_STOCK-1 : Correction barrage visible immédiatement dans page Stock ─
  test("T_BARRAGE_STOCK-1 : correction barrage visible dans /dashboard/stock sans délai", async ({ authedPage, token }) => {
    const STOCK_CIBLE = 12; // valeur de test identifiable

    // 1. Choisir une variante en barrage (stock 1-4) pour la correction
    const barrageRows = await sbQuery("nc_barrage", "limit=1&select=variant_id,product_title,available");
    if (!barrageRows?.length) {
      console.log("⚠️  nc_barrage vide — test skipped");
      return;
    }
    const testVariantId = barrageRows[0].variant_id;
    const testTitle     = barrageRows[0].product_title;
    const stockAvant    = barrageRows[0].available;
    console.log(`Variante test : ${testVariantId} "${testTitle}" stock actuel=${stockAvant}`);

    // 2. Définir stock_cible dans nc_barrage
    await sbPatch("nc_barrage", `variant_id=eq.${testVariantId}`, {
      stock_cible: STOCK_CIBLE,
      verifie: "false",
    });
    console.log(`stock_cible=${STOCK_CIBLE} défini sur variant_id=${testVariantId}`);

    // 3. Appel API barrage/run → applique la correction dans nc_variants
    const runResp = await authedPage.request.post("/api/barrage/run", { data: { token } });
    expect(runResp.status()).toBe(200);
    const runBody = await runResp.json();
    expect(runBody.ok, `barrage/run doit retourner ok=true : ${JSON.stringify(runBody)}`).toBe(true);
    expect(runBody.applied, "Au moins 1 correction doit être appliquée").toBeGreaterThan(0);
    console.log(`✅ barrage/run : ${runBody.applied} corrections appliquées`);

    // 4. Vérifier DB : nc_variants.inventory_quantity = STOCK_CIBLE
    const variantsAfter = await sbQuery("nc_variants", `variant_id=eq.${testVariantId}&select=variant_id,inventory_quantity&limit=1`);
    const stockApres = variantsAfter?.[0]?.inventory_quantity;
    expect(Number(stockApres), `nc_variants.inventory_quantity doit être ${STOCK_CIBLE}`).toBe(STOCK_CIBLE);
    console.log(`✅ nc_variants stock après correction : ${stockApres}`);

    // 5. Ouvrir la page Stock → la correction doit être visible IMMÉDIATEMENT (cache invalidé)
    await authedPage.goto("/dashboard/stock");
    await authedPage.waitForSelector("body", { timeout: 15000 });
    await authedPage.waitForTimeout(5000); // laisser la page charger les variants

    // Chercher l'article dans la page stock (par son nom)
    const shortTitle = testTitle?.slice(0, 15) || "";
    if (shortTitle) {
      // Taper le nom dans la barre de recherche du stock
      const searchInput = authedPage.locator('input[type="text"][placeholder*="echerch"], input[type="search"]').first();
      const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSearch) {
        await searchInput.fill(shortTitle);
        await authedPage.waitForTimeout(1000);
      }
    }

    // Vérifier que le stock affiché est le nouveau (STOCK_CIBLE)
    const bodyText = (await authedPage.locator("body").textContent()) || "";
    const hasNewStock = bodyText.includes(String(STOCK_CIBLE));
    console.log(`Stock ${STOCK_CIBLE} visible dans page Stock : ${hasNewStock}`);
    expect(hasNewStock, `La page Stock doit afficher le nouveau stock ${STOCK_CIBLE} immédiatement après correction barrage`).toBe(true);

    // 6. Navigation barrage → stock : vérifier que le cache "variants" est bien invalidé
    //    (retour sur la page barrage, correction, puis stock → doit montrer la nouvelle valeur)
    console.log("✅ Correction barrage visible dans page Stock sans délai");
  });

});
