// ═══════════════════════════════════════════════════════════════════
//  POST /api/quota/generate
//  Génère une quota de préparation 100% Supabase (0 GAS, 0 Sheets)
//
//  Body : { premierId?, nbCmd?, token }
//  Réponse : { ok, variants, orders, quota_id, duration_ms }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const ALLOWED_ROLES = ["owner", "chef", "responsable", "admin", "preparateur", "agent digital"];

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { premierId, nbCmd, token } = body;

    // ── Auth ──────────────────────────────────────────────────────
    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Token invalide ou expiré" }, { status: 401 });
    }
    const role = (session.role || "").toLowerCase();
    if (!ALLOWED_ROLES.some(r => role.includes(r))) {
      return NextResponse.json({ ok: false, error: "Rôle insuffisant" }, { status: 403 });
    }

    const t0 = Date.now();
    const supabase = adminSB();

    // ── 1. Lire toutes les commandes actives triées par date ──────
    // nullsLast = les commandes sans date (récentes) s'affichent EN FIN de liste ASC
    let allOrders = [];
    let from = 0;
    const PAGE = 500;
    while (true) {
      const { data, error } = await supabase
        .from("nc_orders")
        .select("order_id, customer_name, order_date, items_json")
        .eq("archived", false)
        .neq("order_source", "pos")
        .or("decision_status.is.null,decision_status.neq.annuler")
        .order("order_date", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1);

      if (error) throw new Error("Erreur lecture nc_orders: " + error.message);
      if (!data || data.length === 0) break;
      allOrders = allOrders.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (allOrders.length === 0) {
      return NextResponse.json({ ok: false, error: "Aucune commande active trouvée" });
    }

    // ── 2. Trouver startIdx depuis premierId ──────────────────────
    // Les commandes avec decision_status = 'annuler' sont exclues côté BDD
    let startIdx = 0;
    if (premierId) {
      const pid = String(premierId).trim();
      const idx = allOrders.findIndex(o => String(o.order_id).trim() === pid);
      if (idx >= 0) startIdx = idx;
    }

    let slice = allOrders.slice(startIdx);
    const nb = nbCmd ? Number(nbCmd) : null;
    if (nb && nb > 0) slice = slice.slice(0, nb);

    // ── 3. Agréger les variants depuis items_json ─────────────────
    const aggregated = {};
    const orderSummary = [];

    slice.forEach((order, pos) => {
      const raw = order.items_json;
      const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);

      const nbArticles = items.reduce((s, it) => s + Number(it?.qty || it?.quantity || 1), 0);
      orderSummary.push({
        order_id:      order.order_id,
        customer_name: order.customer_name || "",
        order_date:    order.order_date    || "",
        nb_articles:   nbArticles,
        position:      pos + 1,
      });

      items.filter(Boolean).forEach(item => {
        const vid = item.variant_id ? String(item.variant_id) : ("__" + (item.title || "?"));
        if (!aggregated[vid]) {
          aggregated[vid] = {
            variant_id: item.variant_id || "",
            title:      String(item.title || item.product_title || ""),
            quantity:   0,
            image_url:  "",
            clients:    [],
          };
        }
        aggregated[vid].quantity += Number(item.qty || item.quantity || 1);
        const cname = order.customer_name || "";
        if (cname && !aggregated[vid].clients.includes(cname)) {
          aggregated[vid].clients.push(cname);
        }
      });
    });

    // ── 4. Enrichir images depuis nc_variants ─────────────────────
    let rows = Object.values(aggregated).sort((a, b) => b.quantity - a.quantity);
    const needImg = rows
      .filter(r => r.variant_id && !r.image_url)
      .map(r => r.variant_id)
      .slice(0, 200);

    if (needImg.length > 0) {
      const { data: variants } = await supabase
        .from("nc_variants")
        .select("variant_id, image_url")
        .in("variant_id", needImg);
      const imgMap = {};
      (variants || []).forEach(v => { if (v.image_url) imgMap[String(v.variant_id)] = v.image_url; });
      rows.forEach(r => { if (r.variant_id && imgMap[r.variant_id]) r.image_url = imgMap[r.variant_id]; });
    }

    const quotaRows = rows.map(r => ({
      variant_id: r.variant_id,
      title:      r.title,
      quantity:   r.quantity,
      image_url:  r.image_url || "",
      client:     r.clients.slice(0, 5).join(", "),
    }));

    // ── 5. Écrire dans nc_quota ───────────────────────────────────
    const { data: quota, error: qErr } = await supabase
      .from("nc_quota")
      .insert({
        premier_order_id: premierId ? String(premierId).trim() : (slice[0]?.order_id || ""),
        nb_commandes:     slice.length,
        generated_by:     session.nom || "dashboard",
        rows:             quotaRows,
      })
      .select("id")
      .single();

    if (qErr) throw new Error("Erreur écriture nc_quota: " + qErr.message);

    // ── 6. Écrire nc_quota_orders ─────────────────────────────────
    if (orderSummary.length > 0) {
      const toInsert = orderSummary.map(o => ({ ...o, quota_id: quota.id }));
      const { error: oErr } = await supabase.from("nc_quota_orders").insert(toInsert);
      if (oErr) console.error("nc_quota_orders insert error:", oErr.message);
    }

    const duration = Date.now() - t0;
    console.log(`QUOTA_GENERATE variants=${rows.length} orders=${slice.length} quota_id=${quota.id} ${duration}ms`);

    return NextResponse.json({
      ok:          true,
      message:     `Quota générée — ${rows.length} variantes, ${slice.length} commandes`,
      variants:    rows.length,
      orders:      slice.length,
      quota_id:    quota.id,
      duration_ms: duration,
    });

  } catch (err) {
    console.error("QUOTA_GENERATE_ERROR", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
