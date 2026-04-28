// ═══════════════════════════════════════════════════════════════════
//  POST /api/print/pos
//  Impression ticket thermique POS via PrintNode.
//
//  Body: { token, order_id, force? }
//    force = false (défaut) : auto-print → bloqué si commande > 5 min
//    force = true           : impression manuelle → toujours autorisée
//
//  Logique 5-min :
//    Si force=false ET order_date > 5min → retourne { ok:false, expired:true }
//    Sinon → impression + mise à jour printed_at dans nc_orders
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";
import {
  printPosOrder,
  isWithinAutoPrintWindow,
  AUTO_PRINT_WINDOW_MS,
} from "@/lib/printnode";

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

    const orderId = String(body.order_id || "").trim();
    const force   = body.force === true || body.force === "true";

    if (!orderId) return NextResponse.json({ ok: false, error: "order_id requis" }, { status: 400 });

    const supabase = adminSB();

    // ── 1. Récupérer la commande ──────────────────────────────────
    const { data: order, error: fetchErr } = await supabase
      .from("nc_orders")
      .select("order_id, order_name, order_date, order_source, order_total, order_items_summary, shopify_order_name, printed_at, items_json")
      .eq("order_id", orderId)
      .maybeSingle();

    if (fetchErr || !order) {
      return NextResponse.json({ ok: false, error: "Commande introuvable" }, { status: 404 });
    }

    if ((order.order_source || "").toLowerCase() !== "pos") {
      return NextResponse.json({ ok: false, error: "Commande non POS" }, { status: 400 });
    }

    // ── 2. Vérification fenêtre 5 min (auto-print seulement) ─────
    if (!force && !isWithinAutoPrintWindow(order.order_date)) {
      return NextResponse.json({
        ok:      false,
        expired: true,
        error:   `Fenêtre auto-print dépassée (>${AUTO_PRINT_WINDOW_MS / 60000} min)`,
        printed_at: order.printed_at || null,
      });
    }

    // ── 3. Impression via PrintNode ───────────────────────────────
    const printResult = await printPosOrder(order);

    // ── 4. Mettre à jour printed_at dans nc_orders ────────────────
    const printedAt = new Date().toISOString();
    await supabase
      .from("nc_orders")
      .update({ printed_at: printedAt })
      .eq("order_id", orderId);

    return NextResponse.json({
      ok:           true,
      order_id:     orderId,
      printed_at:   printedAt,
      print_job_id: printResult.print_job_id,
      manual:       force,
    });

  } catch (err) {
    console.error("PRINT_POS_ERROR", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
