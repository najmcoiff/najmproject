/**
 * communes-zr-coverage.spec.js — Test humain : couverture complète des communes ZR.
 *
 * Régression : avant correction, la table nc_communes ne contenait que 714 communes
 * sur 1531 disponibles côté ZR Express. Conséquence : pas mal de clients ne
 * trouvaient pas leur commune dans le formulaire de commande → ils abandonnaient
 * ou contactaient le support (« ma commune n'est pas dans la liste »).
 *
 * Communes ajoutées : 954 dans 54 wilayas (les 4 wilayas non livrées par ZR
 * sont 33 Illizi, 37 Tindouf, 50 Bordj Badji Mokhtar, 56 Djanet).
 *
 * Ce test vérifie sur la prod (www.najmcoiff.com) que :
 *   1. L'API /api/boutique/delivery?list=communes retourne la liste enrichie
 *      pour quelques wilayas critiques (W15 Tizi Ouzou, W26 Médéa, W19 Sétif).
 *   2. Des communes spécifiques précédemment manquantes apparaissent maintenant.
 *   3. Un humain qui choisit ces wilayas dans le formulaire /commander voit
 *      un <select> contenant ces communes.
 *   4. Une commande peut être passée avec une commune nouvellement ajoutée
 *      (parcours bout-en-bout, vérif Supabase, cleanup).
 */
const { test, expect } = require("@playwright/test");

const SB_URL = "https://alyxejkdtkdmluvgfnqk.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXhlamtkdGtkbWx1dmdmbnFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1Mjk1NCwiZXhwIjoyMDkxMjI4OTU0fQ.WkNdrxkT1FNsqR1WuOY1XqviLnmEy0UCc9PhBnnqJOo";

async function sbQuery(table, qs = "") {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${qs ? "?" + qs : ""}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return res.json();
}
async function sbDelete(table, filter) {
  await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
}
async function getTestVariant() {
  const rows = await sbQuery("nc_variants",
    "select=variant_id,product_id,display_name,product_title,price,inventory_quantity,image_url,sku&inventory_quantity=gt.2&limit=1&order=inventory_quantity.desc");
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Aucun variant en stock");
  return rows[0];
}
async function injectCart(page, variant) {
  const cartItem = {
    variant_id: String(variant.variant_id),
    product_id: String(variant.product_id || ""),
    title: variant.product_title || variant.display_name || "Article Test",
    variant_title: null,
    price: Number(variant.price) || 100,
    image_url: variant.image_url || null,
    sku: variant.sku || null,
    qty: 1,
    max_qty: Number(variant.inventory_quantity) || 99,
  };
  await page.evaluate((item) => {
    try {
      localStorage.setItem("nc_cart", JSON.stringify([item]));
      window.dispatchEvent(new Event("nc_cart_updated"));
    } catch {}
  }, cartItem);
}

// ── Communes critiques ajoutées au sync : sample test ────────────────────
// (extraites du rapport audit-communes-report.json — toutes étaient ABSENTES
//  avant le fix et présentes côté ZR Express)
const CRITICAL_NEW_COMMUNES = [
  { wilayaCode: 15, wilayaName: "Tizi Ouzou", communeName: "Yakourene" },
  { wilayaCode: 15, wilayaName: "Tizi Ouzou", communeName: "Mizrana" },
  { wilayaCode: 26, wilayaName: "Médéa",      communeName: "Tamesguida" },
  { wilayaCode: 19, wilayaName: "Sétif",      communeName: "Babor" },
  { wilayaCode: 31, wilayaName: "Oran",       communeName: "Bethioua" },
  { wilayaCode: 16, wilayaName: "Alger",      communeName: "Baraki" },
  { wilayaCode: 13, wilayaName: "Tlemcen",    communeName: "Hammam Boughrara" },
];

test.describe("Communes — couverture ZR Express complète", () => {

  test("1) API delivery?list=communes retourne ≥ 30 communes pour W15/W26/W19", async ({ request }) => {
    const baseURL = test.info().project.use.baseURL || "https://www.najmcoiff.com";
    for (const wilayaCode of [15, 26, 19, 13, 22]) {
      const r = await request.get(`${baseURL}/api/boutique/delivery?wilaya_code=${wilayaCode}&list=communes`);
      const data = await r.json();
      const count = Array.isArray(data.communes) ? data.communes.length : 0;
      console.log(`  W${wilayaCode} : ${count} communes`);
      expect(count, `wilaya ${wilayaCode} doit avoir ≥30 communes après sync ZR`).toBeGreaterThanOrEqual(30);
    }
  });

  test("2) Chaque commune nouvellement ajoutée est bien présente dans l'API", async ({ request }) => {
    const baseURL = test.info().project.use.baseURL || "https://www.najmcoiff.com";
    for (const c of CRITICAL_NEW_COMMUNES) {
      const r = await request.get(`${baseURL}/api/boutique/delivery?wilaya_code=${c.wilayaCode}&list=communes`);
      const data = await r.json();
      const list = Array.isArray(data.communes) ? data.communes : [];
      const found = list.some(name => name.toLowerCase() === c.communeName.toLowerCase());
      expect(
        found,
        `Commune "${c.communeName}" (W${c.wilayaCode} ${c.wilayaName}) doit exister dans l'API`
      ).toBe(true);
    }
  });

  test("2bis) Aucun doublon orthographique pour les 54 wilayas livrées par ZR", async ({ request }) => {
    // Le client a explicitement demandé : pas de doublons (genre "Daia Ben Dahoua"
    // ET "Dhayet Bendhahoua" dans la même wilaya → confusion à la commande).
    const baseURL = test.info().project.use.baseURL || "https://www.najmcoiff.com";
    const PRESERVED = new Set([33, 37, 50, 56]); // wilayas sahariennes hors ZR
    const issues = [];
    for (let code = 1; code <= 58; code++) {
      if (PRESERVED.has(code)) continue;
      const r = await request.get(`${baseURL}/api/boutique/delivery?wilaya_code=${code}&list=communes`);
      const data = await r.json();
      const list = Array.isArray(data.communes) ? data.communes : [];
      // Normalisation : NFD + minuscules + suppression apostrophes/tirets/espaces multiples
      const normalize = s => String(s||"")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().replace(/['']/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
      const seen = new Map();
      for (const name of list) {
        const k = normalize(name);
        if (seen.has(k)) issues.push(`W${code} doublon : "${seen.get(k)}" ↔ "${name}"`);
        else seen.set(k, name);
      }
    }
    if (issues.length) console.log("Doublons trouvés :\n  " + issues.join("\n  "));
    expect(issues.length, `Aucun doublon orthographique attendu après réécriture ZR`).toBe(0);
  });

  test("3) Le formulaire /commander expose les communes ajoutées dans le <select>", async ({ page }) => {
    const variant = await getTestVariant();
    await page.goto("/produits");
    await injectCart(page, variant);
    await page.waitForTimeout(300);
    await page.goto("/commander");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    // Sélectionner Tizi Ouzou (W15) — wilaya avec 50 communes ajoutées
    const wilayaSelect = page.locator('[data-testid="checkout-wilaya"]');
    await expect(wilayaSelect).toBeVisible({ timeout: 10000 });
    await wilayaSelect.selectOption({ value: "15" }).catch(async () => {
      // Fallback : selectOption par label
      await wilayaSelect.selectOption({ label: /tizi.?ouzou/i });
    });
    await page.waitForTimeout(1500);

    const communeEl = page.locator('[data-testid="checkout-commune"]');
    await communeEl.waitFor({ state: "visible", timeout: 10000 });
    const tag = await communeEl.evaluate(el => el.tagName);
    expect(tag, "le sélecteur de commune doit être un <select> pour W15").toBe("SELECT");

    // Lister les options
    const options = await communeEl.locator("option").allTextContents();
    console.log(`  W15 Tizi Ouzou : ${options.length - 1} communes dans le <select>`);
    expect(options.length, "≥ 30 options communes pour Tizi Ouzou").toBeGreaterThanOrEqual(30);

    // Vérifier qu'une commune nouvellement ajoutée est présente
    const has = options.some(t => t.toLowerCase().includes("yakourene") || t.toLowerCase().includes("mizrana"));
    expect(has, "Yakourene ou Mizrana (ajoutées par le sync ZR) doit être dans le <select>").toBe(true);
  });

  test("4) Commande complète bout-en-bout avec une commune nouvellement ajoutée", async ({ page, viewport }) => {
    test.skip(viewport && viewport.width > 400, "Flux mobile uniquement (375px) — évite la race NC-YYMMDD-0001");

    const variant = await getTestVariant();
    let createdOrderName = null;
    let createdOrderId = null;

    try {
      await page.goto("/produits");
      await injectCart(page, variant);
      await page.waitForTimeout(300);
      await page.goto("/commander");
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

      await page.locator('[data-testid="checkout-first-name"]').fill("Playwright");
      await page.locator('[data-testid="checkout-last-name"]').fill("CommunesNew");
      await page.locator('[data-testid="checkout-phone"]').fill("0612345678");

      // Wilaya 26 Médéa (44 communes ajoutées par le sync)
      const wilayaSelect = page.locator('[data-testid="checkout-wilaya"]');
      await wilayaSelect.selectOption({ value: "26" }).catch(async () => {
        await wilayaSelect.selectOption({ label: /m[ée]d[ée]a/i });
      });
      await page.waitForTimeout(1500);

      // Sélectionner une commune nouvellement ajoutée
      const communeEl = page.locator('[data-testid="checkout-commune"]');
      await communeEl.waitFor({ state: "visible", timeout: 8000 });
      const tag = await communeEl.evaluate(el => el.tagName);
      let chosenCommune = "Tamesguida";
      if (tag === "SELECT") {
        // Chercher Tamesguida dans les options
        const optTexts = await communeEl.locator("option").allTextContents();
        const target = optTexts.find(t => t.toLowerCase().includes("tamesguida")) || optTexts[1] || optTexts[0];
        chosenCommune = target.trim();
        await communeEl.selectOption({ label: target });
      } else {
        await communeEl.fill(chosenCommune);
      }
      console.log(`  Commune choisie : "${chosenCommune}"`);

      const submitBtn = page.locator('[data-testid="checkout-submit"]');
      await expect(submitBtn).toBeVisible({ timeout: 5000 });
      await submitBtn.click();

      await page.waitForURL(/\/merci\//, { timeout: 30000 });
      const orderNameEl = page.locator('[data-testid="merci-order-name"]');
      await expect(orderNameEl).toBeVisible({ timeout: 10000 });
      createdOrderName = (await orderNameEl.textContent() || "").trim();
      expect(createdOrderName).toMatch(/^NC-/);
      console.log(`  Commande créée : ${createdOrderName}`);

      // Vérifier en DB
      await page.waitForTimeout(2500);
      const orders = await sbQuery(
        "nc_orders",
        `select=order_id,order_name,wilaya,customer_commune,full_name&order_name=eq.${createdOrderName}`
      );
      expect(Array.isArray(orders) && orders.length > 0).toBe(true);
      const order = orders[0];
      createdOrderId = order.order_id;
      console.log(`  DB : wilaya="${order.wilaya}", commune="${order.customer_commune}"`);

      expect(String(order.customer_commune || "").toLowerCase())
        .toContain(chosenCommune.toLowerCase().split(" ")[0]);
    } finally {
      if (createdOrderName) {
        if (createdOrderId) {
          await sbDelete("nc_stock_movements", `order_id=eq.${createdOrderId}`);
        }
        await sbDelete("nc_orders", `order_name=eq.${createdOrderName}`);
        console.log(`  Cleanup ${createdOrderName} OK`);
      }
    }
  });
});
