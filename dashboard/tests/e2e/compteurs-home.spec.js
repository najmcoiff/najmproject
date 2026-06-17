/**
 * compteurs-home.spec.js — Test humain : compteurs de la première vue du dashboard
 *
 * Bug corrigé : la home lisait confirmation_status (toujours "nouveau") au lieu de
 * decision_status, et comparait des valeurs inexistantes ("confirme", "annule",
 * "préparé"). Résultat affiché : 0 confirmées / 0 annulées / 0 préparées alors que
 * la base contient des commandes confirmées/annulées/préparées.
 *
 * Ce que fait un agent RÉEL :
 *  1. Ouvre la page d'accueil du dashboard
 *  2. Lit les 8 cartes KPI (Total, À traiter, Confirmées, Annulées, À modifier,
 *     Rappel, Injoignables, Préparées)
 *  3. Recalcule indépendamment depuis Supabase (mêmes règles que sbGetCompteurs)
 *  4. Vérifie que l'UI correspond AU calcul de référence
 *  5. Vérifie que le bug est mort : confirmées + préparées ne sont plus bloqués à 0
 */
import { test, expect, sbQuery } from "./fixtures.js";

const noAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Recalcule les compteurs comme lib/supabase-direct.js → sbGetCompteurs()
function computeStats(rows) {
  const active = rows.filter((o) => o.archived !== true);
  let total = 0, confirmes = 0, annules = 0, a_traiter = 0,
      a_modifier = 0, rappels = 0, injoignables = 0, prepares = 0;
  for (const r of active) {
    const ds = noAccent((r.decision_status    || "").toLowerCase().trim());
    const ct =          (r.contact_status     || "").toLowerCase();
    const sp = noAccent((r.statut_preparation || "").toLowerCase().trim());
    if (ds === "annuler" || ds === "annule") { annules++; continue; }
    total++;
    if (ds === "confirmer" || ds === "confirme") confirmes++;
    else if (ds === "modifier")            a_modifier++;
    else if (ct === "rappel")              rappels++;
    else if (ct.startsWith("injoignable") || ct === "ne repond pas") injoignables++;
    else                                   a_traiter++;
    if (sp.startsWith("prepar") || sp === "pret") prepares++;
  }
  return { total, confirmes, annules, a_traiter, a_modifier, rappels, injoignables, prepares };
}

// Lit la valeur numérique d'une carte KPI à partir de son libellé.
// Structure : <div><div>VALEUR</div><div>LIBELLÉ</div></div>
async function readKpi(page, label) {
  const labelDiv = page.locator("div", { hasText: new RegExp(`^${label}$`) }).last();
  const valueDiv = labelDiv.locator("xpath=preceding-sibling::div[1]");
  const txt = (await valueDiv.textContent()) || "";
  const n = parseInt(txt.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

test.describe("Compteurs home — decision_status correctement agrégé", () => {
  test("les KPI affichés correspondent au calcul Supabase de référence", async ({ authedPage }) => {
    // 1. Référence : recalcul indépendant depuis la base
    const rows = await sbQuery(
      "nc_orders",
      "archived=eq.false&or=(order_source.is.null,order_source.neq.pos)" +
      "&select=decision_status,contact_status,statut_preparation,archived&limit=2000"
    );
    expect(Array.isArray(rows), `Supabase doit renvoyer un tableau: ${JSON.stringify(rows).slice(0,150)}`).toBe(true);
    const expected = computeStats(rows);
    console.log("📊 Référence Supabase :", JSON.stringify(expected));

    // 2. Charger la home et attendre les cartes (fin du skeleton)
    await authedPage.goto("/dashboard");
    await authedPage.getByText("Total actives", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
    await authedPage.waitForTimeout(2500); // laisser le fetch compteurs se résoudre

    // 3. Lire les 8 KPI
    const ui = {
      total:        await readKpi(authedPage, "Total actives"),
      a_traiter:    await readKpi(authedPage, "À traiter"),
      confirmes:    await readKpi(authedPage, "Confirmées"),
      annules:      await readKpi(authedPage, "Annulées"),
      a_modifier:   await readKpi(authedPage, "À modifier"),
      rappels:      await readKpi(authedPage, "Rappel"),
      injoignables: await readKpi(authedPage, "Injoignables"),
      prepares:     await readKpi(authedPage, "Préparées"),
    };
    console.log("🖥️  Affiché dans l'UI :", JSON.stringify(ui));

    // 4. L'UI doit correspondre exactement au calcul de référence
    for (const key of Object.keys(expected)) {
      expect(ui[key], `KPI "${key}" : UI=${ui[key]} ≠ attendu=${expected[key]}`).toBe(expected[key]);
    }

    // 5. Anti-régression : le bug rendait confirmées/annulées/préparées = 0.
    // En base il y a des commandes confirmées ET préparées → ne doivent plus être nuls.
    expect(expected.confirmes, "fixture : il doit y avoir des commandes confirmées en base").toBeGreaterThan(0);
    expect(ui.confirmes, "UI Confirmées ne doit plus être bloqué à 0").toBeGreaterThan(0);
    expect(ui.prepares,  "UI Préparées ne doit plus être bloqué à 0").toBeGreaterThan(0);
    console.log(`✅ Compteurs corrects : ${ui.confirmes} confirmées, ${ui.annules} annulées, ${ui.prepares} préparées`);
  });
});
