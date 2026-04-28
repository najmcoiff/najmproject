// ═══════════════════════════════════════════════════════════════════
//  POST /api/webhooks/shopify — DÉSACTIVÉ (Phase M4 — T205)
//
//  Retourne 410 Gone : Shopify arrêtera d'envoyer des webhooks après
//  plusieurs échecs (410 = "ressource supprimée définitivement").
//
//  Désactiver aussi manuellement dans Shopify Admin :
//    Settings → Notifications → Webhooks → Supprimer tous les webhooks
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request) {
  const topic = request.headers.get("x-shopify-topic") || "unknown";
  const shop  = request.headers.get("x-shopify-shop-domain") || "";

  console.warn(`SHOPIFY_WEBHOOK_DISABLED topic=${topic} shop=${shop} — T205 Phase M4`);

  // Log dans nc_events pour traçabilité
  try {
    const sb = createClient(SB_URL, SB_SKEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await sb.from("nc_events").insert({
      ts:       new Date().toISOString(),
      log_type: "WEBHOOK_SHOPIFY_DISABLED",
      source:   "VERCEL",
      actor:    "SYSTEM",
      note:     `Webhook Shopify reçu mais ignoré (T205 — route désactivée)`,
      extra:    JSON.stringify({ topic, shop }),
    });
  } catch { /* fire-and-forget */ }

  return NextResponse.json(
    { ok: false, error: "Shopify webhooks désactivés — Phase M4" },
    { status: 410 }
  );
}
