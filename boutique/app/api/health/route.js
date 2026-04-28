export async function GET() {
  return Response.json({ status: "ok", project: "nc-boutique", ts: Date.now() });
}
