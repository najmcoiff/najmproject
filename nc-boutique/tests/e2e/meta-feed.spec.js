import { test, expect } from "@playwright/test";

/**
 * T_META_CATALOG — Tests Product Feed XML Meta Dynamic Ads
 * Vérifie que /api/boutique/meta-feed retourne un XML valide pour Meta
 */

const FEED_URL  = "/api/boutique/meta-feed";
const BASE_URL  = "https://www.najmcoiff.com";

test.describe("T_META_CATALOG — Product Feed Meta", () => {
  test("Feed complet retourne XML 200 avec items", async ({ request }) => {
    const res = await request.get(`${FEED_URL}?page=1`);
    expect(res.status()).toBe(200);

    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("xml");

    const feedCount = res.headers()["x-feed-count"];
    expect(parseInt(feedCount || "0")).toBeGreaterThan(10);

    const body = await res.text();
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain("<rss");
    expect(body).toContain("<item>");
    expect(body).toContain("<g:id>");
    expect(body).toContain("<g:title>");
    expect(body).toContain("<g:price>");
    expect(body).toContain("<g:availability>in stock</g:availability>");
    expect(body).toContain("<g:condition>new</g:condition>");
    expect(body).toContain("DZD");
  });

  test("Feed coiffure retourne world=coiffure uniquement", async ({ request }) => {
    const res = await request.get(`${FEED_URL}?world=coiffure&page=1`);
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toContain("<item>");
    // Toutes les URLs de produits doivent pointer vers najmcoiff.com
    expect(body).toContain("najmcoiff.com/produits/");
    // Pas de référence à onglerie dans les custom_label
    const worldLabel = body.match(/<g:custom_label_0>([^<]+)<\/g:custom_label_0>/g);
    if (worldLabel) {
      worldLabel.forEach(label => expect(label).not.toContain("onglerie"));
    }
  });

  test("Feed onglerie retourne world=onglerie", async ({ request }) => {
    const res = await request.get(`${FEED_URL}?world=onglerie&page=1`);
    expect(res.status()).toBe(200);

    const feedCount = res.headers()["x-feed-count"];
    expect(parseInt(feedCount || "0")).toBeGreaterThan(0);

    const body = await res.text();
    expect(body).toContain("<item>");

    const worldLabels = body.match(/<g:custom_label_0>([^<]+)<\/g:custom_label_0>/g) || [];
    if (worldLabels.length > 0) {
      worldLabels.forEach(label => expect(label).toContain("onglerie"));
    }
  });

  test("Feed contient des prix au format Meta (DZD)", async ({ request }) => {
    const res = await request.get(`${FEED_URL}?world=coiffure&page=1`);
    const body = await res.text();

    // Format Meta : "1500.00 DZD"
    const prices = body.match(/<g:price>([^<]+)<\/g:price>/g) || [];
    expect(prices.length).toBeGreaterThan(0);

    prices.slice(0, 5).forEach(p => {
      expect(p).toMatch(/\d+\.\d{2} DZD/);
    });
  });

  test("Feed contient des URLs images Supabase Storage", async ({ request }) => {
    const res = await request.get(`${FEED_URL}?world=coiffure&page=1`);
    const body = await res.text();

    const imageLinks = body.match(/<g:image_link>([^<]+)<\/g:image_link>/g) || [];
    expect(imageLinks.length).toBeGreaterThan(0);

    // Les images doivent être des URLs https
    imageLinks.slice(0, 5).forEach(img => {
      expect(img).toMatch(/https?:\/\//);
    });
  });

  test("Pagination page=2 retourne des items différents", async ({ request }) => {
    const [r1, r2] = await Promise.all([
      request.get(`${FEED_URL}?world=coiffure&page=1`),
      request.get(`${FEED_URL}?world=coiffure&page=2`),
    ]);

    expect(r1.status()).toBe(200);
    expect(r2.status()).toBe(200);

    const b1 = await r1.text();
    const b2 = await r2.text();

    // Extraire les IDs de la première page
    const ids1 = [...b1.matchAll(/<g:id>([^<]+)<\/g:id>/g)].map(m => m[1]);
    const ids2 = [...b2.matchAll(/<g:id>([^<]+)<\/g:id>/g)].map(m => m[1]);

    // Les deux pages ne doivent pas avoir les mêmes IDs
    if (ids1.length > 0 && ids2.length > 0) {
      const overlap = ids1.filter(id => ids2.includes(id));
      expect(overlap.length).toBe(0);
    }
  });

  test("Brand = NajmCoiff dans le feed", async ({ request }) => {
    const res = await request.get(`${FEED_URL}?page=1`);
    const body = await res.text();
    expect(body).toContain("<g:brand>NajmCoiff</g:brand>");
  });
});
