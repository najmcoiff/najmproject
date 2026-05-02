/**
 * pixel-onglerie.spec.js — Test humain : pixel Meta onglerie capture les events.
 *
 * Régression : avant le fix, MetaPixel n'init que le pixel coiffure
 * (sessionStorage nc_world vide au mount du root layout). Après nav vers
 * /collections/onglerie, le pixel onglerie n'était jamais initialisé →
 * 0 event capté côté Meta malgré les commandes onglerie réelles.
 *
 * Stratégie de vérification : on intercepte au niveau réseau les requêtes
 * vers facebook.com/tr (l'endpoint de tracking Meta Pixel). C'est ce que
 * Meta voit réellement → si on les capte ici, le pixel fonctionne.
 *
 * Run contre prod via PLAYWRIGHT_BASE_URL=https://www.najmcoiff.com
 */
const { test, expect } = require("@playwright/test");

/** Récupère window.__nc_pixels exposé par MetaPixel.js */
async function getPixelIds(page) {
  await page.waitForFunction(() => !!window.__nc_pixels, null, { timeout: 15000 });
  return await page.evaluate(() => window.__nc_pixels);
}

/**
 * Pose un listener sur les requêtes vers facebook.com/tr et les renvoie
 * sous forme de [{ pixelId, event, url }].
 */
function setupFbTracker(page) {
  const fbRequests = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!/facebook\.com\/tr(\b|\/)/.test(url)) return;
    try {
      const u = new URL(url);
      const pixelId = u.searchParams.get("id");
      const event = u.searchParams.get("ev");
      fbRequests.push({ pixelId, event, url });
    } catch {}
  });
  return fbRequests;
}

test.describe("Pixel Meta — onglerie capture les events", () => {

  test("1) home → click onglerie → requête tracking Meta vers le pixel onglerie", async ({ page }) => {
    const fbRequests = setupFbTracker(page);

    // 1. Arrivée sur la home
    await page.goto("/");
    // Attendre le SDK Meta
    await page.waitForFunction(() => typeof window.fbq === "function", null, { timeout: 15000 });

    const pixels = await getPixelIds(page);
    expect(pixels.coiffure, "pixel coiffure id présent").toBeTruthy();
    expect(pixels.onglerie, "pixel onglerie id présent").toBeTruthy();
    expect(pixels.coiffure).not.toEqual(pixels.onglerie);

    // 2. Clic sur la carte Onglerie
    await page.click('button[data-world="onglerie"]');
    await page.waitForURL(/\/collections\/onglerie/);

    // 3. Attendre une requête tracking vers le pixel onglerie
    await page.waitForFunction(() => true, null, { timeout: 1000 }).catch(() => {});
    // Wait additionnel pour laisser fbevents.js exécuter la queue
    await page.waitForTimeout(2500);

    console.log("Requêtes facebook.com/tr capturées :",
      JSON.stringify(fbRequests.map(r => ({ pixelId: r.pixelId, event: r.event })), null, 2));

    const ongleriePV = fbRequests.find(
      r => r.pixelId === pixels.onglerie && r.event === "PageView"
    );
    expect(
      ongleriePV,
      `Une requête PageView vers le pixel onglerie ${pixels.onglerie} doit avoir été émise`
    ).toBeTruthy();
  });

  test("2) hard reload sur /collections/onglerie → PageView vers pixel onglerie", async ({ page }) => {
    const fbRequests = setupFbTracker(page);

    await page.goto("/collections/onglerie");
    await page.waitForFunction(() => typeof window.fbq === "function", null, { timeout: 15000 });

    const pixels = await getPixelIds(page);
    // Laisser le SDK envoyer les requêtes
    await page.waitForTimeout(3000);

    console.log("Requêtes capturées (hard reload onglerie) :",
      JSON.stringify(fbRequests.map(r => ({ pixelId: r.pixelId, event: r.event })), null, 2));

    const ongleriePV = fbRequests.find(
      r => r.pixelId === pixels.onglerie && r.event === "PageView"
    );
    expect(
      ongleriePV,
      `PageView vers pixel onglerie ${pixels.onglerie} attendu après hard reload`
    ).toBeTruthy();

    // Et SURTOUT : pas de PageView vers le pixel coiffure (attribution propre)
    const coiffurePV = fbRequests.find(
      r => r.pixelId === pixels.coiffure && r.event === "PageView"
    );
    expect(
      coiffurePV,
      "Aucune requête PageView ne doit aller au pixel coiffure quand on est sur onglerie"
    ).toBeFalsy();
  });

  test("3) AddToCart sur onglerie → trackSingle vers pixel onglerie uniquement", async ({ page }) => {
    const fbRequests = setupFbTracker(page);

    await page.goto("/collections/onglerie");
    await page.waitForFunction(() => typeof window.fbq === "function", null, { timeout: 15000 });
    const pixels = await getPixelIds(page);

    // Laisser PageView se faire d'abord
    await page.waitForTimeout(2000);
    const baselineCount = fbRequests.length;

    // Déclencher un AddToCart en simulant exactement ce que fait lib/track.js
    await page.evaluate(() => {
      const world = sessionStorage.getItem("nc_world");
      const pixelId = window.__nc_pixels?.[world];
      if (window.fbq && pixelId) {
        window.fbq("trackSingle", pixelId, "AddToCart", {
          content_ids: ["test-variant-123"],
          content_type: "product",
          value: 1500,
          currency: "DZD",
        });
      }
    });

    // Laisser la requête réseau partir
    await page.waitForTimeout(2500);

    const newRequests = fbRequests.slice(baselineCount);
    console.log("Requêtes après AddToCart :",
      JSON.stringify(newRequests.map(r => ({ pixelId: r.pixelId, event: r.event })), null, 2));

    const addToCartOnglerie = newRequests.find(
      r => r.pixelId === pixels.onglerie && r.event === "AddToCart"
    );
    expect(
      addToCartOnglerie,
      `AddToCart vers pixel onglerie ${pixels.onglerie} attendu`
    ).toBeTruthy();

    const addToCartCoiffure = newRequests.find(
      r => r.pixelId === pixels.coiffure && r.event === "AddToCart"
    );
    expect(
      addToCartCoiffure,
      "AddToCart NE doit PAS être routé vers le pixel coiffure (attribution propre via trackSingle)"
    ).toBeFalsy();
  });
});
