// ═══════════════════════════════════════════════════════════════════
//  POST /api/inject/single
//  Injecte une commande vers ZR Express (crée le colis + tracking)
//
//  Protection double-injection S8 :
//    - Bloque si order.tracking non vide
//    - Bloque si order.zr_locked = 'OUI'
//    - Après succès : set tracking + zr_locked='OUI' + shipping_status='expédié'
//
//  Body : { order_id, token }
//  Réponse : { ok, order_id, tracking, duration_ms }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";
import { zrCreateParcel, zrGetParcelStatus } from "@/lib/zr-express";
import { logScript } from "@/lib/logscript";

export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request) {
  const t0 = Date.now();
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const orderId = String(body.order_id || "").trim();
    if (!orderId) return NextResponse.json({ ok: false, error: "order_id requis" });

    const supabase = adminSB();

    // ── 1. Lire la commande depuis nc_orders ─────────────────────
    const { data: orders } = await supabase
      .from("nc_orders")
      .select("order_id,customer_name,customer_phone,wilaya,commune,adresse,order_total,shopify_delivery_mode,delivery_mode,delivery_type,tracking,zr_locked,order_items_summary,archived,shopify_order_name")
      .eq("order_id", orderId)
      .limit(1);

    const order = orders?.[0];
    if (!order) return NextResponse.json({ ok: false, error: `Commande ${orderId} introuvable` });
    if (order.archived) return NextResponse.json({ ok: false, error: "Commande archivée, injection impossible" });

    // ── Protection double-injection ──────────────────────────────
    if ((order.tracking || "").trim()) {
      return NextResponse.json({ ok: false, error: `Commande déjà injectée (tracking: ${order.tracking})` });
    }
    if ((order.zr_locked || "").trim() === "OUI") {
      return NextResponse.json({ ok: false, error: "Commande déjà verrouillée ZR (zr_locked=OUI)" });
    }

    if (!order.customer_phone) return NextResponse.json({ ok: false, error: "Téléphone manquant" });
    if (!order.wilaya)         return NextResponse.json({ ok: false, error: "Wilaya manquante" });

    // ── 2. Appeler ZR API ────────────────────────────────────────
    const zrResult = await zrCreateParcel(order);
    if (!zrResult.ok) {
      console.error(`INJECT_SINGLE_ZR_ERROR order=${orderId}`, zrResult.error);
      return NextResponse.json({ ok: false, error: zrResult.error });
    }

    const { tracking, parcel_id } = zrResult;
    const now = new Date().toISOString();

    // ── 3. Mettre à jour nc_orders (tracking + zr_locked) ────────
    await supabase
      .from("nc_orders")
      .update({ tracking, zr_locked: "OUI", shipping_status: "expédié" })
      .eq("order_id", orderId);

    // ── 4. Fetch statut réel depuis ZR (immédiat après création) ─
    let initialStatut = "Créé";
    let initialAttempts = 0;
    try {
      const zrStatus = await zrGetParcelStatus(parcel_id, tracking);
      if (zrStatus.ok) {
        initialStatut   = zrStatus.stateLabel || "Créé";
        initialAttempts = zrStatus.attempts    || 0;
      }
    } catch { /* non-bloquant */ }

    // ── 5. Upsert nc_suivi_zr ────────────────────────────────────
    await supabase.from("nc_suivi_zr").upsert({
      tracking,
      parcel_id:          parcel_id   || "",
      order_id:           orderId,
      customer_name:      order.customer_name    || "",
      customer_phone:     order.customer_phone   || "",
      wilaya:             order.wilaya           || "",
      adresse:            order.adresse          || order.commune || "",
      carrier:            "ZR Express",
      statut_livraison:   initialStatut,
      attempts_count:     initialAttempts,
      delivery_mode:      order.shopify_delivery_mode || order.delivery_mode || order.delivery_type || "",
      shopify_order_name: order.shopify_order_name    || "",
      order_total:        order.order_total      || null,
      date_injection:     now,
      updated_at:         now,
      link_zr:            parcel_id ? `https://track.zrexpress.app/?tracking=${tracking}` : "",
    }, { onConflict: "tracking" });

    // ── 6. Log nc_events ─────────────────────────────────────────
    try {
      await supabase.from("nc_events").insert({
        ts:       now,
        log_type: "INJECT_SINGLE_ZR",
        source:   "VERCEL",
        order_id: orderId,
        tracking: tracking,
        note:     `Injection ZR OK → ${tracking} (agent: ${session.nom})`,
        extra:    JSON.stringify({ tracking, parcel_id, agent: session.nom }),
      });
    } catch { /* fire-and-forget */ }

    const duration = Date.now() - t0;
    console.log(`INJECT_SINGLE_ZR OK order=${orderId} tracking=${tracking} ${duration}ms`);

    logScript({ level: "INFO", action: "INJECT_SINGLE_ZR", message: `OK → ${tracking}`, order_id: orderId, duration_ms: duration, details: { tracking, parcel_id, agent: session.nom } });

    return NextResponse.json({ ok: true, order_id: orderId, tracking, parcel_id, duration_ms: duration });

  } catch (err) {
    console.error("INJECT_SINGLE_ZR_EXCEPTION", err);
    logScript({ level: "ERROR", action: "INJECT_SINGLE_ZR", message: String(err.message || err), details: { stack: String(err.stack || "").slice(0, 400) } });
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
