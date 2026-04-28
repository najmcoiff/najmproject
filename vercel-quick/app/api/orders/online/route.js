// POST /api/orders/online
// Retourne les commandes online (order_source != 'pos') depuis nc_orders
// Migration depuis GAS GET_ONLINE_ORDERS → 0 Google Sheets
// Body: { token, limit? }

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

    const limit = Math.min(Number(body.limit) || 300, 1000);

    const { data, error } = await adminSB()
      .from("nc_orders")
      .select("order_id,customer_name,customer_phone,wilaya,decision_status,contact_status,order_total,order_date,order_source,tracking,archived")
      .or("archived.is.null,archived.eq.false")
      .not("order_source", "eq", "pos")
      .order("order_date", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, rows: data || [], count: (data || []).length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
