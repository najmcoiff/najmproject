import { cronGuard, ownerGuard } from "@/lib/ai-helpers";

// Called by cron at 19:00 UTC (= 20:00 Algeria) — sends daily WhatsApp report to owner
export async function GET(req) { return POST(req); }

export async function POST(req) {
  const isCron = cronGuard(req);
  const isOwner = ownerGuard(req);
  if (!isCron && !isOwner) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://najmcoiffdashboard.vercel.app";
  const token = req.headers.get("authorization") || `Bearer ${process.env.CRON_SECRET}`;

  try {
    // Fetch today's KPIs
    const dashRes = await fetch(`${base}/api/bi/dashboard?date=${today}`, {
      headers: { authorization: token },
    });
    if (!dashRes.ok) throw new Error(`Dashboard fetch failed: ${dashRes.status}`);
    const d = await dashRes.json();

    // Format the WhatsApp message
    const dateLabel = new Date().toLocaleDateString("fr-DZ", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    const healthEmoji =
      d.health_status === "green"
        ? "🟢"
        : d.health_status === "yellow"
        ? "🟡"
        : d.health_status === "orange"
        ? "🟠"
        : "🔴";

    const topAgent =
      d.agents?.length > 0
        ? `${d.agents[0].agent} (${d.agents[0].confirmees} conf.)`
        : "—";

    const fmt = (n) => Math.round(n ?? 0).toLocaleString("fr-DZ");
    const deltaSign = (v) => v > 0 ? `▲+${fmt(v)}` : v < 0 ? `▼${fmt(v)}` : "▬ stable";

    const wapp = d.whatsapp || {};
    const j1 = d.j1 || {};

    const msg = `🌙 *NajmCoiff — Rapport du ${dateLabel}*

📦 *COMMANDES*
Récoltées : ${d.boutique?.recoltes ?? 0} (${deltaSign(j1.delta_recoltes ?? 0)} vs hier)
Confirmées : ${d.boutique?.confirmees ?? 0} · ${d.boutique?.taux_confirmation ?? 0}% (${deltaSign(j1.delta_confirmees ?? 0)})
Annulées : ${d.boutique?.annulees ?? 0}  |  POS : ${d.pos?.nb_ventes ?? 0}

💎 *BÉNÉFICE*
Du jour : ${fmt(d.benefice?.total_jour)} DA (${deltaSign(j1.delta_benefice ?? 0)})
CA total : ${fmt((d.boutique?.ca_confirme ?? 0) + (d.pos?.ca_pos ?? 0))} DA
Mensuel : ${fmt(d.mensuel?.benefice_mois)} DA / ${fmt(d.mensuel?.objectif_benefice)} DA (${d.mensuel?.progression_pct ?? 0}%)

🚚 *LIVRAISON*
Livrés aujourd'hui : ${d.delivery?.livres_jour ?? 0}  |  Retournés : ${d.delivery?.retours_jour ?? 0}
Taux 30j : ${d.delivery?.taux_livraison_30j ?? 0}%  |  À encaisser ZR : ${fmt(d.delivery?.pret_a_recuperer)} DA

📲 *WHATSAPP MARKETING*
${wapp.envoyes > 0
  ? `Envoyés : ${wapp.envoyes} · Lus : ${wapp.lus} (${wapp.taux_lecture}%)\nConvertis : ${wapp.convertis} (${wapp.taux_conversion}%) → ${fmt(wapp.revenue_da)} DA attribués`
  : "Aucun message envoyé aujourd'hui"}

📱 *BOUTIQUE EN LIGNE*
Visiteurs : ${d.marketing?.visiteurs_uniques ?? 0}  |  Conversion : ${d.marketing?.taux_conversion ?? 0}%
Paniers abandonnés : ${d.marketing?.paniers_abandonnes ?? 0}

📊 *STOCK*
Ruptures : ${d.stock?.nb_ruptures ?? 0}  |  Articles sans prix achat : ${d.stock?.nb_sans_prix_achat ?? 0}

👥 *ÉQUIPE*
Meilleur agent : ${topAgent}

🏥 *SCORE SANTÉ : ${d.health_score}/100 ${healthEmoji}*
${d.health_message}`;

    // Send via WATI
    const watiUrl = process.env.WATI_API_URL;
    const watiToken = process.env.WATI_API_TOKEN;
    const ownerPhone = process.env.WATI_OWNER_PHONE;

    let wati_sent = false;
    let wati_error = null;

    if (watiUrl && watiToken && ownerPhone) {
      try {
        const watiRes = await fetch(
          `${watiUrl}/api/v1/sendSessionMessage/${ownerPhone}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${watiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ messageText: msg }),
          }
        );
        const watiData = await watiRes.json();
        wati_sent = watiRes.ok && watiData.result;
        if (!wati_sent) wati_error = JSON.stringify(watiData);
      } catch (e) {
        wati_error = e.message;
      }
    } else {
      wati_error = "WATI non configuré (WATI_API_URL / WATI_API_TOKEN / WATI_OWNER_PHONE manquants)";
    }

    // Save snapshot
    await fetch(`${base}/api/bi/snapshot`, {
      method: "POST",
      headers: { authorization: token },
    }).catch(() => {});

    // Log in nc_ai_decisions_log
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await db.from("nc_ai_decisions_log").insert({
      agent: "bi_daily_report",
      decision_type: "report_sent",
      reason: `Rapport quotidien ${today} — score: ${d.health_score}/100`,
      data_snapshot: { health_score: d.health_score, wati_sent, wati_error },
      executed: true,
    });

    return Response.json({
      ok: true,
      date: today,
      health_score: d.health_score,
      wati_sent,
      wati_error,
      message_preview: msg.slice(0, 600) + "...",
    });
  } catch (err) {
    console.error("[BI daily-report]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
