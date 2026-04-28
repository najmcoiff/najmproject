import { createClient } from "@supabase/supabase-js";
import { ownerGuard } from "@/lib/ai-helpers";

const getDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

// ─── Fuseau Algérie (UTC+1) ────────────────────────────────────────────────────
function toAlgeriaDate(isoString) {
  const d = new Date(isoString);
  return new Date(d.getTime() + 3600000).toISOString().split("T")[0];
}

// ─── Normalisation numéro algérien ────────────────────────────────────────────
function normalizePhone(p) {
  p = (p || "").trim().replace(/[\s\-().]/g, "");
  if (p.startsWith("+213")) p = p.slice(4);
  else if (p.startsWith("213") && p.length >= 12) p = p.slice(3);
  else if (p.startsWith("0") && p.length === 10) p = p.slice(1);
  return p;
}

// ─── Statut helpers ───────────────────────────────────────────────────────────
function isConfirmed(o) {
  const cs = (o.confirmation_status || "").toLowerCase();
  const ds = (o.decision_status || "").toLowerCase();
  return cs.startsWith("confirm") || ds.startsWith("confirm") || ds === "modifier";
}
function isCancelled(o) {
  const cs = (o.confirmation_status || "").toLowerCase();
  const ds = (o.decision_status || "").toLowerCase();
  return cs.startsWith("annul") || ds === "annuler";
}
function isPending(o) {
  return !isConfirmed(o) && !isCancelled(o);
}

// ─── Calcul bénéfice brut (prix vente − prix achat) ──────────────────────────
// Uniquement sur commandes avec total_price > 0 (fiables)
function calcProfit(orders, costMap) {
  let totalRevenue = 0;
  let totalCogs = 0;
  for (const o of orders) {
    const tp = parseFloat(o.total_price) || 0;
    if (tp <= 0) continue;
    const items = Array.isArray(o.items_json) ? o.items_json : [];
    if (items.length > 0) {
      let itemsRevenue = 0;
      let itemsCogs = 0;
      for (const item of items) {
        const qty = parseFloat(item.quantity) || 1;
        const sellPrice = parseFloat(item.price) || 0;
        const cost = parseFloat(costMap[item.variant_id]) || sellPrice * 0.5;
        itemsRevenue += sellPrice * qty;
        itemsCogs += cost * qty;
      }
      totalRevenue += tp;
      totalCogs += itemsRevenue > 0 ? itemsCogs * (tp / itemsRevenue) : tp * 0.65;
    } else {
      totalRevenue += tp;
      totalCogs += tp * 0.65; // fallback 35% marge si pas d'items
    }
  }
  const profit = totalRevenue - totalCogs;
  const taux = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 1000) / 10 : 0;
  return { profit: Math.round(profit), revenue: Math.round(totalRevenue), taux };
}

export async function GET(req) {
  if (!ownerGuard(req)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(req.url);
  const targetDate = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const db = getDb();

  const [
    qBoutique,       // 1 — commandes boutique du jour
    qPOS,            // 2 — commandes POS du jour
    qBoutiqueMonth,  // 3 — boutique ce mois
    qPOSMonth,       // 4 — POS ce mois
    qPhoneHistory,   // 5 — historique phones (nouveaux vs fidèles)
    qZrToday,        // 6 — ZR activité aujourd'hui
    qZrConfirmed30j, // 7 — commandes confirmées 30j (dénominateur taux livraison)
    qZrStats30j,     // 8 — stats ZR 30j (livrés, retours, transit)
    qZrRecup,        // 9 — montant récupérable ZR
    qCaisse,         // 10 — caisse du jour
    qRecettes,       // 11 — récettes agents
    qAchatsMois,     // 12 — achats fournisseurs mois
    qPaiementsMois,  // 13 — paiements fournisseurs mois
    qRuptures,       // 14 — ruptures stock
    qCostMap,        // 15 — catalogue prix/coût
    qVisiteurs,      // 16 — visiteurs boutique
    qAbandons,       // 17 — paniers abandonnés
    qUtm,            // 18 — sources UTM
    qConfig,         // 19 — config BI
    q30jOrders,      // 20 — commandes 31j pour graphe historique
    qWatiToday,      // 21 — WhatsApp messages envoyés aujourd'hui
    qWatiConv,       // 22 — WhatsApp conversions du jour
    qYesterdayBoutique, // 23 — commandes boutique hier (J-1)
    qYesterdayPOS,      // 24 — POS hier (J-1)
  ] = await Promise.all([
    // 1 — boutique du jour (exclure POS) — filtre +01:00 (fuseau Algérie)
    db.from("nc_orders")
      .select("confirmation_status,decision_status,total_price,tracking,sold_by,order_source,session_id,order_date,customer_phone,items_json,delivery_price,coupon_discount")
      .gte("order_date", `${targetDate}T00:00:00+01:00`)
      .lte("order_date", `${targetDate}T23:59:59+01:00`)
      .neq("order_source", "pos")
      .or("is_archived.is.null,is_archived.eq.false"),

    // 2 — POS du jour — filtre +01:00 (fuseau Algérie)
    db.from("nc_orders")
      .select("confirmation_status,decision_status,total_price,sold_by,order_source,order_date,customer_phone,items_json")
      .gte("order_date", `${targetDate}T00:00:00+01:00`)
      .lte("order_date", `${targetDate}T23:59:59+01:00`)
      .eq("order_source", "pos"),

    // 3 — boutique ce mois (confirmées)
    db.from("nc_orders")
      .select("confirmation_status,decision_status,total_price,order_source,customer_phone,items_json")
      .gte("order_date", monthStart)
      .neq("order_source", "pos")
      .or("is_archived.is.null,is_archived.eq.false"),

    // 4 — POS ce mois
    db.from("nc_orders")
      .select("total_price,items_json,order_date")
      .gte("order_date", monthStart)
      .eq("order_source", "pos"),

    // 5 — historique phones avant aujourd'hui — filtre +01:00 (fuseau Algérie)
    db.from("nc_orders")
      .select("customer_phone")
      .lt("order_date", `${targetDate}T00:00:00+01:00`)
      .not("customer_phone", "is", null)
      .neq("customer_phone", ""),

    // 6 — ZR mis à jour aujourd'hui — filtre +01:00 (fuseau Algérie)
    db.from("nc_suivi_zr")
      .select("statut_livraison,order_total,final_status,date_livraison,order_id")
      .gte("updated_at", `${targetDate}T00:00:00+01:00`),

    // 7 — commandes boutique confirmées 30j (dénominateur taux livraison)
    db.from("nc_orders")
      .select("order_id", { count: "exact", head: true })
      .gte("order_date", thirtyDaysAgo)
      .neq("order_source", "pos")
      .or("is_archived.is.null,is_archived.eq.false")
      .or("confirmation_status.ilike.confirm%,decision_status.ilike.confirm%,decision_status.eq.modifier"),

    // 8 — ZR stats 30j (livrés, retours, transit)
    db.from("nc_suivi_zr")
      .select("statut_livraison,order_total,final_status,order_id")
      .gte("date_injection", thirtyDaysAgo),

    // 9 — montant récupérable ZR (encaissé + livré en attente)
    db.from("nc_suivi_zr")
      .select("statut_livraison,order_total,final_status"),

    // 10 — caisse du jour — filtre +01:00 (fuseau Algérie)
    db.from("nc_gestion_fond")
      .select("montant,type,categorie")
      .gte("synced_at", `${targetDate}T00:00:00+01:00`)
      .lte("synced_at", `${targetDate}T23:59:59+01:00`),

    // 11 — récettes agents du jour — filtre +01:00 (fuseau Algérie)
    db.from("nc_recettes")
      .select("total_declare,ecart")
      .gte("depot_timestamp", `${targetDate}T00:00:00+01:00`)
      .lte("depot_timestamp", `${targetDate}T23:59:59+01:00`),

    // 12 — achats fournisseurs ce mois
    db.from("nc_po_lines")
      .select("qty_add,purchase_price")
      .gte("created_at", monthStart),

    // 13 — paiements fournisseurs ce mois
    db.from("nc_gestion_fond")
      .select("montant")
      .eq("type", "SORTIE")
      .ilike("categorie", "Paiement fournisseur%")
      .gte("synced_at", monthStart),

    // 14 — ruptures stock
    db.from("nc_variants")
      .select("variant_id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("inventory_quantity", 0),

    // 15 — cost map complet (pour bénéfice)
    db.from("nc_variants")
      .select("variant_id,cost_price,price,inventory_quantity")
      .eq("status", "active"),

    // 16 — visiteurs boutique — filtre +01:00 (fuseau Algérie)
    db.from("nc_page_events")
      .select("session_id")
      .gte("created_at", `${targetDate}T00:00:00+01:00`)
      .lte("created_at", `${targetDate}T23:59:59+01:00`),

    // 17 — paniers abandonnés — filtre +01:00 (fuseau Algérie)
    db.from("nc_page_events")
      .select("session_id")
      .eq("event_type", "CHECKOUT_START")
      .gte("created_at", `${targetDate}T00:00:00+01:00`)
      .lte("created_at", `${targetDate}T23:59:59+01:00`),

    // 18 — UTM sources — filtre +01:00 (fuseau Algérie)
    db.from("nc_page_events")
      .select("utm_source,session_id")
      .gte("created_at", `${targetDate}T00:00:00+01:00`)
      .not("utm_source", "is", null),

    // 19 — config BI
    db.from("nc_bi_config").select("*").eq("id", 1).single(),

    // 20 — commandes 31j pour graphe historique (boutique confirmées + POS)
    db.from("nc_orders")
      .select("order_date,total_price,items_json,order_source,confirmation_status,decision_status")
      .gte("order_date", new Date(Date.now() - 31 * 86400000).toISOString())
      .or("is_archived.is.null,is_archived.eq.false"),

    // 21 — WhatsApp : messages envoyés aujourd'hui
    db.from("nc_wati_message_log")
      .select("id,status,campaign_id")
      .gte("sent_at", `${targetDate}T00:00:00+01:00`)
      .lte("sent_at", `${targetDate}T23:59:59+01:00`),

    // 22 — WhatsApp : conversions (attributions) du jour
    db.from("nc_wati_message_log")
      .select("id,revenue_da,campaign_id")
      .eq("status", "converted")
      .gte("converted_at", `${targetDate}T00:00:00+01:00`)
      .lte("converted_at", `${targetDate}T23:59:59+01:00`),

    // 23 — commandes boutique hier (J-1) pour comparaison
    db.from("nc_orders")
      .select("confirmation_status,decision_status,total_price,items_json")
      .gte("order_date", `${new Date(new Date(targetDate).getTime() - 86400000).toISOString().split("T")[0]}T00:00:00+01:00`)
      .lte("order_date", `${new Date(new Date(targetDate).getTime() - 86400000).toISOString().split("T")[0]}T23:59:59+01:00`)
      .neq("order_source", "pos")
      .or("is_archived.is.null,is_archived.eq.false"),

    // 24 — POS hier (J-1)
    db.from("nc_orders")
      .select("total_price,items_json")
      .gte("order_date", `${new Date(new Date(targetDate).getTime() - 86400000).toISOString().split("T")[0]}T00:00:00+01:00`)
      .lte("order_date", `${new Date(new Date(targetDate).getTime() - 86400000).toISOString().split("T")[0]}T23:59:59+01:00`)
      .eq("order_source", "pos"),
  ]);

  // ── Cost map ──────────────────────────────────────────────────────────────
  const costMap = {};
  const valeurMap = {};
  for (const v of qCostMap.data || []) {
    costMap[v.variant_id] = parseFloat(v.cost_price) || 0;
    valeurMap[v.variant_id] = {
      cost: parseFloat(v.cost_price) || 0,
      price: parseFloat(v.price) || 0,
      qty: Math.max(0, parseInt(v.inventory_quantity) || 0), // stock négatif ignoré
    };
  }

  // ── Commandes boutique du jour ─────────────────────────────────────────────
  const boutiqueOrders = qBoutique.data || [];
  const confirmed = boutiqueOrders.filter(isConfirmed);
  const cancelled = boutiqueOrders.filter(isCancelled);
  const pending = boutiqueOrders.filter(isPending);
  const recoltes = boutiqueOrders.length;
  const confirmees = confirmed.length;
  const annulees = cancelled.length;
  const attente = pending.length;
  const injectees = boutiqueOrders.filter((o) => o.tracking).length;
  const taux_confirmation = recoltes > 0 ? Math.round((confirmees / recoltes) * 1000) / 10 : 0;
  const ca_confirme = confirmed.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
  const panier_moyen = confirmees > 0 ? Math.round(ca_confirme / confirmees) : 0;

  // ── Commandes POS du jour ─────────────────────────────────────────────────
  const posOrders = qPOS.data || [];
  const nb_ventes_pos = posOrders.length;
  const ca_pos = posOrders.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);

  // ── Bénéfice du jour ──────────────────────────────────────────────────────

  // ── Bénéfice du jour ──────────────────────────────────────────────────────
  const allDayOrders = [...boutiqueOrders, ...posOrders];
  const profitBoutique = calcProfit(confirmed, costMap);
  const profitPOS = calcProfit(posOrders, costMap);
  const benefice_total_jour = profitBoutique.profit + profitPOS.profit;
  const ca_total_jour = Math.round(ca_confirme) + Math.round(ca_pos);
  const taux_marge_total = ca_total_jour > 0 ? Math.round(((benefice_total_jour / ca_total_jour) * 1000)) / 10 : 0;

  // ── Nouveaux clients vs fidèles (normalisation téléphone algérien) ──────────
  const phoneHistory = new Set(
    (qPhoneHistory.data || []).map((r) => normalizePhone(r.customer_phone)).filter(Boolean)
  );
  const todayPhones = [...new Set(
    allDayOrders.filter((o) => o.customer_phone)
      .map((o) => normalizePhone(o.customer_phone)).filter(Boolean)
  )];
  const nouveaux = todayPhones.filter((p) => p && !phoneHistory.has(p));
  const fidelite = todayPhones.filter((p) => p && phoneHistory.has(p));
  const taux_fidelite = todayPhones.length > 0 ? Math.round((fidelite.length / todayPhones.length) * 1000) / 10 : 0;

  const ordersNouveaux = confirmed.filter((o) => o.customer_phone && nouveaux.includes(normalizePhone(o.customer_phone)));
  const ordersFideles = confirmed.filter((o) => o.customer_phone && fidelite.includes(normalizePhone(o.customer_phone)));
  const pm_nouveaux = ordersNouveaux.length > 0 ? Math.round(ordersNouveaux.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0) / ordersNouveaux.length) : 0;
  const pm_fidelite = ordersFideles.length > 0 ? Math.round(ordersFideles.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0) / ordersFideles.length) : 0;

  // ── Agents (boutique uniquement — POS sont comptés séparément) ─────────────
  const agentsMap = {};
  for (const o of boutiqueOrders) {
    const ag = o.sold_by || "—";
    if (!agentsMap[ag]) agentsMap[ag] = { agent: ag, traitees: 0, confirmees: 0, ca: 0, annulees: 0 };
    agentsMap[ag].traitees++;
    if (isConfirmed(o)) { agentsMap[ag].confirmees++; agentsMap[ag].ca += parseFloat(o.total_price) || 0; }
    if (isCancelled(o)) agentsMap[ag].annulees++;
  }
  const agents = Object.values(agentsMap)
    .filter((a) => a.agent !== "—")
    .map((a) => ({ ...a, ca: Math.round(a.ca), taux: a.traitees > 0 ? Math.round((a.confirmees / a.traitees) * 1000) / 10 : 0 }))
    .sort((a, b) => b.confirmees - a.confirmees);

  // ── Livraison ZR ─────────────────────────────────────────────────────────
  const zrToday = qZrToday.data || [];
  const zr30 = qZrStats30j.data || [];
  const zrAll = qZrRecup.data || [];

  const livres_jour = zrToday.filter((z) => (z.statut_livraison || "").toLowerCase().startsWith("livr") && (z.date_livraison || "").startsWith(targetDate)).length;
  const retours_jour = zrToday.filter((z) => (z.statut_livraison || "").toLowerCase().includes("retourn")).length;
  const livres_30j = zr30.filter((z) => (z.statut_livraison || "").toLowerCase().startsWith("livr")).length;
  const confirmes_30j = qZrConfirmed30j.count || 1; // éviter division par 0
  // ✅ Taux livraison corrigé : livré / confirmées (pas livré / total_ZR)
  const taux_livraison_30j = Math.round((livres_30j / confirmes_30j) * 1000) / 10;
  const en_transit = zr30.filter((z) => {
    const s = (z.statut_livraison || "").toLowerCase();
    return !s.startsWith("livr") && !s.includes("retourn") && !s.startsWith("encaiss");
  }).length;

  // Montant récupérable ZR (depuis nc_suivi_zr mis à jour par webhooks)
  const pret_a_recuperer = zrAll
    .filter((z) => (z.statut_livraison || "").toLowerCase().startsWith("encaiss"))
    .reduce((s, z) => s + (parseFloat(z.order_total) || 0), 0);
  const livre_en_attente_zr = zrAll
    .filter((z) => {
      const s = (z.statut_livraison || "").toLowerCase();
      return s.startsWith("livr") && !s.startsWith("encaiss") && z.final_status !== "encaisse";
    })
    .reduce((s, z) => s + (parseFloat(z.order_total) || 0), 0);

  // ── Finance ──────────────────────────────────────────────────────────────
  const caisse = qCaisse.data || [];
  const entrees_caisse = caisse.filter((r) => (r.type || "").startsWith("ENT") || r.type === "ENTRÉE").reduce((s, r) => s + (parseFloat(r.montant) || 0), 0);
  const sorties_caisse = caisse.filter((r) => r.type === "SORTIE").reduce((s, r) => s + (parseFloat(r.montant) || 0), 0);
  const recettes = qRecettes.data || [];
  const recettes_agents = recettes.reduce((s, r) => s + (parseFloat(r.total_declare) || 0), 0);
  const ecart_recettes = Math.abs(recettes.reduce((s, r) => s + (parseFloat(r.ecart) || 0), 0));
  const achats_mois = (qAchatsMois.data || []).reduce((s, r) => s + (parseFloat(r.qty_add) || 0) * (parseFloat(r.purchase_price) || 0), 0);
  const paiements_mois = (qPaiementsMois.data || []).reduce((s, r) => s + (parseFloat(r.montant) || 0), 0);
  const dette_mois = Math.max(0, achats_mois - paiements_mois);

  // ── Mensuel (boutique + POS) ──────────────────────────────────────────────
  const boutiqueMonth = qBoutiqueMonth.data || [];
  const confirmedMonth = boutiqueMonth.filter(isConfirmed);
  const posMonth = qPOSMonth.data || [];
  const ca_mois_boutique = confirmedMonth.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
  const ca_mois_pos = posMonth.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
  const ca_mois_total = ca_mois_boutique + ca_mois_pos;
  const profitBoutiqueMonth = calcProfit(confirmedMonth, costMap);
  const profitPOSMonth = calcProfit(posMonth, costMap);
  const benefice_mois = profitBoutiqueMonth.profit + profitPOSMonth.profit;
  const taux_marge_mois = ca_mois_total > 0 ? Math.round((benefice_mois / ca_mois_total) * 1000) / 10 : 0;

  // ── Stock ─────────────────────────────────────────────────────────────────
  const nb_ruptures = qRuptures.count || 0;
  const allVariants = Object.values(valeurMap);
  const valeur_stock_vente = allVariants.reduce((s, v) => s + v.qty * v.price, 0);
  const valeur_stock_achat = allVariants.reduce((s, v) => s + v.qty * v.cost, 0);
  const marge_potentielle_stock = valeur_stock_vente - valeur_stock_achat;
  const stock_total = allVariants.reduce((s, v) => s + v.qty, 0);
  const stock_ruptures_pct = (stock_total + nb_ruptures) > 0 ? Math.round(nb_ruptures / (stock_total + nb_ruptures) * 1000) / 10 : 0;
  // Articles avec stock > 0 mais sans prix d'achat renseigné
  const nb_sans_prix_achat = allVariants.filter(v => v.qty > 0 && v.cost === 0).length;
  const unites_sans_prix_achat = allVariants.filter(v => v.qty > 0 && v.cost === 0).reduce((s, v) => s + v.qty, 0);

  // ── Marketing boutique ────────────────────────────────────────────────────
  const visiteurs_uniques = new Set((qVisiteurs.data || []).map((v) => v.session_id)).size;
  const checkoutSessions = new Set((qAbandons.data || []).map((v) => v.session_id));
  const orderSessions = new Set(boutiqueOrders.filter((o) => o.session_id).map((o) => o.session_id));
  const paniers_abandonnes = [...checkoutSessions].filter((s) => !orderSessions.has(s)).length;
  const nb_boutique_confirmed = boutiqueOrders.filter(isConfirmed).length;
  const taux_conversion = visiteurs_uniques > 0 ? Math.round((nb_boutique_confirmed / visiteurs_uniques) * 1000) / 10 : 0;
  const utmMap = {};
  for (const e of qUtm.data || []) { if (e.utm_source) utmMap[e.utm_source] = (utmMap[e.utm_source] || 0) + 1; }
  const top_utm = Object.entries(utmMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // ── Graphe historique 30j ─────────────────────────────────────────────────
  const byDay30 = {};
  for (let i = 30; i >= 0; i--) {
    const key = toAlgeriaDate(new Date(Date.now() - i * 86400000).toISOString());
    if (!byDay30[key]) byDay30[key] = { date: key, confirmees: 0, benefice: 0, ventes_pos: 0 };
  }
  for (const o of q30jOrders.data || []) {
    const key = toAlgeriaDate(o.order_date);
    const day = byDay30[key];
    if (!day) continue;
    if (o.order_source === "pos") {
      day.ventes_pos++;
    } else if (isConfirmed(o)) {
      day.confirmees++;
      const tp = parseFloat(o.total_price) || 0;
      if (tp > 0) {
        const items = Array.isArray(o.items_json) ? o.items_json : [];
        let rev = 0, cogs = 0;
        for (const item of items) {
          const qty = parseFloat(item.quantity) || 1;
          const sp = parseFloat(item.price) || 0;
          const cp = parseFloat(costMap[item.variant_id]) || sp * 0.5;
          rev += sp * qty;
          cogs += cp * qty;
        }
        day.benefice += Math.round(rev > 0 ? tp - tp * (cogs / rev) : tp * 0.35);
      }
    }
  }
  const byDay30Arr = Object.values(byDay30).sort((a, b) => a.date.localeCompare(b.date));

  // ── WhatsApp Marketing stats ──────────────────────────────────────────────
  const watiMessages = qWatiToday.data || [];
  const watiConversions = qWatiConv.data || [];
  const wati_envoyes = watiMessages.length;
  const wati_lus = watiMessages.filter(m => m.status === "read").length;
  const wati_convertis = watiConversions.length;
  const wati_revenue = watiConversions.reduce((s, m) => s + (parseFloat(m.revenue_da) || 0), 0);
  const wati_taux_lecture = wati_envoyes > 0 ? Math.round((wati_lus / wati_envoyes) * 1000) / 10 : 0;
  const wati_taux_conversion = wati_envoyes > 0 ? Math.round((wati_convertis / wati_envoyes) * 1000) / 10 : 0;

  // ── Comparaison J-1 ───────────────────────────────────────────────────────
  const yesterdayBoutique = qYesterdayBoutique.data || [];
  const yesterdayConfirmed = yesterdayBoutique.filter(isConfirmed);
  const yesterdayPOS = qYesterdayPOS.data || [];
  const j1_confirmees = yesterdayConfirmed.length;
  const j1_ca = yesterdayConfirmed.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0) +
    yesterdayPOS.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
  const j1_profit = calcProfit(yesterdayConfirmed, costMap).profit + calcProfit(yesterdayPOS, costMap).profit;
  const j1_recoltes = yesterdayBoutique.length;
  const delta_confirmees = confirmees - j1_confirmees;
  const delta_ca = Math.round(ca_total_jour) - Math.round(j1_ca);
  const delta_benefice = benefice_total_jour - j1_profit;
  const delta_recoltes = recoltes - j1_recoltes;

  // ── Config ────────────────────────────────────────────────────────────────
  const config = qConfig.data || { objectif_benefice_mensuel: 250000, objectif_ca_mensuel: 1500000, objectif_commandes_jour: 20, dette_initiale: 0 };
  const objectif_benefice = parseFloat(config.objectif_benefice_mensuel) || 250000;
  const dette_totale = (parseFloat(config.dette_initiale) || 0) + dette_mois;
  // Progression bénéfice vs objectif journalier estimé
  const objectif_jour = objectif_benefice / 30;
  const benef_vs_objectif_jour = objectif_jour > 0 ? Math.round((benefice_total_jour / objectif_jour) * 100) : 0;
  // Progression mensuelle bénéfice (2 décimales)
  const progression_benefice_pct = objectif_benefice > 0 ? Math.round((benefice_mois / objectif_benefice) * 10000) / 100 : 0;

  // ── Health Score (basé sur BÉNÉFICE, pas CA) ──────────────────────────────
  let score = 100;
  // Taux confirmation boutique
  if (taux_confirmation < 50) score -= 30;
  else if (taux_confirmation < 65) score -= 15;
  else if (taux_confirmation < 75) score -= 5;
  // Taux livraison 30j
  if (taux_livraison_30j < 60) score -= 25;
  else if (taux_livraison_30j < 70) score -= 15;
  else if (taux_livraison_30j < 80) score -= 5;
  // Progression bénéfice (CORRECTION — plus CA)
  if (benef_vs_objectif_jour < 50) score -= 20;
  else if (benef_vs_objectif_jour < 75) score -= 10;
  else if (benef_vs_objectif_jour < 90) score -= 3;
  // Stock
  if (stock_ruptures_pct > 20) score -= 15;
  else if (stock_ruptures_pct > 10) score -= 8;
  else if (stock_ruptures_pct > 5) score -= 3;
  // Caisse
  if (ecart_recettes > 2000) score -= 10;
  else if (ecart_recettes > 500) score -= 5;
  // Si aucune commande aujourd'hui → score plafonné à 60
  if (recoltes === 0 && nb_ventes_pos === 0) score = Math.min(score + 20, 60);
  score = Math.max(0, score);

  const health_status = score >= 85 ? "green" : score >= 70 ? "yellow" : score >= 50 ? "orange" : "red";
  const health_message =
    score >= 85 ? "Business en excellente santé" :
    score >= 70 ? "Quelques points à surveiller" :
    score >= 50 ? "Attention requise sur plusieurs indicateurs" :
    "ALERTE : Business en difficulté — action immédiate";

  return Response.json({
    date: targetDate,
    health_score: score,
    health_status,
    health_message,

    // Commandes boutique (à traiter par agents)
    boutique: {
      recoltes,
      confirmees,
      annulees,
      attente,
      injectees,
      taux_confirmation,
      ca_confirme: Math.round(ca_confirme),
      panier_moyen,
    },

    // Ventes POS (encaissées sur place)
    pos: {
      nb_ventes: nb_ventes_pos,
      ca_pos: Math.round(ca_pos),
      agents_pos: [...new Set(posOrders.map((o) => o.sold_by).filter(Boolean))],
    },

    // Bénéfice brut (prix vente − prix achat)
    benefice: {
      boutique: profitBoutique.profit,
      taux_marge_boutique: profitBoutique.taux,
      pos: profitPOS.profit,
      taux_marge_pos: profitPOS.taux,
      total_jour: benefice_total_jour,
      taux_marge_total,
      mois: benefice_mois,
      taux_marge_mois,
      objectif_mensuel: objectif_benefice,
      progression_pct: progression_benefice_pct,
      vs_objectif_jour_pct: benef_vs_objectif_jour,
    },

    // Clients & fidélité
    clients: {
      total_today: todayPhones.length,
      nouveaux: nouveaux.length,
      fidelite_count: fidelite.length,
      taux_fidelite,
      pm_nouveaux,
      pm_fidelite,
    },

    // Mensuel
    mensuel: {
      ca_mois_boutique: Math.round(ca_mois_boutique),
      ca_mois_pos: Math.round(ca_mois_pos),
      ca_mois_total: Math.round(ca_mois_total),
      benefice_mois,
      taux_marge_mois,
      objectif_benefice,
      progression_pct: progression_benefice_pct,
      commandes_mois: confirmedMonth.length,
      ventes_pos_mois: posMonth.length,
    },

    // Livraison ZR
    delivery: {
      livres_jour,
      retours_jour,
      taux_livraison_30j,
      en_transit,
      pret_a_recuperer: Math.round(pret_a_recuperer),
      livre_en_attente_zr: Math.round(livre_en_attente_zr),
    },

    // Finance
    finance: {
      entrees_caisse: Math.round(entrees_caisse),
      sorties_caisse: Math.round(sorties_caisse),
      solde_net: Math.round(entrees_caisse - sorties_caisse),
      recettes_agents: Math.round(recettes_agents),
      ecart_recettes: Math.round(ecart_recettes),
      dette_mois: Math.round(dette_mois),
      dette_totale: Math.round(dette_totale),
    },

    // Stock
    stock: {
      nb_ruptures,
      valeur_stock_vente: Math.round(valeur_stock_vente),
      valeur_stock_achat: Math.round(valeur_stock_achat),
      marge_potentielle_stock: Math.round(marge_potentielle_stock),
      stock_ruptures_pct,
      nb_sans_prix_achat,
      unites_sans_prix_achat,
    },

    agents,
    marketing: {
      visiteurs_uniques,
      taux_conversion,
      paniers_abandonnes,
      top_utm,
      utm_sources: Object.entries(utmMap).sort((a,b) => b[1]-a[1]).slice(0, 5).map(([source, count]) => ({ source, count })),
    },
    whatsapp: {
      envoyes: wati_envoyes,
      lus: wati_lus,
      convertis: wati_convertis,
      revenue_da: Math.round(wati_revenue),
      taux_lecture: wati_taux_lecture,
      taux_conversion: wati_taux_conversion,
    },
    j1: {
      confirmees: j1_confirmees,
      recoltes: j1_recoltes,
      ca: Math.round(j1_ca),
      benefice: j1_profit,
      delta_confirmees,
      delta_ca,
      delta_benefice,
      delta_recoltes,
    },
    byDay30: byDay30Arr,
    config: {
      objectif_benefice_mensuel: objectif_benefice,
      objectif_ca_mensuel: config.objectif_ca_mensuel,
      objectif_commandes_jour: config.objectif_commandes_jour,
      dette_initiale: config.dette_initiale,
    },
  });
}
