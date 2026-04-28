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

/** PATCH /api/owner/collections/[id] */
export async function PATCH(req, { params }) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const fields = await req.json();
  fields.updated_at = new Date().toISOString();

  const { error } = await sb().from("nc_collections").update(fields).eq("collection_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/owner/collections/[id] — désactiver (soft delete) */
export async function DELETE(req, { params }) {
  if (!userGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await params;
  const { error } = await sb()
    .from("nc_collections")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("collection_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
