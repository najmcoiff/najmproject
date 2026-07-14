import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function adminSB() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
// Tout utilisateur dashboard connecté peut voir l'affiliation d'une commande.
function ownerGuard(req) {
  const raw = req.headers.get("Authorization")?.replace("Bearer ", "")
    || new URL(req.url).searchParams.get("token") || "";
  if (verifyToken(raw)) return true;
  return raw === process.env.DASHBOARD_SECRET;
}

const SCEN = {
  "2_vente_directe": "Vente directe (client via code)",
  "3_rente_sans_code": "Rente (rachat sans code)",
  "depense_credit": "Crédit dépensé",
};

/**
 * GET /api/ambassadeur/order-info?order_id=...
 * Renvoie l'affiliation (coiffeur + commission) et le code promo d'une commande,
 * pour affichage dans le détail commande du Dashboard.
 */
export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const orderId = new URL(req.url).searchParams.get("order_id");
  if (!orderId) return NextResponse.json({ error: "order_id requis" }, { status: 400 });

  const sb = adminSB();
  const { data: order } = await sb
    .from("nc_orders")
    .select("ambassadeur_code, ambassadeur_phone, coupon_code, coupon_discount")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!order) return NextResponse.json({ affiliation: null, coupon: null });

  const coupon = order.coupon_code
    ? { code: order.coupon_code, discount: Number(order.coupon_discount) || 0 }
    : null;

  let affiliation = null;
  if (order.ambassadeur_phone) {
    const [{ data: coif }, { data: comms }] = await Promise.all([
      sb.from("nc_ambassadeurs").select("full_name, code").eq("phone", order.ambassadeur_phone).maybeSingle(),
      sb.from("nc_ambassadeur_commissions").select("scenario, montant_da, statut").eq("order_id", orderId),
    ]);
    affiliation = {
      code:          order.ambassadeur_code,
      coiffeur_name: coif?.full_name || "—",
      commissions:   (comms || []).map((c) => ({
        label:   SCEN[c.scenario] || c.scenario,
        montant: Number(c.montant_da) || 0,
        statut:  c.statut,
      })),
    };
  }

  return NextResponse.json({ affiliation, coupon });
}
