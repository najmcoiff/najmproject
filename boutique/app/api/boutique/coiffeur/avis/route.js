import { createServiceClient } from "@/lib/supabase";
import { resolveCode } from "@/lib/ambassadeur";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/boutique/coiffeur/avis  { code, body }
 * Le coiffeur laisse un avis → statut "pending" (visible seulement par lui + l'owner).
 * L'owner le valide dans le Dashboard pour qu'il apparaisse publiquement.
 *
 * GET /api/boutique/coiffeur/avis?code=XXX → renvoie l'avis du coiffeur (son propre avis).
 */
export async function POST(request) {
  try {
    const b = await request.json().catch(() => ({}));
    const code = String(b.code || "").trim();
    const body = String(b.body || "").trim().slice(0, 500);
    if (!code || !body) return NextResponse.json({ error: "الكود والتعليق مطلوبان" }, { status: 400 });

    const sb = createServiceClient();
    const amb = await resolveCode(sb, code);
    if (!amb) return NextResponse.json({ error: "الكود غير صحيح" }, { status: 404 });

    const first = (amb.full_name || "").trim().split(/\s+/)[0] || "حلاق";

    // Un seul avis par coiffeur : on remplace l'ancien (repasse en pending)
    await sb.from("nc_ambassadeur_avis").delete().eq("ambassadeur_phone", amb.phone).eq("created_by", "coiffeur");
    const { error } = await sb.from("nc_ambassadeur_avis").insert({
      ambassadeur_phone: amb.phone,
      ambassadeur_code:  amb.code,
      author_name:       first,
      author_city:       amb.wilaya || null,
      body,
      statut:            "pending",
      created_by:        "coiffeur",
    });
    if (error) return NextResponse.json({ error: "خطأ، حاول مجدداً" }, { status: 500 });
    return NextResponse.json({ ok: true, pending: true });
  } catch (err) {
    console.error("[avis POST]", err);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const code = String(new URL(request.url).searchParams.get("code") || "").trim();
    if (!code) return NextResponse.json({ avis: null });
    const sb = createServiceClient();
    const amb = await resolveCode(sb, code);
    if (!amb) return NextResponse.json({ avis: null });
    const { data } = await sb
      .from("nc_ambassadeur_avis")
      .select("body, statut, created_at")
      .eq("ambassadeur_phone", amb.phone)
      .eq("created_by", "coiffeur")
      .order("created_at", { ascending: false })
      .maybeSingle();
    return NextResponse.json({ avis: data || null });
  } catch {
    return NextResponse.json({ avis: null });
  }
}
