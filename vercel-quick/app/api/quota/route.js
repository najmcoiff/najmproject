// ═══════════════════════════════════════════════════════════════════
//  POST /api/quota
//  Lit la dernière quota générée depuis nc_quota + nc_quota_orders
//
//  Body : { token }
//  Réponse : { ok, rows, count, total_qty, config, orders }
//  → Format identique à l'ancienne réponse GAS GET_QUOTA
//    (compatibilité totale avec preparation/page.js)
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

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Token invalide ou expiré" }, { status: 401 });
    }

    const supabase = adminSB();

    // Dernière quota générée
    const { data: quota, error } = await supabase
      .from("nc_quota")
      .select("id, generated_at, premier_order_id, nb_commandes, generated_by, rows")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error("Erreur lecture nc_quota: " + error.message);
    if (!quota) {
      return NextResponse.json({ ok: true, rows: [], count: 0, total_qty: 0, config: {}, orders: [] });
    }

    const rows      = Array.isArray(quota.rows) ? quota.rows : [];
    const totalQty  = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

    // Commandes incluses dans cette quota
    const { data: orders } = await supabase
      .from("nc_quota_orders")
      .select("order_id, customer_name, order_date, nb_articles, position")
      .eq("quota_id", quota.id)
      .order("position", { ascending: true });

    return NextResponse.json({
      ok:        true,
      rows,
      count:     rows.length,
      total_qty: totalQty,
      config: {
        quota_id:         quota.id,
        premier_order_id: quota.premier_order_id,
        nb_commandes:     quota.nb_commandes,
        generated_at:     quota.generated_at,
        generated_by:     quota.generated_by,
      },
      orders: orders || [],
    });

  } catch (err) {
    console.error("GET_QUOTA_ERROR", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
