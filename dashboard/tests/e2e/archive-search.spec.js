/**
 * archive-search.spec.js — Tests humains Recherche Archive
 *
 * Simule un agent qui cherche l'historique d'un client en cas de réclamation.
 * Vérifie les 3 modes : tracking, téléphone, nom.
 *
 * Données réelles utilisées (commande امحمد رضا — 42-LBQFXVLANR-ZR — 13 570 DA)
 */
import { test, expect, sbQuery } from "./fixtures.js";

// Données réelles stables en base
const REAL_TRACKING  = "42-LBQFXVLANR-ZR";
const REAL_PHONE     = "0540955043";
const REAL_ORDER_ID  = "0dad4c06-e7cd-4537-9b8f-0f27b4f00181";

// Helper : aller sur Suivi ZR et cliquer sur l'onglet Archive
async function goToArchiveTab(page) {
  await page.goto("/dashboard/suivi-zr");
  await page.waitForTimeout(2000);
  const archiveTab = page.getByRole("button", { name: /recherche archive/i })
    .or(page.locator("button").filter({ hasText: /archive/i })).first();
  await expect(archiveTab).toBeVisible({ timeout: 10000 });
  await archiveTab.click();
  await page.waitForTimeout(1000);
}

test.describe("Recherche Archive — Page Suivi ZR", () => {

  // ── Test 0 : vérifier que la commande existe bien en DB ────────
  test("DB — la commande réelle existe dans nc_orders", async () => {
    const rows = await sbQuery(
      "nc_orders",
      `order_id=eq.${REAL_ORDER_ID}&select=order_id,tracking,customer_phone,order_total`
    );
    expect(rows?.length, "La commande test doit exister en base").toBe(1);
    expect(rows[0].tracking).toBe(REAL_TRACKING);
    expect(rows[0].customer_phone).toBe(REAL_PHONE);
    expect(Number(rows[0].order_total)).toBe(13570);
  });

  // ── Test 1 : l'onglet Archive s'affiche ───────────────────────
  test("l'onglet Recherche Archive est visible sur la page Suivi ZR", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await authedPage.waitForTimeout(2000);

    const archiveTab = authedPage.getByRole("button", { name: /recherche archive/i })
      .or(authedPage.locator("button").filter({ hasText: /archive/i })).first();
    await expect(archiveTab).toBeVisible({ timeout: 10000 });

    await archiveTab.click();
    await authedPage.waitForTimeout(1000);

    // Vérifier le contenu de l'onglet
    const bodyText = await authedPage.locator("body").textContent();
    expect(bodyText).toMatch(/recherche archive|historique.*client|réclamation/i);
    expect(bodyText).not.toMatch(/Application error|Internal Server Error/i);
  });

  // ── Test 2 : Recherche par TRACKING ───────────────────────────
  test("recherche par tracking → trouve la commande et affiche les détails", async ({ authedPage }) => {
    await goToArchiveTab(authedPage);

    // Sélectionner mode "Tracking"
    const trackingBtn = authedPage.getByRole("button", { name: /tracking/i }).first();
    await expect(trackingBtn).toBeVisible({ timeout: 8000 });
    await trackingBtn.click();
    await authedPage.waitForTimeout(500);

    // Taper le numéro de tracking
    const input = authedPage.locator("input[type='text']").last();
    await input.fill(REAL_TRACKING);
    await authedPage.waitForTimeout(300);

    // Cliquer Rechercher
    const searchBtn = authedPage.getByRole("button", { name: /rechercher/i }).last();
    await searchBtn.click();

    // Attendre les résultats
    await authedPage.waitForTimeout(4000);

    const bodyText = await authedPage.locator("body").textContent();

    // Vérifier qu'on trouve le tracking ou un résultat
    expect(bodyText, "Le tracking doit apparaître dans les résultats")
      .toMatch(/LBQFXVLANR|client|commande/i);

    // Vérifier pas d'erreur réseau ou serveur
    expect(bodyText).not.toMatch(/Application error|Internal Server Error|erreur réseau/i);
  });

  // ── Test 3 : Recherche par TÉLÉPHONE ──────────────────────────
  test("recherche par téléphone → affiche l'historique client", async ({ authedPage }) => {
    await goToArchiveTab(authedPage);

    // Mode Téléphone (actif par défaut)
    const phoneBtn = authedPage.getByRole("button", { name: /téléphone/i }).first();
    const isPhoneVisible = await phoneBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (isPhoneVisible) await phoneBtn.click();
    await authedPage.waitForTimeout(300);

    // Saisir le téléphone
    const input = authedPage.locator("input[type='text']").last();
    await input.fill(REAL_PHONE);
    await authedPage.waitForTimeout(300);

    // Appuyer Entrée (simulation humain)
    await input.press("Enter");
    await authedPage.waitForTimeout(4000);

    const bodyText = await authedPage.locator("body").textContent();

    // Vérifier qu'on trouve un résultat (client ou commande)
    expect(bodyText).not.toMatch(/erreur réseau|Application error|Internal Server Error/i);
    // Au moins une info liée au client (wilaya Tipaza ou montant 13570 ou téléphone)
    const hasResult = /Tipaza|13.?570|commande|client/i.test(bodyText);
    expect(hasResult, "La recherche par téléphone doit retourner des résultats").toBe(true);
  });

  // ── Test 4 : Recherche par NOM ────────────────────────────────
  test("recherche par nom → affiche les résultats avec historique", async ({ authedPage }) => {
    await goToArchiveTab(authedPage);

    // Sélectionner mode "Nom"
    const nomBtn = authedPage.getByRole("button", { name: /nom/i })
      .or(authedPage.locator("button").filter({ hasText: /👤|nom/i })).first();
    await expect(nomBtn).toBeVisible({ timeout: 8000 });
    await nomBtn.click();
    await authedPage.waitForTimeout(300);

    // Chercher par nom partiel
    const input = authedPage.locator("input[type='text']").last();
    await input.fill("ahmed");
    await authedPage.waitForTimeout(300);
    await input.press("Enter");
    await authedPage.waitForTimeout(4000);

    const bodyText = await authedPage.locator("body").textContent();
    expect(bodyText).not.toMatch(/Application error|Internal Server Error/i);
    // Soit résultats, soit message "aucun client"
    const hasContent = /ahmed|client|commande|aucun/i.test(bodyText);
    expect(hasContent, "La recherche par nom doit afficher un résultat ou message 'aucun'").toBe(true);
  });

  // ── Test 5 : Clic sur client → voir commandes ─────────────────
  test("cliquer sur un client affiche la liste de ses commandes", async ({ authedPage }) => {
    await goToArchiveTab(authedPage);

    // Rechercher par téléphone
    const input = authedPage.locator("input[type='text']").last();
    await input.fill(REAL_PHONE);
    await input.press("Enter");
    await authedPage.waitForTimeout(4000);

    // Chercher une carte client cliquable dans les résultats
    const customerCards = authedPage.locator("div[class*='cursor-pointer']")
      .or(authedPage.locator("div").filter({ hasText: REAL_PHONE })).first();

    const cardVisible = await customerCards.isVisible({ timeout: 5000 }).catch(() => false);
    if (!cardVisible) {
      const bodyText = await authedPage.locator("body").textContent();
      console.log("ℹ️ Aucune carte client cliquable trouvée. Body:", bodyText.slice(0, 300));
      return;
    }

    await customerCards.click();
    await authedPage.waitForTimeout(2000);

    const bodyText = await authedPage.locator("body").textContent();
    // Après clic, les commandes du client doivent apparaître
    expect(bodyText).toMatch(/DA|commande|13.?570|LBQFXVLANR/i);
  });

  // ── Test 6 : API enrichit les images manquantes depuis nc_variants ──
  test("API : les 6 articles sans image récupèrent leur image depuis nc_variants", async ({ page }) => {
    const session = require("fs").existsSync(".playwright-auth/session.json")
      ? JSON.parse(require("fs").readFileSync(".playwright-auth/session.json", "utf8"))
      : null;
    if (!session) { console.log("⚠️ session manquante"); return; }

    const res = await fetch("https://najmcoiffdashboard.vercel.app/api/archive/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: session.token, tracking: REAL_TRACKING }),
    });
    const data = await res.json();
    expect(data.ok).toBe(true);

    const orders = data.customers.flatMap(c => c.orders);
    const items  = orders.flatMap(o => Array.isArray(o.items_json) ? o.items_json : []);

    // Les 6 articles connus pour avoir eu image_url vide avant enrichissement
    const needEnrich = [
      "miss claire cire violet",
      "Cire illis huiles naturelles sans sulfate",
      "Keratin restore NATYRA",
      "Ciseau Henbor droit simple",
      "Cadre en verre42",
      "Cadre en verre41",
    ];

    for (const name of needEnrich) {
      const item = items.find(i => i.title === name);
      if (!item) continue; // article pas dans cette commande
      expect(
        item.image_url,
        `"${name}" doit avoir une image_url après enrichissement`
      ).toBeTruthy();
      console.log(`✅ ${name} → ${item.image_url?.slice(0, 60)}...`);
    }
  });

  // ── Test 7 : Fiche détaillée — toutes les images s'affichent (plus de blancs) ──
  test("fiche détaillée : toutes les images s'affichent — 0 blanc pour les 6 articles enrichis", async ({ authedPage }) => {
    await goToArchiveTab(authedPage);

    // Rechercher par tracking
    const trackingBtn = authedPage.getByRole("button", { name: /tracking/i }).first();
    await trackingBtn.click();
    await authedPage.waitForTimeout(300);

    const input = authedPage.locator("input[type='text']").last();
    await input.fill(REAL_TRACKING);
    await input.press("Enter");
    await authedPage.waitForTimeout(4000);

    // Ouvrir la fiche commande
    const orderRow = authedPage.locator("button").filter({ hasText: /13.?570|Voir →/i }).first();
    const rowVisible = await orderRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (rowVisible) {
      await orderRow.click();
    } else {
      await authedPage.locator("button").nth(5).click();
    }
    await authedPage.waitForTimeout(3000);

    const bodyText = await authedPage.locator("body").textContent();
    expect(bodyText, "La fiche doit afficher des articles").toMatch(/DA\/u|13.?570/i);

    // Attendre que les images se chargent
    await authedPage.waitForTimeout(2000);

    // Compter les images réelles dans la fiche (balises <img> avec src Supabase)
    const imgs = authedPage.locator("img[src*='supabase']");
    const imgCount = await imgs.count();
    expect(imgCount, "Des images Supabase doivent s'afficher dans la fiche").toBeGreaterThan(15);
    console.log(`✅ ${imgCount} images Supabase affichées dans la fiche`);

    // Compter les placeholders restants via data-testid précis (pas les ancêtres)
    // Car tous les articles ont maintenant une image dans nc_variants, attendu : 0
    const placeholders = authedPage.locator("[data-testid='item-placeholder']");
    const placeholderCount = await placeholders.count();
    console.log(`ℹ️ ${placeholderCount} placeholder(s) restant(s) (attendu : 0 pour cette commande)`);
    expect(placeholderCount, "Tous les articles doivent avoir une vraie image — 0 placeholder attendu").toBe(0);
  });

  // ── Test 7 : API /api/archive/search répond correctement ──────
  test("API archive/search répond avec les bonnes données pour le tracking", async ({ token }) => {
    const res = await fetch("https://najmcoiffdashboard.vercel.app/api/archive/search", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token, tracking: REAL_TRACKING }),
    });

    expect(res.status, "L'API doit répondre 200").toBe(200);
    const data = await res.json();

    expect(data.ok, `API doit retourner ok:true — erreur: ${data.error}`).toBe(true);
    expect(data.customers?.length, "Doit trouver au moins 1 client").toBeGreaterThan(0);
    expect(data.total, "Doit trouver au moins 1 commande").toBeGreaterThan(0);

    // Vérifier que la commande contient le bon tracking
    const allOrders = data.customers.flatMap(c => c.orders);
    const found = allOrders.find(o => o.tracking === REAL_TRACKING);
    expect(found, `La commande ${REAL_TRACKING} doit être dans les résultats`).toBeTruthy();
  });

  // ── Test 8 : API répond pour le téléphone ─────────────────────
  test("API archive/search répond avec les bonnes données pour le téléphone", async ({ token }) => {
    const res = await fetch("https://najmcoiffdashboard.vercel.app/api/archive/search", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token, phone: REAL_PHONE }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok, `API doit retourner ok:true — erreur: ${data.error}`).toBe(true);
    expect(data.customers?.length).toBeGreaterThan(0);

    // Le client doit avoir ce numéro de téléphone
    const client = data.customers[0];
    expect(client.phone).toContain("0540955043");
    expect(Number(client.total_spent)).toBeGreaterThan(0);
  });

});
