import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createAuth } from "../src/lib/auth-server";
import { githubIdentity } from "../src/lib/github-identity";
import { db } from "../src/lib/db";

const origin = "http://localhost:3100";
const email = "github-auth@example.test";
const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
const defaultProfile = {
  id: 876543210,
  login: "codelean-oauth-test",
  name: "GitHub Tester",
  avatar_url: "https://avatars.githubusercontent.com/u/876543210",
  email: "untrusted-public@example.test",
};
let profile = { ...defaultProfile };
let emails = [{ email, primary: true, verified: true }];
let externalCalls: string[] = [];
let requestNumber = 1;
const testIp = () => `192.0.2.${requestNumber++}`;
function mockGithub() {
  externalCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      externalCalls.push(url);
      if (url === "https://github.com/login/oauth/access_token")
        return Response.json({
          access_token: "github-test-access-token",
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      if (url === "https://api.github.com/user") return Response.json(profile);
      if (url === "https://api.github.com/user/emails")
        return Response.json(emails);
      throw new Error("Unexpected external URL in OAuth test");
    }),
  );
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "GitHub sign-in through Better Auth",
  () => {
    beforeAll(() => {
      vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL!);
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEV_AUTH_BYPASS", "true");
      vi.stubEnv("APP_URL", origin);
      vi.stubEnv("ADMIN_EMAILS", `${email},fresh-github-auth@example.test`);
      vi.stubEnv(
        "BETTER_AUTH_SECRET",
        "github-auth-test-secret-01234567890123456789",
      );
      vi.stubEnv("GITHUB_CLIENT_ID", "github-test-client");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "github-test-secret");
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      profile = { ...defaultProfile };
      emails = [{ email, primary: true, verified: true }];
    });
    afterAll(async () => {
      await db().query('DELETE FROM "user" WHERE email IN ($1,$2)', [
        email,
        "fresh-github-auth@example.test",
      ]);
      await db().query("DELETE FROM verification WHERE identifier LIKE $1", [
        "%github-auth@example.test%",
      ]);
      await db().end();
      vi.unstubAllEnvs();
    });
    async function start(auth: ReturnType<typeof createAuth>) {
      const response = await auth.handler(
        new Request(`${origin}/api/auth/sign-in/social`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            "x-forwarded-for": testIp(),
          },
          body: JSON.stringify({
            provider: "github",
            callbackURL: "/",
            errorCallbackURL: "/login",
          }),
        }),
      );
      expect(response.status).toBe(200);
      const redirect = new URL((await response.json()).url);
      expect(redirect.origin).toBe("https://github.com");
      expect(redirect.searchParams.get("redirect_uri")).toBe(
        `${origin}/api/auth/callback/github`,
      );
      expect(redirect.searchParams.get("client_id")).toBe("github-test-client");
      expect(redirect.searchParams.get("code_challenge")).toBeTruthy();
      return {
        state: redirect.searchParams.get("state")!,
        cookie: cookieHeader(response),
      };
    }
    it("links a verified email-code account, saves GitHub identity and creates a real session", async () => {
      mockGithub();
      const auth = createAuth();
      await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
      const existing = await auth.api.signInEmailOTP({
        body: { email, otp: "7" },
      });
      const flow = await start(auth);
      const callback = await auth.handler(
        new Request(
          `${origin}/api/auth/callback/github?code=test-code&state=${flow.state}`,
          { headers: { cookie: flow.cookie } },
        ),
      );
      expect(callback.status).toBe(302);
      expect(new URL(callback.headers.get("location")!, origin).pathname).toBe(
        "/",
      );
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: cookieHeader(callback) }),
      });
      expect(session?.user.id).toBe(existing.user.id);
      expect(session?.user.githubUsername).toBe(profile.login);
      expect(session?.user.githubId).toBe(String(profile.id));
      expect(session?.user.name).toBe(profile.name);
      const account = (
        await db().query(
          'SELECT "accountId", "accessToken" FROM account WHERE "userId"=$1 AND "providerId"=$2',
          [existing.user.id, "github"],
        )
      ).rows[0];
      expect(account.accountId).toBe(String(profile.id));
      expect(account.accessToken).toBeTruthy();
      expect(account.accessToken).not.toContain("github-test-access-token");
    });
    it("creates a new authorized GitHub user without an existing email-code account", async () => {
      mockGithub();
      profile = { ...defaultProfile, id: defaultProfile.id + 1 };
      emails = [
        {
          email: "fresh-github-auth@example.test",
          primary: true,
          verified: true,
        },
      ];
      const auth = createAuth();
      const flow = await start(auth);
      const response = await auth.handler(
        new Request(
          `${origin}/api/auth/callback/github?code=test-code&state=${flow.state}`,
          { headers: { cookie: flow.cookie } },
        ),
      );
      expect(new URL(response.headers.get("location")!, origin).pathname).toBe(
        "/",
      );
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: cookieHeader(response) }),
      });
      expect(session?.user.email).toBe("fresh-github-auth@example.test");
      expect(session?.user.githubId).toBe(String(profile.id));
    });
    it("rejects client-supplied GitHub identity during email-code sign-in", async () => {
      const auth = createAuth();
      const response = await auth.handler(
        new Request(`${origin}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            "x-forwarded-for": testIp(),
          },
          body: JSON.stringify({
            email,
            otp: "7",
            githubUsername: "forged",
            githubId: "1",
          }),
        }),
      );
      expect(response.status).toBe(403);
    });
    it("rejects callbacks without the matching browser state before contacting GitHub", async () => {
      mockGithub();
      const auth = createAuth();
      const flow = await start(auth);
      const response = await auth.handler(
        new Request(
          `${origin}/api/auth/callback/github?code=test-code&state=${flow.state}`,
        ),
      );
      expect(response.status).toBe(302);
      expect(new URL(response.headers.get("location")!, origin).pathname).toBe(
        "/login",
      );
      expect(externalCalls).toHaveLength(0);
    });
    it("rejects an unverified allowlisted email even on a previously linked GitHub account", async () => {
      mockGithub();
      emails = [{ email, primary: true, verified: false }];
      const auth = createAuth();
      const flow = await start(auth);
      const response = await auth.handler(
        new Request(
          `${origin}/api/auth/callback/github?code=test-code&state=${flow.state}`,
          { headers: { cookie: flow.cookie } },
        ),
      );
      expect(new URL(response.headers.get("location")!, origin).pathname).toBe(
        "/login",
      );
      expect(
        await auth.api.getSession({
          headers: new Headers({ cookie: cookieHeader(response) }),
        }),
      ).toBeNull();
    });
    it("does not authorize a non-allowlisted identity from public profile email", async () => {
      mockGithub();
      emails = [
        { email: "stranger@example.test", primary: true, verified: true },
      ];
      expect(await githubIdentity({ accessToken: "test" })).toBeNull();
    });
    it("accepts an allowed verified secondary email without relying on public email", async () => {
      mockGithub();
      emails = [
        {
          email: "private-primary@example.test",
          primary: true,
          verified: true,
        },
        { email, primary: false, verified: true },
      ];
      expect((await githubIdentity({ accessToken: "test" }))?.user.email).toBe(
        email,
      );
    });
    it("rejects off-site return URLs and unsupported providers", async () => {
      const auth = createAuth();
      for (const body of [
        { provider: "github", callbackURL: "https://attacker.example/" },
        { provider: "google", callbackURL: "/" },
      ]) {
        const response = await auth.handler(
          new Request(`${origin}/api/auth/sign-in/social`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin,
              "x-forwarded-for": testIp(),
            },
            body: JSON.stringify(body),
          }),
        );
        expect(response.status).toBe(403);
      }
    });
  },
);
