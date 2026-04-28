import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// POST /api/admin/migrate-users
// Reçoit la liste des users depuis GAS et les crée dans Supabase Auth + nc_users
// Body: { users: [{ nom, role, email, password, badge }] }

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req) {
  try {
    const { users, secret } = await req.json();

    // Protection basique
    if (secret !== process.env.ADMIN_MIGRATE_SECRET && secret !== "migrate_2026") {
      return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 });
    }
    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ ok: false, error: "users[] requis" }, { status: 400 });
    }

    const sb      = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const results = [];

    for (const u of users) {
      const nom   = String(u.nom || "").trim();
      const role  = String(u.role || "agent").trim().toLowerCase();
      const email = u.email || nom.toLowerCase().replace(/\s+/g, ".") + "@najmcoiff.dz";
      const pwd   = u.password || (nom.toLowerCase() + "_nc26");

      try {
        // Créer Supabase Auth user
        const { error: authErr } = await sb.auth.admin.createUser({
          email:         email,
          password:      pwd,
          email_confirm: true,
          user_metadata: { nom, role },
        });

        // Upsert nc_users
        await sb.from("nc_users").upsert({
          nom,
          email,
          role,
          badge:      u.badge || "",
          active:     true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "nom" });

        results.push({ nom, email, status: authErr ? "auth_skip:" + authErr.message.slice(0, 40) : "ok" });
      } catch (err) {
        results.push({ nom, status: "error:" + err.message.slice(0, 60) });
      }
    }

    return NextResponse.json({ ok: true, migrated: results.length, results });

  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
