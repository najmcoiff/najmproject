import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/config
 * Retourne les paramètres publics de nc_boutique_config.
 * Utilise la clé anon (lecture seule, RLS autorise SELECT pour tous).
 *
 * Filtre les clés sensibles (meta_pixel_*, instagram_handle, etc.) si non requis.
 * Cache : 60 secondes côté CDN (revalidate).
 */

// Clés autorisées en lecture publique
const PUBLIC_KEYS = new Set([
  'promo_banner_text',
  'promo_banner_active',
  'site_name',
  'whatsapp_number',
  'facebook_coiffure',
  'instagram_handle',
  'meta_pixel_coiffure',
  'meta_pixel_onglerie',
]);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("nc_boutique_config")
      .select("key, value")
      .in("key", [...PUBLIC_KEYS]);

    if (error) {
      // Table pas encore créée → retourner config vide (pas d'erreur 500)
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json({ config: {} }, {
          headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
        });
      }
      console.error("[config] Supabase error:", error.message);
      return NextResponse.json({ config: {} }, { status: 200 });
    }

    // Transformer en objet clé/valeur
    const config = Object.fromEntries(
      (data || []).map((row) => [row.key, row.value])
    );

    return NextResponse.json({ config }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("[config] Unexpected error:", err);
    return NextResponse.json({ config: {} });
  }
}
