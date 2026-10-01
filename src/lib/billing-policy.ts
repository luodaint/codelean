import { creemConfigured } from "./config";
export const pricing = {
  monthlyCents: 1000,
  includedTokens: 20_000_000n,
  packCents: 500,
  packTokens: 10_000_000n,
  // $0.50 / million: exactly one cent per 20,000 tokens.
  tokensPerCent: 20_000n,
  eventName: "codelean_overage_tokens",
};

// Never authorize by mutable username. Unconfigured installations have no operator.
export function ownerGitHubId() {
  const id = process.env.OPERATOR_GITHUB_ID?.trim();
  return id && /^[1-9][0-9]*$/.test(id) ? id : null;
}
export function isOperator(user: { githubId?: string | null }) {
  return Boolean(ownerGitHubId() && user.githubId === ownerGitHubId());
}
export function billingEnabled() {
  const mode = process.env.BILLING_ENABLED?.trim() || "auto";
  if (mode === "false") return false;
  if (mode === "true") return true; // Explicit paid deployments fail closed.
  if (mode !== "auto")
    throw new Error("BILLING_ENABLED must be auto, true or false");
  return creemConfigured();
}
export class BillingBlocked extends Error {
  constructor(
    message: string,
    readonly code:
      "billing-access" | "repository-limit" | "queue-limit" = "billing-access",
  ) {
    super(message);
  }
}

export function allocateTokens(
  tokens: bigint,
  includedUsed: bigint,
  prepaid: bigint,
) {
  if ([tokens, includedUsed, prepaid].some((n) => n < 0n))
    throw new Error("Invalid token count");
  const remaining =
    includedUsed >= pricing.includedTokens
      ? 0n
      : pricing.includedTokens - includedUsed;
  const included = tokens < remaining ? tokens : remaining;
  const purchased = tokens - included < prepaid ? tokens - included : prepaid;
  return {
    included,
    prepaid: purchased,
    overage: tokens - included - purchased,
  };
}
export function fitsBudget(
  tokens: bigint,
  includedUsed: bigint,
  prepaid: bigint,
  overage: bigint,
  cap: bigint | null,
) {
  if (cap === null) return true;
  const remaining =
    cap * pricing.tokensPerCent > overage
      ? cap * pricing.tokensPerCent - overage
      : 0n;
  return allocateTokens(tokens, includedUsed, prepaid).overage <= remaining;
}
export function parseLimit(value: string): bigint | null {
  if (!value.trim()) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a dollar amount with up to two decimal places.");
  const [dollars, cents = ""] = value.split(".");
  return BigInt(dollars) * 100n + BigInt(cents.padEnd(2, "0"));
}
export function tokenLabel(value: string | bigint) {
  return Number(value).toLocaleString("en-US");
}
export function usageDollars(tokens: string | bigint) {
  return (Number(tokens) / Number(pricing.tokensPerCent) / 100).toFixed(2);
}
