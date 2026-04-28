import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { hashString, getClientIp } from "@/lib/utils";
import { EVENT_TYPES } from "@/lib/constants";

const VALID_EVENT_TYPES = new Set(Object.values(EVENT_TYPES));

/**
 * POST /api/boutique/track-event
 * Enregistre un événement tracking dans nc_page_events.
 * Fire & forget côté client — retourne 200 immédiatement.
 * Traitement asynchrone.
 *
 * Body :
 * {
 *   session_id:   string,
 *   event_type:   string,     (voir EVENT_TYPES dans constants.js)
 *   world:        string?,    ('coiffure' | 'onglerie')
 *   page:         string?,
 *   product_id:   string?,
 *   variant_id:   string?,
 *   order_id:     string?,
 *   metadata:     object?,
 *   utm_source:   string?,
 *   utm_medium:   string?,
 *   utm_campaign: string?,
 *   utm_content:  string?,
 *   utm_term:     string?,
 *   referrer:     string?,
 *   user_agent:   string?,
 * }
 */
export async function POST(request) {
  // Répondre immédiatement pour ne pas bloquer le client
  const responsePromise = NextResponse.json({ ok: true });

  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.session_id || !body.event_type) {
      return responsePromise;
    }

    // Valider event_type (rejeter silencieusement les valeurs inconnues)
    if (!VALID_EVENT_TYPES.has(body.event_type)) {
      return responsePromise;
    }

    // Hash de l'IP côté serveur (RGPD — jamais l'IP brute)
    const clientIp = getClientIp(request);
    const ipHash = await hashString(clientIp).catch(() => "unknown");

    const sb = createServiceClient();

    const eventId = `${body.session_id}_${body.event_type}_${Date.now()}`;

    const insertPromise = sb.from("nc_page_events").insert({
      session_id:   body.session_id,
      event_type:   body.event_type,
      world:        body.world        || null,
      page:         body.page         || null,
      product_id:   body.product_id   || null,
      variant_id:   body.variant_id   || null,
      order_id:     body.order_id     || null,
      metadata:     body.metadata     || {},
      utm_source:   body.utm_source   || null,
      utm_medium:   body.utm_medium   || null,
      utm_campaign: body.utm_campaign || null,
      utm_content:  body.utm_content  || null,
      utm_term:     body.utm_term     || null,
      referrer:     body.referrer     || null,
      user_agent:   body.user_agent   || request.headers.get("user-agent") || null,
      ip_hash:      ipHash,
    });

    const capiPromise = sendCAPI(body, eventId, clientIp, request);

    await Promise.allSettled([insertPromise, capiPromise]);
  } catch (err) {
    // Silencieux — le tracking ne doit jamais bloquer la boutique
    console.error("[track-event] Error:", err?.message);
  }

  return responsePromise;
}

// ── Meta Conversions API (CAPI) ─────────────────────────────
const CAPI_EVENT_MAP = {
  PAGE_VIEW:      "PageView",
  PRODUCT_VIEW:   "ViewContent",
  CART_ADD:       "AddToCart",
  CHECKOUT_START: "InitiateCheckout",
  ORDER_PLACED:   "Purchase",
  SEARCH:         "Search",
};

async function sendCAPI(body, eventId, clientIp, request) {
  const capiToken = process.env.META_CAPI_TOKEN;
  if (!capiToken) return;

  const metaEvent = CAPI_EVENT_MAP[body.event_type];
  if (!metaEvent) return;

  const pixelId =
    body.world === "onglerie"
      ? process.env.NEXT_PUBLIC_META_PIXEL_ONGLERIE
      : process.env.NEXT_PUBLIC_META_PIXEL_COIFFURE;

  if (!pixelId) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.najmcoiff.com";

  const payload = {
    data: [
      {
        event_name: metaEvent,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: body.page
          ? `${siteUrl}${body.page}`
          : siteUrl,
        action_source: "website",
        user_data: {
          client_ip_address: clientIp,
          client_user_agent:
            body.user_agent || request.headers.get("user-agent") || "",
          external_id: [body.session_id],
          country: ["2a92270185a50d8020949f2cfb2125d1af1c2bd3dd92eada9210fcdb5c4310bf"],
        },
        custom_data: {
          content_ids: [body.variant_id || body.product_id].filter(Boolean),
          content_type: "product",
          value: body.metadata?.price || body.metadata?.total || 0,
          currency: "DZD",
          order_id: body.order_id || null,
        },
      },
    ],
    access_token: capiToken,
  };

  try {
    await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // CAPI failure must never block tracking
  }
}
