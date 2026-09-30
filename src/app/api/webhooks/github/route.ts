import { required } from "@/lib/config";
import { verifyWebhook } from "@/lib/security";
import { handleEvent } from "@/lib/events";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const delivery = request.headers.get("x-github-delivery") || "";
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(delivery))
    return Response.json({ error: "Invalid delivery" }, { status: 400 });
  if (Number(request.headers.get("content-length")) > 2_000_000)
    return Response.json({ error: "Payload too large" }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 2_000_000) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (
    !verifyWebhook(
      body,
      request.headers.get("x-hub-signature-256") || "",
      required("GITHUB_WEBHOOK_SECRET"),
    )
  )
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    return Response.json({
      status: await handleEvent(
        delivery,
        request.headers.get("x-github-event") || "",
        payload,
      ),
    });
  } catch {
    return Response.json(
      { error: "Delivery could not be processed; redelivery is safe" },
      { status: 503 },
    );
  }
}
