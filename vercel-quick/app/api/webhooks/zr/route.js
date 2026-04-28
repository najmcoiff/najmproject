// ═══════════════════════════════════════════════════════════════════
//  POST /api/webhooks/zr — T210b (fix critical)
//  Reçoit les webhooks ZR Express (via Svix) — mises à jour état colis
//
//  ⚠️ IMPORTANT : ZR envoie `data.state` comme OBJET { id, name, description }
//                 PAS comme string — il faut extraire state.name
//
//  ZR state.name values (French) :
//    recouvert, en_cours, en_livraison, livre, echec_livraison, retour, annule, created, ...
//
//  Actions :
//    1. Update nc_suivi_zr.statut_livraison + attempts_count
//    2. Sync nc_orders.shipping_status
//    3. Auto-set final_status pour états terminaux (livré, retourné, annulé)
//    4. Log nc_events
// ═══════════════════════════════════════════════════════════════════

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { mapZRState } from "@/lib/zr-states";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Vérification signature Svix ──────────────────────────────────
function verifySvixSignature(rawBody, headers, secret) {
  if (!secret) return true;
  try {
    const svixId        = headers.get("svix-id")        || "";
    const svixTimestamp = headers.get("svix-timestamp") || "";
    const svixSignature = headers.get("svix-signature") || "";
    if (!svixId || !svixTimestamp || !svixSignature) return false;

    const ts = parseInt(svixTimestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes  = Buffer.from(rawSecret, "base64");
    const toSign    = `${svixId}.${svixTimestamp}.${rawBody}`;
    const computed  = "v1," + crypto.createHmac("sha256", keyBytes).update(toSign).digest("base64");

    return svixSignature.split(" ").some(s => {
      if (s.length !== computed.length) return false;
      try { return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(computed)); }
      catch { return false; }
    });
  } catch { return false; }
}

// Extraction état depuis payload ZR (state peut être objet ou string)
function extractZRState(data) {
  const stateObj = data?.state || data?.currentState || data?.newState || {};
  return mapZRState(stateObj);
}

export async function POST(request) {
  const t0    = Date.now();
  const runId = Math.random().toString(36).slice(2, 10);

  try {
    const rawBody = await request.text();
    if (!rawBody) return NextResponse.json({ ok: true, runId, note: "EMPTY_BODY" });

    // ── Vérification signature Svix ──────────────────────────────
    const secret = process.env.ZR_WEBHOOK_SECRET;
    if (secret && !verifySvixSignature(rawBody, request.headers, secret)) {
      console.warn(`ZR_WEBHOOK SVIX_FAIL runId=${runId}`);
      return NextResponse.json({ ok: false, error: "Signature invalide" }, { status: 401 });
    }

    // ── Parse payload ────────────────────────────────────────────
    let payload;
    try { payload = JSON.parse(rawBody); }
    catch { return NextResponse.json({ ok: true, runId, note: "BAD_JSON" }); }

    const eventType  = String(payload?.type || "");
    const data       = payload?.data || payload || {};

    // ── Extraire tracking + état ─────────────────────────────────
    const tracking   = String(
      data?.trackingNumber || data?.parcel?.trackingNumber || data?.tracking_number || ""
    ).trim();

    const externalId = String(data?.externalId || data?.parcel?.externalId || "").trim();
    const parcelId   = String(data?.id || data?.parcelId || "").trim();
    const attempts   = Number(data?.failedDeliveriesCount || data?.failedAttempts || 0);

    const { stateName, label: stateLabel, shipping: shippingStatus, final: finalStatus } = extractZRState(data);

    if (!tracking && !externalId) {
      console.warn(`ZR_WEBHOOK NO_TRACKING eventType=${eventType} runId=${runId}`);
      return NextResponse.json({ ok: true, runId, note: "NO_TRACKING" });
    }

    const supabase = adminSB();
    const now      = new Date().toISOString();

    console.log(`ZR_WEBHOOK event=${eventType} tracking=${tracking} externalId=${externalId} stateName=${stateName} label=${stateLabel} final=${finalStatus} runId=${runId}`);

    // ── 1. Update nc_suivi_zr ────────────────────────────────────
    const suiviFields = {
      statut_livraison: stateLabel,
      updated_at:       now,
      ...(attempts > 0 ? { attempts_count: attempts } : {}),
      ...(finalStatus === "livré"    ? { final_status: "livré",    date_livraison: now } : {}),
      ...(finalStatus === "retourné" ? { final_status: "retourné" }                     : {}),
      ...(finalStatus === "annulé"   ? { final_status: "annulé" }                       : {}),
    };

    let resolvedOrderId  = externalId || "";
    let resolvedTracking = tracking   || "";

    if (tracking) {
      const { data: updatedZR } = await supabase
        .from("nc_suivi_zr")
        .update(suiviFields)
        .eq("tracking", tracking)
        .select("tracking, order_id")
        .maybeSingle();
      if (updatedZR?.order_id)  resolvedOrderId  = updatedZR.order_id;
      if (updatedZR?.tracking)  resolvedTracking = updatedZR.tracking;
    } else if (externalId) {
      await supabase
        .from("nc_suivi_zr")
        .update(suiviFields)
        .eq("order_id", externalId);
    }

    // Si parcel_id reçu dans webhook, le stocker pour les futurs refresh
    if (parcelId && tracking) {
      await supabase
        .from("nc_suivi_zr")
        .update({ parcel_id: parcelId })
        .eq("tracking", tracking)
        .is("parcel_id", null);
    }

    // ── 2. Sync nc_orders.shipping_status ────────────────────────
    if (shippingStatus) {
      if (resolvedOrderId) {
        await supabase.from("nc_orders")
          .update({ shipping_status: shippingStatus })
          .eq("order_id", resolvedOrderId);
      } else if (resolvedTracking) {
        await supabase.from("nc_orders")
          .update({ shipping_status: shippingStatus })
          .eq("tracking", resolvedTracking);
      }
    }

    // ── 3. Log nc_events ────────────────────────────────────────
    try {
      await supabase.from("nc_events").insert({
        ts:       now,
        log_type: "ZR_STATUT_UPDATE",
        source:   "WEBHOOK_ZR",
        order_id: resolvedOrderId,
        actor:    "ZR_WEBHOOK",
        note:     `${stateLabel}${finalStatus ? " (final)" : ""}`,
        extra:    JSON.stringify({ tracking: resolvedTracking, stateName, event: eventType, attempts, parcelId }),
      });
    } catch { /* fire-and-forget */ }

    const duration = Date.now() - t0;
    console.log(`ZR_WEBHOOK_OK event=${eventType} label=${stateLabel} final=${finalStatus} ${duration}ms runId=${runId}`);

    return NextResponse.json({
      ok:          true,
      runId,
      tracking:    resolvedTracking,
      state:       stateLabel,
      terminal:    !!finalStatus,
      duration_ms: duration,
    });

  } catch (err) {
    console.error(`ZR_WEBHOOK_ERROR runId=${runId}`, err);
    return NextResponse.json({ ok: false, runId, error: String(err.message || err) }, { status: 500 });
  }
}
