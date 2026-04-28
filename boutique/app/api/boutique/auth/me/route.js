import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifyToken, extractToken } from "@/lib/customer-auth";

/**
 * GET /api/boutique/auth/me
 * Authorization: Bearer <token>
 * Retourne le profil client + ses 20 dernières commandes.
 */
export async function GET(request) {
  const token = extractToken(request);
  const payload = verifyToken(token);

  if (!payload) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const sb = createServiceClient();

  const { data: customer, error } = await sb
    .from("nc_customers")
    .select("id, phone, full_name, wilaya, address, total_orders, total_spent, created_at, last_login")
    .eq("id", payload.id)
    .maybeSingle();

  if (error || !customer) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  // Récupérer les commandes du client (via customer_phone)
  const { data: orders } = await sb
    .from("nc_orders")
    .select(
      "id, order_name, created_at, total_price, status, delivery_type, wilaya, commune, items_json"
    )
    .eq("customer_phone", customer.phone)
    .eq("order_source", "nc_boutique")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    customer,
    orders: orders || [],
  });
}
