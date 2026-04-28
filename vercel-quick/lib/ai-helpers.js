import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/server-auth";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

export function ownerGuard(req) {
  const auth = req.headers.get("authorization") || "";
  const token =
    auth.replace("Bearer ", "").trim() ||
    req.nextUrl?.searchParams.get("token");
  const user = verifyToken(token);
  if (
    !user ||
    (user.nom?.toLowerCase() !== "najm" && user.role?.toLowerCase() !== "owner")
  )
    return null;
  return user;
}

export function cronGuard(req) {
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return !!ownerGuard(req);
}

export function getServiceClient() {
  return sb();
}

export async function logDecision(
  client,
  { agent, decision_type, description, input_data, output_data, impact, success, error_message }
) {
  await client.from("nc_ai_decisions_log").insert({
    agent,
    decision_type,
    description,
    input_data: input_data || {},
    output_data: output_data || {},
    impact: impact || "medium",
    success: success !== false,
    error_message: error_message || null,
  });
}

export function normalize(value, min, max) {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function formatDA(amount) {
  return new Intl.NumberFormat("fr-DZ").format(Math.round(amount)) + " DA";
}

export function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2 || Date.now());
  return Math.floor(Math.abs(d2 - d1) / 86400000);
}

export function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}
