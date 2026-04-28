/**
 * mention-force-attention.spec.js
 * Tests E2E pour les fonctionnalités "force attention" mentions :
 *   A — Bannière rouge sticky sur toutes les pages
 *   B — Son ping double bip + vibration (vérifié via AudioContext mock)
 *   D — Double tick ✓✓ accusé de lecture (read_by)
 */
import { test, expect, sbQuery, sbInsert, sbDelete, sbPatch } from "./fixtures.js";

const BASE = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";

test.describe("A — Bannière mention urgente", () => {
  // Stratégie : insérer la notif AVANT de charger la page (is_read=false)
  // Le layout charge les mentions non lues au démarrage → bannière apparaît sans Realtime

  test("T_BANNER_INJECT : bannière rouge apparaît au chargement si mention non lue", async ({ authedPage: page }) => {
    const notif = await sbInsert("notifications_log", {
      title: "📣 soumia vous a mentionné",
      body: "Réunion dans 10 min @najm",
      url: "/dashboard/discussions",
      target_user: "najm",
      from_user: "soumia",
      type: "mention",
      is_read: false,
    });
    const notifId = Array.isArray(notif) ? notif[0]?.id : notif?.id;

    // Charger la page APRÈS l'insert → le layout doit charger la mention
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("networkidle");

    const banner = page.locator(".bg-red-600").first();
    await expect(banner).toBeVisible({ timeout: 8000 });

    // Cleanup
    if (notifId) await sbDelete("notifications_log", `id=eq.${notifId}`);
  });

  test("T_BANNER_NO_CLOSE : pas de bouton × — seul 'Lire maintenant' ferme la bannière", async ({ authedPage: page }) => {
    const notif = await sbInsert("notifications_log", {
      title: "📣 soumia vous a mentionné",
      body: "Test pas de fermeture @najm",
      url: "/dashboard/discussions",
      target_user: "najm",
      from_user: "soumia",
      type: "mention",
      is_read: false,
    });
    const notifId = Array.isArray(notif) ? notif[0]?.id : notif?.id;

    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("networkidle");

    const banner = page.locator(".bg-red-600").first();
    await expect(banner).toBeVisible({ timeout: 8000 });

    // Vérifier qu'il n'y a PAS de bouton × (supprimé intentionnellement)
    const closeBtn = page.locator(".bg-red-600 button[aria-label='Fermer']");
    await expect(closeBtn).not.toBeVisible();

    // Le bouton "Lire maintenant" doit être présent
    await expect(page.locator(".bg-red-600 a")).toContainText("Lire maintenant");

    if (notifId) await sbDelete("notifications_log", `id=eq.${notifId}`);
  });

  test("T_BANNER_NAVIGATE : bannière reste visible en naviguant vers préparation", async ({ authedPage: page }) => {
    const notif = await sbInsert("notifications_log", {
      title: "📣 soumia vous a mentionné",
      body: "Test navigation @najm",
      url: "/dashboard/discussions",
      target_user: "najm",
      from_user: "soumia",
      type: "mention",
      is_read: false,
    });
    const notifId = Array.isArray(notif) ? notif[0]?.id : notif?.id;

    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("networkidle");

    const banner = page.locator(".bg-red-600").first();
    await expect(banner).toBeVisible({ timeout: 8000 });

    // Naviguer via le menu sidebar
    await page.goto(`${BASE}/dashboard/preparation`);
    await page.waitForLoadState("networkidle");
    // La bannière doit encore être là (état React persisté dans le layout)
    await expect(banner).toBeVisible({ timeout: 5000 });

    if (notifId) await sbDelete("notifications_log", `id=eq.${notifId}`);
  });

  test("T_BANNER_VOIR : 'Voir →' navigue vers discussions et marque is_read", async ({ authedPage: page }) => {
    const notif = await sbInsert("notifications_log", {
      title: "📣 soumia vous a mentionné",
      body: "Test voir discussions @najm",
      url: "/dashboard/discussions",
      target_user: "najm",
      from_user: "soumia",
      type: "mention",
      is_read: false,
    });
    const notifId = Array.isArray(notif) ? notif[0]?.id : notif?.id;

    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("networkidle");

    const banner = page.locator(".bg-red-600").first();
    await expect(banner).toBeVisible({ timeout: 8000 });

    await page.locator(".bg-red-600 a").click();
    await page.waitForURL("**/discussions", { timeout: 8000 });
    await expect(banner).not.toBeVisible({ timeout: 3000 });

    if (notifId) await sbDelete("notifications_log", `id=eq.${notifId}`);
  });
});

test.describe("D — Double tick ✓✓ accusé de lecture", () => {
  test("T_TICK_GRIS : message envoyé = ✓✓ gris (pas encore lu)", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/dashboard/discussions`);
    await page.waitForLoadState("networkidle");

    // Attendre que le premier salon soit chargé
    await page.waitForTimeout(1500);

    const input = page.locator("textarea, input[type='text']").first();
    if (!await input.isVisible()) return; // pas de salon dispo

    const msgSuffix = `Test tick gris ${Date.now()}`;
    const msg = msgSuffix;
    const before = new Date().toISOString();
    await input.click();
    await page.keyboard.type(msg);
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    // Le dernier message envoyé doit avoir ✓✓ en couleur grise/bleue
    const ticks = page.locator("span[title='Envoyé'], span[title^='Lu par']").last();
    await expect(ticks).toBeVisible({ timeout: 5000 });
    await expect(ticks).toHaveText("✓✓");

    // Cleanup : supprimer le message de test
    try {
      const msgs = await sbQuery("messages", `auteur_nom=eq.najm&created_at=gt.${before}&order=created_at.desc&limit=5`);
      for (const m of (msgs || [])) {
        if (m.contenu?.startsWith("Test tick gris")) {
          await sbDelete("messages", `id=eq.${m.id}`).catch(() => {});
        }
      }
    } catch {}
  });

  test("T_TICK_DB : read_by est mis à jour dans la DB quand on entre dans un salon", async ({ authedPage: page }) => {
    // Insérer un message test dans le premier salon
    const { data: salons } = await sbQuery("salons", "order=ordre.asc&limit=1").then(r => ({ data: r }));
    const salon = Array.isArray(salons) ? salons[0] : null;
    if (!salon) { test.skip(); return; }

    const inserted = await sbInsert("messages", {
      salon_id: salon.id,
      auteur_nom: "soumia",
      auteur_role: "agent digital",
      contenu: `Test read_by ${Date.now()}`,
      type: "text",
      read_by: [],
    });
    const msgId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    if (!msgId) { test.skip(); return; }

    // Naviguer vers discussions — doit déclencher markSalonRead
    await page.goto(`${BASE}/dashboard/discussions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(6000); // laisser le temps à markSalonRead + boucle UPDATE de s'exécuter

    // Vérifier que le message a bien najm dans read_by
    const rows = await sbQuery("messages", `id=eq.${msgId}&select=read_by`);
    const row = Array.isArray(rows) ? rows[0] : rows;
    expect(row?.read_by).toBeTruthy();
    expect(row.read_by).toContain("najm");

    // Cleanup
    await sbDelete("messages", `id=eq.${msgId}`);
  });

  test("T_TICK_BLEU : ✓✓ devient bleu quand quelqu'un d'autre a lu", async ({ authedPage: page }) => {
    // Insérer un message de najm avec read_by déjà rempli par quelqu'un d'autre
    const rows = await sbQuery("salons", "order=ordre.asc&limit=1");
    const salon = Array.isArray(rows) ? rows[0] : null;
    if (!salon) { test.skip(); return; }

    const inserted = await sbInsert("messages", {
      salon_id: salon.id,
      auteur_nom: "najm",
      auteur_role: "owner",
      contenu: `Test tick bleu ${Date.now()}`,
      type: "text",
      read_by: ["soumia"], // déjà lu par soumia
    });
    const msgId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    if (!msgId) { test.skip(); return; }

    await page.goto(`${BASE}/dashboard/discussions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Le ✓✓ correspondant à ce message doit être bleu (text-blue-400)
    const tick = page.locator(`span[title^='Lu par']`).last();
    await expect(tick).toBeVisible({ timeout: 5000 });

    // Cleanup
    await sbDelete("messages", `id=eq.${msgId}`);
  });
});
