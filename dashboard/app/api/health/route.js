// GET /api/health
// Diagnostic complet du système en 1 appel.
// Teste : Supabase + tables + env vars critiques
// Pas d'auth requise (lecture seule, aucune donnée sensible exposée)
// Note Phase M4 : GAS + Shopify retirés (archivés en archive/gas-obsolete/).

import { NextResponse } from "next/server";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://alyxejkdtkdmluvgfnqk.supabase.co";
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkSupabase() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/nc_users?limit=1`, {
      headers: { apikey: SB_SKEY, Authorization: `Bearer ${SB_SKEY}` },
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}

async function checkEnvVars() {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DASHBOARD_SECRET"];
  const missing = required.filter(k => !process.env[k]);
  return { ok: missing.length === 0, missing };
}

async function checkTables() {
  const tables = ["nc_orders","nc_events","nc_users","nc_suivi_zr","nc_po_lines","nc_barrage","nc_partenaires"];
  const results = {};
  await Promise.all(tables.map(async t => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${t}?limit=1`, {
        headers: { apikey: SB_SKEY, Authorization: `Bearer ${SB_SKEY}` },
      });
      results[t] = r.ok ? "ok" : `HTTP ${r.status}`;
    } catch (e) {
      results[t] = `error: ${e.message}`;
    }
  }));
  const failed = Object.entries(results).filter(([,v]) => v !== "ok").map(([k,v]) => `${k}: ${v}`);
  return { ok: failed.length === 0, tables: results, failed };
}

export async function GET() {
  const t0 = Date.now();
  const [supabase, envVars, tables] = await Promise.all([
    checkSupabase(),
    checkEnvVars(),
    checkTables(),
  ]);

  const allOk = supabase.ok && envVars.ok && tables.ok;
  const elapsed = Date.now() - t0;

  const report = {
    ok: allOk,
    ts: new Date().toISOString(),
    elapsed_ms: elapsed,
    checks: { supabase, env_vars: envVars, tables },
    summary: allOk
      ? "✅ Tout est opérationnel"
      : `❌ Problèmes détectés : ${[
          !supabase.ok && "Supabase KO",
          !envVars.ok  && `Env vars manquantes: ${envVars.missing?.join(", ")}`,
          !tables.ok   && `Tables: ${tables.failed?.join(", ")}`,
        ].filter(Boolean).join(" | ")}`,
  };

  return NextResponse.json(report, { status: allOk ? 200 : 503 });
}
