import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { isValidAlgerianPhone } from "@/lib/utils";
import { normPhone } from "@/lib/ambassadeur";

export const dynamic = "force-dynamic";

// Code lisible sans ambiguïté (pas de 0/O/1/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return "NC" + s;
}

/**
 * POST /api/boutique/ambassadeur/join
 * Body : { full_name, phone, salon }
 * Crée un coiffeur en attente (actif=false) → l'owner valide ensuite.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const full_name = String(body.full_name || "").trim();
    const rawPhone  = String(body.phone || "").trim();
    const salon     = String(body.salon || "").trim();

    if (!full_name) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
    if (!isValidAlgerianPhone(rawPhone))
      return NextResponse.json({ error: "رقم الهاتف غير صحيح" }, { status: 400 });

    const phone = normPhone(rawPhone);
    const sb = createServiceClient();

    // Déjà inscrit ?
    const { data: existing } = await sb
      .from("nc_ambassadeurs")
      .select("code, actif")
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ok: true,
        already: true,
        active: !!existing.actif,
        code: existing.code,
      });
    }

    // Générer un code unique
    let code = randomCode();
    for (let i = 0; i < 6; i++) {
      const { data: clash } = await sb.from("nc_ambassadeurs").select("id").eq("code", code).maybeSingle();
      if (!clash) break;
      code = randomCode();
    }

    const { error: insErr } = await sb.from("nc_ambassadeurs").insert({
      code,
      phone,
      full_name,
      salon: salon || null,
      type: "coiffeur",
      actif: false,          // en attente de validation owner
      source: "landing",
      created_by: "landing",
    });

    if (insErr) {
      console.error("[ambassadeur join] insert:", insErr.message);
      return NextResponse.json({ error: "خطأ، حاول مرة أخرى" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pending: true });
  } catch (err) {
    console.error("[ambassadeur join] Error:", err);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
