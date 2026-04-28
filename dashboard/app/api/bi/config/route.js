import { createClient } from "@supabase/supabase-js";
import { ownerGuard } from "@/lib/ai-helpers";

const getDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

export async function GET(req) {
  if (!ownerGuard(req)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  const db = getDb();
  const { data, error } = await db
    .from("nc_bi_config")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PATCH(req) {
  if (!ownerGuard(req)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  const body = await req.json();
  const allowed = [
    "dette_initiale",
    "objectif_benefice_mensuel",
    "objectif_ca_mensuel",
    "objectif_commandes_jour",
    "objectif_taux_livraison",
  ];
  const updates = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Aucun champ valide" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();
  updates.updated_by = "owner";

  const db = getDb();
  const { data, error } = await db
    .from("nc_bi_config")
    .update(updates)
    .eq("id", 1)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, config: data });
}
