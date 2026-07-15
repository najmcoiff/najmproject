import { NextResponse } from "next/server";
import { getServiceClient, cronGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/ambassadeur/validate-delivery  (cron quotidien)
 *
 * Fait passer les commissions ambassadeur « en_attente » → « valide »
 * UNIQUEMENT quand la commande est LIVRÉE (shipping_status), et les annule
 * si la commande est retournée/annulée.
 *
 * Livré   = shipping_status contient livré / encaissé / recouvert (et pas annul/retour)
 * Annulé  = shipping_status contient annul / retour  OU decision_status annulé
 */
export async function GET(req) { return POST(req); }

// Notif WhatsApp « مبروك، X ولات في رصيدك » quand la commission est validée (livraison).
// Template WATI « nc_commission_valide » (Utility). Best-effort.
// {{name}} prénom · {{amount}} montant DA · {{ref}} code (URL du bouton).
async function notifyCommissionValide(phone9, firstName, montant, code) {
  const url = (process.env.WATI_API_URL || "").replace(/\/$/, "");
  const token = process.env.WATI_API_TOKEN;
  if (!url || !token || !phone9 || !(montant > 0)) return;
  const params = [
    { name: "name",   value: firstName || "" },
    { name: "amount", value: String(montant) },
    { name: "ref",    value: code || "" },
  ];
  try {
    await fetch(`${url}/api/v1/sendTemplateMessage?whatsappNumber=213${phone9}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ template_name: "nc_commission_valide", broadcast_name: `amb_valide_${Date.now()}`, parameters: params }),
    });
  } catch { /* silencieux */ }
}

const isDelivered = (s) => /livr|encaiss|recouvert/i.test(s || "") && !/annul|retour/i.test(s || "");
const isCancelled = (ship, dec) =>
  /annul|retour/i.test(ship || "") || /^annul/i.test((dec || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim());

export async function POST(req) {
  if (!cronGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = getServiceClient();
  let validated = 0, cancelled = 0, scanned = 0;

  try {
    // 1) Toutes les commissions en attente (paginé)
    const pending = [];
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await sb
          .from("nc_ambassadeur_commissions")
          .select("id, order_id, ambassadeur_phone, montant_da, statut")
          .eq("statut", "en_attente")
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        pending.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }
    scanned = pending.length;
    if (scanned === 0) return NextResponse.json({ ok: true, scanned: 0, validated: 0, cancelled: 0 });

    // 2) Statut de livraison des commandes concernées
    const orderIds = [...new Set(pending.map((c) => c.order_id).filter(Boolean))];
    const statusByOrder = {};
    for (let i = 0; i < orderIds.length; i += 200) {
      const chunk = orderIds.slice(i, i + 200);
      const { data: orders } = await sb
        .from("nc_orders")
        .select("order_id, shipping_status, decision_status")
        .in("order_id", chunk);
      for (const o of orders || []) statusByOrder[o.order_id] = o;
    }

    // 3) Valider (livré) ou annuler (retour/annulé)
    for (const c of pending) {
      const o = statusByOrder[c.order_id];
      if (!o) continue;

      if (isDelivered(o.shipping_status)) {
        await sb.rpc("valider_commission", { p_commission_id: c.id });
        validated++;
        // Notif « ولات في رصيدك » — seulement pour un gain positif (pas une dépense de crédit)
        if (Number(c.montant_da) > 0) {
          const { data: amb } = await sb
            .from("nc_ambassadeurs")
            .select("full_name, code")
            .eq("phone", c.ambassadeur_phone)
            .maybeSingle();
          await notifyCommissionValide(
            c.ambassadeur_phone,
            (amb?.full_name || "").trim().split(/\s+/)[0] || "",
            Number(c.montant_da),
            amb?.code,
          );
        }
      } else if (isCancelled(o.shipping_status, o.decision_status)) {
        // Annuler : retirer de la cagnotte en attente
        const { error: upErr } = await sb
          .from("nc_ambassadeur_commissions")
          .update({ statut: "annule" })
          .eq("id", c.id)
          .eq("statut", "en_attente");
        if (!upErr) {
          const { data: a } = await sb
            .from("nc_ambassadeurs")
            .select("cagnotte_attente_da")
            .eq("phone", c.ambassadeur_phone)
            .maybeSingle();
          if (a) {
            await sb
              .from("nc_ambassadeurs")
              .update({ cagnotte_attente_da: Math.max(0, Number(a.cagnotte_attente_da || 0) - Number(c.montant_da || 0)) })
              .eq("phone", c.ambassadeur_phone);
          }
          cancelled++;
        }
      }
      // sinon : encore en transit → on laisse en_attente
    }

    return NextResponse.json({ ok: true, scanned, validated, cancelled });
  } catch (err) {
    console.error("[validate-delivery] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
