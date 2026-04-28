import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

// Route serveur : POST /api/auth/login
// Authentifie via Supabase Auth (email/password)
// Retourne { ok, token, user: { nom, role, badge } }

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function _generateToken(nom, role, badge) {
  const gasSecret    = process.env.DASHBOARD_SECRET || "nc_secret_2026";
  const tokenPayload = JSON.stringify({ nom, role, badge: badge || "", exp: Date.now() + 24 * 3600 * 1000 });
  const encoded      = Buffer.from(tokenPayload).toString("base64");
  const sig          = crypto.createHash("md5").update(encoded + gasSecret).digest("hex").slice(0, 16);
  return encoded + "." + sig;
}

export async function POST(req) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Identifiant et mot de passe requis" }, { status: 400 });
    }

    const nom   = String(username).trim().toLowerCase();
    const email = nom.includes("@") ? nom : nom.replace(/\s+/g, ".") + "@najmcoiff.dz";

    // ── Étape 1 : nc_users — mécanisme principal (password_hash) ──────────
    // Toujours essayé en premier car fiable et instantané
    const admin = adminClient();

    // Chercher par nom d'abord, puis par email si pas trouvé
    let u = null;
    try {
      const { data: byNom } = await admin
        .from("nc_users")
        .select("nom,role,badge,email,active,password_hash")
        .ilike("nom", nom)
        .limit(1);
      u = byNom?.[0];

      if (!u && nom.includes("@")) {
        const { data: byEmail } = await admin
          .from("nc_users")
          .select("nom,role,badge,email,active,password_hash")
          .ilike("email", nom)
          .limit(1);
        u = byEmail?.[0];
      } else if (!u) {
        const { data: byEmail } = await admin
          .from("nc_users")
          .select("nom,role,badge,email,active,password_hash")
          .ilike("email", email)
          .limit(1);
        u = byEmail?.[0];
      }
    } catch (ncErr) {
      console.warn("NC_USERS_QUERY_ERR", ncErr?.message);
    }
    if (u && u.active && u.password_hash && u.password_hash === password) {
      return NextResponse.json({
        ok:    true,
        token: _generateToken(u.nom, u.role, u.badge),
        user:  { nom: u.nom, role: u.role, badge: u.badge || "", email: u.email || "" },
      });
    }

    // ── Étape 2 : Supabase Auth — fallback pour comptes Auth uniquement ───
    // Protégé dans try/catch car signInWithPassword peut lever une exception
    // (ex: réponse 401 vide = SyntaxError JSON)
    try {
      const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });

      if (!authErr && authData?.session) {
        // Auth Supabase réussie — récupérer le profil nc_users
        const { data: profiles } = await admin
          .from("nc_users")
          .select("nom,role,badge,email,active,password_hash")
          .eq("email", email)
          .limit(1)
          .catch(() => ({ data: null }));

        const profile = profiles?.[0];
        if (profile && !profile.active) {
          return NextResponse.json({ ok: false, error: "Compte inactif" });
        }

        const profileNom   = profile?.nom   || String(username).trim();
        const profileRole  = profile?.role  || "agent";
        const profileBadge = profile?.badge || "";

        // Synchro password_hash pour les futurs logins via nc_users
        if (profile && !profile.password_hash) {
          await admin.from("nc_users")
            .update({ password_hash: password })
            .eq("email", email)
            .catch(() => {});
        }

        return NextResponse.json({
          ok:    true,
          token: _generateToken(profileNom, profileRole, profileBadge),
          user:  { nom: profileNom, role: profileRole, badge: profileBadge, email },
        });
      }
    } catch (authEx) {
      // signInWithPassword a levé une exception (réponse inattendue de Supabase)
      // On continue vers le refus d'accès ci-dessous
      console.warn("SUPABASE_AUTH_EXCEPTION", authEx?.message || authEx);
    }

    // ── Aucune méthode n'a réussi ─────────────────────────────────────────
    if (u && !u.active) {
      return NextResponse.json({ ok: false, error: "Compte inactif" });
    }
    return NextResponse.json({ ok: false, error: "Identifiant ou mot de passe incorrect" });

  } catch (err) {
    console.error("LOGIN_ERROR", err);
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 });
  }
}
