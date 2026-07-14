import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ownerGuard as jwtOwnerGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

function adminSB() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
function ownerGuard(req) {
  if (jwtOwnerGuard(req)) return true;
  const raw = req.headers.get("x-owner-token") || new URL(req.url).searchParams.get("token");
  return raw === process.env.DASHBOARD_SECRET;
}

/**
 * GET  /api/ambassadeur/manage  → liste en attente + actifs
 * POST /api/ambassadeur/manage  { phone, active }  → active/désactive
 * (Écran owner — voit tout, y compris le numéro complet pour contacter le coiffeur.)
 */
export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const sb = adminSB();
  const { data } = await sb
    .from("nc_ambassadeurs")
    .select("code, phone, full_name, salon, actif, cagnotte_da, total_filleuls, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = data || [];
  return NextResponse.json({
    pending: rows.filter((r) => !r.actif),
    active:  rows.filter((r) => r.actif),
  });
}

// Template NEUTRE (notification de compte). Meta rejette le THÈME affiliation
// (partenaire + partage + gagner), pas le mot "code". On garde le code mais
// présenté en "numéro de compte", sans solliciter le partage/gain.
// Variables : {{1}} prénom · {{2}} code (présenté comme n° de compte).
const WELCOME_TPL = "nc_activation";

async function sendWelcomeWati(phone9, code, fullName) {
  const url = (process.env.WATI_API_URL || "").replace(/\/$/, "");
  const token = process.env.WATI_API_TOKEN;
  if (!url || !token || !code) return false;
  const first = (fullName || "").trim().split(/\s+/)[0] || "";
  // {{name}} = prénom · {{ref}} = code, MAIS placé uniquement dans l'URL du
  // template (www.najmcoiff.com/coiffeur/{{ref}}) → lien direct vers l'espace,
  // sans login. Le code dans une URL (pas comme "code: X") évite que Meta le
  // classe en OTP. Pattern déjà approuvé (cf. najm_order_v2 /suivi/{{3}}).
  const params = [
    { name: "name", value: first },
    { name: "ref", value: code },
  ];
  try {
    const r = await fetch(`${url}/api/v1/sendTemplateMessage?whatsappNumber=213${phone9}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ template_name: WELCOME_TPL, broadcast_name: `amb_welcome_${Date.now()}`, parameters: params }),
    });
    const j = await r.json().catch(() => ({}));
    return j.result === true || !!j.id;
  } catch {
    return false;
  }
}

// DELETE /api/ambassadeur/manage?phone=... → supprime l'ambassadeur + ses liens + commissions
export async function DELETE(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const phone = String(new URL(req.url).searchParams.get("phone") || "").replace(/\D/g, "").slice(-9);
  if (phone.length < 9) return NextResponse.json({ error: "phone requis" }, { status: 400 });
  const sb = adminSB();
  await sb.from("nc_ambassadeur_commissions").delete().eq("ambassadeur_phone", phone);
  await sb.from("nc_ambassadeur_liens").delete().eq("ambassadeur_phone", phone);
  await sb.from("nc_ambassadeurs").delete().eq("phone", phone);
  return NextResponse.json({ ok: true });
}

export async function POST(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone || "").replace(/\D/g, "").slice(-9);
  if (phone.length < 9) return NextResponse.json({ error: "phone requis" }, { status: 400 });

  const sb = adminSB();
  const active = !!body.active;

  // Récupérer code + nom (pour le WhatsApp de bienvenue)
  const { data: row } = await sb
    .from("nc_ambassadeurs")
    .select("code, full_name")
    .eq("phone", phone)
    .maybeSingle();

  const { error } = await sb
    .from("nc_ambassadeurs")
    .update({ actif: active, updated_at: new Date().toISOString() })
    .eq("phone", phone);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // À l'activation : tenter le WhatsApp de bienvenue via WATI (best-effort).
  // Échoue silencieusement tant que le template n'est pas approuvé → fallback wa.me.
  let wa_sent = false;
  if (active && row?.code) wa_sent = await sendWelcomeWati(phone, row.code, row.full_name);

  return NextResponse.json({ ok: true, wa_sent });
}
