// POST /api/po/labels
// Retourne les données étiquettes depuis nc_po_lines pour impression
// Migration depuis GAS GET_PO_LABELS → 0 Google Sheets
// Body: { token, po_id? }

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

    const filterPoId = String(body.po_id || "").trim();

    let query = adminSB()
      .from("nc_po_lines")
      .select("po_line_id,po_id,product_title,variant_id,qty_add,purchase_price,sell_price,note,created_at,barcode,display_name")
      .gt("qty_add", 0)
      .order("po_id", { ascending: false });

    if (filterPoId) {
      query = query.eq("po_id", filterPoId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data || []).map(r => ({
      product_title: r.product_title || "",
      barcode:       r.variant_id    || "",
      sell_price:    r.sell_price    || 0,
      qty_add:       r.qty_add       || 0,
      po_id:         r.po_id         || "",
    }));

    const po_ids = [...new Set((data || []).map(r => r.po_id).filter(Boolean))].sort();

    return NextResponse.json({ ok: true, rows, po_ids, count: rows.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
