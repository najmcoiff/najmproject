/**
 * t118b-variants-load.spec.js — Diagnostic de la liste variants chargée
 *
 * Mesure combien de variants la page POS reçoit réellement (vs 4060 en DB),
 * et vérifie si Daxter vert (variant_id 49000214659368) y figure.
 *
 * Le helper _sbAll() pagine par 1000. Avec 4060 lignes, on attend 4 pages.
 * Si on observe ~1000 côté front, la pagination ne suit pas.
 */
import { test, expect } from "./fixtures.js";

test("Compter les variants chargés côté POS et chercher Daxter vert", async ({ authedPage }) => {
  // Intercepter les appels Supabase pour compter ce qui revient
  const supabasePayloads = [];
  authedPage.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/rest/v1/nc_variants") && url.includes("synced_at.desc")) {
      try {
        const body = await res.json();
        if (Array.isArray(body)) {
          supabasePayloads.push({
            range: res.request().headers().range || "—",
            size:  body.length,
            firstId: body[0]?.variant_id,
            lastId:  body[body.length-1]?.variant_id,
            hasDaxterVert: body.some(v => String(v.variant_id) === "49000214659368"),
          });
        }
      } catch {}
    }
  });

  await authedPage.goto("/dashboard/pos");
  await expect(authedPage.locator('[data-testid="pos-search"]')).toBeVisible({ timeout: 30000 });

  // Attendre la fin du chargement
  await authedPage.waitForFunction(() => /\d+ articles/.test(document.body.textContent || ""),
    { timeout: 30000, polling: 600 }).catch(() => {});
  await authedPage.waitForTimeout(2000); // laisser le temps à toutes les pages d'arriver

  // Compter ce que le composant POS a réellement chargé
  const stats = await authedPage.evaluate(() => {
    // Pas d'accès direct au state React, mais on peut lire le texte affiché
    const txt = document.body.textContent || "";
    const match = txt.match(/(\d+) articles/);
    return { displayedTotal: match ? Number(match[1]) : null };
  });

  console.log(`[T118B] Pages Supabase reçues : ${supabasePayloads.length}`);
  supabasePayloads.forEach((p, i) => {
    console.log(`         page ${i+1} : range="${p.range}" size=${p.size} firstId=${p.firstId} hasDaxterVert=${p.hasDaxterVert}`);
  });
  const totalReceived = supabasePayloads.reduce((s, p) => s + p.size, 0);
  const daxterFound  = supabasePayloads.some(p => p.hasDaxterVert);
  console.log(`[T118B] Total reçu via REST : ${totalReceived}`);
  console.log(`[T118B] Total affiché "X articles" : ${stats.displayedTotal}`);
  console.log(`[T118B] Daxter vert présent dans le payload : ${daxterFound ? "OUI" : "NON"}`);

  // Test recherche directe sur "daxter vert"
  await authedPage.locator('[data-testid="pos-search"]').fill("daxter");
  await authedPage.waitForTimeout(500);
  const tiles = authedPage.locator('[data-testid="pos-result-item"]');
  const tileCount = await tiles.count();
  const titles = [];
  for (let i = 0; i < tileCount; i++) {
    titles.push((await tiles.nth(i).textContent() || "").replace(/\s+/g," ").slice(0, 80));
  }
  console.log(`[T118B] "daxter" → ${tileCount} résultats POS:`);
  titles.forEach(t => console.log(`         ${t}`));

  const vertVisible = titles.some(t => /Daxter vert/i.test(t));
  console.log(`[T118B] "Daxter vert" visible dans résultats : ${vertVisible ? "OUI" : "NON"}`);
});
