import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { normPhone } from "@/lib/ambassadeur";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/ambassadeur/lookup?phone=06...
 * Accès partenaire (« دخول الشركاء ») : le coiffeur entre son numéro,
 * on lui renvoie son code pour le rediriger vers son espace.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = normPhone(searchParams.get("phone") || "");
    if (phone.length < 9) {
      return NextResponse.json({ found: false, error: "رقم غير صحيح" });
    }

    const sb = createServiceClient();
    const { data } = await sb
      .from("nc_ambassadeurs")
      .select("code, actif")
      .eq("phone", phone)
      .maybeSingle();

    if (!data) return NextResponse.json({ found: false });
    if (!data.actif) return NextResponse.json({ found: true, active: false }); // en attente

    return NextResponse.json({ found: true, active: true, code: data.code });
  } catch (err) {
    console.error("[ambassadeur lookup] Error:", err);
    return NextResponse.json({ found: false, error: "خطأ في الخادم" }, { status: 500 });
  }
}
