import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import nodemailer from "nodemailer";
import { appUrl, required } from "./config";
import { db } from "./db";
import { adminEmailAllowed, localOtpBypass } from "./auth-policy";

export function createAuth() {
  const bypass = localOtpBypass(
    process.env.NODE_ENV,
    process.env.DEV_AUTH_BYPASS,
    appUrl(),
  );
  if (process.env.DEV_AUTH_BYPASS === "true" && !bypass)
    throw new Error(
      "DEV_AUTH_BYPASS is only available in development on localhost",
    );
  const secret = required("BETTER_AUTH_SECRET");
  if (secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must have at least 32 characters");
  return betterAuth({
    appName: "Luoda PR Checker",
    baseURL: appUrl(),
    secret,
    database: db(),
    trustedOrigins: [appUrl()],
    session: { expiresIn: 12 * 3600, updateAge: 3600 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ![
            "/email-otp/send-verification-otp",
            "/sign-in/email-otp",
            "/get-session",
            "/sign-out",
            "/error",
            "/ok",
          ].includes(ctx.path)
        )
          throw new APIError("FORBIDDEN", {
            message: "This sign-in method is disabled",
          });
        if (
          ctx.body?.email &&
          !adminEmailAllowed(ctx.body.email, process.env.ADMIN_EMAILS || "")
        )
          throw new APIError("FORBIDDEN", {
            message: "This email is not authorized for this workspace",
          });
        if (
          ctx.path === "/email-otp/send-verification-otp" &&
          ctx.body?.type !== "sign-in"
        )
          throw new APIError("FORBIDDEN", {
            message: "Only sign-in codes are supported",
          });
        if (bypass && ctx.path === "/sign-in/email-otp") {
          if (!/^\d{1,12}$/.test(String(ctx.body?.otp || "")))
            throw new APIError("BAD_REQUEST", {
              message: "Enter a numeric code",
            });
          return { context: { ...ctx, body: { ...ctx.body, otp: "000000" } } };
        }
      }),
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        storeOTP: "hashed",
        ...(bypass ? { generateOTP: () => "000000" } : {}),
        async sendVerificationOTP({ email, otp }) {
          if (!adminEmailAllowed(email, process.env.ADMIN_EMAILS || ""))
            throw new Error("Email not authorized");
          if (bypass) return;
          const smtp = nodemailer.createTransport({
            host: required("SMTP_HOST"),
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === "true",
            requireTLS: process.env.SMTP_SECURE !== "true",
            auth: {
              user: required("SMTP_USER"),
              pass: required("SMTP_PASSWORD"),
            },
            connectionTimeout: 10_000,
            socketTimeout: 15_000,
          });
          await smtp.sendMail({
            from: required("EMAIL_FROM"),
            to: email,
            subject: "Your Luoda sign-in code",
            text: `Your sign-in code is ${otp}. It expires in 5 minutes. If you did not request it, ignore this email.`,
          });
        },
      }),
    ],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function auth() {
  return (instance ??= createAuth());
}
