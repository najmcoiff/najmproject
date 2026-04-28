import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/server-auth";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminSB() {
  return createClient(SB_URL, SB_SKEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 401 });
    }
    if ((session.role || "").toLowerCase() !== "owner") {
      return NextResponse.json({ ok: false, error: "Réservé au owner" }, { status: 403 });
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id requis" }, { status: 400 });
    }

    const { error } = await adminSB()
      .from("nc_social_queue")
      .update({ status: "valide", published_by: null, published_at: null })
      .eq("id", id);

    if (error) {
      console.error("Unshare error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
