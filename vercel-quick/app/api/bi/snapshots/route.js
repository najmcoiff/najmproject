import { createClient } from "@supabase/supabase-js";
import { ownerGuard } from "@/lib/ai-helpers";

export async function GET(req) {
  if (!ownerGuard(req)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "30", 10);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await db
    .from("nc_bi_daily_snapshots")
    .select("snapshot_date, ca_confirme, commandes_confirmees, health_score, health_status, taux_confirmation, livres_jour, nb_ruptures")
    .order("snapshot_date", { ascending: true })
    .limit(limit);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ snapshots: data || [] });
}
