import { verifyCreemSignature } from "@/lib/creem";
import { handleCreemEvent } from "@/lib/billing-creem";
import { ZodError } from "zod";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  if (!secret)
    return Response.json(
      { error: "Billing webhooks are not configured" },
      { status: 503 },
    );
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1_000_000) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (
    !verifyCreemSignature(
      body,
      request.headers.get("creem-signature") || "",
      secret,
    )
  )
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    await handleCreemEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    const invalid = error instanceof ZodError;
    // Never log signed payloads, customer data, credentials or provider bodies.
    console.error(
      invalid
        ? "Creem webhook schema validation failed"
        : "Creem webhook processing requires reconciliation",
    );
    return Response.json(
      { error: "Billing event needs retry or reconciliation" },
      { status: invalid ? 400 : 503 },
    );
  }
}
