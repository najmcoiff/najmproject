import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { generateOrderPrefix, buildOrderName, hashString, getClientIp } from "@/lib/utils";
import { isValidAlgerianPhone, normalizePhone, calcCartTotal } from "@/lib/utils";
import { LOG_TYPES, ORDER_SOURCES, EVENT_TYPES, MOVEMENT_TYPES } from "@/lib/constants";
import { normPhone, computeMargin, resolveCode, resolveParrain, commissionFor, computeCagnotteLive } from "@/lib/ambassadeur";
import { randomUUID } from "crypto";

/**
 * POST /api/boutique/order
 * Crée une commande depuis nc-boutique dans nc_orders.
 *
 * Body :
 * {
 *   items: [{variant_id, qty, price, title, image_url}],
 *   customer: {
 *     first_name, last_name, phone,
 *     wilaya, wilaya_code, commune,
 *     delivery_type: 'home'|'office'
 *   },
 *   delivery_price: number,
 *   coupon?: { code, percentage, nom },
 *   session_id: string,
 *   idempotency_key: string,
 *   utm: {source?, medium?, campaign?}
 * }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { items, customer, delivery_price, coupon, session_id, idempotency_key, utm, world, ambassadeur_code, spend_credit_code } = body;

  // ── Validation ───────────────────────────────────────────
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "السلة فارغة" }, { status: 400 });
  }

  if (!customer?.first_name?.trim() && !customer?.full_name?.trim()) {
    return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
  }

  if (!isValidAlgerianPhone(customer.phone)) {
    return NextResponse.json({
      error: "رقم الهاتف غير صحيح. الصيغة المطلوبة: 06XXXXXXXX أو 07XXXXXXXX",
    }, { status: 400 });
  }

  if (!customer?.wilaya) {
    return NextResponse.json({ error: "الولاية مطلوبة" }, { status: 400 });
  }

  const sb = createServiceClient();

  // ── Anti-double-submit ────────────────────────────────────
  if (idempotency_key) {
    const { data: existing } = await sb
      .from("nc_orders")
      .select("order_id, order_name")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ok: true,
        order_id: existing.order_id,
        order_name: existing.order_name,
        duplicate: true,
      });
    }
  }

  // ── Vérification stock ────────────────────────────────────
  const variantIds = items.map((i) => i.variant_id);
  const { data: variants, error: varErr } = await sb
    .from("nc_variants")
    .select("variant_id, inventory_quantity, product_title, price")
    .in("variant_id", variantIds)
    .eq("status", "active");

  if (varErr) {
    return NextResponse.json({ error: "Erreur vérification stock" }, { status: 500 });
  }

  const stockMap = Object.fromEntries(
    (variants || []).map((v) => [String(v.variant_id), v])
  );

  for (const item of items) {
    const stock = stockMap[String(item.variant_id)];
    if (!stock) {
      return NextResponse.json({
        error: `Produit introuvable : ${item.title || item.variant_id}`,
        stock_alert: true,
      }, { status: 400 });
    }
    if (Number(stock.inventory_quantity) < Number(item.qty)) {
      await logStockAlert(sb, item.variant_id, item.qty, stock.inventory_quantity, stock.product_title);
      return NextResponse.json({
        error: `Stock insuffisant pour "${stock.product_title}". Disponible : ${stock.inventory_quantity}`,
        stock_alert: true,
        variant_id: item.variant_id,
      }, { status: 400 });
    }
  }

  // ── Génération numéro de commande ─────────────────────────
  const prefix = generateOrderPrefix();

  // Compteur journalier : combien de commandes nc_boutique aujourd'hui ?
  // Utilise order_date (présent sur toutes les commandes natives)
  const today = new Date().toISOString().slice(0, 10);
  const { count: todayCount } = await sb
    .from("nc_orders")
    .select("order_id", { count: "exact", head: true })
    .eq("order_source", ORDER_SOURCES.NC_BOUTIQUE)
    .gte("order_date", `${today}T00:00:00.000Z`)
    .lt("order_date", `${today}T23:59:59.999Z`);

  const order_name = buildOrderName(prefix, (todayCount || 0) + 1);

  // ── Construction du payload nc_orders ────────────────────
  const cartTotal     = calcCartTotal(items);
  const phone         = normalizePhone(customer.phone);
  const firstName     = customer.first_name?.trim() || "";
  const lastName      = customer.last_name?.trim()  || "";
  const fullName      = customer.full_name?.trim()  || `${firstName} ${lastName}`.trim();
  const deliveryPrice = Number(delivery_price) || 0;
  // Remise basée sur la marge : (prix_vente - coût) × percentage/100 par article
  // ⚠️  Si coût inconnu → remise = 0 pour cet article (jamais réduire sur le prix entier)
  const couponDiscount = (() => {
    if (!coupon?.percentage) return 0;
    const pp = coupon.purchase_prices || {};
    return items.reduce((sum, item) => {
      const cost = pp[item.variant_id];
      if (cost == null) return sum;                     // coût inconnu → pas de remise
      const base = Number(item.price) - Number(cost);  // marge réelle
      if (base <= 0) return sum;
      return sum + Math.round(base * coupon.percentage / 100) * Number(item.qty);
    }, 0);
  })();
  // ── Crédit ambassadeur dépensé (le coiffeur commande pour LUI) ────────────
  // Discount = min(cagnotte dispo, marge, panier) → jamais sous ton coût.
  // Sécurité : seulement si le numéro acheteur = le numéro du coiffeur.
  let creditSpent = 0;
  let spendAmb = null;
  if (spend_credit_code) {
    const amb = await resolveCode(sb, spend_credit_code);
    if (amb && normPhone(amb.phone) === normPhone(phone)) {
      // Cagnotte DISPONIBLE calculée en direct (= commissions de commandes livrées)
      const { dispo } = await computeCagnotteLive(sb, amb.phone);
      if (dispo > 0) {
        const { marge } = await computeMargin(sb, items);
        creditSpent = Math.max(0, Math.min(dispo, marge, cartTotal - couponDiscount));
        if (creditSpent > 0) spendAmb = amb;
      }
    }
  }

  const total = cartTotal - couponDiscount - creditSpent + deliveryPrice;

  const now = new Date().toISOString();

  const orderPayload = {
    order_id:              randomUUID(),
    order_name,
    order_date:            now,
    order_source:          ORDER_SOURCES.NC_BOUTIQUE,
    confirmation_status:   "nouveau",
    decision_status:       "en_attente",
    full_name:             fullName,
    customer_name:         fullName,
    customer_first_name:   firstName || null,
    customer_last_name:    lastName  || null,
    phone,
    customer_phone:        phone,
    wilaya:                customer.wilaya,
    customer_wilaya:       customer.wilaya,
    customer_commune:      customer.commune?.trim() || null,
    commune:               customer.commune?.trim() || null,
    delivery_type:         customer.delivery_type || "home",
    delivery_price:        deliveryPrice,
    coupon_code:           coupon?.code || null,
    coupon_discount:       couponDiscount || null,
    items_json:            items,
    total_price:           total,
    order_total:           total,
    delivery_mode:         customer.delivery_type === "office" ? "Bureau" : "Domicile",
    idempotency_key:       idempotency_key || null,
    session_id:            session_id || null,
    utm_source:            utm?.source || null,
    utm_medium:            utm?.medium || null,
    utm_campaign:          utm?.campaign || null,
    stock_deducted:        false,
    synced_at:             now,
  };

  const { data: newOrder, error: insertErr } = await sb
    .from("nc_orders")
    .insert(orderPayload)
    .select("order_id, order_name")
    .single();

  if (insertErr) {
    console.error("[order] Insert error:", insertErr.message);
    await logOrderFailed(sb, insertErr.message, orderPayload);
    return NextResponse.json({
      error: "Erreur création commande. Veuillez réessayer.",
    }, { status: 500 });
  }

  // ── Déduction stock (atomique par variante) ───────────────
  await deductStock(sb, newOrder, items);

  // ── Crédit ambassadeur dépensé → débiter la cagnotte du coiffeur ──────────
  if (spendAmb && creditSpent > 0) {
    await spendCoiffeurCredit(sb, newOrder, spendAmb, creditSpent);
  }

  // ── Logs post-création ────────────────────────────────────
  const clientIp = getClientIp(request);
  const ipHash = await hashString(clientIp).catch(() => "unknown");

  await Promise.allSettled([
    // Log opérationnel nc_events
    logOrderPlaced(sb, newOrder, total, items.length, customer.wilaya),
    // Log par article pour nc_kpi_stock_view (vitesse de vente + score urgence)
    logOrderItems(sb, newOrder, items),
    // Tracking marketing nc_page_events (côté serveur = fiable)
    trackOrderPlaced(sb, {
      session_id:    session_id || "unknown",
      order_id:      newOrder.order_id,
      order_name:    newOrder.order_name,
      total,
      item_count:    items.length,
      wilaya:        customer.wilaya,
      utm,
      ip_hash:       ipHash,
      user_agent:    request.headers.get("user-agent") || "",
    }),
    // Attribution WhatsApp : si ce numéro a reçu un message dans les 72h → conversion
    attributeWhatsAppConversion(sb, phone, newOrder.order_id, total),
    // Programme Ambassadeur (Couche 1) : commission coiffeur / rente parrain
    creditAmbassadeur(sb, newOrder, items, phone, ambassadeur_code),
    // Meta CAPI Purchase (server-side — bypass adblockers)
    sendPurchaseCAPI({
      world:      world || null,
      session_id: session_id || "unknown",
      order_id:   newOrder.order_id,
      items,
      total,
      clientIp,
      userAgent:  request.headers.get("user-agent") || "",
    }),
  ]);

  return NextResponse.json({
    ok: true,
    order_id: newOrder.order_id,
    order_name: newOrder.order_name,
    credit_spent: creditSpent || 0,
  });
}

// Débite la cagnotte du coiffeur quand il paie une partie avec son crédit,
// et trace le mouvement dans le grand livre (montant négatif).
async function spendCoiffeurCredit(sb, order, amb, amount) {
  try {
    const phone = normPhone(amb.phone);
    const { data: a } = await sb.from("nc_ambassadeurs").select("cagnotte_da").eq("phone", phone).maybeSingle();
    if (!a) return;
    const newBal = Math.max(0, Number(a.cagnotte_da || 0) - amount);
    await sb.from("nc_ambassadeurs")
      .update({ cagnotte_da: newBal, updated_at: new Date().toISOString() })
      .eq("phone", phone);
    await sb.from("nc_ambassadeur_commissions").insert({
      ambassadeur_code:  amb.code,
      ambassadeur_phone: phone,
      order_id:          order.order_id,
      scenario:          "depense_credit",
      marge_da:  0,
      taux_pct:  0,
      montant_da: -amount,          // négatif = dépense
      statut:    "valide",
      validated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[spendCoiffeurCredit] Error:", e.message);
  }
}

// ── Déduction stock + audit trail ────────────────────────────
async function deductStock(sb, order, items) {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const { data: movement, error: rpcErr } = await sb.rpc("decrement_stock", {
        p_variant_id: String(item.variant_id),
        p_qty:        Number(item.qty),
      });

      if (rpcErr) {
        console.error(`[deductStock] RPC error variant ${item.variant_id}:`, rpcErr.message);
        return;
      }

      const row = Array.isArray(movement) ? movement[0] : movement;
      if (!row) return;

      await sb.from("nc_stock_movements").insert({
        variant_id:    String(item.variant_id),
        movement_type: MOVEMENT_TYPES.SALE,
        qty_before:    row.qty_before,
        qty_change:    -Number(item.qty),
        qty_after:     row.qty_after,
        order_id:      order.order_id,
        source:        ORDER_SOURCES.NC_BOUTIQUE,
        note:          `Commande ${order.order_name}`,
      });
    })
  );

  const allOk = results.every((r) => r.status === "fulfilled");
  await sb
    .from("nc_orders")
    .update({ stock_deducted: allOk })
    .eq("order_id", order.order_id);
}

// ── Fonctions de log ──────────────────────────────────────────

// Log un event ORDERS_ITEMS par article — alimente nc_kpi_stock_view (vitesse + score urgence)
async function logOrderItems(sb, order, items) {
  const rows = items.map((item) => ({
    log_type:   "ORDERS_ITEMS",
    source:     "nc_boutique",
    order_id:   order.order_id,
    variant_id: String(item.variant_id),
    qty:        Number(item.qty),
    note:       `${item.title || item.variant_id} × ${item.qty}`,
  }));
  await sb.from("nc_events").insert(rows);
}

async function logOrderPlaced(sb, order, total, itemCount, wilaya) {
  await sb.from("nc_events").insert({
    log_type:   LOG_TYPES.ORDER_PLACED,
    source:     "nc_boutique",
    order_id:   order.order_id,
    note:       `Commande ${order.order_name} créée — ${total} DA — ${itemCount} article(s) — ${wilaya}`,
    metadata:   { order_name: order.order_name, total, item_count: itemCount, wilaya },
  }).throwOnError();
}

async function logOrderFailed(sb, errorMsg, payload) {
  await sb.from("nc_events").insert({
    log_type:         LOG_TYPES.ORDER_FAILED,
    source:           "nc_boutique",
    note:             `Erreur création commande : ${errorMsg}`,
    metadata:         { error: errorMsg, payload_snapshot: payload },
  });
}

async function logStockAlert(sb, variantId, requested, available, title) {
  await sb.from("nc_events").insert({
    log_type: LOG_TYPES.STOCK_ALERT,
    source:   "nc_boutique",
    note:     `Stock insuffisant pour "${title}" : demandé ${requested}, disponible ${available}`,
    metadata: { variant_id: variantId, requested_qty: requested, available_qty: available, title },
  });
}

// ── Attribution WhatsApp → Commande ────────────────────────────────────────
// Si le numéro a reçu un message WhatsApp dans les 72h, la commande est attribuée
async function attributeWhatsAppConversion(sb, phone, orderId, revenueDa) {
  try {
    const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const { data: logs } = await sb
      .from("nc_wati_message_log")
      .select("id, campaign_id")
      .eq("phone", phone.replace(/\D/g, ""))
      .gte("sent_at", since)
      .is("converted_at", null)
      .order("sent_at", { ascending: false })
      .limit(1);

    if (!logs || logs.length === 0) return;

    const log = logs[0];
    // Marquer le message comme converti
    await sb
      .from("nc_wati_message_log")
      .update({ status: "converted", converted_at: new Date().toISOString(), order_id: orderId, revenue_da: revenueDa })
      .eq("id", log.id);

    // Incrémenter les stats de la campagne
    if (log.campaign_id) {
      await sb.rpc("increment_campaign_conversion", {
        p_campaign_id: log.campaign_id,
        p_revenue: revenueDa,
      }).catch(() => {
        // RPC optionnelle — si non disponible, faire un UPDATE direct
        return sb
          .from("nc_wati_campaigns")
          .update({ total_converted: sb.rpc })
          .eq("id", log.campaign_id);
      });

      const { data: camp } = await sb
        .from("nc_wati_campaigns")
        .select("total_converted, revenue_da")
        .eq("id", log.campaign_id)
        .maybeSingle();
      if (camp) {
        await sb
          .from("nc_wati_campaigns")
          .update({
            total_converted: (camp.total_converted || 0) + 1,
            revenue_da: (Number(camp.revenue_da) || 0) + Number(revenueDa),
          })
          .eq("id", log.campaign_id);
      }
    }
  } catch (err) {
    console.error("[attributeWhatsApp] Error:", err.message);
  }
}

// ── Meta CAPI — Purchase (server-side, bypass adblockers) ────────────────
async function sendPurchaseCAPI({ world, session_id, order_id, items, total, clientIp, userAgent }) {
  const capiToken = process.env.META_CAPI_TOKEN;
  if (!capiToken) return;

  const pixelId = world === "onglerie"
    ? process.env.NEXT_PUBLIC_META_PIXEL_ONGLERIE
    : process.env.NEXT_PUBLIC_META_PIXEL_COIFFURE;
  if (!pixelId) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.najmcoiff.com";
  const eventId = `purchase_${order_id}_${Date.now()}`;

  const payload = {
    data: [{
      event_name:       "Purchase",
      event_time:       Math.floor(Date.now() / 1000),
      event_id:         eventId,
      event_source_url: `${siteUrl}/commander`,
      action_source:    "website",
      user_data: {
        client_ip_address: clientIp,
        client_user_agent:  userAgent,
        external_id:       [session_id],
        country:           ["2a92270185a50d8020949f2cfb2125d1af1c2bd3dd92eada9210fcdb5c4310bf"],
      },
      custom_data: {
        content_ids:  items.map((i) => String(i.variant_id)),
        content_type: "product",
        value:        Number(total),
        currency:     "DZD",
        order_id:     String(order_id),
        num_items:    items.reduce((s, i) => s + Number(i.qty), 0),
      },
    }],
    access_token: capiToken,
  };

  try {
    await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch {
    // CAPI failure must never block order creation
  }
}

// ── Programme Ambassadeur — Couche 1 ────────────────────────────────────────
// Scénario 2 : commande AVEC code coiffeur      → coiffeur 50 % (vente directe)
// Scénario 3 : rachat SANS code (tel attribué)  → parrain 20 % (rente)
// Le client ne reçoit AUCUNE remise ici (Couche 1 = express + garanties, coût 0).
// La commission reste 'en_attente' jusqu'au COD confirmé + payé (voir dashboard).
async function creditAmbassadeur(sb, order, items, rawPhone, ambassadeurCode) {
  try {
    const phone = normPhone(rawPhone);
    if (phone.length < 9) return;

    let earner = null;       // { code, phone } de celui qui touche
    let scenario = null;
    let isNewLien = false;
    let switchLien = false;  // « dernier code gagne » : le client bascule vers un nouveau coiffeur

    const existingLien = await resolveParrain(sb, phone);

    if (ambassadeurCode) {
      // Scénario 2 — le client utilise un code coiffeur
      const amb = await resolveCode(sb, ambassadeurCode);
      if (!amb) return;                              // code inconnu → rien
      if (normPhone(amb.phone) === phone) return;    // auto-parrainage interdit
      earner   = { code: amb.code, phone: normPhone(amb.phone) };
      scenario = "2_vente_directe";
      if (!existingLien) {
        isNewLien = true;
      } else if (normPhone(existingLien.ambassadeur_phone) !== earner.phone) {
        // Le client était attribué à un AUTRE coiffeur → « dernier code gagne » : il bascule.
        switchLien = true;
      }
    } else if (existingLien) {
      // Scénario 3 — rachat sans code, numéro déjà attribué à un parrain
      earner   = { code: existingLien.ambassadeur_code, phone: normPhone(existingLien.ambassadeur_phone) };
      scenario = "3_rente_sans_code";
    } else {
      return; // commande organique — aucun ambassadeur
    }

    // Graver l'attribution EN PREMIER (robuste) : lien + commande sauvés AVANT
    // tout calcul → une erreur transitoire de marge ne perd pas l'attribution.
    if (isNewLien) {
      await sb.from("nc_ambassadeur_liens").insert({
        ambassadeur_code:  earner.code,
        ambassadeur_phone: earner.phone,
        filleul_phone:     phone,
        filleul_type:      "client",
        premiere_order_id: order.order_id,
      });
      const { data: a } = await sb.from("nc_ambassadeurs")
        .select("total_filleuls").eq("phone", earner.phone).maybeSingle();
      if (a) {
        await sb.from("nc_ambassadeurs")
          .update({ total_filleuls: (a.total_filleuls || 0) + 1, updated_at: new Date().toISOString() })
          .eq("phone", earner.phone);
      }
    } else if (switchLien) {
      // « Dernier code gagne » : réattribuer le client au coiffeur dont le code vient d'être utilisé.
      // Y touche la vente de cette commande ET la rente future (scénario 3) ; X perd le client.
      const oldPhone = normPhone(existingLien.ambassadeur_phone);
      await sb.from("nc_ambassadeur_liens").update({
        ambassadeur_code:  earner.code,
        ambassadeur_phone: earner.phone,
      }).eq("filleul_phone", phone);
      // Transférer le compteur clients : -1 à l'ancien coiffeur, +1 au nouveau.
      const { data: oldA } = await sb.from("nc_ambassadeurs")
        .select("total_filleuls").eq("phone", oldPhone).maybeSingle();
      if (oldA) {
        await sb.from("nc_ambassadeurs")
          .update({ total_filleuls: Math.max(0, (oldA.total_filleuls || 0) - 1), updated_at: new Date().toISOString() })
          .eq("phone", oldPhone);
      }
      const { data: newA } = await sb.from("nc_ambassadeurs")
        .select("total_filleuls").eq("phone", earner.phone).maybeSingle();
      if (newA) {
        await sb.from("nc_ambassadeurs")
          .update({ total_filleuls: (newA.total_filleuls || 0) + 1, updated_at: new Date().toISOString() })
          .eq("phone", earner.phone);
      }
    }
    await sb.from("nc_orders").update({
      ambassadeur_code:  earner.code,
      ambassadeur_phone: earner.phone,
    }).eq("order_id", order.order_id);

    // Marge réelle (INTERNE) + montant selon la grille (plancher NajmCoiff 40 %)
    const { marge } = await computeMargin(sb, items);
    const comm    = commissionFor(scenario, marge, { hasParrain: scenario === "3_rente_sans_code" });
    const montant = scenario === "2_vente_directe" ? comm.self_da   : comm.parrain_da;
    const taux    = scenario === "2_vente_directe" ? comm.taux_self : comm.taux_parrain;

    // Enregistrer la commission (en attente jusqu'au COD payé)
    if (montant > 0) {
      const { error: commErr } = await sb.from("nc_ambassadeur_commissions").insert({
        ambassadeur_code:  earner.code,
        ambassadeur_phone: earner.phone,
        order_id:          order.order_id,
        filleul_phone:     phone,
        scenario,
        marge_da:  marge,
        taux_pct:  Math.round(taux * 100),
        montant_da: montant,
        statut:    "en_attente",
      });
      if (!commErr) {
        // Refléter en "cagnotte en attente" (débloquée quand COD payé)
        const { data: a } = await sb.from("nc_ambassadeurs")
          .select("cagnotte_attente_da").eq("phone", earner.phone).maybeSingle();
        if (a) {
          await sb.from("nc_ambassadeurs")
            .update({ cagnotte_attente_da: Number(a.cagnotte_attente_da || 0) + montant })
            .eq("phone", earner.phone);
        }
      }
    }
  } catch (err) {
    console.error("[creditAmbassadeur] Error:", err.message);
  }
}

async function trackOrderPlaced(sb, data) {
  await sb.from("nc_page_events").insert({
    session_id:   data.session_id,
    event_type:   EVENT_TYPES.ORDER_PLACED,
    order_id:     data.order_id,
    utm_source:   data.utm?.source || null,
    utm_medium:   data.utm?.medium || null,
    utm_campaign: data.utm?.campaign || null,
    ip_hash:      data.ip_hash,
    user_agent:   data.user_agent,
    metadata: {
      order_name: data.order_name,
      total:      data.total,
      item_count: data.item_count,
      wilaya:     data.wilaya,
    },
  });
}
