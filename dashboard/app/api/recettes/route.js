/**
 * GET  /api/recettes?token=&date=YYYY-MM-DD
 *   → Retourne les recettes déclarées pour une date donnée + totaux POS réels par agent
 *
 * POST /api/recettes
 *   body: { token, agent, date_recette, montant_declare, notes? }
 *   → Crée une déclaration de recette dans nc_recettes_v2
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";
import { verifyToken }   from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── GET ────────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || request.headers.get("Authorization")?.replace("Bearer ", "").trim();
    const date  = searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const session = verifyToken(token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const sb = adminSB();

    // Algérie = UTC+1 → ajuster les bornes de la journée
    const dayStart = `${date}T00:00:00+01:00`;
    const dayEnd   = `${date}T23:59:59+01:00`;

    // 1) Recettes déclarées pour ce jour
    const { data: recettes, error: recErr } = await sb
      .from("nc_recettes_v2")
      .select("*")
      .eq("date_recette", date)
      .order("created_at", { ascending: true });

    if (recErr) throw new Error(recErr.message);

    // 2) Totaux POS réels par agent pour ce jour
    const { data: posOrders, error: posErr } = await sb
      .from("nc_orders")
      .select("order_id, order_total, prepared_by, order_date, order_name, order_items_summary, items_json, pos_discount")
      .eq("order_source", "pos")
      .gte("order_date", dayStart)
      .lte("order_date", dayEnd)
      .order("order_date", { ascending: true });

    if (posErr) throw new Error(posErr.message);

    // Agréger POS par agent
    const posByAgent = {};
    for (const o of posOrders || []) {
      const ag = o.prepared_by || o.customer_name || "—";
      if (!posByAgent[ag]) posByAgent[ag] = { agent: ag, total: 0, nb_commandes: 0, commandes: [] };
      posByAgent[ag].total       += Number(o.order_total) || 0;
      posByAgent[ag].nb_commandes += 1;
      posByAgent[ag].commandes.push({
        order_id:            o.order_id,
        order_name:          o.order_name,
        order_total:         Number(o.order_total) || 0,
        pos_discount:        Number(o.pos_discount) || 0,
        order_date:          o.order_date,
        order_items_summary: o.order_items_summary,
        items_json:          o.items_json,
      });
    }

    // Fusionner recettes déclarées + totaux POS
    const result = (recettes || []).map(rec => ({
      ...rec,
      total_pos_reel: posByAgent[rec.agent]?.total || 0,
      nb_commandes:   posByAgent[rec.agent]?.nb_commandes || 0,
      ecart:          Number(rec.montant_declare) - (posByAgent[rec.agent]?.total || 0),
      commandes:      posByAgent[rec.agent]?.commandes || [],
    }));

    // Agents POS du jour qui n'ont PAS encore déclaré
    const agentsDeclares = new Set((recettes || []).map(r => r.agent));
    const agentsPos = Object.values(posByAgent).filter(a => !agentsDeclares.has(a.agent)).map(a => ({
      ...a,
      non_declare: true,
    }));

    return NextResponse.json({
      ok:      true,
      date,
      recettes: result,
      agentsPos,
      posTotal: Object.values(posByAgent).reduce((s, a) => s + a.total, 0),
      posOrders: posOrders || [],
    });

  } catch (err) {
    console.error("[recettes/get]", err.message);
    return NextResponse.json({ ok: false, error: String(err.message) }, { status: 500 });
  }
}

// ── POST — Déclarer une recette ─────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const { agent, date_recette, montant_declare, notes } = body;

    if (!agent)          return NextResponse.json({ ok: false, error: "Agent requis" },          { status: 400 });
    if (!date_recette)   return NextResponse.json({ ok: false, error: "Date requise" },          { status: 400 });
    if (montant_declare === undefined || montant_declare === null || montant_declare === "")
      return NextResponse.json({ ok: false, error: "Montant requis" }, { status: 400 });

    const sb = adminSB();

    const { data, error } = await sb
      .from("nc_recettes_v2")
      .insert({
        agent,
        date_recette,
        montant_declare: Number(montant_declare),
        notes:           notes || null,
        verified:        false,
        created_by:      session.nom,
        created_at:      new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      console.error("[recettes/post]", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Log
    await sb.from("nc_events").insert({
      ts:       new Date().toISOString(),
      log_type: "RECETTE_DECLAREE",
      source:   "dashboard",
      actor:    session.nom,
      note:     `Recette déclarée par ${agent} pour le ${date_recette} : ${Number(montant_declare).toLocaleString("fr-DZ")} DA`,
      extra:    { recette_id: data.id, agent, date_recette, montant: Number(montant_declare) },
    });

    return NextResponse.json({ ok: true, recette: data });

  } catch (err) {
    console.error("[recettes/post]", err.message);
    return NextResponse.json({ ok: false, error: String(err.message) }, { status: 500 });
  }
}
