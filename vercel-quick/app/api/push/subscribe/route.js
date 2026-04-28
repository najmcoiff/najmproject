import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { subscription, userName } = await request.json();
    if (!subscription?.endpoint || !userName) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    // Upsert subscription (endpoint unique par appareil)
    await supabase.from("push_subscriptions").upsert({
      user_nom: userName,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh,
      auth: subscription.keys?.auth,
    }, { onConflict: "endpoint" });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
