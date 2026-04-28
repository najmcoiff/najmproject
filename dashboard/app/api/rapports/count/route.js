// POST /api/rapports/count
// Compte les nouveaux rapports depuis une date donnée
// Migration depuis GAS COUNT_NEW_RAPPORTS → 0 Google Sheets
// Body: { token, since? }

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request) {
  try {
    const body    = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });

    const since = body.since
      ? new Date(body.since).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await adminSB()
      .from("nc_rapports")
      .select("*", { count: "exact", head: true })
      .gt("created_at", since);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, count: count || 0 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
