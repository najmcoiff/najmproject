import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/server-auth";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

async function auth(req) {
  const body = await req.json().catch(() => ({}));
  const token = body.token || req.headers.get("authorization")?.replace("Bearer ", "");
  const session = verifyToken(token);
  if (!session) return { error: "Non autorisé", body };
  return { body, session };
}

// GET — liste des campagnes + KPIs
export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!verifyToken(token)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { data: campaigns } = await sb()
    .from("nc_campaign_plans")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: aiLog } = await sb()
    .from("nc_ai_decisions_log")
    .select("id, agent, decision_type, description, output_data, impact, success, error_message, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: audiences } = await sb()
    .from("nc_ai_audiences")
    .select("id, name, audience_type, meta_audience_id, world, member_count, status");

  // KPIs agrégés
  const active = (campaigns || []).filter(c => c.status === "active");
  const kpis = {
    total_campaigns: campaigns?.length || 0,
    active_campaigns: active.length,
    total_budget_da: campaigns?.reduce((s, c) => s + Number(c.budget_da || 0), 0) || 0,
    total_spend_da:  campaigns?.reduce((s, c) => s + Number(c.spend_da || 0), 0) || 0,
    total_orders:    campaigns?.reduce((s, c) => s + Number(c.orders_generated || 0), 0) || 0,
    total_revenue_da:campaigns?.reduce((s, c) => s + Number(c.revenue_da || 0), 0) || 0,
    avg_roas: (() => {
      const withRoas = (campaigns || []).filter(c => Number(c.roas) > 0);
      if (!withRoas.length) return 0;
      return (withRoas.reduce((s, c) => s + Number(c.roas), 0) / withRoas.length).toFixed(2);
    })(),
  };

  return NextResponse.json({ campaigns: campaigns || [], aiLog: aiLog || [], audiences: audiences || [], kpis });
}

// POST — créer une campagne
export async function POST(req) {
  const { error, body } = await auth(req);
  if (error) return NextResponse.json({ error }, { status: 401 });
  const {
    title, platform = "meta", status = "draft", world = "all",
    campaign_type, audience_id, audience_name,
    budget_da = 0, start_date, end_date,
    ai_reasoning, created_by_ai = true, approved_by_owner = false,
  } = body;

  if (!title) return NextResponse.json({ error: "title requis" }, { status: 400 });

  const { data, error: dbErr } = await sb()
    .from("nc_campaign_plans")
    .insert({
      title, platform, status, world, campaign_type,
      audience_id, audience_name, budget_da,
      start_date: start_date || null,
      end_date: end_date || null,
      ai_reasoning, created_by_ai, approved_by_owner,
    })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, campaign: data });
}

// PATCH — mettre à jour une campagne (statut, métriques, notes)
export async function PATCH(req) {
  const { error, body } = await auth(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  delete updates.token;
  updates.updated_at = new Date().toISOString();

  const { data, error: dbErr } = await sb()
    .from("nc_campaign_plans")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, campaign: data });
}

// DELETE — supprimer une campagne
export async function DELETE(req) {
  const { error, body } = await auth(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  await sb().from("nc_campaign_plans").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
