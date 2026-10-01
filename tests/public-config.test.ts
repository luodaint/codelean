import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelConfig, configuredModel } from "../src/lib/config";
import { billingEnabled, isOperator } from "../src/lib/billing-policy";

beforeEach(() => {
  for (const name of [
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_MODEL",
    "LLM_FALLBACK_MODEL",
    "NAN_BASE_URL",
    "NAN_API_KEY",
    "NAN_MODEL",
    "NAN_FALLBACK_MODEL",
    "BILLING_ENABLED",
    "OPERATOR_GITHUB_ID",
    "CREEM_API_KEY",
    "CREEM_WEBHOOK_SECRET",
    "CREEM_PLAN_PRODUCT_ID",
    "CREEM_TOKEN_PRODUCT_ID",
    "CREEM_METER_ID",
  ])
    vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("public self-hosting configuration", () => {
  it("needs no subscription or default administrator on a fresh install", () => {
    expect(billingEnabled()).toBe(false);
    expect(isOperator({ githubId: "1257083" })).toBe(false);
    expect(isOperator({})).toBe(false);
  });
  it("requires complete Creem configuration in auto mode and honors explicit modes", () => {
    vi.stubEnv("CREEM_API_KEY", "test-key");
    expect(billingEnabled()).toBe(false);
    for (const name of [
      "CREEM_WEBHOOK_SECRET",
      "CREEM_PLAN_PRODUCT_ID",
      "CREEM_TOKEN_PRODUCT_ID",
      "CREEM_METER_ID",
    ])
      vi.stubEnv(name, "test-value");
    expect(billingEnabled()).toBe(true);
    vi.stubEnv("BILLING_ENABLED", "false");
    expect(billingEnabled()).toBe(false);
    vi.stubEnv("CREEM_API_KEY", "");
    vi.stubEnv("BILLING_ENABLED", "true");
    expect(billingEnabled()).toBe(true);
    vi.stubEnv("BILLING_ENABLED", "typo");
    expect(() => billingEnabled()).toThrow("BILLING_ENABLED");
  });
  it("retains existing NaN settings including the fallback model", () => {
    vi.stubEnv("NAN_API_KEY", "legacy-key");
    vi.stubEnv("NAN_MODEL", "legacy-model");
    vi.stubEnv("NAN_FALLBACK_MODEL", "legacy-fallback");
    expect(modelConfig()).toMatchObject({
      baseUrl: "https://api.nan.builders/v1",
      apiKey: "legacy-key",
      model: "legacy-model",
      fallbackModel: "legacy-fallback",
    });
  });
  it("never combines an old provider key or model with a new endpoint", () => {
    vi.stubEnv("NAN_API_KEY", "legacy-key");
    vi.stubEnv("NAN_MODEL", "legacy-model");
    vi.stubEnv("LLM_BASE_URL", "https://provider.example/v1");
    expect(modelConfig()).toMatchObject({
      apiKey: "",
      model: "",
      fallbackModel: "",
    });
    expect(() => configuredModel()).toThrow("LLM_MODEL");
    vi.stubEnv("LLM_MODEL", "chosen-model");
    vi.stubEnv("LLM_API_KEY", "chosen-key");
    expect(configuredModel()).toBe("chosen-model");
    expect(modelConfig().apiKey).toBe("chosen-key");
  });
  it("grants operator access only to the configured numeric identity", () => {
    vi.stubEnv("OPERATOR_GITHUB_ID", "987654");
    expect(isOperator({ githubId: "987654" })).toBe(true);
    expect(isOperator({ githubId: "1257083" })).toBe(false);
    vi.stubEnv("OPERATOR_GITHUB_ID", "mllopart");
    expect(isOperator({ githubId: "mllopart" })).toBe(false);
  });
});

import { modelReview } from "../src/lib/review";

afterEach(() => vi.unstubAllGlobals());
it("sends generic requests to the configured endpoint using only its credentials", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  vi.stubEnv("LLM_BASE_URL", "https://provider.example/v1/");
  vi.stubEnv("LLM_API_KEY", "provider-key");
  vi.stubEnv("LLM_MODEL", "provider-model");
  vi.stubEnv("LLM_TOKEN_PARAMETER", "max_completion_tokens");
  vi.stubEnv("NAN_API_KEY", "old-secret");
  const fetcher = vi.fn().mockImplementation(async () =>
    Response.json({
      choices: [
        { message: { content: '{"summary":"Reviewed","findings":[]}' } },
      ],
      usage: { total_tokens: 10 },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await modelReview(
    [
      {
        path: "a.ts",
        content: "const a = 1;",
        patch: "@@ -0,0 +1 @@\n+const a = 1;",
      },
    ],
    [],
  );
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://provider.example/v1/chat/completions");
  expect(options.headers.Authorization).toBe("Bearer provider-key");
  expect(options.redirect).toBe("error");
  expect(JSON.parse(options.body)).toMatchObject({
    model: "provider-model",
    max_completion_tokens: 65536,
    stream: true,
  });
  expect(JSON.parse(options.body)).not.toHaveProperty("max_tokens");
  expect(JSON.parse(options.body)).not.toHaveProperty("temperature");
});

it.each([
  "http://provider.example/v1",
  "https://user:password@provider.example/v1",
  "https://provider.example/v1?key=secret",
  "https://provider.example/v1#fragment",
])("rejects an unsafe endpoint before sending source: %s", async (url) => {
  vi.stubEnv("BILLING_ENABLED", "false");
  vi.stubEnv("LLM_BASE_URL", url);
  vi.stubEnv("LLM_API_KEY", "provider-key");
  vi.stubEnv("LLM_MODEL", "provider-model");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    modelReview(
      [
        {
          path: "a.ts",
          content: "const a = 1;",
          patch: "@@ -0,0 +1 @@\n+const a = 1;",
        },
      ],
      [],
    ),
  ).rejects.toThrow("HTTPS");
  expect(fetcher).not.toHaveBeenCalled();
});
