import { NextResponse } from "next/server";

// Tables autorisées — jamais exposer service key sur une route ouverte
const ALLOWED = new Set(["nc_rapports", "nc_barrage"]);

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://alyxejkdtkdmluvgfnqk.supabase.co";
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

export async function POST(req) {
  try {
    if (!SB_SKEY) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_KEY manquant" }, { status: 500 });

    const { table, method = "POST", filter = "", data } = await req.json();

    if (!ALLOWED.has(table))
      return NextResponse.json({ ok: false, error: `Table "${table}" non autorisée` }, { status: 403 });

    const path   = filter ? `${table}?${filter}` : table;
    const prefer = method === "POST" ? "return=representation" : "return=minimal";

    const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey:          SB_SKEY,
        Authorization:  `Bearer ${SB_SKEY}`,
        "Content-Type": "application/json",
        Prefer:          prefer,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ ok: false, error: err }, { status: res.status });
    }

    let rows = [];
    try { rows = await res.json(); } catch {}
    return NextResponse.json({ ok: true, rows });

  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
