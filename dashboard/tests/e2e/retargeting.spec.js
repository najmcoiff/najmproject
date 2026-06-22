/**
 * retargeting.spec.js — Test humain : page Retargeting & Codes promo
 *
 * Vérifie que la nouvelle page de suivi (source de vérité unique) affiche bien
 * les stats par code promo, alignées sur l'API /api/marketing/retargeting-stats,
 * et que le bandeau "relances auto coupées" est présent.
 */
import { test, expect } from "./fixtures.js";

const BASE = "https://najmcoiffdashboard.vercel.app";

test.describe("Retargeting & Codes promo — suivi dashboard", () => {
  test("l'API renvoie des stats cohérentes par code promo", async ({ token }) => {
    const r = await fetch(`${BASE}/api/marketing/retargeting-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);

    // Relances auto coupées (décision owner)
    expect(d.sending_enabled).toBe(false);

    // VIPGOLDEN doit exister, être une campagne, avoir des ventes et une conversion
    const vip = d.codes.find((c) => c.code === "VIPGOLDEN");
    expect(vip, "VIPGOLDEN doit être présent").toBeTruthy();
    expect(vip.is_campaign).toBe(true);
    expect(vip.orders_total).toBeGreaterThan(0);
    expect(vip.sent_unique).toBeGreaterThan(0);
    // Cohérence interne : confirmées + annulées + en attente = total
    expect(vip.confirmed + vip.cancelled + vip.pending).toBe(vip.orders_total);

    // Audience réelle (calculée en direct, pas la table périmée)
    expect(d.audience).toBeTruthy();
    expect(d.audience.total_customers).toBeGreaterThan(1000);
    expect(d.audience.vip_eligible).toBeGreaterThanOrEqual(0);
    expect(d.audience.anciens_eligible).toBeGreaterThan(1000); // gros réservoir de win-back
    console.log(`✅ API OK — VIPGOLDEN: ${vip.buyers_unique} acheteurs / ${vip.sent_unique} contactés, profit ${vip.net_profit_est} DA`);
    console.log(`   Audience: ${d.audience.total_customers} clients, ${d.audience.vip_eligible} VIP éligibles, ${d.audience.anciens_eligible} anciens à réactiver`);
  });

  test("la page affiche le titre, le bandeau coupé et la carte VIPGOLDEN", async ({ authedPage, token }) => {
    // Référence API pour comparer à l'affichage
    const d = await (await fetch(`${BASE}/api/marketing/retargeting-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const vip = d.codes.find((c) => c.code === "VIPGOLDEN");

    await authedPage.goto("/dashboard/owner/retargeting");
    await authedPage.getByText("Retargeting & Codes promo").first().waitFor({ state: "visible", timeout: 20000 });
    await authedPage.waitForTimeout(2500);

    const body = await authedPage.locator("body").textContent();

    // Bandeau relances coupées
    expect(/COUPÉES|coup[ée]es/i.test(body), "bandeau relances coupées visible").toBe(true);

    // La carte VIPGOLDEN et son nombre d'acheteurs uniques
    expect(body.includes("VIPGOLDEN"), "carte VIPGOLDEN visible").toBe(true);
    expect(body.includes("REACT30"), "carte REACT30 visible").toBe(true);

    // Le nombre de contactés VIPGOLDEN doit apparaître quelque part
    expect(body.includes(String(vip.sent_unique)), `contactés VIPGOLDEN (${vip.sent_unique}) affichés`).toBe(true);

    // Segments dormants affichés
    expect(/Dormant 90j/i.test(body), "segment dormant 90j affiché").toBe(true);
    console.log("✅ Page Retargeting rendue correctement");
  });
});
