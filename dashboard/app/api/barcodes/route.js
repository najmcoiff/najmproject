// GET /api/barcodes?po_id=xxx&token=...
// POST /api/barcodes { token, po_id? }
// Retourne les données barcodes depuis nc_po_lines pour impression frontend
// Migration depuis GAS PRINT_BARCODES → page /dashboard/barcodes

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

async function handler(token, poId) {
  const session = verifyToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

  let query = adminSB()
    .from("nc_po_lines")
    .select("po_id,product_title,variant_id,qty_add,purchase_price,note,barcode,display_name")
    .gt("qty_add", 0)
    .order("po_id", { ascending: false })
    .limit(500);

  if (poId) query = query.eq("po_id", poId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Explode: une ligne par unité selon quantite pour impression
  const rows = [];
  for (const r of (data || [])) {
    const qty = Number(r.qty_add) || 1;
    for (let i = 0; i < qty; i++) {
      rows.push({
        po_id:         r.po_id         || "",
        product_title: r.product_title || "",
        barcode:       r.variant_id    || "",
        price:         r.purchase_price || 0,
        note:          r.note          || "",
        display_name:  r.display_name  || "",
      });
    }
  }

  const po_ids = [...new Set((data || []).map(r => r.po_id).filter(Boolean))].sort();
  return NextResponse.json({ ok: true, rows, po_ids, count: rows.length });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const poId  = searchParams.get("po_id") || "";
    return await handler(token, poId);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    return await handler(body.token || "", String(body.po_id || ""));
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
