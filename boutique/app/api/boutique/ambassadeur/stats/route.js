import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/ambassadeur/stats
 * Chiffres publics de la landing : nombre RÉEL de coiffeurs actifs
 * + derniers gains anonymisés (prénom + ville + montant) pour le ticker live.
 * ⚠️ Jamais de faux chiffres. Aucune donnée sensible (ni %, ni marge, ni numéro).
 */
export async function GET() {
  try {
    const sb = createServiceClient();

    // Nombre réel de coiffeurs actifs
    const { count } = await sb
      .from("nc_ambassadeurs")
      .select("id", { count: "exact", head: true })
      .eq("actif", true);

    // Derniers gains réels (montant positif = commission, pas dépense)
    const { data: comms } = await sb
      .from("nc_ambassadeur_commissions")
      .select("ambassadeur_phone, montant_da, created_at")
      .gt("montant_da", 0)
      .order("created_at", { ascending: false })
      .limit(12);

    const phones = [...new Set((comms || []).map((c) => c.ambassadeur_phone))];
    const infoByPhone = {};
    if (phones.length > 0) {
      const { data: ambs } = await sb
        .from("nc_ambassadeurs")
        .select("phone, full_name, wilaya")
        .in("phone", phones);
      for (const a of ambs || []) {
        infoByPhone[a.phone] = {
          first_name: (a.full_name || "").trim().split(/\s+/)[0] || "حلاق",
          wilaya: a.wilaya || "",
        };
      }
    }

    // Temps relatif en darija (قبل X دقيقة/ساعة/يوم)
    const relTime = (iso) => {
      const t = iso ? new Date(iso).getTime() : 0;
      if (!t) return "قبل قليل";
      const mins = Math.max(1, Math.floor((Date.now() - t) / 60000));
      if (mins < 60)   return mins === 1 ? "قبل دقيقة" : `قبل ${mins} دقيقة`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24)    return hrs === 1 ? "قبل ساعة" : `قبل ${hrs} ساعة`;
      const days = Math.floor(hrs / 24);
      return days === 1 ? "قبل يوم" : `قبل ${days} أيام`;
    };

    const recent = (comms || []).map((c) => {
      const info = infoByPhone[c.ambassadeur_phone] || {};
      return {
        first_name: info.first_name || "حلاق",
        wilaya: info.wilaya || "",
        montant_da: Number(c.montant_da) || 0,
        ago: relTime(c.created_at),
      };
    });

    return NextResponse.json({
      partner_count: count || 0,
      recent,
    });
  } catch (err) {
    console.error("[ambassadeur stats] Error:", err);
    return NextResponse.json({ partner_count: 0, recent: [] });
  }
}
