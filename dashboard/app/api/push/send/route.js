import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

webpush.setVapidDetails(
  "mailto:admin@najmcoiff.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { title, body, url, tag, targetUser, excludeUser, fromUser, type } = await request.json();

    // Récupérer les subscriptions
    let query = supabase.from("push_subscriptions").select("*");
    if (targetUser) query = query.eq("user_nom", targetUser);
    const { data: subs } = await query;

    const resolvedUrl = url || "/dashboard/discussions";

    // Logger la notification dans notifications_log (en parallèle, non bloquant)
    // target_user : défini si la notif est privée (ex: mention → seul le destinataire la voit)
    // excluded_user : l'émetteur ne voit pas sa propre notif générale dans le centre
    supabase.from("notifications_log").insert([{
      from_user:     fromUser || "",
      title:         title    || "",
      body:          body     || "",
      url:           resolvedUrl,
      type:          type     || "general",
      target_user:   targetUser   || null,  // null = visible par tous (sauf excluded_user)
      excluded_user: excludeUser  || null,  // null = pas d'exclusion
    }]).then(() => {}).catch(() => {});

    if (!subs?.length) return Response.json({ ok: true, sent: 0 });

    const payload = JSON.stringify({ title, body, url: resolvedUrl, tag: tag || "notif" });
    const expired = [];

    await Promise.allSettled(
      subs
        .filter(s => {
          if (excludeUser && s.user_nom === excludeUser) return false;
          return true;
        })
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload
            );
          } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              expired.push(s.endpoint);
            }
          }
        })
    );

    if (expired.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expired);
    }

    return Response.json({ ok: true, sent: subs.length - expired.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
