// GET /api/marketing/retargeting-stats
// Source de vérité unique pour le suivi du retargeting WhatsApp + codes promo.
//
// Pour chaque code promo : combien de numéros uniques contactés (via les
// templates WhatsApp associés), combien ont acheté, combien de commandes,
// CA confirmé (hors annulées), remise accordée, marge nette estimée, ROI,
// taux de conversion. Plus : distribution des segments, état des envois.
//
// Attribution = code promo posé sur la commande (déterministe), pas le
// fragile "même téléphone dans les 72h".

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MSG_COST_DA = 16; // coût d'un message marketing WATI

// Mapping code promo → templates WhatsApp qui le portent
const CODE_TEMPLATES = {
  REACT30:   ["najm_react30_v2", "najm_reactivation_30"],
  REACT60:   ["najm_react60_v2", "najm_reactivation_60"],
  VIPGOLDEN: ["najm_vip_v2", "najm_vip_exclusive"],
};

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getToken(request) {
  return request.headers.get("Authorization")?.replace("Bearer ", "")
    || new URL(request.url).searchParams.get("token")
    || "";
}

// 9 derniers chiffres = clé de matching téléphone fiable (formats variés)
const normPhone = (p) => String(p || "").replace(/\D/g, "").slice(-9);
const noAccent  = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

// Pagination générique (contourne le plafond 1000 lignes PostgREST)
async function fetchAll(sb, table, columns, applyFilters, orderCol = "id") {
  const pageSize = 1000;
  let from = 0, all = [];
  while (true) {
    let q = sb.from(table).select(columns).order(orderCol, { ascending: true }).range(from, from + pageSize - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function GET(request) {
  try {
    const session = verifyToken(getToken(request));
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const sb = adminSB();

    // 1) Codes promo
    const partenaires = await fetchAll(
      sb, "nc_partenaires", "id,code,nom,percentage,active", null, "code"
    );

    // 2) TOUTES les commandes (paginé) — sert à l'audience réelle ET à
    //    l'attribution par coupon. On ne se fie PAS à nc_ai_client_segments
    //    (table périmée : son cron lit nc_orders sans pagination → plafond 1000).
    const allOrders = await fetchAll(
      sb, "nc_orders",
      "order_id,customer_phone,coupon_code,coupon_discount,total_price,order_total,decision_status,archived,order_date,order_source",
      null, "order_id"
    );
    const orders = allOrders.filter((o) => o.coupon_code != null && String(o.coupon_code).trim() !== "");

    // 3) Envois WhatsApp (les 2 systèmes réunis)
    const queue = await fetchAll(
      sb, "nc_ai_whatsapp_queue", "phone,template_name,status,sent_at", null, "id"
    );
    const watiLog = await fetchAll(
      sb, "nc_wati_message_log", "phone,template_name,status,sent_at", null, "id"
    );
    const allSends = [...queue, ...watiLog];

    // ── Helpers d'agrégation ──────────────────────────────────────────
    const isValid     = (ds) => /^(confirm|modif)/.test(noAccent((ds || "").toLowerCase()).trim());
    const isCancelled = (ds) => /^annul/.test(noAccent((ds || "").toLowerCase()).trim());
    const totalOf     = (o) => Number(o.total_price) || Number(o.order_total) || 0;

    // ── AUDIENCE RÉELLE (calculée en direct depuis les commandes) ─────
    // Un client = un téléphone unique (≥9 chiffres). Fidélité hors annulées.
    const NOW = Date.now(), DAY = 86400000;
    const byCust = {};
    for (const o of allOrders) {
      const p = normPhone(o.customer_phone);
      if (p.length < 9) continue;
      const c = (byCust[p] ||= { orders: 0, spent: 0, last: 0, ancien: false });
      if (!o.order_source) c.ancien = true; // null = ère Shopify (anciens clients)
      if (isCancelled(o.decision_status)) continue;
      c.orders++;
      c.spent += totalOf(o);
      const t = o.order_date ? new Date(o.order_date).getTime() : 0;
      if (t > c.last) c.last = t;
    }
    const contactedVipSet = new Set(allSends.filter((s) => /vip/i.test(s.template_name || "")).map((s) => normPhone(s.phone)));
    const contactedAnySet = new Set(allSends.map((s) => normPhone(s.phone)).filter((p) => p.length >= 9));

    const audience = {
      total_customers: 0, vip: 0, vip_eligible: 0,
      active: 0, dormant_30: 0, dormant_60: 0, dormant_90: 0,
      anciens: 0, anciens_eligible: 0, // réservoir Shopify jamais recontacté
    };
    for (const [p, c] of Object.entries(byCust)) {
      audience.total_customers++;
      const days = c.last ? Math.floor((NOW - c.last) / DAY) : 9999;
      const isVip = c.orders >= 5 || c.spent > 50000;
      if (isVip) { audience.vip++; if (!contactedVipSet.has(p)) audience.vip_eligible++; }
      if      (days <= 30) audience.active++;
      else if (days <= 60) audience.dormant_30++;
      else if (days <= 90) audience.dormant_60++;
      else                 audience.dormant_90++;
      if (c.ancien && days > 90) { audience.anciens++; if (!contactedAnySet.has(p)) audience.anciens_eligible++; }
    }
    // Compat page : buckets de récence (le total réel = audience.total_customers)
    const segments = {
      vip: audience.vip, active: audience.active,
      dormant_30: audience.dormant_30, dormant_60: audience.dormant_60, dormant_90: audience.dormant_90,
    };

    // Pré-calcul des envois par template
    const sendsByTemplate = {};
    for (const s of allSends) {
      const t = s.template_name || "(inconnu)";
      if (!sendsByTemplate[t]) sendsByTemplate[t] = { template_name: t, phones: new Set(), total: 0, last_sent_at: null };
      sendsByTemplate[t].phones.add(normPhone(s.phone));
      sendsByTemplate[t].total++;
      if (s.sent_at && (!sendsByTemplate[t].last_sent_at || s.sent_at > sendsByTemplate[t].last_sent_at)) {
        sendsByTemplate[t].last_sent_at = s.sent_at;
      }
    }

    // Ensemble des numéros contactés par code (union des templates du code)
    function sentSetForCode(code) {
      const templates = CODE_TEMPLATES[code] || [];
      const set = new Set();
      let total = 0, last = null;
      for (const t of templates) {
        const e = sendsByTemplate[t];
        if (!e) continue;
        e.phones.forEach((p) => set.add(p));
        total += e.total;
        if (e.last_sent_at && (!last || e.last_sent_at > last)) last = e.last_sent_at;
      }
      return { uniqueSet: set, total, last };
    }

    // ── Stats par code ────────────────────────────────────────────────
    const ordersByCode = {};
    for (const o of orders) {
      const c = String(o.coupon_code || "").toUpperCase().trim();
      if (!c) continue;
      (ordersByCode[c] ||= []).push(o);
    }

    // Codes à afficher : ceux avec ≥1 commande OU code de campagne
    const codeSet = new Set([
      ...Object.keys(ordersByCode),
      ...Object.keys(CODE_TEMPLATES),
    ]);

    const partByCode = {};
    for (const p of partenaires) partByCode[String(p.code || "").toUpperCase()] = p;

    const codes = [];
    for (const code of codeSet) {
      const os = ordersByCode[code] || [];
      const isCampaign = !!CODE_TEMPLATES[code];
      const { uniqueSet, total: sentTotal, last } = isCampaign
        ? sentSetForCode(code)
        : { uniqueSet: new Set(), total: 0, last: null };

      const valid     = os.filter((o) => isValid(o.decision_status));
      const cancelled = os.filter((o) => isCancelled(o.decision_status));
      const buyers    = new Set(os.map((o) => normPhone(o.customer_phone)));

      const caConfirmed   = valid.reduce((s, o) => s + totalOf(o), 0);
      const caGross       = os.reduce((s, o) => s + totalOf(o), 0);
      const discountConf  = valid.reduce((s, o) => s + (Number(o.coupon_discount) || 0), 0);

      // Conversion : acheteurs qui ont reçu le message
      let matched = 0;
      if (uniqueSet.size) for (const b of buyers) if (uniqueSet.has(b)) matched++;

      const msgCost      = sentTotal * MSG_COST_DA;
      // remise = 50% de la marge → marge nette retenue ≈ remise (sur commandes valides)
      const netMargin    = discountConf;
      const netProfit    = netMargin - msgCost;

      const p = partByCode[code];
      codes.push({
        code,
        nom: p?.nom || (isCampaign ? "Campagne retargeting" : ""),
        percentage: p?.percentage ?? null,
        active: p ? !!p.active : null,
        is_campaign: isCampaign,
        sent_unique: uniqueSet.size,
        sent_total: sentTotal,
        last_sent_at: last,
        orders_total: os.length,
        buyers_unique: buyers.size,
        confirmed: valid.length,
        cancelled: cancelled.length,
        pending: os.length - valid.length - cancelled.length,
        ca_confirmed: Math.round(caConfirmed),
        ca_gross: Math.round(caGross),
        discount_confirmed: Math.round(discountConf),
        avg_basket: valid.length ? Math.round(caConfirmed / valid.length) : 0,
        matched_buyers: matched,
        conversion_pct: uniqueSet.size ? +(100 * matched / uniqueSet.size).toFixed(2) : null,
        msg_cost: msgCost,
        net_margin_est: Math.round(netMargin),
        net_profit_est: Math.round(netProfit),
      });
    }
    codes.sort((a, b) => b.ca_confirmed - a.ca_confirmed || b.orders_total - a.orders_total);

    // ── Portée globale du retargeting ─────────────────────────────────
    const allContacted = new Set(allSends.map((s) => normPhone(s.phone)).filter((p) => p.length >= 9));
    const templates = Object.values(sendsByTemplate)
      .map((e) => ({ template_name: e.template_name, sent_unique: e.phones.size, sent_total: e.total, last_sent_at: e.last_sent_at }))
      .sort((a, b) => b.sent_total - a.sent_total);

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      sending_enabled: false, // relances auto coupées (voir whatsapp-reactivate)
      msg_cost_da: MSG_COST_DA,
      reach: {
        unique_contacted: allContacted.size,
        total_messages: allSends.length,
      },
      audience,
      segments,
      codes,
      templates,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
