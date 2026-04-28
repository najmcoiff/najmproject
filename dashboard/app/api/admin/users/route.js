import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

// GET /api/admin/users  → liste nc_users
// POST /api/admin/users → créer un user (nc_users + Supabase Auth)
// PATCH /api/admin/users → modifier mot de passe / rôle
// DELETE /api/admin/users → désactiver un user

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function admin() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function _getToken(req) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
}

function _checkManager(req) {
  const token = _getToken(req);
  if (!token) return false;
  const session = verifyToken(token);
  if (!session) return false;
  const role = (session.role || "").toLowerCase();
  return ["owner", "admin", "chef"].some(r => role.includes(r));
}

function _isOwner(req) {
  const token = _getToken(req);
  if (!token) return false;
  const session = verifyToken(token);
  if (!session) return false;
  const role = (session.role || "").toLowerCase();
  return role.includes("owner") || role.includes("admin");
}

export async function GET(req) {
  try {
    const sb = admin();
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get("all") === "true";
    let query = sb
      .from("nc_users")
      .select("id,nom,email,role,active,badge,created_at")
      .order("nom");
    if (!showAll) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, rows: data, users: data, count: data.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    if (!_checkManager(req)) {
      return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 });
    }
    const body = await req.json();
    const { nom, role, password, email, badge } = body;
    if (!nom || !password) {
      return NextResponse.json({ ok: false, error: "nom et password requis" }, { status: 400 });
    }
    // Chef d'équipe ne peut pas créer un compte owner
    if (!_isOwner(req) && (role || "").toLowerCase() === "owner") {
      return NextResponse.json({ ok: false, error: "Seul le owner peut créer un compte owner" }, { status: 403 });
    }

    const sb        = admin();
    const userEmail = email || nom.toLowerCase().replace(/\s+/g, ".") + "@najmcoiff.dz";

    // Créer ou MAJ dans Supabase Auth
    const { data: { users: existingUsers } } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const existingAuth = existingUsers?.find(u => u.email?.toLowerCase() === userEmail.toLowerCase());

    if (existingAuth) {
      await sb.auth.admin.updateUserById(existingAuth.id, { password });
    } else {
      const { error: authErr } = await sb.auth.admin.createUser({
        email:         userEmail,
        password:      password,
        email_confirm: true,
        user_metadata: { nom, role: role || "agent" },
      });
      if (authErr) console.error("CREATE_AUTH_USER_ERR", authErr.message);
    }

    // Insérer/MAJ dans nc_users — inclut password_hash pour le fallback
    const { data: profile, error: profileErr } = await sb
      .from("nc_users")
      .upsert({
        nom,
        email:         userEmail,
        role:          role || "agent",
        badge:         badge || "",
        active:        true,
        password_hash: password,
        updated_at:    new Date().toISOString(),
      }, { onConflict: "nom", ignoreDuplicates: false })
      .select()
      .single();

    if (profileErr) throw profileErr;
    return NextResponse.json({ ok: true, user: profile });

  } catch (err) {
    console.error("ADD_USER_ERR", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    if (!_checkManager(req)) {
      return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 });
    }
    const { nom, password, role, active, badge } = await req.json();
    if (!nom) return NextResponse.json({ ok: false, error: "nom requis" }, { status: 400 });

    const sb = admin();

    // Récupérer le vrai email depuis nc_users
    const { data: userRows } = await sb.from("nc_users").select("email").eq("nom", nom).limit(1);
    const realEmail = userRows?.[0]?.email;

    // MAJ Supabase Auth password si fourni
    if (password && realEmail) {
      const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 });
      const authUser = users?.find(u => u.email?.toLowerCase() === realEmail.toLowerCase());
      if (authUser) {
        await sb.auth.admin.updateUserById(authUser.id, { password });
      }
    }

    // MAJ nc_users
    const patch = { updated_at: new Date().toISOString() };
    if (password !== undefined) patch.password_hash = password;
    if (role     !== undefined) patch.role          = role;
    if (active   !== undefined) patch.active        = active;
    if (badge    !== undefined) patch.badge         = badge;

    const { error } = await sb.from("nc_users").update(patch).eq("nom", nom);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    if (!_checkManager(req)) {
      return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 });
    }
    const { nom } = await req.json();
    if (!nom) return NextResponse.json({ ok: false, error: "nom requis" }, { status: 400 });

    const sb = admin();
    const { error } = await sb
      .from("nc_users")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("nom", nom);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
