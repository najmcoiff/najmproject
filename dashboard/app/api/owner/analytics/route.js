import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/server-auth";

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function ownerGuard(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "").trim() || req.nextUrl?.searchParams.get("token");
  const user = verifyToken(token);
  if (!user || (user.nom?.toLowerCase() !== "najm" && user.role?.toLowerCase() !== "owner")) return null;
  return user;
}

export async function GET(req) {
  if (!ownerGuard(req)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const days = Number(req.nextUrl.searchParams.get("days") || 7);
  const client = sb();

  // Lancer toutes les queries en parallèle
  const [
    kpiRes,
    byTypeRes,
    byWorldRes,
    byDayRes,
    topPagesRes,
    utmRes,
    funnelRes,
  ] = await Promise.all([
    // KPI globaux
    client.rpc("query_raw", {}).then ? null :
    client.from("nc_page_events")
      .select("session_id, created_at", { count: "exact", head: false })
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString()),

    // Events par type
    client.from("nc_page_events")
      .select("event_type")
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString()),

    // Events par monde
    client.from("nc_page_events")
      .select("world, event_type")
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString()),

    // Events par jour
    client.from("nc_page_events")
      .select("created_at, event_type")
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString())
      .order("created_at", { ascending: true }),

    // Top pages
    client.from("nc_page_events")
      .select("page")
      .eq("event_type", "PAGE_VIEW")
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString())
      .not("page", "is", null),

    // UTM sources
    client.from("nc_page_events")
      .select("utm_source")
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString())
      .not("utm_source", "is", null),

    // Funnel : PAGE_VIEW → PRODUCT_VIEW → CART_ADD → ORDER_PLACED
    client.from("nc_page_events")
      .select("event_type, session_id")
      .in("event_type", ["PAGE_VIEW", "PRODUCT_VIEW", "CART_ADD", "CHECKOUT_START", "ORDER_PLACED"])
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString()),
  ]);

  // Traitement côté serveur
  const events       = byTypeRes.data || [];
  const worldEvents  = byWorldRes.data || [];
  const dayEvents    = byDayRes.data || [];
  const pageEvents   = topPagesRes.data || [];
  const utmEvents    = utmRes.data || [];
  const funnelEvents = funnelRes.data || [];

  // KPIs
  const totalEvents    = events.length;
  const uniqueSessions = new Set(funnelEvents.map(e => e.session_id)).size;

  // Today
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEvents = dayEvents.filter(e => new Date(e.created_at) >= todayStart).length;

  // Par type
  const byType = {};
  events.forEach(e => { byType[e.event_type] = (byType[e.event_type] || 0) + 1; });

  // Par monde
  const byWorld = { coiffure: 0, onglerie: 0, unknown: 0 };
  worldEvents.forEach(e => {
    if (e.world === "coiffure") byWorld.coiffure++;
    else if (e.world === "onglerie") byWorld.onglerie++;
    else byWorld.unknown++;
  });

  // Par jour (last N days)
  const byDay = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().split("T")[0];
    byDay[key] = { date: key, events: 0, sessions: new Set() };
  }
  dayEvents.forEach(e => {
    const key = e.created_at.split("T")[0];
    if (byDay[key]) byDay[key].events++;
  });
  const byDayArr = Object.values(byDay).map(d => ({ date: d.date, events: d.events }));

  // Top pages
  const pageCount = {};
  pageEvents.forEach(e => { if (e.page) pageCount[e.page] = (pageCount[e.page] || 0) + 1; });
  const topPages = Object.entries(pageCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([page, count]) => ({ page, count }));

  // UTM sources
  const utmCount = {};
  utmEvents.forEach(e => { if (e.utm_source) utmCount[e.utm_source] = (utmCount[e.utm_source] || 0) + 1; });
  const utmSources = Object.entries(utmCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([source, count]) => ({ source, count }));

  // Funnel
  const FUNNEL_STEPS = ["PAGE_VIEW", "PRODUCT_VIEW", "CART_ADD", "CHECKOUT_START", "ORDER_PLACED"];
  const funnelByStep = {};
  funnelEvents.forEach(e => {
    funnelByStep[e.event_type] = (funnelByStep[e.event_type] || new Set()).add(e.session_id);
  });
  const funnel = FUNNEL_STEPS.map(step => ({
    step,
    sessions: funnelByStep[step]?.size || 0,
  }));

  return NextResponse.json({
    kpi: { totalEvents, uniqueSessions, todayEvents, days },
    byType,
    byWorld,
    byDay: byDayArr,
    topPages,
    utmSources,
    funnel,
  });
}
