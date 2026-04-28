import { NextResponse } from "next/server";
import { getServiceClient, ownerGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!ownerGuard(req))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const sb = getServiceClient();
  const status = req.nextUrl.searchParams.get("status") || null;
  const type = req.nextUrl.searchParams.get("type") || null;
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);

  try {
    let query = sb
      .from("nc_ai_content_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (type) query = query.eq("content_type", type);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, items: data || [], count: data?.length || 0 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
