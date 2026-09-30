import { createHmac, timingSafeEqual } from "node:crypto";
import { required } from "./config";
import { pricing } from "./billing-policy";

export function creemConfigured() {
  return Boolean(
    process.env.CREEM_API_KEY &&
    process.env.CREEM_WEBHOOK_SECRET &&
    process.env.CREEM_PLAN_PRODUCT_ID &&
    process.env.CREEM_TOKEN_PRODUCT_ID &&
    process.env.CREEM_METER_ID,
  );
}
export async function creemRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const base =
    process.env.CREEM_TEST_MODE === "false"
      ? "https://api.creem.io"
      : "https://test-api.creem.io";
  const response = await fetch(`${base}/v1${path}`, {
    method,
    headers: {
      "x-api-key": required("CREEM_API_KEY"),
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
    redirect: "error",
  });
  // Provider bodies may contain billing PII. Keep them out of error messages/logs.
  if (!response.ok)
    throw new Error(`Creem request failed (${response.status})`);
  return response.json() as Promise<T>;
}
export function verifyCreemSignature(
  body: string,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    createHmac("sha256", secret).update(body).digest(),
  );
}
export function creemRedirect(url: string) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !(parsed.hostname === "creem.io" || parsed.hostname.endsWith(".creem.io"))
  )
    throw new Error("Unexpected billing redirect");
  return parsed.toString();
}
export function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  )
    return value.id;
  return null;
}
export type CreemSubscription = {
  id: string;
  customer: unknown;
  product: unknown;
  status: string;
  current_period_start_date?: string;
  current_period_end_date?: string;
  updated_at?: string;
  last_transaction_id?: string;
  last_transaction_date?: string;
};
export function getSubscription(id: string) {
  return creemRequest<CreemSubscription>(
    `/subscriptions?subscription_id=${encodeURIComponent(id)}`,
  );
}
export function planDefinition(meterId: string) {
  return {
    name: "Codelean",
    description:
      "$10/workspace/month. 20M tokens included; $0.50/M extra. Included and prepaid tokens are deducted by Codelean before metering.",
    price: pricing.monthlyCents,
    currency: "USD",
    billing_type: "recurring",
    billing_period: "every-month",
    tax_mode: "exclusive",
    tax_category: "saas",
    usage_prices: [
      {
        meter_id: meterId,
        unit_price: 0.00005,
        free_allowance: 0,
        settlement_mode: "postpaid",
      },
    ],
  };
}
