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

// GET — liste recommandations (+ stats ROAB)
export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!verifyToken(token)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const status = new URL(req.url).searchParams.get("status") || null;

  let query = sb()
    .from("nc_ai_recommendations")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  else query = query.in("status", ["pending", "accepted", "refused"]);

  const { data } = await query.limit(50);

  // Exclure les recommandations expirées pending
  const now = new Date();
  const filtered = (data || []).map(r => ({
    ...r,
    expired: r.status === "pending" && r.expires_at && new Date(r.expires_at) < now,
  }));

  return NextResponse.json({ recommendations: filtered });
}

// POST — créer une recommandation (IA uniquement)
export async function POST(req) {
  const { error, body } = await auth(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const {
    id, title, description, reasoning, action_type, action_payload,
    platform = "meta", world = "all",
    estimated_budget_da, estimated_orders, estimated_profit_da, estimated_roab,
    confidence = "medium",
    expires_hours = 48,
  } = body;

  if (!id || !title || !description || !action_type) {
    return NextResponse.json({ error: "id, title, description, action_type requis" }, { status: 400 });
  }

  const expires_at = new Date(Date.now() + expires_hours * 3600 * 1000).toISOString();

  const { data, error: dbErr } = await sb()
    .from("nc_ai_recommendations")
    .upsert({
      id, title, description, reasoning, action_type, action_payload,
      platform, world, estimated_budget_da, estimated_orders,
      estimated_profit_da, estimated_roab, confidence,
      status: "pending", expires_at,
    })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, recommendation: data });
}

// PATCH — accepter ou refuser
export async function PATCH(req) {
  const { error, body } = await auth(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const { id, action, owner_note } = body;
  if (!id || !action) return NextResponse.json({ error: "id + action requis" }, { status: 400 });
  if (!["accept", "refuse"].includes(action)) {
    return NextResponse.json({ error: "action doit être 'accept' ou 'refuse'" }, { status: 400 });
  }

  const update = {
    status: action === "accept" ? "accepted" : "refused",
    owner_note: owner_note || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error: dbErr } = await sb()
    .from("nc_ai_recommendations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Si accepté : déclencher l'action (créer la campagne Meta via l'agent 2)
  if (action === "accept" && data.action_type === "create_campaign") {
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";
      // Utiliser CRON_SECRET en Authorization header (accepté par cronGuard)
      fetch(`${baseUrl}/api/ai/campaign-create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({
          recommendation_id: id,
          ...data.action_payload,
        }),
      }).catch(() => {});
    } catch { /* loggé par l'agent */ }
  }

  return NextResponse.json({ ok: true, recommendation: data });
}
