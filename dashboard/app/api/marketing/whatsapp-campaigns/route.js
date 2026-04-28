// API WhatsApp Campaign Manager
// GET  → segments + campagnes existantes + stats templates
// POST → créer et lancer une campagne WhatsApp
// PATCH → pause/resume une campagne
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ownerGuard as jwtOwnerGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

const WATI_URL   = process.env.WATI_API_URL;
const WATI_TOKEN = process.env.WATI_API_TOKEN;

const TEMPLATES = {
  najm_react30_v2: {
    label: "Réactivation 30j — تخفيضات",
    segment: "dormant_30",
    params: ["prénom", "univers (الكوافير / الأونقلري)"],
    cost_da: 16,
  },
  najm_react60_v2: {
    label: "Réactivation 60j — عرض قوي",
    segment: "dormant_60",
    params: ["prénom"],
    cost_da: 16,
  },
  najm_vip_v2: {
    label: "Offre VIP exclusif — 👑",
    segment: "vip",
    params: ["prénom"],
    cost_da: 16,
  },
  najm_cart_v2: {
    label: "Panier abandonné — 🛒",
    segment: "cart_abandoned",
    params: ["prénom"],
    cost_da: 16,
  },
};

function adminSB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function ownerGuard(req) {
  if (jwtOwnerGuard(req)) return true;
  const raw = req.headers.get("x-owner-token") || new URL(req.url).searchParams.get("token");
  return raw === process.env.DASHBOARD_SECRET;
}

// ── Tester connectivité WATI (non bloquant, compatible Node 16) ──────────
async function checkWatiConnectivity() {
  const url   = (process.env.WATI_API_URL || "").replace(/\/$/, "");
  const token = process.env.WATI_API_TOKEN;
  if (!url || !token) return { connected: false, error: "credentials_missing" };
  const ctrl = new AbortController();
  const tId  = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${url}/api/v1/getContacts?pageSize=1&pageNumber=1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(tId);
    if (r.status === 200) return { connected: true };
    return { connected: false, error: r.status === 401 ? "token_expired" : `http_${r.status}` };
  } catch {
    clearTimeout(tId);
    return { connected: false, error: "network_error" };
  }
}

// ── GET — dashboard data ─────────────────────────────────────────────────────
export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = adminSB();

  // Test connectivité WATI en parallèle (non bloquant, 5s max)
  const watiConnPromise = checkWatiConnectivity();

  // ── Segments : totaux réels via COUNT SQL (évite la limite 1000 lignes Supabase) ──
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Totaux par segment via RPC ou requête directe — on utilise la méthode de comptage Supabase
  // Pour chaque segment on fait un COUNT séparé (rapide et fiable)
  const SEGMENT_NAMES = ["dormant_30", "dormant_60", "dormant_90", "vip", "active", "cart_abandoned"];
  const available = {};

  // Comptage total par segment (COUNT ≠ select all)
  for (const seg of SEGMENT_NAMES) {
    const { count } = await sb
      .from("nc_ai_client_segments")
      .select("*", { count: "exact", head: true })
      .eq("segment", seg);
    available[seg] = { total: count || 0, available: 0, by_template: {} };
  }

  // Contacts déjà reçu un template dans les 30 derniers jours
  const { data: recentByTemplate } = await sb
    .from("nc_wati_message_log")
    .select("phone, template_name")
    .gte("sent_at", thirtyDaysAgo)
    .in("status", ["sent", "delivered", "read", "replied", "converted"]);

  const phoneTemplatesMap = {};
  (recentByTemplate || []).forEach(m => {
    if (!phoneTemplatesMap[m.phone]) phoneTemplatesMap[m.phone] = new Set();
    phoneTemplatesMap[m.phone].add(m.template_name);
  });

  // Calculer les "disponibles" : total - déjà contactés ce mois par ce template
  // Pour chaque segment + template, compter ceux qui N'ont PAS reçu ce template
  for (const [tplName, tpl] of Object.entries(TEMPLATES)) {
    const seg = tpl.segment;
    if (!available[seg]) continue;

    // Contacts du segment qui ont déjà reçu CE template dans les 30j
    const alreadySentPhones = new Set(
      (recentByTemplate || [])
        .filter(m => m.template_name === tplName)
        .map(m => m.phone)
    );

    // Disponibles = total - déjà contactés pour ce template
    const totalSeg = available[seg].total;
    const alreadySentCount = alreadySentPhones.size;
    const availForTpl = Math.max(0, totalSeg - alreadySentCount);

    available[seg].by_template[tplName] = availForTpl;
    if (!available[seg].available) available[seg].available = availForTpl;
  }

  // Pour les segments sans template configuré (active, cart_abandoned)
  for (const seg of SEGMENT_NAMES) {
    if (!available[seg].available && available[seg].total > 0) {
      available[seg].available = available[seg].total;
    }
  }

  // ── Campagnes : exclure les brouillons vides (total_sent=0 ET status='draft') ──
  const { data: campaigns } = await sb
    .from("nc_wati_campaigns")
    .select("*")
    .or("total_sent.gt.0,status.neq.draft")
    .order("created_at", { ascending: false })
    .limit(30);

  // ── Stats par template ──
  const { data: templateStats } = await sb
    .from("nc_wati_templates")
    .select("name, display_name, total_sent, total_delivered, total_read, total_replied, total_converted, revenue_da, performance_score, is_winner")
    .in("name", Object.keys(TEMPLATES));

  // ── Stats messages globaux 30j ──
  const { data: msgStats } = await sb
    .from("nc_wati_message_log")
    .select("status")
    .gte("sent_at", thirtyDaysAgo);

  const msgCounts = (msgStats || []).reduce((a, m) => {
    a[m.status] = (a[m.status] || 0) + 1;
    return a;
  }, {});

  // ── Revenus attribués : commandes dans les 72h post-envoi ──
  // Chercher les commandes créées après une campagne WA par le même numéro
  const { data: recentCamps } = await sb
    .from("nc_wati_campaigns")
    .select("id, launched_at, template_a")
    .gt("total_sent", 0)
    .order("launched_at", { ascending: false })
    .limit(10);

  // Revenue agrégé par campagne
  const campRevenues = {};
  for (const camp of (recentCamps || [])) {
    if (!camp.launched_at) continue;
    const window72h = new Date(new Date(camp.launched_at).getTime() + 72 * 3600 * 1000).toISOString();

    // Récupérer les numéros envoyés pour cette campagne
    const { data: sentPhones } = await sb
      .from("nc_wati_message_log")
      .select("phone")
      .eq("campaign_id", camp.id)
      .in("status", ["sent", "delivered", "read", "replied", "converted"]);

    const phones = (sentPhones || []).map(m => m.phone.replace(/^\+/, "")).slice(0, 200);
    if (phones.length === 0) continue;

    // Commandes créées dans les 72h
    if (phones.length > 0) {
      const { data: orders } = await sb
        .from("nc_orders")
        .select("total_price")
        .gte("created_at", camp.launched_at)
        .lte("created_at", window72h)
        .in("phone", [...phones, ...phones.map(p => `+${p}`)]);

      const rev = (orders || []).reduce((s, o) => s + (Number(o.total_price) || 0), 0);
      campRevenues[camp.id] = Math.round(rev);

      // Mettre à jour nc_wati_campaigns.revenue_da si > 0
      if (rev > 0) {
        await sb.from("nc_wati_campaigns")
          .update({ revenue_da: rev, updated_at: new Date().toISOString() })
          .eq("id", camp.id);
      }
    }
  }

  // ── Réponses clients ──
  const { data: inbox } = await sb
    .from("nc_whatsapp_inbox")
    .select("id, phone, customer_name, message_text, sentiment, sentiment_label, template_replied_to, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .then(r => r);

  // ── KPIs globaux WhatsApp (tous temps) ──
  const { data: allMsgStats } = await sb
    .from("nc_wati_message_log")
    .select("status");

  const allCounts = (allMsgStats || []).reduce((a, m) => {
    a[m.status] = (a[m.status] || 0) + 1;
    return a;
  }, {});

  const { data: allCampsStats } = await sb
    .from("nc_wati_campaigns")
    .select("total_sent, total_failed, revenue_da, total_cost_da")
    .gt("total_sent", 0);

  const globalKpis = (allCampsStats || []).reduce((a, c) => ({
    total_sent: a.total_sent + (c.total_sent || 0),
    total_failed: a.total_failed + (c.total_failed || 0),
    total_revenue: a.total_revenue + Number(c.revenue_da || 0),
    total_cost: a.total_cost + Number(c.total_cost_da || 0),
  }), { total_sent: 0, total_failed: 0, total_revenue: 0, total_cost: 0 });

  // Attendre le résultat de connectivité WATI
  const watiConn = await watiConnPromise;

  return NextResponse.json({
    wati_connected: watiConn.connected,
    wati_error: watiConn.error || null,
    segments: available,
    templates: TEMPLATES,
    templateStats: templateStats || [],
    campaigns: campaigns || [],
    inbox: inbox || [],
    msgStats: {
      sent:      msgCounts.sent      || 0,
      delivered: msgCounts.delivered || 0,
      read:      msgCounts.read      || 0,
      replied:   msgCounts.replied   || 0,
      converted: msgCounts.converted || 0,
      failed:    msgCounts.failed    || 0,
      total:     (msgStats || []).length,
    },
    globalKpis,
    cost_per_msg_marketing: 16,
    cost_per_msg_utility: 5,
  });
}

// ── POST — créer + lancer une campagne ────────────────────────────────────────
export async function POST(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = adminSB();
  const body = await req.json();
  const { segment, template_name, daily_limit, schedule_now, name, world = "coiffure" } = body;

  if (!segment || !template_name || !daily_limit) {
    return NextResponse.json({ error: "segment, template_name, daily_limit requis" }, { status: 400 });
  }

  const tpl = TEMPLATES[template_name];
  if (!tpl) return NextResponse.json({ error: "Template inconnu" }, { status: 400 });

  const campName = name || `${tpl.label} — ${new Date().toLocaleDateString("fr-DZ")}`;

  const { data: campaign, error: campErr } = await sb
    .from("nc_wati_campaigns")
    .insert({
      name: campName,
      description: `Segment: ${segment} | Template: ${template_name} | Plafond: ${daily_limit}`,
      template_a: template_name,
      is_ab_test: false,
      target_segment: segment,
      world,
      status: schedule_now ? "active" : "draft",
      launched_at: schedule_now ? new Date().toISOString() : null,
      created_by: "owner",
      budget_da: daily_limit * 16,
    })
    .select("id")
    .single();

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });

  if (!schedule_now) {
    return NextResponse.json({ ok: true, campaign_id: campaign.id, queued: 0, status: "draft" });
  }

  // ── Anti-duplicate PER TEMPLATE sur 30 jours ──────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: alreadySentThisTemplate } = await sb
    .from("nc_wati_message_log")
    .select("phone")
    .eq("template_name", template_name)
    .gte("sent_at", thirtyDaysAgo)
    .in("status", ["sent", "delivered", "read", "replied", "converted"]);
  const alreadyGotThisTemplate = new Set((alreadySentThisTemplate || []).map(m => m.phone));

  // Récupérer les contacts par pages pour dépasser la limite 1000 de Supabase
  let contacts = [];
  let page2 = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: batch } = await sb
      .from("nc_ai_client_segments")
      .select("phone, full_name")
      .eq("segment", segment)
      .range(page2 * PAGE_SIZE, (page2 + 1) * PAGE_SIZE - 1);
    if (!batch || batch.length === 0) break;
    contacts = contacts.concat(batch);
    if (batch.length < PAGE_SIZE) break;
    page2++;
    if (page2 > 20) break; // max 20000 contacts par campagne
  }

  const eligible = contacts.filter(c => !alreadyGotThisTemplate.has(c.phone));
  const toSend   = eligible.slice(0, daily_limit);

  function buildParams(contact) {
    const firstName = contact.full_name
      ? contact.full_name.trim().split(/\s+/)[0].substring(0, 20)
      : "";
    if (template_name === "najm_react30_v2") {
      return { "1": firstName, "2": world === "onglerie" ? "الأونقلري" : "الكوافير" };
    }
    return { "1": firstName };
  }

  let sent = 0;
  let failed = 0;
  const sentAt = new Date().toISOString();

  for (const contact of toSend) {
    const params = buildParams(contact);
    const formattedPhone = contact.phone.replace(/^0/, "213").replace(/^\+/, "");

    const { data: qItem } = await sb
      .from("nc_ai_whatsapp_queue")
      .insert({
        phone: contact.phone,
        template_name,
        template_params: params,
        flow_type: segment.startsWith("dormant") ? "reactivation" : segment,
        world,
        priority: 2,
        status: "queued",
      })
      .select("id")
      .single();

    if (WATI_URL && WATI_TOKEN && qItem) {
      try {
        const watiParams = Object.entries(params).map(([name, value]) => ({ name, value: String(value) }));
        const r = await fetch(
          `${WATI_URL}/api/v1/sendTemplateMessage?whatsappNumber=${formattedPhone}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${WATI_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              template_name,
              broadcast_name: `camp_${campaign.id}_${Date.now()}`,
              parameters: watiParams,
            }),
          }
        );
        const rj = await r.json();

        if (rj.result === true || rj.id) {
          await sb.from("nc_ai_whatsapp_queue").update({ status: "sent", sent_at: sentAt }).eq("id", qItem.id);
          await sb.from("nc_wati_message_log").insert({
            campaign_id: campaign.id,
            phone: contact.phone,
            template_name,
            params,
            wati_message_id: rj.id || null,
            status: "sent",
            sent_at: sentAt,
          });
          await sb.from("nc_ai_client_segments")
            .update({ last_template_sent: template_name, last_template_sent_at: sentAt })
            .eq("phone", contact.phone);
          sent++;
        } else {
          // ── Enregistrer les FAILED dans nc_wati_message_log ──
          const errMsg = rj.error || rj.message || JSON.stringify(rj).substring(0, 200);
          await sb.from("nc_ai_whatsapp_queue")
            .update({ status: "failed", error_message: errMsg })
            .eq("id", qItem.id);
          await sb.from("nc_wati_message_log").insert({
            campaign_id: campaign.id,
            phone: contact.phone,
            template_name,
            params,
            wati_message_id: null,
            status: "failed",
            error_message: errMsg,
            sent_at: sentAt,
          });
          failed++;
        }
      } catch (e) {
        const errMsg = e.message || "network_error";
        await sb.from("nc_ai_whatsapp_queue")
          .update({ status: "failed", error_message: errMsg })
          .eq("id", qItem?.id);
        await sb.from("nc_wati_message_log").insert({
          campaign_id: campaign.id,
          phone: contact.phone,
          template_name,
          params,
          wati_message_id: null,
          status: "failed",
          error_message: errMsg,
          sent_at: sentAt,
        });
        failed++;
      }

      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Mettre à jour nc_wati_campaigns avec totaux réels
  await sb
    .from("nc_wati_campaigns")
    .update({
      total_sent:    sent,
      total_failed:  failed,
      total_cost_da: sent * 16,
      budget_da:     toSend.length * 16,
      status:        sent > 0 ? "active" : "draft",
      updated_at:    sentAt,
    })
    .eq("id", campaign.id);

  return NextResponse.json({
    ok: true,
    campaign_id: campaign.id,
    eligible: eligible.length,
    sent,
    failed,
    daily_limit,
    cost_da: sent * 16,
  });
}

// ── PATCH — pause/resume campagne ────────────────────────────────────────────
export async function PATCH(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb = adminSB();
  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id + status requis" }, { status: 400 });

  await sb.from("nc_wati_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}
