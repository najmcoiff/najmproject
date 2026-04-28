import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * GET /api/boutique/meta-feed
 * Product Feed XML au format Meta/Google Shopping.
 * Utilisé par Meta Business Manager pour les Dynamic Ads.
 * Mis à jour toutes les 24h via le cron Meta.
 *
 * Format : RSS 2.0 + namespace g: (Google Shopping)
 * Spec : https://developers.facebook.com/docs/marketing-api/catalog/reference
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.najmcoiff.com";
const BRAND = "NajmCoiff";

export async function GET(request) {
  try {
    // Paramètre optionnel ?world=coiffure|onglerie pour feed séparé par monde
    const { searchParams } = new URL(request.url);
    const worldFilter = searchParams.get("world"); // null = tous les mondes

    const sb = createServiceClient();

    // Feed complet sans pagination — Meta a besoin de TOUS les produits en une seule page
    // Limite haute (2000) pour couvrir tout le catalogue même en cas de croissance
    const PAGE_LIMIT = 2000;

    let query = sb
      .from("nc_variants")
      .select(
        "variant_id, product_title, display_name, price, compare_at_price, image_url, world, collections_titles, description, inventory_quantity, vendor, sku, barcode, is_new"
      )
      .eq("status", "active")
      .gt("inventory_quantity", 0)
      .not("image_url", "is", null)
      .order("variant_id", { ascending: true })
      .limit(PAGE_LIMIT);

    if (worldFilter) {
      query = query.eq("world", worldFilter);
    }

    const { data: products, error } = await query;

    if (error) {
      console.error("[meta-feed] DB error:", error.message);
      return new Response("DB error", { status: 500 });
    }

    const items = products || [];

    // Construire le XML
    const xml = buildFeedXML(items, worldFilter);

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "X-Feed-Count": String(items.length),
        "X-Feed-World": worldFilter || "all",
      },
    });
  } catch (err) {
    console.error("[meta-feed] Error:", err);
    return new Response("Server error", { status: 500 });
  }
}

// ── XML Builder ──────────────────────────────────────────────────────────────

function buildFeedXML(items, worldFilter) {
  const feedTitle = worldFilter
    ? `NajmCoiff Catalogue ${worldFilter}`
    : "NajmCoiff Catalogue Complet";

  const itemsXML = items.map(buildItemXML).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXML(feedTitle)}</title>
    <link>${SITE_URL}</link>
    <description>Catalogue produits NajmCoiff — Coiffure &amp; Onglerie professionnelle</description>
${itemsXML}
  </channel>
</rss>`;
}

function buildItemXML(p) {
  const productUrl = `${SITE_URL}/produits/${p.variant_id}`;
  const price      = formatPrice(p.price);
  const oldPrice   = p.compare_at_price ? formatPrice(p.compare_at_price) : null;
  const category   = guessCategory(p.world, p.collections_titles);
  const title      = escapeXML(p.display_name || p.product_title || "Produit NajmCoiff");
  const desc       = escapeXML(
    p.description ||
    p.display_name ||
    `${p.product_title} — disponible sur NajmCoiff`
  );

  // Nettoyer l'URL image (Supabase Storage public)
  const imageUrl = cleanImageUrl(p.image_url);

  return `    <item>
      <g:id>${escapeXML(String(p.variant_id))}</g:id>
      <g:title>${title}</g:title>
      <g:description>${desc}</g:description>
      <g:link>${productUrl}</g:link>
      <g:image_link>${imageUrl}</g:image_link>
      <g:availability>in stock</g:availability>
      <g:condition>new</g:condition>
      <g:price>${price}</g:price>${oldPrice ? `\n      <g:sale_price>${price}</g:sale_price>\n      <g:original_price>${oldPrice}</g:original_price>` : ""}
      <g:brand>${BRAND}</g:brand>
      <g:google_product_category>${escapeXML(category)}</g:google_product_category>
      <g:product_type>${escapeXML(p.world === "onglerie" ? "Onglerie" : "Coiffure")}</g:product_type>${p.sku ? `\n      <g:mpn>${escapeXML(String(p.sku))}</g:mpn>` : ""}${p.barcode ? `\n      <g:gtin>${escapeXML(String(p.barcode))}</g:gtin>` : ""}
      <g:custom_label_0>${escapeXML(p.world || "coiffure")}</g:custom_label_0>
      <g:custom_label_1>${p.is_new ? "nouveaute" : "catalogue"}</g:custom_label_1>
    </item>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(raw) {
  const num = parseFloat(String(raw).replace(",", ".")) || 0;
  return `${num.toFixed(2)} DZD`;
}

function cleanImageUrl(url) {
  if (!url) return `${SITE_URL}/logo.png`;
  // Supabase Storage : s'assurer que c'est une URL https publique
  if (url.startsWith("http")) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function guessCategory(world, collections) {
  if (world === "onglerie") return "Health &amp; Beauty > Personal Care > Cosmetics > Nail Care";
  const c = (collections || "").toLowerCase();
  if (c.includes("wax") || c.includes("gel") || c.includes("brillantine")) return "Health &amp; Beauty > Personal Care > Hair Care > Hair Styling Products";
  if (c.includes("coloration") || c.includes("couleur")) return "Health &amp; Beauty > Personal Care > Hair Care > Hair Color";
  if (c.includes("tondeuse") || c.includes("clippers")) return "Health &amp; Beauty > Personal Care > Hair Removal > Electric Hair Clippers";
  if (c.includes("ciseaux") || c.includes("scissor")) return "Health &amp; Beauty > Personal Care > Hair Care > Scissors";
  return "Health &amp; Beauty > Personal Care > Hair Care";
}

function escapeXML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
