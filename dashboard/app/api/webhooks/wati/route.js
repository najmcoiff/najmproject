// ═══════════════════════════════════════════════════════════════════
//  POST /api/webhooks/wati
//  Reçoit les événements WATI en temps réel :
//    - Messages entrants (réponses clients)
//    - Statuts de livraison (sent / delivered / read / failed)
//  Stocke tout dans nc_whatsapp_inbox (entrants) + nc_wati_message_log (statuts)
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Détection sentiment simple (arabe + français)
function detectSentiment(text) {
  if (!text) return { sentiment: "neutral", label: "autre" };
  const t = text.toLowerCase();

  const positive = ["مليح","راضي","شكرا","شكراً","merci","bien","super","parfait","bravo","وصل","وصلت","ممتاز","top","👍","⭐","😊","❤️"];
  const negative = ["مشكل","ما وصل","ما وصلتش","مزال","retour","رجع","مكسور","غلط","انهدر","خايب","problème","problem","pas reçu","annuler","annulation","رد","👎","😡","❌"];
  const question = ["وين","متى","كيفاش","comment","quand","où","suivi","تتبع","كم","délai","livraison","?","؟"];

  if (negative.some(w => t.includes(w))) return { sentiment: "negative", label: "reclamation" };
  if (positive.some(w => t.includes(w))) return { sentiment: "positive", label: "satisfaction" };
  if (question.some(w => t.includes(w))) return { sentiment: "neutral",  label: "question_livraison" };
  return { sentiment: "neutral", label: "autre" };
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const sb = adminSB();

  // ── WATI envoie un tableau d'événements OU un seul objet ──────────
  const events = Array.isArray(body) ? body : [body];

  for (const event of events) {
    const type = event.type || event.eventType || "";

    // ── 1. Message entrant (réponse du client) ──────────────────────
    if (
      type === "message" ||
      type === "INCOMING_MESSAGE" ||
      event.waId ||          // fallback WATI v1
      event.senderPhone      // fallback WATI v2
    ) {
      const phone    = event.waId || event.senderPhone || event.phone || "";
      const name     = event.senderName || event.name || null;
      const text     = event.text?.body || event.message || event.body || "";
      const msgType  = event.type === "image" ? "image"
                     : event.type === "audio"  ? "audio"
                     : event.type === "document" ? "document" : "text";
      const msgId    = event.id || event.messageId || null;

      // Trouver la commande liée à ce numéro (dernière commande)
      let orderId = null;
      if (phone) {
        const cleaned = phone.replace(/\D/g, "");
        const { data: order } = await sb
          .from("nc_orders")
          .select("id, order_name")
          .or(`phone.ilike.%${cleaned.slice(-9)},customer_phone.ilike.%${cleaned.slice(-9)}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (order) orderId = order.order_name || order.id;
      }

      const { sentiment, label } = detectSentiment(text);

      await sb.from("nc_whatsapp_inbox").upsert({
        phone,
        customer_name:       name,
        order_id:            orderId,
        message_text:        text,
        message_type:        msgType,
        direction:           "inbound",
        wati_message_id:     msgId,
        template_replied_to: event.replyContext?.elementName || event.templateName || null,
        sentiment,
        sentiment_label:     label,
        is_read:             false,
        is_escalated:        sentiment === "negative",
        raw_payload:         event,
      }, { onConflict: "wati_message_id", ignoreDuplicates: true });

      continue;
    }

    // ── 2. Statut de livraison message (sent / delivered / read / failed) ──
    if (
      type === "message_status" ||
      type === "MESSAGE_STATUS" ||
      event.messageStatus ||
      event.status
    ) {
      const msgId  = event.id || event.messageId || event.waMsgId;
      const status = (event.messageStatus || event.status || "").toLowerCase();

      if (!msgId) continue;

      const update = {};
      if (status === "sent")      update.status = "sent";
      if (status === "delivered") { update.status = "delivered"; update.delivered_at = new Date().toISOString(); }
      if (status === "read")      { update.status = "read";      update.read_at      = new Date().toISOString(); }
      if (status === "failed")    { update.status = "failed";    update.error_message = event.error?.message || "failed"; }

      if (Object.keys(update).length > 0) {
        await sb.from("nc_wati_message_log")
          .update(update)
          .eq("wati_message_id", msgId);
      }

      continue;
    }
  }

  return NextResponse.json({ ok: true, received: events.length });
}

// WATI envoie parfois un GET pour vérifier l'URL du webhook
export async function GET() {
  return NextResponse.json({ ok: true, service: "NajmCoiff WATI Webhook" });
}
