import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/coupon?code=XXX
 * Validation simple du code (sans calcul de marge — rétrocompatibilité).
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("code") || "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ valid: false, error: "أدخل الكود" }, { status: 400 });
    }

    const sb = createServiceClient();
    const { data, error } = await sb
      .from("nc_partenaires")
      .select("code, nom, percentage, active")
      .ilike("code", code)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      console.error("[coupon GET] Supabase error:", error.message);
      return NextResponse.json({ valid: false, error: "خطأ في التحقق" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ valid: false, error: "الكود غير صحيح أو منتهي الصلاحية" });
    }

    return NextResponse.json({
      valid:      true,
      code:       data.code,
      nom:        data.nom,
      percentage: Number(data.percentage),
    });
  } catch (err) {
    console.error("[coupon GET] Unexpected error:", err);
    return NextResponse.json({ valid: false, error: "خطأ في الخادم" }, { status: 500 });
  }
}

/**
 * POST /api/boutique/coupon
 * Body : { code: string, items: [{ variant_id, qty, price }] }
 *
 * Valide le code + récupère le coût d'achat pour chaque variant :
 *   Source 1 : nc_po_lines.purchase_price (prix d'achat réel PO — le plus récent)
 *   Source 2 : nc_variants.cost_price     (coût Shopify migré — fallback si absent de nc_po_lines)
 *
 * La remise par article = (prix_vente - coût) × percentage / 100
 * Exemple : coût=500, vente=1000, 20% → remise=100 → prix final=900
 *
 * ⚠️  Si le coût est INCONNU (absent des deux sources), remise = 0 DA pour cet article.
 *     On ne réduit JAMAIS sur le prix entier — uniquement sur la marge réelle.
 *
 * Retourne :
 * {
 *   valid: true,
 *   code, nom, percentage,
 *   purchase_prices: { [variant_id]: cost }   ← absent = 0 remise
 * }
 */
export async function POST(request) {
  try {
    const body    = await request.json().catch(() => ({}));
    const rawCode = body.code || "";
    const items   = Array.isArray(body.items) ? body.items : [];
    const code    = rawCode.trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ valid: false, error: "أدخل الكود" }, { status: 400 });
    }

    const sb = createServiceClient();

    // ── 1. Valider le code partenaire ────────────────────────────────────────
    const { data: partner, error: partnerErr } = await sb
      .from("nc_partenaires")
      .select("code, nom, percentage, active")
      .ilike("code", code)
      .eq("active", true)
      .maybeSingle();

    if (partnerErr) {
      console.error("[coupon POST] Supabase error:", partnerErr.message);
      return NextResponse.json({ valid: false, error: "خطأ في التحقق" }, { status: 500 });
    }

    if (!partner) {
      return NextResponse.json({ valid: false, error: "الكود غير صحيح أو منتهي الصلاحية" });
    }

    const percentage = Number(partner.percentage);

    // ── 2. Récupérer le coût d'achat pour chaque variant ────────────────────
    // Source prioritaire : nc_po_lines (prix PO réel, le plus récent)
    // Source secondaire  : nc_variants.cost_price (coût Shopify migré via T128)
    const purchase_prices = {};

    if (items.length > 0) {
      const variantIds = [...new Set(items.map((i) => i.variant_id).filter(Boolean))];

      // Source 1 — nc_po_lines (ordre DESC = plus récent en premier)
      const { data: poLines } = await sb
        .from("nc_po_lines")
        .select("variant_id, purchase_price, created_at")
        .in("variant_id", variantIds)
        .order("created_at", { ascending: false });

      if (poLines) {
        for (const line of poLines) {
          if (!(line.variant_id in purchase_prices) && line.purchase_price != null) {
            purchase_prices[line.variant_id] = Number(line.purchase_price);
          }
        }
      }

      // Source 2 — nc_variants.cost_price pour les variants manquants
      const missingIds = variantIds.filter((id) => !(id in purchase_prices));
      if (missingIds.length > 0) {
        const { data: ncVariants } = await sb
          .from("nc_variants")
          .select("variant_id, cost_price")
          .in("variant_id", missingIds);

        if (ncVariants) {
          for (const v of ncVariants) {
            if (v.cost_price != null && Number(v.cost_price) > 0) {
              purchase_prices[String(v.variant_id)] = Number(v.cost_price);
            }
          }
        }
      }
    }

    return NextResponse.json({
      valid:      true,
      code:       partner.code,
      nom:        partner.nom,
      percentage,
      purchase_prices,
    });
  } catch (err) {
    console.error("[coupon POST] Unexpected error:", err);
    return NextResponse.json({ valid: false, error: "خطأ في الخادم" }, { status: 500 });
  }
}
