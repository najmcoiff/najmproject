import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function userGuard(req) {
  const auth  = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "").trim() || req.nextUrl?.searchParams.get("token");
  return verifyToken(token);
}

/** GET /api/owner/catalogue
 *  ?search=&world=&collection_id=&status=&sort=&date_from=&date_to=&limit=&offset=
 *  sort: recent (défaut) | oldest | price_asc | price_desc | name_asc | stock_asc | stock_desc
 */
export async function GET(req) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const sp        = req.nextUrl.searchParams;
  const search    = sp.get("search");
  const world     = sp.get("world");
  const colId     = sp.get("collection_id");
  const status    = sp.get("status") || "all";
  const sort      = sp.get("sort") || "recent";
  const dateFrom  = sp.get("date_from");
  const dateTo    = sp.get("date_to");
  const limit     = Math.min(Number(sp.get("limit")) || 50, 200);
  const offset    = Number(sp.get("offset")) || 0;

  const SORT_MAP = {
    recent:     ["updated_at",          false],
    oldest:     ["updated_at",          true],
    price_asc:  ["price",               true],
    price_desc: ["price",               false],
    name_asc:   ["product_title",       true],
    stock_asc:  ["inventory_quantity",  true],
    stock_desc: ["inventory_quantity",  false],
    pinned:     ["sort_order",          true],
  };
  const [sortCol, ascending] = SORT_MAP[sort] || SORT_MAP.recent;

  let q = sb()
    .from("nc_variants")
    .select(
      "variant_id, product_id, product_title, vendor, price, cost_price, compare_at_price, inventory_quantity, image_url, sku, barcode, status, world, is_new, tags, collections, collections_titles, collection_ids, description, display_name, updated_at, sort_order",
      { count: "exact" }
    )
    .not("product_title", "is", null) // Exclure variantes fantômes Shopify (sans titre)
    .order(sortCol, { ascending })
    .range(offset, offset + limit - 1);

  if (status !== "all") q = q.eq("status", status);
  if (world)            q = q.eq("world", world);
  if (search) {
    // Recherche intelligente multi-champs + multi-tokens (AND entre mots, OR entre champs)
    const SEARCH_FIELDS = ["product_title", "vendor", "display_name", "sku", "barcode", "collections_titles"];
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const escaped = token.replace(/[%_]/g, "\\$&");
      q = q.or(SEARCH_FIELDS.map(f => `${f}.ilike.%${escaped}%`).join(","));
    }
  }
  if (colId)            q = q.contains("collection_ids", [colId]);
  if (dateFrom)         q = q.gte("updated_at", dateFrom);
  if (dateTo)           q = q.lte("updated_at", dateTo + "T23:59:59Z");

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ articles: data || [], total: count || 0, limit, offset });
}

/** POST /api/owner/catalogue — créer un nouvel article */
export async function POST(req) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await req.json();
  const {
    product_title, price, inventory_quantity,
    cost_price, compare_at_price, image_url, sku, barcode,
    vendor, description, world, tags,
    collections, collections_titles, collection_ids,
    is_new, status,
  } = body;

  if (!product_title || price == null || inventory_quantity == null) {
    return NextResponse.json({ error: "Champs obligatoires : product_title, price, inventory_quantity" }, { status: 400 });
  }

  // Générer un variant_id unique (préfixe "nc_" + timestamp + aléatoire)
  const variant_id = `nc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const product_id = `nc_p_${Date.now()}`;
  const display_name = product_title;

  const row = {
    variant_id,
    product_id,
    product_title:    product_title.trim(),
    display_name,
    price:            Number(price),
    cost_price:       cost_price ? Number(cost_price) : null,
    compare_at_price: compare_at_price ? Number(compare_at_price) : null,
    inventory_quantity: Number(inventory_quantity),
    image_url:        image_url || null,
    sku:              sku || null,
    barcode:          barcode || null,
    vendor:           vendor || "NajmCoiff",
    description:      description || null,
    world:            world || "coiffure",
    tags:             Array.isArray(tags) ? tags : (tags ? tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : []),
    collections:      Array.isArray(collections) ? collections : [],
    collections_titles: collections_titles || "",
    collection_ids:   Array.isArray(collection_ids) ? collection_ids : [],
    is_new:           is_new || false,
    is_new_since:     is_new ? new Date().toISOString() : null,
    status:           status || "active",
    updated_at:       new Date().toISOString(),
  };

  const { data, error } = await sb().from("nc_variants").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, article: data }, { status: 201 });
}

/** PATCH /api/owner/catalogue — modifier un article (variant_id dans le body) */
export async function PATCH(req) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await req.json();
  const { variant_id, ...fields } = body;
  if (!variant_id) return NextResponse.json({ error: "variant_id manquant" }, { status: 400 });

  // Normaliser les tags si fournis en string
  if (fields.tags && !Array.isArray(fields.tags)) {
    fields.tags = fields.tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  }

  // Tracker la date de passage à is_new pour l'auto-expiry (21 jours)
  if (fields.is_new === true) {
    fields.is_new_since = new Date().toISOString();
  } else if (fields.is_new === false) {
    fields.is_new_since = null;
  }

  fields.updated_at = new Date().toISOString();

  const { error } = await sb().from("nc_variants").update(fields).eq("variant_id", variant_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
