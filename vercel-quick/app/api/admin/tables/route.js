// ═══════════════════════════════════════════════════════════════════
//  GET /api/admin/tables
//  Viewer BDD — liste les tables et leur contenu (owner only)
//
//  ?list=1                         → toutes les tables + count
//  ?table=nc_orders&page=1&q=xxx   → colonnes + lignes paginées
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { verifyToken }  from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Tables exposées (ordre d'affichage)
const TABLES = [
  // ── Dashboard core ────────────────────────────────────────────
  { name: "nc_logscript",       label: "🔍 Logs Script",      searchCol: "message" },
  { name: "nc_events",          label: "📋 Events",            searchCol: "log_type" },
  { name: "nc_orders",          label: "🛒 Commandes",         searchCol: "customer_name" },
  { name: "nc_suivi_zr",        label: "📦 Suivi ZR",         searchCol: "tracking" },
  { name: "nc_variants",        label: "🏷 Variants",          searchCol: "display_name" },
  { name: "nc_barrage",         label: "🛡 Barrage",           searchCol: "product_title" },
  { name: "nc_po_lines",        label: "📝 PO Lines",          searchCol: "po_id" },
  { name: "nc_users",           label: "👤 Users",             searchCol: "nom" },
  { name: "nc_rapports",        label: "📊 Rapports",          searchCol: "agent" },
  { name: "nc_gestion_fond",    label: "💰 Gestion Fond",      searchCol: "label" },
  { name: "nc_quota",           label: "🎯 Quota",             searchCol: "agent" },
  { name: "nc_quota_orders",    label: "🎯 Quota Orders",      searchCol: "order_id" },
  { name: "nc_partenaires",     label: "🤝 Partenaires",       searchCol: "nom" },
  { name: "nc_kpi_stock",       label: "📈 KPI Stock",         searchCol: "display_name" },
  { name: "nc_gas_logs",        label: "⚙️ GAS Logs",          searchCol: "action" },
  { name: "nc_recettes",        label: "🧾 Recettes",          searchCol: null },
  // ── Owner / Boutique (ajoutés T07-T09) ───────────────────────
  { name: "nc_boutique_config", label: "⚙️ Config Boutique",   searchCol: "key" },
  { name: "nc_delivery_config", label: "🚚 Config Livraison",  searchCol: "wilaya_name" },
  { name: "nc_banners",         label: "🖼 Banners",           searchCol: "alt_text" },
  { name: "nc_page_events",     label: "📡 Page Events",       searchCol: "event_type" },
  { name: "nc_customers",       label: "👥 Customers",         searchCol: "email" },
  { name: "nc_products",        label: "🛍 Produits",          searchCol: "title" },
  { name: "nc_carts",           label: "🛒 Paniers",           searchCol: "session_id" },
  // ── Marketing IA ─────────────────────────────────────────────
  { name: "nc_ai_client_segments", label: "🤖 IA · Segments Clients",  searchCol: "full_name" },
  { name: "nc_ai_product_scores",  label: "🤖 IA · Scores Produits",   searchCol: "world" },
  { name: "nc_ai_decisions_log",   label: "🤖 IA · Décisions Log",     searchCol: "agent" },
  { name: "nc_ai_daily_reports",   label: "🤖 IA · Rapports Quotidiens", searchCol: "report_type" },
];

const PAGE_SIZE = 50;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || request.headers.get("authorization")?.replace("Bearer ", "");
    const session = verifyToken(token);
    if (!session) return Response.json({ ok: false, error: "Token invalide" }, { status: 401 });
    if (session.role !== "owner") return Response.json({ ok: false, error: "Owner only" }, { status: 403 });

    const sb = adminSB();

    // ── MODE LIST : retourner toutes les tables avec count ────────
    if (searchParams.get("list") === "1") {
      const counts = await Promise.all(
        TABLES.map(async t => {
          try {
            const { count } = await sb.from(t.name).select("*", { count: "exact", head: true });
            return { ...t, count: count || 0 };
          } catch {
            return { ...t, count: -1 };
          }
        })
      );
      return Response.json({ ok: true, tables: counts });
    }

    // ── MODE DATA : retourner colonnes + lignes d'une table ───────
    const tableName = searchParams.get("table") || "";
    const tableConf = TABLES.find(t => t.name === tableName);
    if (!tableConf) return Response.json({ ok: false, error: `Table inconnue: ${tableName}` }, { status: 400 });

    const page      = Math.max(1, Number(searchParams.get("page") || "1"));
    const q         = (searchParams.get("q") || "").trim();
    const dateFrom  = (searchParams.get("date_from") || "").trim(); // ISO ou YYYY-MM-DD
    const dateTo    = (searchParams.get("date_to")   || "").trim();
    const from      = (page - 1) * PAGE_SIZE;
    const to        = from + PAGE_SIZE - 1;

    // Détecter colonne de tri et colonne de date
    let sortCol = "id";
    let dateCol = null;
    try {
      const { data: sampleRow } = await sb.from(tableName).select("*").limit(1);
      if (sampleRow?.[0]) {
        const keys = Object.keys(sampleRow[0]);
        if (keys.includes("ts"))              { sortCol = "ts";         dateCol = "ts"; }
        else if (keys.includes("created_at")) { sortCol = "created_at"; dateCol = "created_at"; }
        else if (keys.includes("order_date")) { sortCol = "order_date"; dateCol = "order_date"; }
        else if (keys.includes("id"))           sortCol = "id";
        else                                    sortCol = keys[0];
      }
    } catch { /* ignore */ }

    let query = sb.from(tableName).select("*", { count: "exact" });

    if (q && tableConf.searchCol) {
      query = query.ilike(tableConf.searchCol, `%${q}%`);
    }

    // ── Filtres rapides nc_orders ─────────────────────────────────
    if (tableName === "nc_orders") {
      // Par défaut : masquer archivés (hide_archived=0 pour tout afficher)
      const showArchived = searchParams.get("show_archived") === "1";
      if (!showArchived) query = query.eq("archived", false);

      if (searchParams.get("hide_pos")        === "1") query = query.not("order_source", "eq", "pos");
      if (searchParams.get("hide_cloture")    === "1") query = query.not("cloture",      "eq", "OUI");
      if (searchParams.get("hide_last")       === "1") query = query.not("last",         "eq", "OUI");
      if (searchParams.get("hide_zr_locked")  === "1") query = query.not("zr_locked",    "eq", "OUI");
      if (searchParams.get("tracking_vide")   === "1") query = query.or("tracking.is.null,tracking.eq.");
    }

    // Filtre date
    if (dateCol) {
      if (dateFrom) query = query.gte(dateCol, dateFrom);
      if (dateTo) {
        // Si dateTo est une date seule (YYYY-MM-DD), inclure toute la journée
        const toVal = dateTo.length === 10 ? dateTo + "T23:59:59Z" : dateTo;
        query = query.lte(dateCol, toVal);
      }
    }

    query = query.order(sortCol, { ascending: false }).range(from, to);

    const { data: rows, count, error } = await query;
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

    const columns = rows?.length > 0 ? Object.keys(rows[0]) : [];
    const total   = count || 0;

    return Response.json({
      ok: true,
      table:       tableName,
      label:       tableConf.label,
      columns,
      rows:        rows || [],
      total,
      page,
      page_size:   PAGE_SIZE,
      total_pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });

  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
