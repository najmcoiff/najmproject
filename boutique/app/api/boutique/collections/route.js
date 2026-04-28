import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/collections
 * Retourne les collections actives depuis nc_collections.
 * Paramètres query :
 *   - world : 'coiffure' | 'onglerie' (défaut: coiffure)
 *   - all   : 'true' pour retourner les deux mondes
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const world  = searchParams.get("world") || "coiffure";
    const allW   = searchParams.get("all") === "true";

    const sb = createServiceClient();

    const homepage = searchParams.get("homepage") === "true";

    let query = sb
      .from("nc_collections")
      .select("collection_id, title, handle, world, products_count, image_url, sort_order, show_on_homepage, show_in_filter")
      .eq("active", true)
      .gt("products_count", 0)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });

    if (!allW) {
      query = query.eq("world", world);
    }

    if (homepage) {
      query = query.eq("show_on_homepage", true);
    } else {
      query = query.eq("show_in_filter", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[collections] Supabase error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ collections: data || [] });
  } catch (err) {
    console.error("[collections] Unexpected error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
