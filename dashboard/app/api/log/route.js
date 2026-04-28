import { NextResponse } from "next/server";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://alyxejkdtkdmluvgfnqk.supabase.co";
// Clé service (server-only) — bypasse RLS pour écrire dans nc_events
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

export async function POST(req) {
  try {
    const row = await req.json();
    if (!row || !row.log_type) {
      return NextResponse.json({ error: "log_type requis" }, { status: 400 });
    }

    const serviceKey = SB_SERVICE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "SUPABASE_SERVICE_KEY non configuré" }, { status: 500 });
    }

    const payload = {
      event_id:       crypto.randomUUID(),
      ts:             new Date().toISOString(),
      source:         "NEXTJS",
      log_type:       row.log_type       || null,
      actor:          row.actor          || null,
      order_id:       row.order_id  != null ? String(row.order_id)  : null,
      variant_id:     row.variant_id != null ? String(row.variant_id) : null,
      tracking:       row.tracking       || null,
      ancien_statut:  row.ancien_statut  || null,
      nouveau_statut: row.nouveau_statut || null,
      qty:            row.qty     != null ? Number(row.qty)     : null,
      montant:        row.montant != null ? Number(row.montant) : null,
      label:          row.label          || null,
      note:           row.note           || null,
      extra:          row.extra          || null,
    };
    // Supprimer les clés null
    Object.keys(payload).forEach(k => payload[k] === null && delete payload[k]);

    const res = await fetch(`${SB_URL}/rest/v1/nc_events`, {
      method: "POST",
      headers: {
        apikey:          serviceKey,
        Authorization:   `Bearer ${serviceKey}`,
        "Content-Type":  "application/json",
        Prefer:          "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[/api/log] Supabase error:", res.status, text);
      return NextResponse.json({ error: text }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/log] Exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
