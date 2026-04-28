/**
 * WA-01 à WA-10 — Tests Playwright humain WATI Dashboard
 * Vérifie point par point tous les correctifs apportés :
 *   - Segments affichent vrais totaux (13 449 dormant_90, pas 237)
 *   - KPIs séparés Meta / WhatsApp dans la barre du haut
 *   - 0 campagne vide affichée (total_sent=0 + draft filtrés)
 *   - Stats envoyés/livrés/lus/réponses/échoués (6 métriques)
 *   - Revenue + coût par campagne
 *   - Sync statuts WATI via bouton
 *   - API globalKpis + segments.total réels
 */

import { test, expect, sbQuery } from "./fixtures.js";
import fs from "fs";

const BASE = process.env.BASE_URL || "https://najmcoiffdashboard.vercel.app";

function getToken() {
  try {
    return JSON.parse(fs.readFileSync(".playwright-auth/session.json", "utf-8")).token || "";
  } catch { return ""; }
}

// ── WA-01 : La page marketing est accessible ──────────────────────────────
test("WA-01 · Page War Room Marketing accessible", async ({ authedPage: page }) => {
  await page.goto(`${BASE}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  await expect(page.locator("h1")).toContainText("War Room Marketing");
  console.log("✅ WA-01: Page War Room accessible");
});

// ── WA-02 : Barre du haut séparée Meta / WhatsApp ────────────────────────
test("WA-02 · Barre du haut : sections Meta + WhatsApp séparées", async ({ authedPage: page }) => {
  await page.goto(`${BASE}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  // Chercher les labels spécifiques à chaque section
  await expect(page.getByText("Dépensé Meta", { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Msgs envoyés", { exact: false })).toBeVisible();
  await expect(page.getByText("Msgs échoués", { exact: false })).toBeVisible();
  await expect(page.getByText("Coût total WA", { exact: false })).toBeVisible();
  await expect(page.getByText("Revenus attribués", { exact: false })).toBeVisible();

  console.log("✅ WA-02: Barre du haut avec sections Meta + WhatsApp séparées");
});

// ── WA-03 : Onglet WhatsApp accessible + contenu visible ─────────────────
test("WA-03 · Onglet WhatsApp Campagnes charge correctement", async ({ authedPage: page }) => {
  await page.goto(`${BASE}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const waTab = page.locator("button").filter({ hasText: /WhatsApp Campagnes/i }).first();
  await expect(waTab).toBeVisible({ timeout: 8000 });
  await waTab.click();
  await page.waitForTimeout(3000);

  await expect(page.getByText("WhatsApp Campaign Manager")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Segments de contacts", { exact: false })).toBeVisible();
  console.log("✅ WA-03: Onglet WhatsApp chargé + Campaign Manager visible");
});

// ── WA-04 : API retourne vrais segments (dormant_90 > 1000) ──────────────
test("WA-04 · API : segments totaux réels (dormant_90 > 1000)", async ({ request }) => {
  const token = getToken();
  const resp = await request.get(`${BASE}/api/marketing/whatsapp-campaigns?token=${token}`);
  expect(resp.status()).toBe(200);

  const data = await resp.json();
  expect(data).toHaveProperty("segments");
  expect(data).toHaveProperty("globalKpis");
  expect(data).toHaveProperty("campaigns");
  expect(data).toHaveProperty("msgStats");

  // dormant_90 doit avoir BEAUCOUP plus que 237 contacts
  const d90 = data.segments.dormant_90;
  expect(d90).toBeDefined();
  expect(d90.total).toBeGreaterThan(1000);
  console.log(`✅ WA-04: dormant_90 total=${d90.total} available=${d90.available}`);

  // vip aussi
  const vip = data.segments.vip;
  if (vip) {
    expect(vip.total).toBeGreaterThan(0);
    console.log(`   vip: total=${vip.total}, available=${vip.available}`);
  }
});

// ── WA-05 : UI affiche vrais totaux segments (grands nombres) ─────────────
test("WA-05 · UI segments : totaux affichés > 1000 contacts", async ({ authedPage: page }) => {
  await page.goto(`${BASE}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const waTab = page.locator("button").filter({ hasText: /WhatsApp Campagnes/i }).first();
  await waTab.click();
  await page.waitForTimeout(4000);

  // Chercher le label "Inactifs 90j+" dans les cartes segments (premier div, pas l'option select)
  await expect(page.locator("div.text-xs").filter({ hasText: "Inactifs 90j+" }).first()).toBeVisible({ timeout: 10000 });

  // Vérifier qu'un nombre > 1000 apparaît dans la page
  const pageText = await page.locator("body").innerText();
  const allNums = pageText.match(/\b\d[\d\s]*\d\b/g) || [];
  const bigNums = allNums.map(n => parseInt(n.replace(/\s/g, ""))).filter(n => n > 1000);
  expect(bigNums.length).toBeGreaterThan(0);
  console.log(`✅ WA-05: Grands nombres trouvés dans l'UI: ${bigNums.slice(0, 5).join(", ")}`);
});

// ── WA-06 : 0 campagne vide (total_sent=0 + draft) retournée par API ──────
test("WA-06 · API : 0 campagne vide (total_sent=0 + draft) affichée", async ({ request }) => {
  const token = getToken();
  const resp = await request.get(`${BASE}/api/marketing/whatsapp-campaigns?token=${token}`);
  const data = await resp.json();

  // Aucune campagne avec total_sent=0 ET status=draft
  const emptyCamps = (data.campaigns || []).filter(c => c.total_sent === 0 && c.status === "draft");
  expect(emptyCamps.length).toBe(0);
  console.log(`✅ WA-06: ${data.campaigns?.length || 0} campagnes retournées, 0 vide`);
});

// ── WA-07 : 6 métriques WhatsApp 30j visibles dans l'UI ─────────────────
test("WA-07 · UI : 6 métriques (Envoyés/Livrés/Lus/Réponses/Convertis/Échoués)", async ({ authedPage: page }) => {
  await page.goto(`${BASE}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const waTab = page.locator("button").filter({ hasText: /WhatsApp Campagnes/i }).first();
  await waTab.click();
  await page.waitForTimeout(4000);

  await expect(page.getByText("Statistiques WhatsApp", { exact: false })).toBeVisible({ timeout: 10000 });

  for (const metric of ["Envoyés", "Livrés", "Lus", "Réponses", "Convertis", "Échoués"]) {
    await expect(page.getByText(metric, { exact: false }).first()).toBeVisible({ timeout: 5000 });
    console.log(`   ✅ ${metric} visible`);
  }
  console.log("✅ WA-07: 6 métriques WhatsApp affichées");
});

// ── WA-08 : Cards campagnes ont failed, coût, delivered, lus ─────────────
test("WA-08 · UI campagnes : colonnes Échoués + Livrés + Coût présentes", async ({ authedPage: page }) => {
  await page.goto(`${BASE}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const waTab = page.locator("button").filter({ hasText: /WhatsApp Campagnes/i }).first();
  await waTab.click();
  await page.waitForTimeout(4000);

  // Vérifier l'historique des campagnes
  await expect(page.getByText("Historique des campagnes", { exact: false })).toBeVisible({ timeout: 10000 });

  // Si des campagnes sont affichées, vérifier les colonnes
  const token = getToken();
  const resp = await page.request.get(`${BASE}/api/marketing/whatsapp-campaigns?token=${token}`);
  const apiData = await resp.json();
  const visibleCamps = (apiData.campaigns || []).filter(c => c.total_sent > 0);

  if (visibleCamps.length > 0) {
    // La card doit contenir "Échoués" et "Coût"
    await expect(page.getByText("Échoués").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Coût").first()).toBeVisible({ timeout: 5000 });
    console.log(`✅ WA-08: ${visibleCamps.length} campagnes avec statistiques complètes`);
  } else {
    console.log("⚠️  WA-08: Aucune campagne avec envois — test de structure skippé");
  }
});

// ── WA-09 : API msgStats contient "failed" ───────────────────────────────
test("WA-09 · API msgStats inclut champ failed (35 échoués WATI)", async ({ request }) => {
  const token = getToken();
  const resp = await request.get(`${BASE}/api/marketing/whatsapp-campaigns?token=${token}`);
  const data = await resp.json();

  expect(data.msgStats).toHaveProperty("failed");
  expect(typeof data.msgStats.failed).toBe("number");
  expect(data.msgStats).toHaveProperty("sent");
  expect(data.msgStats).toHaveProperty("delivered");
  expect(data.msgStats).toHaveProperty("read");
  expect(data.msgStats).toHaveProperty("replied");
  expect(data.msgStats).toHaveProperty("converted");

  console.log(`✅ WA-09: msgStats = sent:${data.msgStats.sent} delivered:${data.msgStats.delivered} read:${data.msgStats.read} failed:${data.msgStats.failed}`);
});

// ── WA-10 : globalKpis correct ────────────────────────────────────────────
test("WA-10 · API globalKpis (total_sent ≥ 221, total_cost ≥ 3200 DA)", async ({ request }) => {
  const token = getToken();
  const resp = await request.get(`${BASE}/api/marketing/whatsapp-campaigns?token=${token}`);
  const data = await resp.json();

  expect(data.globalKpis).toBeDefined();
  expect(data.globalKpis.total_sent).toBeGreaterThanOrEqual(221);
  expect(data.globalKpis.total_cost).toBeGreaterThanOrEqual(3200); // 221 × 16 = 3536 DA minimum

  console.log(`✅ WA-10: globalKpis = sent:${data.globalKpis.total_sent} failed:${data.globalKpis.total_failed} cost:${data.globalKpis.total_cost}DA revenue:${data.globalKpis.total_revenue}DA`);
});

// ── WA-11 : API retourne wati_connected (boolean) ─────────────────────────
test("WA-11 · API retourne wati_connected (diagnostic WATI)", async ({ request }) => {
  const token = getToken();
  const resp = await request.get(`${BASE}/api/marketing/whatsapp-campaigns?token=${token}`);
  const data = await resp.json();

  expect(data).toHaveProperty("wati_connected");
  expect(typeof data.wati_connected).toBe("boolean");

  // Si non connecté, l'erreur doit être expliquée
  if (!data.wati_connected) {
    expect(data).toHaveProperty("wati_error");
    expect(typeof data.wati_error).toBe("string");
    console.log(`✅ WA-11: wati_connected=false — erreur rapportée: "${data.wati_error}"`);
  } else {
    console.log("✅ WA-11: wati_connected=true — WATI API opérationnelle");
  }
});

// ── WA-12 : Sync WATI retourne wati_connected (ok ou erreur explicite) ────
test("WA-12 · POST wati-sync-status retourne wati_connected explicite", async ({ request }) => {
  test.setTimeout(90000); // 90s pour laisser la sync se terminer
  const token = getToken();
  // wati-sync-status utilise ownerGuard de ai-helpers.js → ?token= ou Authorization: Bearer
  const resp = await request.post(`${BASE}/api/marketing/wati-sync-status?token=${token}`, {
    headers: { "Content-Type": "application/json" },
    timeout: 80000,
  });

  // La route retourne 200 même en cas d'erreur (avec wati_connected: false)
  // On accepte 200 ET 500 (le 500 ne doit plus arriver mais on le capte pour debug)
  const statusCode = resp.status();
  const data = await resp.json().catch(() => ({}));

  if (statusCode === 500) {
    console.log(`⚠️  WA-12: HTTP 500 — erreur interne: ${JSON.stringify(data)}`);
  }
  expect(statusCode).toBe(200);
  expect(data).toHaveProperty("wati_connected");
  expect(data).toHaveProperty("checked");

  if (!data.wati_connected) {
    expect(data).toHaveProperty("wati_error");
    expect(data.checked).toBe(0);
    console.log(`✅ WA-12: Sync WATI désactivé — wati_error="${data.wati_error}" · fix_guide="${data.fix_guide || 'absent'}"`);
  } else {
    console.log(`✅ WA-12: Sync WATI OK — checked=${data.checked} updated=${data.updated} delivered=${data.delivered} read=${data.read} failed=${data.failed}`);
  }
});

// ── WA-13 : UI affiche alerte WATI si token invalide ─────────────────────
test("WA-13 · UI : alerte WATI visible quand token expiré/invalide", async ({ authedPage: page, request }) => {
  // Vérifier d'abord ce que l'API répond
  const token = getToken();
  const apiResp = await request.get(`${BASE}/api/marketing/whatsapp-campaigns?token=${token}`);
  const apiData = await apiResp.json();

  await page.goto(`${BASE}/dashboard/owner/marketing`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const waTab = page.locator("button").filter({ hasText: /WhatsApp Campagnes/i }).first();
  await waTab.click();
  await page.waitForTimeout(4000);

  if (!apiData.wati_connected) {
    // Le badge WATI doit être rouge/orange
    const badgeEl = page.locator("span").filter({ hasText: /WATI.*(expiré|Erreur)/i }).first();
    await expect(badgeEl).toBeVisible({ timeout: 8000 });
    // L'alerte de token invalide doit être visible
    await expect(page.getByText("Token WATI invalide", { exact: false })).toBeVisible({ timeout: 5000 });
    console.log(`✅ WA-13: Alerte WATI visible — wati_error="${apiData.wati_error}"`);
  } else {
    // Badge vert doit être visible
    const greenBadge = page.locator("span").filter({ hasText: /WATI OK/i }).first();
    await expect(greenBadge).toBeVisible({ timeout: 8000 });
    console.log("✅ WA-13: Badge WATI vert visible — connexion active");
  }
});
