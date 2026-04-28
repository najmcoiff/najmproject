/**
 * webhook-t205.spec.js — T205 : Désactivation webhook Shopify (Playwright)
 *
 * Vérifie que :
 *   1. POST /api/webhooks/shopify retourne 410 Gone
 *   2. Le body contient le message de désactivation
 *   3. Un log WEBHOOK_SHOPIFY_DISABLED est écrit dans nc_events
 *   4. La route ne crée plus de commande dans nc_orders
 */
import { test, expect, sbQuery, sbDelete } from "./fixtures.js";

const BASE_URL = process.env.E2E_BASE_URL || "https://najmcoiffdashboard.vercel.app";

test("T205 : POST /api/webhooks/shopify retourne 410 et log nc_events", async () => {
  const beforeTs = new Date().toISOString();

  // Simuler un webhook Shopify orders/create
  const fakePayload = {
    id:            999888777,
    order_number:  9001,
    name:          "#T205-TEST",
    created_at:    new Date().toISOString(),
    customer:      { first_name: "Test", last_name: "T205", phone: "+213600000205" },
    billing_address: { address1: "Test", city: "Alger", province: "Alger" },
    line_items:    [{ id: 1, title: "Article T205", quantity: 1, price: "1000.00", variant_id: 49000269414696 }],
    total_price:   "1000.00",
    financial_status: "paid",
  };

  const resp = await fetch(`${BASE_URL}/api/webhooks/shopify`, {
    method:  "POST",
    headers: {
      "Content-Type":           "application/json",
      "x-shopify-topic":        "orders/create",
      "x-shopify-shop-domain":  "8fc262.myshopify.com",
    },
    body: JSON.stringify(fakePayload),
  });

  // ── Vérifier HTTP 410 ────────────────────────────────────────────
  expect(resp.status, "HTTP 410 Gone attendu").toBe(410);

  const body = await resp.json();
  console.log("[T205] Réponse webhook :", JSON.stringify(body));
  expect(body.ok, "ok doit être false").toBe(false);
  expect(body.error, "message doit mentionner désactivé").toContain("désactivé");

  // ── Vérifier qu'aucune commande n'a été créée ────────────────────
  await new Promise(r => setTimeout(r, 1000));
  const orders = await sbQuery("nc_orders", `order_id=eq.999888777&select=order_id&limit=1`);
  expect(orders?.length ?? 0, "Aucune commande ne doit avoir été insérée").toBe(0);
  console.log("[T205] ✅ Aucune commande créée en base");

  // ── Vérifier le log WEBHOOK_SHOPIFY_DISABLED dans nc_events ──────
  const events = await sbQuery(
    "nc_events",
    `log_type=eq.WEBHOOK_SHOPIFY_DISABLED&ts=gt.${beforeTs}&select=log_type,note,extra&limit=5`
  );
  expect(events?.length ?? 0, "Un log WEBHOOK_SHOPIFY_DISABLED doit exister").toBeGreaterThan(0);
  console.log("[T205] ✅ Log nc_events :", JSON.stringify(events?.[0]));

  // ── Vérifier que le log contient le topic ────────────────────────
  const logEntry = events?.[0];
  const extraParsed = typeof logEntry?.extra === "string" ? JSON.parse(logEntry.extra) : logEntry?.extra;
  expect(extraParsed?.topic, "topic doit être dans l'extra").toBe("orders/create");
});

test("T205-CODE : route webhook ne contient plus mapShopifyPayload", async () => {
  const { readFileSync } = await import("fs");
  const { join }         = await import("path");

  const routePath    = join(process.cwd(), "app", "api", "webhooks", "shopify", "route.js");
  const routeContent = readFileSync(routePath, "utf-8");

  // La route ne doit plus importer lib/shopify
  expect(
    routeContent.includes('from "@/lib/shopify"'),
    "lib/shopify ne doit plus être importé dans le webhook"
  ).toBe(false);

  // Elle doit retourner 410
  expect(
    routeContent.includes("410"),
    "La route doit retourner 410"
  ).toBe(true);

  // Elle doit loger WEBHOOK_SHOPIFY_DISABLED
  expect(
    routeContent.includes("WEBHOOK_SHOPIFY_DISABLED"),
    "La route doit loger WEBHOOK_SHOPIFY_DISABLED"
  ).toBe(true);

  console.log("[T205-CODE] ✅ Route webhook neutralisée — 410 + log + 0 import Shopify");
});
