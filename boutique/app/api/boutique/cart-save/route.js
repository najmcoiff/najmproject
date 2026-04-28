// POST /api/boutique/cart-save
// Sauvegarde phone + prénom dans nc_carts dès saisie formulaire
// Permet la récupération des paniers abandonnés via WhatsApp
import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { session_id, phone, first_name, items, cart_total } = await req.json();
    if (!session_id || !phone) return NextResponse.json({ ok: false });

    const clean_phone = String(phone).replace(/\s/g, "").replace(/^0/, "213").replace(/^\+/, "");
    if (clean_phone.length < 9) return NextResponse.json({ ok: false });

    const sb = createServiceClient();

    await sb.from("nc_carts").upsert({
      session_id,
      phone:      clean_phone,
      first_name: first_name || null,
      items:      items || [],
      cart_total: cart_total || 0,
      converted:  false,
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id" });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
