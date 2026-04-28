// POST /api/orders/pos
// Retourne les commandes POS (order_source = 'pos') depuis nc_orders
// Champs étendus pour la vue confirmation (printed_at inclus)
// Body: { token, q?, limit? }

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

    const q     = String(body.q || "").trim().toLowerCase();
    const limit = Math.min(Number(body.limit) || 100, 500);

    let query = adminSB()
      .from("nc_orders")
      .select([
        "order_id", "order_date", "order_source",
        "customer_name", "customer_phone",
        "order_total", "order_items_summary",
        "shopify_order_name", "shopify_order_url",
        "items_json", "note",
        "decision_status", "confirmation_status", "contact_status",
        "printed_at", "archived",
      ].join(","))
      .eq("order_source", "pos")
      .eq("archived", false)
      .order("order_date", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`order_id.ilike.%${q}%,customer_name.ilike.%${q}%,shopify_order_name.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, rows: data || [], count: (data || []).length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
