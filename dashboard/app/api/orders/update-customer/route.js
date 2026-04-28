// ═══════════════════════════════════════════════════════════════════
//  PATCH /api/orders/update-customer
//  Modifie les infos client + prix d'une commande
//
//  Body : { token, order_id, customer_phone?, wilaya?, commune?,
//           adresse?, delivery_type?, delivery_price?, order_total? }
//  Réponse : { ok, order_id, updated_fields }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function PATCH(request) {
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const orderId = String(body.order_id || "").trim();
    if (!orderId) return NextResponse.json({ ok: false, error: "order_id requis" });

    const ALLOWED_STR = ["customer_phone", "wilaya", "commune", "adresse", "delivery_type"];
    const ALLOWED_NUM = ["delivery_price", "order_total"];
    const patch = {};
    for (const field of ALLOWED_STR) {
      if (body[field] !== undefined && body[field] !== null) {
        patch[field] = String(body[field]).trim();
      }
    }
    for (const field of ALLOWED_NUM) {
      if (body[field] !== undefined && body[field] !== null) {
        const n = Number(body[field]);
        if (!isNaN(n)) patch[field] = n;
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "Aucun champ à mettre à jour" });
    }

    const supabase = adminSB();

    const { error } = await supabase
      .from("nc_orders")
      .update(patch)
      .eq("order_id", orderId);

    if (error) throw new Error(error.message);

    // Log nc_events
    try {
      await supabase.from("nc_events").insert({
        ts:       new Date().toISOString(),
        log_type: "UPDATE_CUSTOMER_INFO",
        source:   "VERCEL",
        order_id: orderId,
        action:   "UPDATE_CUSTOMER_INFO",
        new_value: JSON.stringify({ updated: patch, agent: session.nom }),
        status:   "success",
      });
    } catch { /* fire-and-forget */ }

    return NextResponse.json({ ok: true, order_id: orderId, updated_fields: Object.keys(patch) });

  } catch (err) {
    console.error("UPDATE_CUSTOMER_EXCEPTION", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
