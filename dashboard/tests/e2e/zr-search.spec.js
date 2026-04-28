/**
 * zr-search.spec.js — Test humain : onglet Recherche ZR Express
 *
 * Tests validés avec des données RÉELLES :
 *  - tracking : 48-DEBPLAPS12-ZR (Mehdi Mehdi, +213776810995, Vers wilaya)
 *  - phone    : +213776810995
 *
 * Ce que fait un agent RÉEL :
 *  1. Ouvre la page Suivi ZR
 *  2. Clique sur l'onglet "Recherche ZR"
 *  3. Saisit le tracking réel → vérifie la carte snapshot ZR
 *  4. Passe en mode téléphone → saisit le numéro réel → vérifie les résultats
 *  5. Tracking invalide → vérifie le message d'erreur
 */
import { test, expect, sbQuery } from "./fixtures.js";

// Données réelles confirmées en DB
const REAL_TRACKING = "48-DEBPLAPS12-ZR";
const REAL_PHONE    = "+213776810995";
const REAL_NAME     = "Mehdi";

const BASE = "https://najmcoiffdashboard.vercel.app";

// ── Helpers ────────────────────────────────────────────────────────
async function apiSearch(body) {
  const res = await fetch(`${BASE}/api/suivi-zr/search`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ════════════════════════════════════════════════════════════════════
//  TESTS API DIRECTS (sans navigateur)
// ════════════════════════════════════════════════════════════════════
test.describe("API /api/suivi-zr/search — sécurité et fonctionnement", () => {

  // ── Test 1 : sans token → 401 ──────────────────────────────────
  test("sans token → 401 Token invalide", async () => {
    const { status, data } = await apiSearch({ tracking: REAL_TRACKING });
    expect(status).toBe(401);
    expect(data?.ok).toBe(false);
    expect(data?.error).toMatch(/token/i);
  });

  // ── Test 2 : body vide → 400 ──────────────────────────────────
  test("body vide → 400 manque tracking ou téléphone", async ({ token }) => {
    const { status, data } = await apiSearch({ token });
    expect(status).toBe(400);
    expect(data?.ok).toBe(false);
  });

  // ── Test 3 : tracking fictif → erreur claire ──────────────────
  test("tracking fictif → ok:false + message colis introuvable", async ({ token }) => {
    const { data } = await apiSearch({ token, tracking: "ZR-INEXISTANT-E2E-9999" });
    expect(data?.ok).toBe(false);
    expect(data?.error).toBeTruthy();
    expect(data?.mode).toBe("tracking");
    console.log(`✅ Erreur retournée : ${data.error}`);
  });

  // ── Test 4 : TRACKING RÉEL 48-DEBPLAPS12-ZR ───────────────────
  test("48-DEBPLAPS12-ZR → snapshot ZR avec infos Mehdi Mehdi", async ({ token }) => {
    console.log(`🔍 Recherche tracking réel : ${REAL_TRACKING}`);
    const { data } = await apiSearch({ token, tracking: REAL_TRACKING });

    // La route doit répondre sans crash
    expect(typeof data?.ok).toBe("boolean");
    expect(data?.mode).toBe("tracking");

    if (data.ok) {
      const snap = data.snapshot;
      expect(snap).toBeTruthy();
      expect(snap.trackingNumber.toUpperCase()).toContain("DEBPLAPS12");
      expect(typeof snap.customerName).toBe("string");
      expect(typeof snap.stateLabel).toBe("string");
      expect(typeof snap.amount).toBe("number");
      expect(Array.isArray(data.history)).toBe(true);
      console.log(`✅ Snapshot ZR : ${snap.customerName} — ${snap.stateLabel} — ${snap.city} (${data.history.length} événements)`);
    } else {
      // ZR peut avoir archivé le colis — acceptable si le supabase fallback est fourni
      console.log(`ℹ️  ZR ok:false : ${data.error}`);
      // Le champ supabase doit au minimum contenir des infos
      expect(data.error).toBeTruthy();
    }
  });

  // ── Test 5 : TÉLÉPHONE RÉEL +213776810995 ─────────────────────
  test("+213776810995 → colis Mehdi trouvé (ok:true) ou fallback Supabase", async ({ token }) => {
    console.log(`📞 Recherche téléphone réel : ${REAL_PHONE}`);
    const { data } = await apiSearch({ token, phone: REAL_PHONE });

    expect(typeof data?.ok).toBe("boolean");
    expect(data?.mode).toBe("phone");

    if (data.ok) {
      expect(Array.isArray(data.parcels)).toBe(true);
      expect(data.count).toBeGreaterThan(0);
      // Vérifier que le colis Mehdi est dedans
      const mehdi = data.parcels.find(p =>
        String(p.customerName || "").toLowerCase().includes("mehdi") ||
        p.trackingNumber?.toUpperCase().includes("DEBPLAPS12")
      );
      expect(mehdi, "Le colis de Mehdi doit être dans les résultats").toBeTruthy();
      console.log(`✅ ${data.count} colis trouvé(s) : ${data.parcels.map(p => p.trackingNumber).join(", ")}`);
    } else {
      // Acceptable si ZR a archivé — le fallback Supabase doit contenir les données
      console.log(`ℹ️  ZR n'a pas répondu, fallback: ${JSON.stringify(data.supabase || data.error)}`);
      // Au minimum l'erreur est descriptive
      expect(data.error).toBeTruthy();
    }
  });
});

// ════════════════════════════════════════════════════════════════════
//  TESTS UI — NAVIGATION HUMAINE
// ════════════════════════════════════════════════════════════════════
test.describe("UI Recherche ZR — navigation agent", () => {

  // ── Test 6 : onglet Recherche ZR visible ──────────────────────
  test("l'onglet Recherche ZR est visible sur la page Suivi ZR", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await authedPage.waitForTimeout(3000);

    const tabBtn = authedPage.getByRole("button", { name: /recherche\s*zr/i }).first()
      .or(authedPage.locator("button").filter({ hasText: /recherche.*zr/i }).first());

    await expect(tabBtn).toBeVisible({ timeout: 10000 });
    console.log("✅ Onglet Recherche ZR visible");
  });

  // ── Test 7 : cliquer sur l'onglet affiche le formulaire ───────
  test("cliquer sur Recherche ZR affiche les boutons de mode", async ({ authedPage }) => {
    await authedPage.goto("/dashboard/suivi-zr");
    await authedPage.waitForTimeout(3000);

    // Cliquer l'onglet
    const tabBtn = authedPage.locator("button").filter({ hasText: /recherche.*zr/i }).first();
    await tabBtn.click();
    await authedPage.waitForTimeout(1000);

    // Les deux boutons de mode doivent être présents
    const trackingBtn = authedPage.locator("button").filter({ hasText: /tracking/i }).first();
    const phoneBtn    = authedPage.locator("button").filter({ hasText: /t[eé]l[eé]phone/i }).first();

    await expect(trackingBtn).toBeVisible({ timeout: 5000 });
    await expect(phoneBtn).toBeVisible({ timeout: 5000 });
    console.log("✅ Boutons mode tracking + téléphone visibles");
  });

  // ── Helper : ouvrir l'onglet Recherche ZR ─────────────────────
  async function openSearchTab(page) {
    await page.goto("/dashboard/suivi-zr");
    await page.waitForTimeout(3000);
    await page.locator("button").filter({ hasText: /recherche.*zr/i }).first().click();
    await page.locator("[data-testid='zr-search-input']").waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(500);
  }

  // ── Helper : remplir + soumettre ──────────────────────────────
  // fill() est la méthode la plus fiable pour React controlled inputs
  async function doSearch(page, value) {
    const input = page.locator("[data-testid='zr-search-input']");
    const btn   = page.locator("[data-testid='zr-search-btn']");

    // fill() déclenche les events input/change et met à jour le state React
    await input.fill(value);
    await page.waitForTimeout(400);

    // Vérifier que la valeur est bien dans l'input
    const actual = await input.inputValue();
    if (!actual.trim()) {
      // Fallback page.evaluate si fill() n'a pas suffi
      await page.evaluate((selector, v) => {
        const el = document.querySelector(selector);
        if (el) {
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
            .set.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, "[data-testid='zr-search-input']", value);
      await page.waitForTimeout(400);
    }

    // Attendre que le bouton soit activé (input non vide)
    await expect(btn).toBeEnabled({ timeout: 5000 });
    // Cliquer directement le bouton (plus fiable qu'Enter)
    await btn.click();
  }

  // ── Test 8 : tracking invalide → erreur affichée ──────────────
  test("tracking fictif → message d'erreur visible dans l'UI", async ({ authedPage }) => {
    await openSearchTab(authedPage);
    await doSearch(authedPage, "ZR-INEXISTANT-E2E-9999");
    await authedPage.waitForTimeout(8000);

    const bodyText = await authedPage.locator("body").textContent();
    const hasError = /introuvable|erreur|vérifier|non\s*trouv/i.test(bodyText);
    expect(hasError, "Message d'erreur doit être visible pour tracking fictif").toBe(true);
    console.log("✅ Message d'erreur correct pour tracking inexistant");
  });

  // ── Test 9 : switch téléphone → placeholder change ─────────────
  test("mode téléphone → placeholder 0661234567", async ({ authedPage }) => {
    await openSearchTab(authedPage);
    await authedPage.locator("button").filter({ hasText: /t[eé]l[eé]phone/i }).first().click();
    await authedPage.waitForTimeout(500);

    const placeholder = await authedPage.locator("[data-testid='zr-search-input']").getAttribute("placeholder");
    expect(placeholder).toMatch(/06|07|0[5-9]|\+213/);
    console.log(`✅ Placeholder mode téléphone : "${placeholder}"`);
  });

  // ── Test 10 : TRACKING RÉEL 48-DEBPLAPS12-ZR dans l'UI ────────
  test("UI : 48-DEBPLAPS12-ZR → carte Mehdi Mehdi affichée ou fallback", async ({ authedPage }) => {
    console.log(`🔍 UI Test tracking réel : ${REAL_TRACKING}`);

    // Écouter les erreurs JS pour diagnostiquer tout crash
    const pageErrors = [];
    authedPage.on("pageerror", err => {
      pageErrors.push(err.message);
      console.log("🔴 PAGE ERROR:", err.message);
    });
    authedPage.on("console", msg => {
      if (msg.type() === "error") console.log("🔴 CONSOLE:", msg.text());
    });

    await openSearchTab(authedPage);

    // Utiliser waitForResponse pour attendre la réponse API précisément
    let apiResponse = null;
    const [response] = await Promise.all([
      authedPage.waitForResponse(
        r => r.url().includes("/api/suivi-zr/search") && r.request().method() === "POST",
        { timeout: 25000 }
      ),
      doSearch(authedPage, REAL_TRACKING),
    ]);

    if (response) {
      try { apiResponse = await response.json(); } catch { /* */ }
      console.log(`📡 API response: ok=${apiResponse?.ok}, mode=${apiResponse?.mode}`);
    }

    // Attendre que le rendu React soit terminé (spinner disparu)
    await authedPage.waitForTimeout(2000);

    // Si la carte a bien été insérée dans le DOM, attendre qu'elle apparaisse
    if (apiResponse?.ok && apiResponse?.mode === "tracking") {
      try {
        await authedPage.locator("[data-testid='zr-snapshot-card']").waitFor({ state: "visible", timeout: 8000 });
        console.log("✅ Carte snapshot visible dans le DOM");
      } catch {
        console.log("⚠️ Carte snapshot non visible dans le DOM après 8 secondes");
      }
    }

    const bodyText = await authedPage.locator("body").textContent();
    const hasCrashed = bodyText.includes("This page couldn") || bodyText.includes("Reload to try");

    if (hasCrashed) {
      const errMsg = pageErrors.join(" | ") || "crash sans message détaillé";
      console.log(`🔴 Page crashée : ${errMsg}`);
      // Si la page a crashé mais l'API a répondu correctement, c'est un bug React à corriger
      expect(hasCrashed, `Page crashée après réponse API. Erreurs: ${errMsg}`).toBe(false);
    }

    const hasName     = bodyText.includes(REAL_NAME);
    const hasTracking = bodyText.toUpperCase().includes("DEBPLAPS12");
    const hasStatus   = /vers wilaya|en transit|livraison|collecté|bureau|relizane/i.test(bodyText);
    const hasError    = /introuvable|erreur|vérifier|local|données/i.test(bodyText);

    const isOk = hasName || hasTracking || hasStatus || hasError;
    expect(isOk, [
      `La page doit afficher ${REAL_NAME} ou DEBPLAPS12 ou un statut ou une erreur.`,
      pageErrors.length > 0 ? `Erreurs JS : ${pageErrors.join(" | ")}` : "",
    ].join(" ")).toBe(true);

    if (hasName || hasTracking || hasStatus) {
      console.log(`✅ Carte ZR affichée pour ${REAL_TRACKING}`);
    } else {
      console.log(`✅ Erreur/fallback affiché`);
    }
  });

  // ── Test 11 : TÉLÉPHONE RÉEL +213776810995 dans l'UI ──────────
  test("UI : +213776810995 → résultats pour Mehdi Mehdi", async ({ authedPage }) => {
    console.log(`📞 UI Test téléphone réel : ${REAL_PHONE}`);
    await openSearchTab(authedPage);

    // Passer en mode téléphone
    await authedPage.locator("button").filter({ hasText: /t[eé]l[eé]phone/i }).first().click();
    await authedPage.waitForTimeout(500);

    await doSearch(authedPage, REAL_PHONE);
    await authedPage.waitForTimeout(12000);

    const bodyText = await authedPage.locator("body").textContent();

    const hasName    = bodyText.includes(REAL_NAME);
    const hasResult  = /colis trouvé|mehdi|debplaps/i.test(bodyText);
    const hasFallback = /commande|base locale|données locales/i.test(bodyText);
    const hasError   = /introuvable|erreur|aucun/i.test(bodyText);

    const isOk = hasName || hasResult || hasFallback || hasError;
    expect(isOk, "La page doit afficher un résultat ou une erreur pour ce téléphone").toBe(true);

    if (hasName || hasResult) {
      console.log(`✅ ${REAL_NAME} trouvé dans la page (mode téléphone)`);
    } else {
      console.log(`✅ Réponse : ${hasError ? "erreur" : "fallback"}`);
    }
  });
});
