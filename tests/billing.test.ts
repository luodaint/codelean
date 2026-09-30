import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  allocateTokens,
  fitsBudget,
  isOperator,
  parseLimit,
  pricing,
} from "../src/lib/billing-policy";
import {
  creemRedirect,
  planDefinition,
  verifyCreemSignature,
} from "../src/lib/creem";
import { readModelResponse } from "../src/lib/model-response";
afterEach(() => vi.unstubAllEnvs());
describe("billing policy and Creem contract", () => {
  it("consumes the monthly allowance, then purchased tokens, then overage", () => {
    expect(allocateTokens(15_000_000n, 15_000_000n, 3_000_000n)).toEqual({
      included: 5_000_000n,
      prepaid: 3_000_000n,
      overage: 7_000_000n,
    });
  });
  it("distinguishes no cap from a zero cap and accounts for reserved work", () => {
    expect(fitsBudget(3_000_000_000n, 0n, 0n, 0n, null)).toBe(true);
    expect(fitsBudget(20_000_001n, 0n, 0n, 0n, 0n)).toBe(false);
    expect(fitsBudget(21_000_000n, 0n, 1_000_000n, 0n, 0n)).toBe(true);
    expect(fitsBudget(1n, pricing.includedTokens, 0n, 2_000_000n, 100n)).toBe(
      false,
    );
    expect(fitsBudget(100n, pricing.includedTokens, 100n, 2_000_000n, 0n)).toBe(
      true,
    );
  });
  it("uses exact decimal cents without accepting exponents or negative values", () => {
    expect(parseLimit("")).toBeNull();
    expect(parseLimit("0")).toBe(0n);
    expect(parseLimit("12.34")).toBe(1234n);
    for (const input of ["-1", "1e3", "0.001", "Infinity"])
      expect(() => parseLimit(input)).toThrow();
  });
  it("grants operator status only to the immutable owner identity", () => {
    expect(isOperator({ githubId: "1257083" })).toBe(true);
    expect(isOperator({ githubId: "1" })).toBe(false);
    expect(isOperator({})).toBe(false);
  });
  it("configures native postpaid excess usage without double applying the included allowance", () => {
    const plan = planDefinition("mtr_test");
    expect(plan.price).toBe(1000);
    expect(plan.usage_prices[0]).toMatchObject({
      settlement_mode: "postpaid",
      free_allowance: 0,
      meter_id: "mtr_test",
    });
    expect(plan.usage_prices[0].unit_price * 1_000_000).toBe(50);
    // Creem documents minor currency units, so convert cents to dollars.
    expect((plan.usage_prices[0].unit_price * 1_000_000) / 100).toBe(0.5);
  });
  it("authenticates the exact webhook bytes", () => {
    const raw = '{"id":"event"}';
    const sig = createHmac("sha256", "test-secret").update(raw).digest("hex");
    expect(verifyCreemSignature(raw, sig, "test-secret")).toBe(true);
    expect(verifyCreemSignature(raw + " ", sig, "test-secret")).toBe(false);
    expect(verifyCreemSignature(raw, "bad", "test-secret")).toBe(false);
  });
  it("rejects off-provider checkout redirects", () => {
    expect(creemRedirect("https://www.creem.io/test/checkout")).toContain(
      "creem.io",
    );
    for (const url of [
      "http://creem.io/x",
      "https://creem.io.evil.test/x",
      "javascript:alert(1)",
    ])
      expect(() => creemRedirect(url)).toThrow();
  });
  it("records provider usage even when a stream ends without a usable review", async () => {
    const usage = vi.fn();
    const response = new Response(
      'data: {"usage":{"total_tokens":42,"completion_tokens_details":{"reasoning_tokens":20}}}\n\n',
      { headers: { "content-type": "text/event-stream" } },
    );
    await expect(readModelResponse(response, usage)).rejects.toThrow(
      "before completion",
    );
    expect(usage).toHaveBeenCalledWith({
      total_tokens: 42,
      completion_tokens_details: { reasoning_tokens: 20 },
    });
  });
});
