import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/products
 * Retourne le catalogue des produits actifs depuis nc_variants_boutique (vue avec scores IA).
 * Paramètres query :
 *   - world         : 'coiffure' | 'onglerie' (défaut: coiffure)
 *   - category      : filtrer par titre de collection ILIKE (ex: Shampoing)
 *   - collection_id : filtrer par ID Shopify exact dans collection_ids[]
 *   - tag           : filtrer par balise dans tags[] (ex: onglerie, promo)
 *   - search        : recherche textuelle sur le titre
 *   - sort          : price_asc | price_desc | title_asc | smart (défaut)
 *                     "smart" = sort_order manuel → is_new → promo → health_score → sales_30d
 *   - limit         : nombre max de résultats (défaut 48)
 *   - offset        : pagination (défaut 0)
 *   - is_new        : 'true' pour les articles AWAKHIR uniquement
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const world        = searchParams.get("world") || "coiffure";
    const category     = searchParams.get("category");
    const collectionId = searchParams.get("collection_id");
    const tag          = searchParams.get("tag");
    const search       = searchParams.get("search");
    const sort         = searchParams.get("sort") || "smart";
    const limit        = Math.min(Number(searchParams.get("limit")) || 48, 100);
    const offset       = Number(searchParams.get("offset")) || 0;
    const isNew        = searchParams.get("is_new") === "true";

    const sb = createServiceClient();

    // nc_variants_boutique = vue enrichie avec health_score, sales_30d, has_promo, sort_order
    let query = sb
      .from("nc_variants_boutique")
      .select(
        "variant_id, product_id, product_title, vendor, price, compare_at_price, inventory_quantity, sku, barcode, variant_title, collections_titles, collection_ids, tags, status, image_url, display_name, is_new, world, sort_order, health_score, sales_30d, cart_adds_30d, velocity, has_promo",
        { count: "exact" }
      )
      .eq("status", "active")
      .gt("inventory_quantity", 0)
      .not("image_url", "is", null)
      .neq("image_url", "")
      .range(offset, offset + limit - 1);

    // ── Filtre monde ─────────────────────────────────────────────────────
    query = query.eq("world", world);

    if (isNew) query = query.eq("is_new", true);

    // ── Filtre collection ID ─────────────────────────────────────────────
    if (collectionId) query = query.contains("collection_ids", [collectionId]);

    // ── Filtre tag ───────────────────────────────────────────────────────
    if (tag) query = query.contains("tags", [tag.toLowerCase()]);

    // ── Filtre catégorie texte ───────────────────────────────────────────
    if (category && !collectionId) {
      query = query.ilike("collections_titles", `%${category}%`);
    }

    // ── Recherche multi-champs multi-tokens ──────────────────────────────
    if (search) {
      const tokens = search.trim().split(/\s+/).filter(Boolean);
      const SEARCH_FIELDS = ["product_title", "vendor", "collections_titles", "display_name", "sku", "barcode"];
      for (const token of tokens) {
        const escaped = token.replace(/[%_]/g, "\\$&");
        const orClause = SEARCH_FIELDS.map(f => `${f}.ilike.%${escaped}%`).join(",");
        query = query.or(orClause);
      }
    }

    // ── Tri ──────────────────────────────────────────────────────────────
    switch (sort) {
      case "price_asc":
        query = query.order("price", { ascending: true });
        break;
      case "price_desc":
        query = query.order("price", { ascending: false });
        break;
      case "title_asc":
        query = query.order("product_title", { ascending: true });
        break;
      case "newest":
        query = query.order("variant_id", { ascending: false });
        break;
      default:
        // "smart" — tri intelligent conversion-first :
        // 1. sort_order ASC   → articles pinés manuellement par le owner (1–998)
        // 2. health_score DESC → score IA Agent 1 (ventes + marge + stock) — PRIORITÉ ABSOLUE
        // 3. is_new DESC      → nouveautés en bonus de départage (leur section AWAKHIR suffit)
        // 4. has_promo DESC   → articles en promo (prix barré)
        // 5. sales_30d DESC   → bestsellers tiebreaker
        // 6. variant_id DESC  → fallback FIFO inversé
        query = query
          .order("sort_order",    { ascending: true  })
          .order("health_score",  { ascending: false })
          .order("is_new",        { ascending: false })
          .order("has_promo",     { ascending: false })
          .order("sales_30d",     { ascending: false })
          .order("variant_id",    { ascending: false });
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[products] Supabase error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Fallback fuzzy (pg_trgm) si 0 résultats exacts ──────────────────
    if (search && search.trim().length >= 3 && (count === 0 || data?.length === 0)) {
      const { data: fuzzyData, error: fuzzyErr } = await sb.rpc("fuzzy_search_products", {
        p_query:    search.trim(),
        p_world:    world,
        p_category: category || null,
        p_limit:    limit,
        p_offset:   offset,
      });

      if (!fuzzyErr && fuzzyData?.length > 0) {
        return NextResponse.json({
          products: fuzzyData,
          total:    fuzzyData.length,
          limit,
          offset,
          is_fuzzy: true,
        });
      }
    }

    return NextResponse.json({
      products: data || [],
      total:    count || 0,
      limit,
      offset,
      is_fuzzy: false,
    });
  } catch (err) {
    console.error("[products] Unexpected error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
