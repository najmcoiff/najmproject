import { NextResponse } from "next/server";
import { getServiceClient, ownerGuard } from "@/lib/ai-helpers";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!ownerGuard(req))
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const sb = getServiceClient();

  try {
    const { data: campaigns } = await sb
      .from("nc_ai_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    const active = (campaigns || []).filter((c) => c.status === "active");
    const totalSpent = active.reduce(
      (s, c) => s + (Number(c.budget_spent_da) || 0),
      0
    );
    const totalRevenue = active.reduce(
      (s, c) => s + (Number(c.revenue_da) || 0),
      0
    );
    const avgRoas =
      totalSpent > 0 ? Math.round((totalRevenue / totalSpent) * 100) / 100 : 0;

    return NextResponse.json({
      ok: true,
      summary: {
        active_count: active.length,
        total_spent_da: totalSpent,
        total_revenue_da: totalRevenue,
        avg_roas: avgRoas,
      },
      campaigns: campaigns || [],
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
