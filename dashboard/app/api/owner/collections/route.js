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

/** GET /api/owner/collections — liste toutes les collections */
export async function GET(req) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const world = req.nextUrl.searchParams.get("world");

  let q = sb()
    .from("nc_collections")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (world) q = q.eq("world", world);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ collections: data || [] });
}

/** POST /api/owner/collections — créer une nouvelle collection */
export async function POST(req) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { title, world, sort_order, image_url } = await req.json();
  if (!title) return NextResponse.json({ error: "title manquant" }, { status: 400 });

  // Générer un ID unique local (préfixe "nc_col_")
  const collection_id = `nc_col_${Date.now()}`;
  const handle = title.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 60);

  const row = {
    collection_id,
    title:          title.trim(),
    handle,
    world:          world || "coiffure",
    sort_order:     Number(sort_order) || 0,
    image_url:      image_url || null,
    products_count: 0,
    active:         true,
    updated_at:     new Date().toISOString(),
  };

  const { data, error } = await sb().from("nc_collections").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, collection: data }, { status: 201 });
}

/** PATCH /api/owner/collections — modifier une collection (collection_id dans body) */
export async function PATCH(req) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { collection_id, ...fields } = await req.json();
  if (!collection_id) return NextResponse.json({ error: "collection_id manquant" }, { status: 400 });

  fields.updated_at = new Date().toISOString();

  const { error } = await sb().from("nc_collections").update(fields).eq("collection_id", collection_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
