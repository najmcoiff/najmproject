import { cronGuard } from "@/lib/ai-helpers";

// Called by cron at 23:55 every night — saves the day's KPIs snapshot
export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!cronGuard(req)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://najmcoiffdashboard.vercel.app";

  try {
    // Fetch the dashboard data for today
    const token = req.headers.get("authorization") || `Bearer ${process.env.CRON_SECRET}`;
    const dashRes = await fetch(`${base}/api/bi/dashboard?date=${today}`, {
      headers: { authorization: token },
    });
    if (!dashRes.ok) throw new Error(`Dashboard fetch failed: ${dashRes.status}`);
    const d = await dashRes.json();

    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const snapshot = {
      snapshot_date: today,
      commandes_recoltes: d.orders?.recoltes || 0,
      commandes_confirmees: d.orders?.confirmees || 0,
      commandes_annulees: d.orders?.annulees || 0,
      commandes_attente: d.orders?.attente || 0,
      commandes_injectees: d.orders?.injectees || 0,
      taux_confirmation: d.orders?.taux_confirmation || 0,
      ca_confirme: d.orders?.ca_confirme || 0,
      panier_moyen: d.orders?.panier_moyen || 0,
      entrees_caisse: d.finance?.entrees_caisse || 0,
      sorties_caisse: d.finance?.sorties_caisse || 0,
      solde_net: d.finance?.solde_net || 0,
      livres_jour: d.delivery?.livres_jour || 0,
      retours_jour: d.delivery?.retours_jour || 0,
      montant_a_encaisser: d.delivery?.montant_a_encaisser || 0,
      nb_ruptures: d.stock?.nb_ruptures || 0,
      nb_alertes_stock: d.stock?.nb_alertes_stock || 0,
      valeur_stock_vente: d.stock?.valeur_stock_vente || 0,
      visiteurs_uniques: d.marketing?.visiteurs_uniques || 0,
      taux_conversion: d.marketing?.taux_conversion || 0,
      paniers_abandonnes: d.marketing?.paniers_abandonnes || 0,
      health_score: d.health_score || 0,
      health_status: d.health_status || "unknown",
    };

    const { error } = await db
      .from("nc_bi_daily_snapshots")
      .upsert(snapshot, { onConflict: "snapshot_date" });

    if (error) throw error;

    return Response.json({ ok: true, snapshot_date: today, health_score: d.health_score });
  } catch (err) {
    console.error("[BI snapshot]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
