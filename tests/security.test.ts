import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { redact, safePath, verifyWebhook } from "../src/lib/security";
import { adminEmailAllowed, localOtpBypass } from "../src/lib/auth-policy";
describe("trust boundaries", () => {
  it("verifies exact webhook bytes and rejects modified payloads", () => {
    const body = '{"action":"opened"}',
      secret = "webhook-test";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyWebhook(body, signature, secret)).toBe(true);
    expect(verifyWebhook(body + " ", signature, secret)).toBe(false);
    expect(verifyWebhook(body, "sha256=oops", secret)).toBe(false);
  });
  it.each([
    "../etc/passwd",
    "/etc/passwd",
    "src/../../file",
    "a\\b",
    "a\0b",
    "a//b",
    "./a",
  ])("rejects path %s", (path) => expect(safePath(path)).toBe(false));
  it("accepts ordinary repository paths", () =>
    expect(safePath("src/routes/[id]/page.tsx")).toBe(true));
  it("redacts credentials without shifting source lines", () => {
    const value =
      'const api_key = "sensitive-value-here";\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\nconst ok = 1;';
    const redacted = redact(value);
    expect(redacted).not.toContain("sensitive-value");
    expect(redacted).not.toContain("abc");
    expect(redacted.split("\n")).toHaveLength(value.split("\n").length);
  });
  it("requires exact allowlisted administrator emails", () => {
    expect(adminEmailAllowed("ADMIN@EXAMPLE.COM", " admin@example.com ")).toBe(
      true,
    );
    expect(
      adminEmailAllowed("attacker@admin@example.com", "admin@example.com"),
    ).toBe(false);
    expect(adminEmailAllowed("a@b.com", "")).toBe(false);
  });
  it("allows development bypass only with explicit opt-in on loopback", () => {
    expect(localOtpBypass("development", "true", "http://localhost:3100")).toBe(
      true,
    );
    expect(localOtpBypass("production", "true", "http://localhost:3100")).toBe(
      false,
    );
    expect(
      localOtpBypass("development", "true", "https://reviews.example.com"),
    ).toBe(false);
    expect(
      localOtpBypass("development", undefined, "http://localhost:3100"),
    ).toBe(false);
    expect(
      localOtpBypass("development", "true", "http://localhost.attacker.com"),
    ).toBe(false);
  });
});
