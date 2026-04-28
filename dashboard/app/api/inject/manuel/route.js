// POST /api/inject/manuel
// Injection manuelle d'un tracking dans nc_orders + nc_suivi_zr
// Migration depuis GAS INJECT_MANUEL → 0 Google Sheets
// Body: { token, order_id, tracking, carrier? }

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

export async function POST(request) {
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const orderId  = String(body.order_id || "").trim();
    const tracking = String(body.tracking || "").trim();
    const carrier  = String(body.carrier  || "Manuel").trim();

    if (!orderId)  return NextResponse.json({ ok: false, error: "order_id requis" });
    if (!tracking) return NextResponse.json({ ok: false, error: "tracking requis" });

    const sb  = adminSB();
    const now = new Date().toISOString();

    // Lire la commande pour enrichir nc_suivi_zr
    const { data: orders } = await sb
      .from("nc_orders")
      .select("order_id,customer_name,customer_phone,wilaya,adresse,commune,order_total")
      .eq("order_id", orderId)
      .limit(1);

    const order = orders?.[0];
    if (!order) return NextResponse.json({ ok: false, error: `Commande ${orderId} introuvable` });

    // Patch nc_orders
    const { error: patchErr } = await sb
      .from("nc_orders")
      .update({
        tracking,
        shipping_status: `Manuel — ${carrier}`,
      })
      .eq("order_id", orderId);

    if (patchErr) throw new Error(patchErr.message);

    // Upsert nc_suivi_zr
    await sb.from("nc_suivi_zr").upsert({
      tracking,
      order_id:         orderId,
      customer_name:    order.customer_name  || "",
      customer_phone:   order.customer_phone || "",
      wilaya:           order.wilaya         || "",
      adresse:          order.adresse        || order.commune || "",
      carrier:          carrier,
      statut_livraison: "Manuel",
      order_total:      order.order_total    || null,
      date_injection:   now,
      updated_at:       now,
    }, { onConflict: "tracking" });

    // Log nc_events
    try {
      await sb.from("nc_events").insert({
        ts: now, log_type: "INJECT_MANUEL", source: "VERCEL",
        order_id: orderId, actor: session.nom,
        note: `tracking=${tracking} carrier=${carrier}`,
      });
    } catch { /* fire-and-forget */ }

    return NextResponse.json({ ok: true, order_id: orderId, tracking });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
