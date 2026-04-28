// ═══════════════════════════════════════════════════════════════════
//  lib/logscript.js — Logger centralisé → nc_logscript
//  Fire-and-forget : ne bloque jamais la route appelante
//  Colonnes : id, ts, source, level, action, message, order_id, duration_ms, details
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _sb = null;
function getSB() {
  if (!_sb) _sb = createClient(SB_URL, SB_SKEY, { auth: { autoRefreshToken: false, persistSession: false } });
  return _sb;
}

/**
 * @param {object} opts
 * @param {"VERCEL"|"GAS"|"WEBHOOK"|"CRON"}  opts.source
 * @param {"INFO"|"WARN"|"ERROR"|"DEBUG"}     opts.level
 * @param {string}  opts.action       e.g. "INJECT_SINGLE_ZR"
 * @param {string}  opts.message      message humain lisible
 * @param {string}  [opts.order_id]   order_id associé
 * @param {number}  [opts.duration_ms]
 * @param {object}  [opts.details]    payload JSONB libre
 */
export async function logScript({ source = "VERCEL", level = "INFO", action, message, order_id, duration_ms, details } = {}) {
  try {
    await getSB().from("nc_logscript").insert({
      ts:          new Date().toISOString(),
      source:      source || "VERCEL",
      level:       level  || "INFO",
      action:      action      || null,
      message:     message     || null,
      order_id:    order_id    || null,
      duration_ms: duration_ms != null ? Number(duration_ms) : null,
      details:     details     || null,
    });
  } catch {
    /* fire-and-forget — ne jamais planter la route appelante */
  }
}

/** Shorthand pour erreurs */
export function logError(action, error, extra = {}) {
  return logScript({
    level:   "ERROR",
    action,
    message: String(error?.message || error),
    details: { error: String(error?.message || error), stack: String(error?.stack || "").slice(0, 500), ...extra },
    order_id: extra.order_id || null,
  });
}

/** Shorthand pour succès avec timing */
export function logInfo(action, message, extra = {}) {
  return logScript({
    level:      "INFO",
    action,
    message,
    duration_ms: extra.duration_ms || null,
    order_id:    extra.order_id || null,
    details:     Object.keys(extra).length > 0 ? extra : null,
  });
}
