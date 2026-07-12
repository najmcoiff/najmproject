import { createServiceClient } from "@/lib/supabase";
import { resolveCode } from "@/lib/ambassadeur";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/ambassadeur?code=XXX
 * Valide un code ambassadeur et renvoie le strict nécessaire pour la page
 * "commande sous garantie" : prénom du coiffeur, rien de plus.
 *
 * ⚠️ On ne renvoie JAMAIS de %, de marge, ni de montant de commission au client.
 *    Le client voit seulement : « Tu commandes sous la garantie de <prénom> ».
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("code") || "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ valid: false, error: "أدخل الكود" }, { status: 400 });
    }

    const sb = createServiceClient();
    const amb = await resolveCode(sb, code);

    if (!amb) {
      return NextResponse.json({ valid: false, error: "الكود غير صحيح" });
    }

    // Prénom uniquement (premier mot) — jamais le nom complet ni le téléphone.
    const firstName = (amb.full_name || "").trim().split(/\s+/)[0] || "";

    return NextResponse.json({
      valid: true,
      code: amb.code,
      first_name: firstName,
      // Avantages affichés au client (aucun chiffre financier)
      perks: {
        express: true,
        authentique: true,
        garantie_coiffeur: true,
      },
    });
  } catch (err) {
    console.error("[ambassadeur GET] Unexpected error:", err);
    return NextResponse.json({ valid: false, error: "خطأ في الخادم" }, { status: 500 });
  }
}
