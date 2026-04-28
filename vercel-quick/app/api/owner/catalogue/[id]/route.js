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

/** PATCH /api/owner/catalogue/[id] — mise à jour rapide d'un article */
export async function PATCH(req, { params }) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const fields = await req.json();

  if (fields.tags && !Array.isArray(fields.tags)) {
    fields.tags = fields.tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  }
  fields.updated_at = new Date().toISOString();

  const { error } = await sb().from("nc_variants").update(fields).eq("variant_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/owner/catalogue/[id] — suppression définitive d'un article (hard delete) */
export async function DELETE(req, { params }) {
  const user = userGuard(req);
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const supabase = sb();

  // Charger l'article avant suppression pour le log
  const { data: articles } = await supabase
    .from("nc_variants")
    .select("variant_id, product_title, price, inventory_quantity, world")
    .eq("variant_id", id)
    .limit(1);

  const article = articles?.[0];
  if (!article) return NextResponse.json({ error: `Article ${id} introuvable` }, { status: 404 });

  // Hard DELETE
  const { error } = await supabase.from("nc_variants").delete().eq("variant_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log nc_events (schéma réel : log_type, source, actor, variant_id, label, note)
  try {
    await supabase.from("nc_events").insert({
      ts:         new Date().toISOString(),
      log_type:   "DELETE_ARTICLE",
      source:     "VERCEL",
      actor:      user.nom,
      variant_id: id,
      label:      article.product_title,
      note:       JSON.stringify({
        price: article.price,
        stock: article.inventory_quantity,
        world: article.world,
      }),
    });
  } catch { /* fire-and-forget */ }

  return NextResponse.json({ ok: true, deleted: id, product_title: article.product_title });
}
