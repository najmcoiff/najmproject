/**
 * livraison-edit.spec.js
 * Test humain — Correction tarifs livraison dans le dashboard owner
 *
 * Objectif : Vérifier que le owner peut modifier les prix de livraison
 * sans erreur "duplicate key value violates unique constraint".
 *
 * Scénarios :
 *   1. Page livraison se charge avec les 58 zones
 *   2. Modifier le prix domicile de Blida → sauvegarder sans erreur
 *   3. Modifier le prix bureau d'Alger → sauvegarder sans erreur
 *   4. Vérification DB après sauvegarde via Supabase direct
 *   5. API POST /api/owner/livraison avec id → UPDATE réussi (pas de doublon)
 */

import { test, expect, sbQuery } from "./fixtures.js";

test.describe("Dashboard — Modification prix livraison (bugfix duplicate key)", () => {

  // ── Test 1 : Page se charge ─────────────────────────────────────────────────
  test("Page Prix livraison affiche les zones configurées", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/livraison");
    await expect(authedPage.getByText("Prix livraison")).toBeVisible({ timeout: 15000 });

    // Vérifier le compteur de zones (doit afficher 58 zones)
    const counter = authedPage.locator("text=zones configurées");
    await expect(counter).toBeVisible({ timeout: 5000 });
    const counterText = await counter.textContent();
    expect(Number(counterText.match(/(\d+)/)?.[1])).toBeGreaterThanOrEqual(50);
  });

  // ── Test 2 : Modifier Blida sans erreur duplicate key ──────────────────────
  test("Modifier prix Blida — sauvegarder SANS erreur duplicate key", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/owner/livraison");
    await expect(authedPage.getByText("Prix livraison")).toBeVisible({ timeout: 15000 });

    // Filtrer sur Blida
    await authedPage.locator('input[placeholder="Rechercher une wilaya…"]').fill("blida");
    await authedPage.waitForTimeout(600);

    // Cliquer Modifier sur la première ligne Blida
    const modifierBtn = authedPage.locator("button", { hasText: "Modifier" }).first();
    await expect(modifierBtn).toBeVisible({ timeout: 5000 });
    await modifierBtn.click();

    // Changer le prix domicile à 600
    const homeInput = authedPage.locator('input[type="number"]').first();
    await expect(homeInput).toBeVisible({ timeout: 3000 });
    await homeInput.click({ clickCount: 3 });
    await homeInput.fill("600");

    // Sauvegarder
    const saveBtn = authedPage.locator("button", { hasText: "✓" }).first();
    await saveBtn.click();
    await authedPage.waitForTimeout(1500);

    // ❌ Ne doit PAS afficher l'erreur "duplicate key"
    const errorBanner = authedPage.locator("text=duplicate");
    expect(await errorBanner.count()).toBe(0);

    // ✅ Le mode édition doit être fermé (succès)
    await expect(authedPage.locator("button", { hasText: "✓" })).not.toBeVisible({ timeout: 3000 });

    // ✅ Prix affiché = 600 DA
    await expect(authedPage.locator("td", { hasText: "600 DA" }).first()).toBeVisible({ timeout: 5000 });
  });

  // ── Test 3 : Modifier Alger bureau → 300 DZD ───────────────────────────────
  test("Modifier prix bureau Alger → 300 DZD, vérifier en DB", async ({ authedPage, token }) => {
    await authedPage.goto("/dashboard/owner/livraison");
    await expect(authedPage.getByText("Prix livraison")).toBeVisible({ timeout: 15000 });

    // Filtrer sur Alger
    await authedPage.locator('input[placeholder="Rechercher une wilaya…"]').fill("alger");
    await authedPage.waitForTimeout(600);

    const modifierBtn = authedPage.locator("button", { hasText: "Modifier" }).first();
    await modifierBtn.click();

    // Modifier prix bureau (2e input) → 300
    const officeInput = authedPage.locator('input[type="number"]').nth(1);
    await expect(officeInput).toBeVisible({ timeout: 3000 });
    await officeInput.click({ clickCount: 3 });
    await officeInput.fill("300");

    const saveBtn = authedPage.locator("button", { hasText: "✓" }).first();
    await saveBtn.click();
    await authedPage.waitForTimeout(1500);

    // Pas d'erreur
    expect(await authedPage.locator("text=duplicate").count()).toBe(0);
    expect(await authedPage.locator("text=Erreur").count()).toBe(0);

    // Vérifier en DB via Supabase direct
    const rows = await sbQuery("nc_delivery_config", "wilaya_code=eq.16&select=price_office");
    expect(rows[0]?.price_office).toBe(300);
  });

  // ── Test 4 : API directe avec id → UPDATE sans doublon ─────────────────────
  test("API POST avec id → UPDATE (pas INSERT) — Blida wilaya_code=9", async ({ authedPage, token }) => {
    // Récupérer la ligne Blida via API
    const getResp = await authedPage.request.get(
      "/api/owner/livraison?wilaya_code=9",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(getResp.status()).toBe(200);
    const { rows } = await getResp.json();
    expect(rows.length).toBeGreaterThan(0);

    const row = rows[0];
    expect(row.id).toBeTruthy();

    const newHome   = 600;
    const newOffice = 400;

    // POST avec id existant → doit UPDATE, jamais INSERT
    const postResp = await authedPage.request.post("/api/owner/livraison", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: JSON.stringify({
        id:           row.id,
        wilaya_code:  row.wilaya_code,
        wilaya_name:  row.wilaya_name,
        commune_name: row.commune_name,
        price_home:   newHome,
        price_office: newOffice,
        is_active:    row.is_active,
      }),
    });

    expect(postResp.status()).toBe(200);
    const result = await postResp.json();
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined(); // Pas d'erreur "duplicate key"

    // Vérifier en DB que les valeurs sont bien mises à jour
    const dbRows = await sbQuery("nc_delivery_config", `id=eq.${row.id}&select=price_home,price_office`);
    expect(dbRows[0]?.price_home).toBe(newHome);
    expect(dbRows[0]?.price_office).toBe(newOffice);
  });

  // ── Test 5 : POST sans id → UPSERT (nouvelle zone) sans doublon ─────────────
  test("API POST sans id sur zone existante → UPSERT ne crée pas de doublon", async ({ authedPage, token }) => {
    // Récupérer la ligne actuelle de Constantine (wilaya 25)
    const rows = await sbQuery("nc_delivery_config", "wilaya_code=eq.25&select=id,price_home,price_office");
    const initialCount = rows.length;
    expect(initialCount).toBe(1);

    // POST sans id (simule une "nouvelle" zone qui existe déjà)
    const postResp = await authedPage.request.post("/api/owner/livraison", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: JSON.stringify({
        wilaya_code:  25,
        wilaya_name:  "Constantine",
        commune_name: "",
        price_home:   750,
        price_office: 450,
        is_active:    true,
      }),
    });

    expect(postResp.status()).toBe(200);
    const result = await postResp.json();
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();

    // Vérifier qu'il n'y a toujours QU'UNE seule ligne pour cette wilaya
    const rowsAfter = await sbQuery("nc_delivery_config", "wilaya_code=eq.25");
    expect(rowsAfter.length).toBe(initialCount); // Pas de doublon créé
  });
});
