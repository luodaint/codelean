export const pricing = {
  monthlyCents: 1000,
  includedTokens: 20_000_000n,
  packCents: 500,
  packTokens: 10_000_000n,
  // $0.50 / million: exactly one cent per 20,000 tokens.
  tokensPerCent: 20_000n,
  eventName: "codelean_overage_tokens",
};

// Public GitHub API verified 2026-09-30. Never authorize by mutable username.
export const ownerGitHubId = "1257083";
export function isOperator(user: { githubId?: string | null }) {
  return user.githubId === ownerGitHubId;
}
export function billingEnabled() {
  return process.env.BILLING_ENABLED !== "false";
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
