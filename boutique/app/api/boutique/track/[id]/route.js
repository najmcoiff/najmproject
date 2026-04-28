import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { LOG_TYPES } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * GET /api/boutique/track/[id]
 * Suivi public d'une commande.
 * [id] peut être :
 *   - order_name (NC-260411-0001)
 *   - order_id (numérique Shopify ou UUID)
 *   - tracking ZR (31-XXXXXXXX-ZR)
 */

const FULL_COLS =
  "order_id, order_name, order_source, confirmation_status, decision_status, wilaya, items_json, total_price, order_date, delivery_mode, shopify_order_name";

const SAFE_COLS =
  "order_id, order_source, confirmation_status, decision_status, wilaya, total_price, order_date, shopify_order_name";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Identifiant de commande manquant" }, { status: 400 });
    }

    const sb = createServiceClient();

    let order = null;
    let zrData = null;

    // ── Cas 1 : Numéro de tracking ZR Express (31-XXXXXXXX-ZR) ─────────────
    if (id.includes("-ZR") || /^\d{2}-[A-Z0-9]+-ZR$/.test(id)) {
      const { data: zr } = await sb
        .from("nc_suivi_zr")
        .select("tracking, order_id, customer_name, statut_livraison, updated_at, wilaya")
        .eq("tracking", id)
        .maybeSingle();

      if (zr) {
        zrData = zr;
        // Chercher la commande associée
        const { data: ord } = await sb
          .from("nc_orders")
          .select(FULL_COLS)
          .eq("order_id", zr.order_id)
          .maybeSingle();
        order = ord;
      }
    }

    // ── Cas 2 : order_name (NC-...) ou order_id numérique ───────────────────
    if (!order) {
      const isOrderName = id.startsWith("NC-") || id.startsWith("nc-");
      const field = isOrderName ? "order_name" : "order_id";

      let { data: ord, error } = await sb
        .from("nc_orders")
        .select(FULL_COLS)
        .eq(field, id)
        .maybeSingle();

      // Fallback colonnes sûres si erreur 42703
      if (error && (error.code === "42703" || error.message?.includes("does not exist"))) {
        const retry = await sb
          .from("nc_orders")
          .select(SAFE_COLS)
          .eq(field, id)
          .maybeSingle();

        if (retry.error) {
          return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
        }
        ord = retry.data;
      } else if (error) {
        return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
      }

      order = ord;
    }

    if (!order) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    // ── Suivi ZR Express (si pas encore récupéré via tracking direct) ────────
    if (!zrData) {
      const { data: zr } = await sb
        .from("nc_suivi_zr")
        .select("tracking, statut_livraison, updated_at, wilaya")
        .eq("order_id", String(order.order_id))
        .maybeSingle();
      zrData = zr;
    }

    // ── Timeline ─────────────────────────────────────────────────────────────
    const timeline = buildTimeline(order, zrData);

    // ── Log analytics (fire-and-forget) ──────────────────────────────────────
    const displayName = order.order_name || order.shopify_order_name || order.order_id;
    sb.from("nc_events").insert({
      log_type: LOG_TYPES.TRACK_VIEWED,
      source:   "nc_boutique",
      order_id: String(order.order_id),
      note:     `Suivi commande ${displayName} consulté`,
      metadata: { status_at_view: order.confirmation_status },
    }).then(() => {}).catch(() => {});

    // ── Réponse publique ──────────────────────────────────────────────────────
    return NextResponse.json({
      order: {
        order_name:      order.order_name || order.shopify_order_name || `CMD-${String(order.order_id).slice(-6)}`,
        status:          mapStatus(order.confirmation_status, order.decision_status, zrData?.statut_livraison),
        wilaya:          order.wilaya || zrData?.wilaya || null,
        total_price:     order.total_price || 0,
        items_count:     Array.isArray(order.items_json) ? order.items_json.length : 0,
        items_summary:   summarizeItems(order.items_json),
        created_at:      order.order_date || null,
        delivery_mode:   order.delivery_mode || null,
        tracking_number: zrData?.tracking || null,
        zr_status:       zrData?.statut_livraison || null,
        zr_updated_at:   zrData?.updated_at || null,
        timeline,
      },
    });
  } catch (err) {
    console.error("[track] Unexpected error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Statuts ZR Express qui signifient "en route"
const ZR_SHIPPED_STATUSES = new Set([
  "Expédié", "En cours de livraison", "Recouvert", "Au bureau",
  "Commande reçue", "En attente de traitement", "Retour en cours",
]);

function mapStatus(confirmStatus, decisionStatus, zrStatus) {
  if (confirmStatus === "annulé")                                                 return "cancelled";
  if (decisionStatus === "livré" || confirmStatus === "livré" || zrStatus === "LIVRÉ")  return "delivered";
  if (decisionStatus === "expédié" || (zrStatus && ZR_SHIPPED_STATUSES.has(zrStatus))) return "shipped";
  if (decisionStatus === "préparé")                                                return "prepared";
  if (confirmStatus === "confirmé")                                                return "confirmed";
  return "pending";
}

function summarizeItems(itemsJson) {
  if (!Array.isArray(itemsJson)) return [];
  return itemsJson.slice(0, 5).map((item) => ({
    title:         item.title || item.product_title || "Article",
    variant_title: item.variant_title || null,
    qty:           item.quantity || item.qty || 1,
    price:         item.price,
  }));
}

function buildTimeline(order, zrData) {
  if (order.confirmation_status === "annulé") {
    return [{ key: "cancelled", label: "Commande annulée", done: true, date: null }];
  }

  const ds  = order.decision_status;
  const zrs = zrData?.statut_livraison;
  const hasTracking = !!zrData?.tracking;
  const isDelivered = ds === "livré" || zrs === "LIVRÉ";

  return [
    {
      key:   "placed",
      label: "Commande reçue",
      done:  true,
      date:  order.order_date || null,
    },
    {
      key:   "confirmed",
      label: "Commande confirmée",
      done:  order.confirmation_status === "confirmé" || ds === "préparé" || ds === "expédié" || ds === "livré",
      date:  null,
    },
    {
      key:   "prepared",
      label: "Colis préparé",
      done:  ds === "préparé" || ds === "expédié" || ds === "livré",
      date:  null,
    },
    {
      key:   "shipped",
      label: "Colis expédié — ZR Express",
      done:  hasTracking,
      date:  hasTracking ? (zrData?.updated_at || null) : null,
    },
    {
      key:   "delivered",
      label: "Colis livré",
      done:  isDelivered,
      date:  isDelivered ? (zrData?.updated_at || null) : null,
    },
  ];
}
