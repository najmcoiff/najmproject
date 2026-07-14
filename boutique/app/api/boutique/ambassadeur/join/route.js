import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { isValidAlgerianPhone } from "@/lib/utils";
import { normPhone } from "@/lib/ambassadeur";

export const dynamic = "force-dynamic";

// Translittération arabe → latin (basique) pour un code lisible et humain.
const AR2LAT = {
  "ا":"a","أ":"a","إ":"i","آ":"a","ب":"b","ت":"t","ث":"th","ج":"j","ح":"h","خ":"kh",
  "د":"d","ذ":"d","ر":"r","ز":"z","س":"s","ش":"ch","ص":"s","ض":"d","ط":"t","ظ":"z",
  "ع":"a","غ":"gh","ف":"f","ق":"q","ك":"k","ل":"l","م":"m","ن":"n","ه":"h","و":"w",
  "ي":"y","ى":"a","ة":"a","ء":"","ئ":"y","ؤ":"w","پ":"p","گ":"g","ڤ":"v","چ":"ch",
};
function slugify(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  let out = "";
  for (const ch of first) {
    if (AR2LAT[ch] != null) out += AR2LAT[ch];
    else if (/[a-zA-Z]/.test(ch)) out += ch.toLowerCase();
  }
  out = out.replace(/[^a-z]/g, "");
  return out.slice(0, 12);
}
// Code = prénom (minuscule) + chiffre, ex. "karim7". Fallback "nc" + chiffres.
function makeCode(name) {
  const base = slugify(name) || "nc";
  const num = Math.floor(Math.random() * 90) + 10; // 2 chiffres
  return base + num;
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

    // Générer un code unique basé sur le prénom (ex. karim7)
    let code = makeCode(full_name);
    for (let i = 0; i < 8; i++) {
      const { data: clash } = await sb.from("nc_ambassadeurs").select("id").ilike("code", code).maybeSingle();
      if (!clash) break;
      code = makeCode(full_name);
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
