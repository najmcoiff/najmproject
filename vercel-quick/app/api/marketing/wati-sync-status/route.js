// ═══════════════════════════════════════════════════════════════════
//  POST /api/marketing/wati-sync-status
//  GET  /api/marketing/wati-sync-status  → idem (cron-friendly)
//
//  Synchronise les statuts WATI (delivered/read/failed) depuis l'API WATI.
//  Stratégie robuste :
//    1. Test de connectivité WATI en début de route
//    2. Pour chaque message "sent" → GET /api/v1/getMessages?whatsappNumber={phone}
//    3. Match par wati_message_id OU par (template_name + sent_at ±120s)
//    4. Recalcul des totaux par campagne
//  Gestion explicite : token expiré, dry-run messages, erreurs réseau
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getServiceClient, ownerGuard, cronGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 secondes max (Vercel Pro)

export async function GET(req) { return POST(req); }

// ── Helper : AbortSignal avec timeout compatible Node.js 16+ ────────
function makeAbortSignal(ms) {
  // AbortSignal.timeout() n'est disponible qu'en Node 17.3+
  // On utilise l'approche compatible pour Node 16
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  const cleanup = () => clearTimeout(id);
  return { signal: ctrl.signal, cleanup };
}

// ── Tester la connectivité WATI ─────────────────────────────────────
async function testWatiConnectivity(baseUrl, token) {
  const { signal, cleanup } = makeAbortSignal(8000);
  try {
    const r = await fetch(`${baseUrl}/api/v1/getContacts?pageSize=1&pageNumber=1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    cleanup();
    if (r.status === 200) return { connected: true, status: 200 };
    if (r.status === 401) return { connected: false, status: 401, error: "Token WATI invalide ou expiré — renouveler depuis le dashboard WATI" };
    if (r.status === 403) return { connected: false, status: 403, error: "Token WATI révoqué — régénérer un token dans WATI → Paramètres → API" };
    return { connected: false, status: r.status, error: `WATI HTTP ${r.status}` };
  } catch (e) {
    cleanup();
    return { connected: false, status: 0, error: `Réseau: ${e.message}` };
  }
}

// ── Récupérer messages WATI pour un numéro ─────────────────────────
async function fetchWatiMessages(baseUrl, token, phone, pageSize = 20) {
  const normalizedPhone = phone.replace(/^\+/, "").replace(/^0/, "213");
  const { signal, cleanup } = makeAbortSignal(5000);
  try {
    const r = await fetch(
      `${baseUrl}/api/v1/getMessages?whatsappNumber=${normalizedPhone}&pageSize=${pageSize}&pageNumber=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      }
    );
    cleanup();
    if (!r.ok) return null;
    const data = await r.json();
    return Array.isArray(data?.messages?.items) ? data.messages.items
      : Array.isArray(data?.items) ? data.items
      : Array.isArray(data?.messages) ? data.messages
      : [];
  } catch {
    cleanup();
    return null;
  }
}

// ── Dériver statut depuis WATI statusString ─────────────────────────
function deriveStatus(rawStatus) {
  const s = (rawStatus || "").toLowerCase();
  if (s === "read") return "read";
  if (s === "delivered") return "delivered";
  if (s === "sent") return "sent";
  if (["failed", "error", "undelivered", "rejected"].includes(s)) return "failed";
  return null;
}

export async function POST(req) {
  try {
    return await _handlePost(req);
  } catch (err) {
    console.error("[wati-sync-status] Uncaught error:", err);
    return NextResponse.json({
      ok: false,
      wati_connected: false,
      wati_error: `Erreur interne: ${err.message || String(err)}`,
      checked: 0, updated: 0, delivered: 0, read: 0, failed: 0,
    });
  }
}

async function _handlePost(req) {
  const isOwner = ownerGuard(req);
  const isCron  = cronGuard(req);
  if (!isOwner && !isCron)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sb   = getServiceClient();
  const wUrl = (process.env.WATI_API_URL || "").replace(/\/$/, "");
  const wTok = process.env.WATI_API_TOKEN;

  // ── Guard : credentials manquants ────────────────────────────────
  if (!wUrl || !wTok) {
    return NextResponse.json({
      ok: false,
      wati_connected: false,
      wati_error: "WATI_API_URL ou WATI_API_TOKEN absent dans les variables d'environnement Vercel",
      checked: 0, updated: 0, delivered: 0, read: 0, failed: 0,
    });
  }

  // ── 1. Test de connectivité ────────────────────────────────────────
  const conn = await testWatiConnectivity(wUrl, wTok);
  if (!conn.connected) {
    // Stocker l'erreur de connectivité
    await sb.from("nc_ai_decisions_log").insert({
      agent: "reactivation",
      decision_type: "wati_sync_connectivity",
      description: `Sync WATI impossible : ${conn.error}`,
      output_data: { wati_connected: false, error: conn.error, http_status: conn.status },
      success: false,
      impact: "medium",
      created_at: new Date().toISOString(),
    }); // Supabase v2 : pas de .catch() — l'erreur est ignorée silencieusement
    return NextResponse.json({
      ok: false,
      wati_connected: false,
      wati_error: conn.error,
      wati_http_status: conn.status,
      fix_guide: conn.status === 401
        ? "Aller sur https://app.wati.io → Paramètres → API → Régénérer le token → Copier dans Vercel WATI_API_TOKEN"
        : "Vérifier WATI_API_URL et WATI_API_TOKEN dans les variables Vercel",
      checked: 0, updated: 0, delivered: 0, read: 0, failed: 0,
    });
  }

  // ── 2. Messages "sent" des 30 derniers jours à vérifier ───────────
  // Limite : 30 par run pour ne pas dépasser le timeout Vercel (60s)
  // Le cron quotidien avance progressivement sur tous les messages
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: pendingMessages } = await sb
    .from("nc_wati_message_log")
    .select("id, wati_message_id, phone, campaign_id, template_name, status, sent_at")
    .eq("status", "sent")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(30);

  const messages = pendingMessages || [];
  let updated = 0;
  let delivered = 0;
  let read = 0;
  let failed = 0;
  let not_found = 0;

  // Grouper par téléphone (un seul appel WATI par numéro)
  const byPhone = {};
  for (const msg of messages) {
    const phone = msg.phone.replace(/^\+/, "").replace(/^0/, "213");
    if (!byPhone[phone]) byPhone[phone] = [];
    byPhone[phone].push(msg);
  }

  for (const [phone, msgs] of Object.entries(byPhone)) {
    const items = await fetchWatiMessages(wUrl, wTok, phone, 30);
    if (!items) { not_found += msgs.length; continue; }

    for (const msg of msgs) {
      // Stratégie 1 : match par wati_message_id (si pas "dry-run")
      // Stratégie 2 : match par template_name + sent_at ±120 secondes
      const isDryRun = !msg.wati_message_id || msg.wati_message_id === "dry-run" || msg.wati_message_id === "null";
      const sentMs = new Date(msg.sent_at).getTime();

      const watiMsg = items.find(item => {
        if (!isDryRun) {
          if (item.id === msg.wati_message_id) return true;
          if (item.whatsappMessageId === msg.wati_message_id) return true;
        }
        // Fallback : template + date ±3 min
        const itemMs = item.created ? new Date(item.created).getTime() : 0;
        const sameTemplate = item.templateName === msg.template_name
          || (item.text || "").includes(msg.template_name);
        return sameTemplate && Math.abs(itemMs - sentMs) < 180000;
      });

      if (!watiMsg) { not_found++; continue; }

      const newStatus = deriveStatus(watiMsg.statusString || watiMsg.status);
      if (!newStatus || newStatus === "sent") continue;

      const update = { status: newStatus };
      if (newStatus === "delivered") {
        update.delivered_at = watiMsg.deliveredDateTime || watiMsg.created || new Date().toISOString();
        delivered++;
      } else if (newStatus === "read") {
        update.delivered_at = watiMsg.deliveredDateTime || watiMsg.created || msg.sent_at;
        update.read_at = watiMsg.readDateTime || new Date().toISOString();
        read++;
      } else if (newStatus === "failed") {
        update.error_message = watiMsg.failedReason || watiMsg.error || "failed";
        failed++;
      }

      await sb.from("nc_wati_message_log").update(update).eq("id", msg.id);
      updated++;
    }

    await new Promise(r => setTimeout(r, 100)); // 100ms entre appels
  }

  // ── 3. Recalcul des totaux par campagne ───────────────────────────
  const campaignIds = [...new Set(messages.map(m => m.campaign_id).filter(Boolean))];
  for (const campId of campaignIds) {
    const { data: stats } = await sb
      .from("nc_wati_message_log")
      .select("status")
      .eq("campaign_id", campId);

    const counts = (stats || []).reduce((a, m) => {
      a[m.status] = (a[m.status] || 0) + 1;
      return a;
    }, {});

    const total_sent = (counts.sent || 0) + (counts.delivered || 0)
      + (counts.read || 0) + (counts.replied || 0) + (counts.converted || 0);

    await sb.from("nc_wati_campaigns").update({
      total_sent,
      total_delivered: (counts.delivered || 0) + (counts.read || 0) + (counts.replied || 0) + (counts.converted || 0),
      total_read:      (counts.read || 0) + (counts.replied || 0) + (counts.converted || 0),
      total_replied:   counts.replied   || 0,
      total_converted: counts.converted || 0,
      total_failed:    counts.failed    || 0,
      total_cost_da:   total_sent * 16,
      updated_at:      new Date().toISOString(),
    }).eq("id", campId);
  }

  await sb.from("nc_ai_decisions_log").insert({
    agent: "reactivation",
    decision_type: "wati_status_sync",
    description: `Sync WATI OK: ${messages.length} msgs vérifiés → ${delivered} livrés, ${read} lus, ${failed} échoués, ${not_found} non trouvés`,
    output_data: { wati_connected: true, checked: messages.length, updated, delivered, read, failed, not_found },
    success: true,
    impact: "low",
    created_at: new Date().toISOString(),
  }); // Supabase v2 : pas de .catch()

  return NextResponse.json({
    ok: true,
    wati_connected: true,
    checked: messages.length,
    updated,
    delivered,
    read,
    failed,
    not_found,
  });
} // end _handlePost
