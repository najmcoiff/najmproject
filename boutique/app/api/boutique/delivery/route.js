import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/delivery
 *
 * Mode 1 — Prix livraison :
 *   ?wilaya_code=16&type=home   → { price, default }
 *
 * Mode 2 — Liste communes :
 *   ?wilaya_code=16&list=communes → { communes: ["Alger Centre", "Kouba", ...] }
 *
 * Sources :
 *   - Prix    : nc_delivery_config (T07) avec fallback défaut
 *   - Communes: nc_communes (T109)
 */

const DEFAULT_PRICES = { home: 400, office: 300 };

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const wilayaCode = Number(searchParams.get("wilaya_code") || 0);
    const listMode   = searchParams.get("list") === "communes";
    const type       = searchParams.get("type") === "office" ? "office" : "home";

    if (!wilayaCode || wilayaCode < 1 || wilayaCode > 58) {
      if (listMode) return NextResponse.json({ communes: [] });
      return NextResponse.json({ price: DEFAULT_PRICES[type], default: true });
    }

    const sb = createServiceClient();

    // ── Mode communes ──────────────────────────────────────────────
    if (listMode) {
      const { data, error } = await sb
        .from("nc_communes")
        .select("commune_name")
        .eq("wilaya_code", wilayaCode)
        .order("commune_name", { ascending: true });

      if (error || !data?.length) {
        return NextResponse.json({ communes: [] });
      }

      return NextResponse.json({
        communes: data.map(r => r.commune_name),
      });
    }

    // ── Mode prix ──────────────────────────────────────────────────
    const { data, error } = await sb
      .from("nc_delivery_config")
      .select("price_home, price_office")
      .eq("wilaya_code", wilayaCode)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ price: DEFAULT_PRICES[type], default: true });
    }

    const price = type === "office" ? data.price_office : data.price_home;
    return NextResponse.json({ price: Number(price), default: false });

  } catch {
    return NextResponse.json({ price: DEFAULT_PRICES.home, default: true });
  }
}
