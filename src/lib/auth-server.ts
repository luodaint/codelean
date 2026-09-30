import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import nodemailer from "nodemailer";
import { githubIdentity } from "./github-identity";
import {
  appUrl,
  required,
  githubLoginConfigured,
  emailLoginConfigured,
} from "./config";
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
    appName: "Codelean",
    baseURL: appUrl(),
    secret,
    database: db(),
    trustedOrigins: [appUrl()],
    user: {
      additionalFields: {
        githubUsername: { type: "string", required: false, input: true },
        githubId: { type: "string", required: false, input: true },
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        updateUserInfoOnLink: true,
      },
    },
    onAPIError: { errorURL: `${appUrl()}/login` },
    socialProviders: githubLoginConfigured()
      ? {
          github: {
            clientId: required("GITHUB_CLIENT_ID"),
            clientSecret: required("GITHUB_CLIENT_SECRET"),
            getUserInfo: githubIdentity,
            overrideUserInfoOnSignIn: true,
          },
        }
      : {},
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (
              !user.emailVerified ||
              !adminEmailAllowed(user.email, process.env.ADMIN_EMAILS || "")
            )
              return false;
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = (
              await db().query(
                'SELECT email, "emailVerified" FROM "user" WHERE id=$1',
                [session.userId],
              )
            ).rows[0];
            if (
              !user?.emailVerified ||
              !adminEmailAllowed(user.email, process.env.ADMIN_EMAILS || "")
            )
              return false;
          },
        },
      },
    },
    session: { expiresIn: 12 * 3600, updateAge: 3600 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/social") {
          for (const key of [
            "callbackURL",
            "errorCallbackURL",
            "newUserCallbackURL",
          ]) {
            const value = ctx.body?.[key];
            if (value === undefined) continue;
            let valid = false;
            try {
              valid =
                typeof value === "string" &&
                new URL(value, appUrl()).origin === new URL(appUrl()).origin;
            } catch {}
            if (!valid)
              throw new APIError("FORBIDDEN", {
                message: "Invalid sign-in return URL",
              });
          }
        }
        // Better Auth's provider profile mapping needs input-enabled fields.
        // Block client writes here; only our authenticated GitHub adapter sets them.
        if (
          ctx.body &&
          ("githubUsername" in ctx.body || "githubId" in ctx.body)
        )
          throw new APIError("FORBIDDEN", {
            message: "GitHub identity comes from GitHub sign-in",
          });
        const githubRoute =
          ctx.path === "/sign-in/social" ||
          ctx.path === "/callback/github" ||
          (ctx.path === "/callback/:id" && ctx.params?.id === "github");
        if (
          !githubRoute &&
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
          githubRoute &&
          (!githubLoginConfigured() ||
            (ctx.path === "/sign-in/social" &&
              (ctx.body?.provider !== "github" || ctx.body?.idToken)))
        )
          throw new APIError("FORBIDDEN", {
            message: "GitHub sign-in is not configured",
          });
        if (
          ["/email-otp/send-verification-otp", "/sign-in/email-otp"].includes(
            ctx.path,
          ) &&
          !bypass &&
          !emailLoginConfigured()
        )
          throw new APIError("FORBIDDEN", {
            message: "Email sign-in is not configured",
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
            subject: "Your Codelean sign-in code",
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
