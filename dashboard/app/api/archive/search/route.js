// ═══════════════════════════════════════════════════════════════════
//  POST /api/archive/search — Recherche Archive Client
//
//  Recherche dans nc_orders + nc_orders_archive par :
//    • phone    → tous les colis de ce client
//    • tracking → commande précise
//    • name     → recherche par nom (partiel)
//
//  Body: { token, phone?, tracking?, name? }
//  Réponse: { ok, mode, customers[], orders[] }
// ═══════════════════════════════════════════════════════════════════

import { NextResponse }  from "next/server";
import { createClient }  from "@supabase/supabase-js";
import { verifyToken }   from "@/lib/server-auth";

export const maxDuration = 30;

function adminSB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Normalise un numéro DZ vers les 9 derniers chiffres (pour matching flexible)
function phoneCore(raw) {
  const digits = String(raw || "").replace(/[^0-9]/g, "");
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}

// Champs communs aux deux tables (nc_orders + nc_orders_hq)
// Colonnes absentes de nc_orders_hq exclues : pos_discount, restocked
// Colonnes absentes des deux : final_status (uniquement dans nc_suivi_zr)
const FIELDS = [
  "order_id", "order_name", "shopify_order_name", "order_date",
  "customer_name", "customer_phone", "wilaya", "commune",
  "adresse", "order_total", "shipping_fee", "delivery_mode",
  "delivery_type", "delivery_price",
  "decision_status", "confirmation_status", "tracking",
  "statut_preparation", "shipping_status",
  "order_items_summary", "items_json",
  "note", "note_manager", "order_source",
  "coupon_code", "coupon_discount",
  "customer_summary", "customer_type",
  "doublon", "prepared_by", "prepared_at",
  "order_change_status", "cancellation_reason",
  "contact_status",
].join(",");

// ── Enrichir items_json : remplace les image_url vides depuis nc_variants ──
async function enrichImages(sb, rows) {
  // Collecter tous les display_name des articles sans image
  const missingNames = new Set();
  for (const row of rows) {
    const items = Array.isArray(row.items_json) ? row.items_json : [];
    for (const item of items) {
      if (!item.image_url && item.title) missingNames.add(item.title);
    }
  }
  if (!missingNames.size) return rows;

  // Récupérer les images depuis nc_variants (batch)
  const names = Array.from(missingNames);
  const { data: variants } = await sb
    .from("nc_variants")
    .select("display_name,image_url")
    .in("display_name", names)
    .not("image_url", "is", null)
    .neq("image_url", "");

  // Index display_name → image_url
  const imgMap = {};
  for (const v of variants || []) {
    if (v.display_name && v.image_url) imgMap[v.display_name] = v.image_url;
  }

  if (!Object.keys(imgMap).length) return rows;

  // Patch les items
  return rows.map(row => {
    const items = Array.isArray(row.items_json) ? row.items_json : [];
    const patched = items.map(item => {
      if (!item.image_url && item.title && imgMap[item.title]) {
        return { ...item, image_url: imgMap[item.title] };
      }
      return item;
    });
    return { ...row, items_json: patched };
  });
}

// ── Grouper les commandes par client (téléphone) ───────────────
function groupByCustomer(rows) {
  const map = new Map();
  for (const row of rows) {
    const phone = phoneCore(row.customer_phone || "");
    const key   = phone || String(row.customer_name || "").toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        phone:         row.customer_phone || "",
        name:          row.customer_name  || "—",
        wilaya:        row.wilaya         || "",
        orders_count:  0,
        total_spent:   0,
        last_order:    null,
        orders:        [],
      });
    }
    const g = map.get(key);
    g.orders_count++;
    g.total_spent += Number(row.order_total || 0);
    const d = row.order_date ? new Date(row.order_date) : null;
    if (d && (!g.last_order || d > new Date(g.last_order))) g.last_order = row.order_date;
    g.orders.push(row);
  }
  // Trier les clients par date de dernière commande décroissante
  return Array.from(map.values()).sort((a, b) => {
    const da = a.last_order ? new Date(a.last_order) : 0;
    const db = b.last_order ? new Date(b.last_order) : 0;
    return db - da;
  });
}

// ════════════════════════════════════════════════════════════════
//  HANDLER
// ════════════════════════════════════════════════════════════════
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!verifyToken(body.token)) {
      return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
    }

    const rawPhone    = String(body.phone    || "").trim();
    const rawTracking = String(body.tracking || "").trim().toUpperCase();
    const rawName     = String(body.name     || "").trim();

    if (!rawPhone && !rawTracking && !rawName) {
      return NextResponse.json({ ok: false, error: "Fournir un critère de recherche" }, { status: 400 });
    }

    const sb = adminSB();

    // ── Recherche par TRACKING ────────────────────────────────
    if (rawTracking) {
      const [{ data: active }, { data: archived }] = await Promise.all([
        sb.from("nc_orders").select(FIELDS).ilike("tracking", `%${rawTracking}%`).limit(10),
        sb.from("nc_orders_hq").select(FIELDS).ilike("tracking", `%${rawTracking}%`).limit(10),
      ]);

      const rows = [...(active || []), ...(archived || [])];
      if (!rows.length) {
        return NextResponse.json({ ok: false, error: "Aucune commande trouvée pour ce tracking" });
      }

      // Marquer la source
      const marked = [
        ...(active   || []).map(r => ({ ...r, _source: "actif" })),
        ...(archived || []).map(r => ({ ...r, _source: "archive" })),
      ];

      const enriched  = await enrichImages(sb, marked);
      const customers = groupByCustomer(enriched);
      return NextResponse.json({ ok: true, mode: "tracking", customers, total: enriched.length });
    }

    // ── Recherche par TÉLÉPHONE ───────────────────────────────
    if (rawPhone) {
      const core = phoneCore(rawPhone);
      const [{ data: active }, { data: archived }] = await Promise.all([
        sb.from("nc_orders")
          .select(FIELDS)
          .ilike("customer_phone", `%${core}%`)
          .order("order_date", { ascending: false })
          .limit(200),
        sb.from("nc_orders_hq")
          .select(FIELDS)
          .ilike("customer_phone", `%${core}%`)
          .order("order_date", { ascending: false })
          .limit(200),
      ]);

      const marked = [
        ...(active   || []).map(r => ({ ...r, _source: "actif" })),
        ...(archived || []).map(r => ({ ...r, _source: "archive" })),
      ];

      if (!marked.length) {
        return NextResponse.json({ ok: false, error: "Aucun client trouvé pour ce numéro" });
      }

      const enriched  = await enrichImages(sb, marked);
      const customers = groupByCustomer(enriched);
      return NextResponse.json({ ok: true, mode: "phone", customers, total: enriched.length });
    }

    // ── Recherche par NOM ─────────────────────────────────────
    if (rawName) {
      const q = rawName.replace(/'/g, "''");
      const [{ data: active }, { data: archived }] = await Promise.all([
        sb.from("nc_orders")
          .select(FIELDS)
          .ilike("customer_name", `%${q}%`)
          .order("order_date", { ascending: false })
          .limit(100),
        sb.from("nc_orders_hq")
          .select(FIELDS)
          .ilike("customer_name", `%${q}%`)
          .order("order_date", { ascending: false })
          .limit(100),
      ]);

      const marked = [
        ...(active   || []).map(r => ({ ...r, _source: "actif" })),
        ...(archived || []).map(r => ({ ...r, _source: "archive" })),
      ];

      if (!marked.length) {
        return NextResponse.json({ ok: false, error: `Aucun client trouvé pour "${rawName}"` });
      }

      const enriched  = await enrichImages(sb, marked);
      const customers = groupByCustomer(enriched);
      return NextResponse.json({ ok: true, mode: "name", customers, total: enriched.length });
    }

  } catch (err) {
    console.error("ARCHIVE_SEARCH_ERROR", err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
