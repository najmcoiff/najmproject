// POST /api/logscript — endpoint pour logger depuis le client ou GAS
import { verifyToken } from "@/lib/server-auth";
import { logScript }   from "@/lib/logscript";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = verifyToken(body.token);
    if (!session) return Response.json({ ok: false, error: "Token requis" }, { status: 401 });

    await logScript({
      source:      body.source      || "CLIENT",
      level:       body.level       || "INFO",
      action:      body.action      || null,
      message:     body.message     || null,
      order_id:    body.order_id    || null,
      duration_ms: body.duration_ms || null,
      details:     body.details     || null,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
