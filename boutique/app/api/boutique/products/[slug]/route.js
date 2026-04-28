import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VARIANT_COLS =
  "variant_id, product_id, product_title, vendor, price, inventory_quantity, sku, barcode, variant_title, collections_titles, status, image_url, display_name";

/**
 * GET /api/boutique/products/[slug]
 * Retourne un produit et TOUTES ses variantes depuis nc_variants.
 *
 * Stratégie en 2 étapes :
 *   1. Résoudre le slug → product_id
 *      a. slug == product_id  → requête directe sur product_id
 *      b. slug == variant_id  → trouver la variante, extraire son product_id
 *      c. slug == sku         → trouver la variante par sku, extraire son product_id
 *      d. fallback title      → recherche ilike sur product_title
 *   2. Charger TOUTES les variantes actives de ce product_id
 */
export async function GET(request, { params }) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: "Slug manquant" }, { status: 400 });
    }

    const sb = createServiceClient();

    // ── Étape 1 : résoudre product_id depuis le slug ──────────────────────────

    let resolvedProductId = null;

    // a. Essayer product_id direct
    const byProductId = await sb
      .from("nc_variants")
      .select("product_id")
      .eq("product_id", slug)
      .limit(1)
      .maybeSingle();

    if (!byProductId.error && byProductId.data) {
      resolvedProductId = byProductId.data.product_id;
    }

    // b. Essayer variant_id
    if (!resolvedProductId) {
      const byVariantId = await sb
        .from("nc_variants")
        .select("product_id")
        .eq("variant_id", slug)
        .limit(1)
        .maybeSingle();

      if (!byVariantId.error && byVariantId.data) {
        resolvedProductId = byVariantId.data.product_id;
      }
    }

    // c. Essayer sku
    if (!resolvedProductId) {
      const bySku = await sb
        .from("nc_variants")
        .select("product_id")
        .eq("sku", slug)
        .limit(1)
        .maybeSingle();

      if (!bySku.error && bySku.data) {
        resolvedProductId = bySku.data.product_id;
      }
    }

    // ── Étape 2 : charger toutes les variantes du product_id résolu ───────────

    let data = null;

    if (resolvedProductId) {
      const { data: rows, error } = await sb
        .from("nc_variants")
        .select(VARIANT_COLS)
        .eq("product_id", resolvedProductId)
        .eq("status", "active")
        .order("price", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      data = rows;
    }

    // d. Fallback titre (slug = mots séparés par des tirets)
    if (!data || data.length === 0) {
      const titleSearch = slug.replace(/-/g, " ");
      const { data: rows, error } = await sb
        .from("nc_variants")
        .select(VARIANT_COLS)
        .eq("status", "active")
        .ilike("product_title", `%${titleSearch}%`)
        .order("price", { ascending: true })
        .limit(20);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      data = rows;
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
    }

    // ── Construire la réponse produit ─────────────────────────────────────────

    const first = data[0];
    const product = {
      product_id:    first.product_id,
      product_title: first.product_title,
      vendor:        first.vendor,
      collections:   first.collections_titles,
      image_url:     first.image_url,
      slug,
      variants: data.map((v) => ({
        variant_id:         v.variant_id,
        variant_title:      v.variant_title,
        display_name:       v.display_name,
        price:              v.price,
        inventory_quantity: v.inventory_quantity,
        sku:                v.sku,
        barcode:            v.barcode,
        image_url:          v.image_url,
      })),
      min_price: Math.min(...data.map((v) => Number(v.price) || 0)),
      max_price: Math.max(...data.map((v) => Number(v.price) || 0)),
      in_stock:  data.some((v) => Number(v.inventory_quantity) > 0),
    };

    return NextResponse.json({ product });
  } catch (err) {
    console.error("[products/slug] Unexpected error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
