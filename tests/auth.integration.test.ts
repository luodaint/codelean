import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { createAuth } from "../src/lib/auth-server";
const { mail } = vi.hoisted(() => ({ mail: vi.fn().mockResolvedValue({}) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: mail }) },
}));
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Better Auth email-code integration",
  () => {
    beforeAll(() => {
      vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL!);
      vi.stubEnv("APP_URL", "http://localhost:3100");
      vi.stubEnv(
        "ADMIN_EMAILS",
        "local-auth@example.test, real-auth@example.test",
      );
      vi.stubEnv(
        "BETTER_AUTH_SECRET",
        "test-auth-secret-012345678901234567890123456789",
      );
      vi.stubEnv("SMTP_HOST", "smtp.example.test");
      vi.stubEnv("SMTP_USER", "test");
      vi.stubEnv("SMTP_PASSWORD", "test");
      vi.stubEnv("EMAIL_FROM", "Codelean <test@example.test>");
    });
    afterAll(async () => {
      await db().query('DELETE FROM "user" WHERE email IN ($1,$2)', [
        "local-auth@example.test",
        "real-auth@example.test",
      ]);
      await db().query("DELETE FROM verification WHERE identifier LIKE $1", [
        "%auth@example.test%",
      ]);
      await db().end();
      vi.unstubAllEnvs();
    });
    const headers = new Headers({ origin: "http://localhost:3100" });
    it("accepts any numeric code locally through a real library session, then prevents reuse", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEV_AUTH_BYPASS", "true");
      const auth = createAuth();
      const email = "local-auth@example.test";
      await auth.api.sendVerificationOTP({
        body: { email, type: "sign-in" },
        headers,
      });
      const session = await auth.api.signInEmailOTP({
        body: { email, otp: "9" },
        headers,
      });
      expect(session.user.email).toBe(email);
      expect(session.token).toBeTruthy();
      expect(mail).not.toHaveBeenCalled();
      await expect(
        auth.api.signInEmailOTP({ body: { email, otp: "9" }, headers }),
      ).rejects.toThrow();
    });
    it("rejects unapproved emails before issuing an OTP", async () => {
      const auth = createAuth();
      await expect(
        auth.api.sendVerificationOTP({
          body: { email: "attacker@example.test", type: "sign-in" },
          headers,
        }),
      ).rejects.toThrow("not authorized");
    });
    it("requires the emailed code in production (mail transport mocked)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DEV_AUTH_BYPASS", "false");
      const auth = createAuth();
      const email = "real-auth@example.test";
      await auth.api.sendVerificationOTP({
        body: { email, type: "sign-in" },
        headers,
      });
      expect(mail).toHaveBeenCalledOnce();
      const otp = /code is (\d{6})/.exec(mail.mock.calls[0][0].text)![1];
      await expect(
        auth.api.signInEmailOTP({
          body: { email, otp: "not-a-code" },
          headers,
        }),
      ).rejects.toThrow();
      const session = await auth.api.signInEmailOTP({
        body: { email, otp },
        headers,
      });
      expect(session.user.email).toBe(email);
    });
    it("fails closed if a production deployment enables the development bypass", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DEV_AUTH_BYPASS", "true");
      expect(() => createAuth()).toThrow("only available in development");
    });
  },
);
