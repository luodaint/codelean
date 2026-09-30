import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { createAuth } from "../src/lib/auth-server";
import { db } from "../src/lib/db";
import { requireWorkspace } from "../src/lib/auth";
import { overview, runDetails, statistics } from "../src/lib/data";
import { updateRepository, retryRun } from "../src/app/actions";
import {
  authorizeInstallation,
  GitHub,
  syncRepositories,
} from "../src/lib/github";
import { workspaceFor, workspacesFor } from "../src/lib/workspaces";

const context = vi.hoisted(() => ({
  headers: new Headers(),
  auth: null as any,
}));
vi.mock("next/headers", () => ({ headers: async () => context.headers }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`Redirect: ${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../src/lib/auth-server", async (original) => ({
  ...(await original<typeof import("../src/lib/auth-server")>()),
  auth: () => context.auth,
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "company workspace isolation",
  () => {
    const origin = "http://localhost:3100";
    const users: string[] = [],
      organizations: string[] = [],
      runs = [randomUUID(), randomUUID()];
    let ownerA: Headers, ownerB: Headers, reader: Headers;
    let readerId: string,
      orgA: string,
      orgB: string,
      ownerAId: string,
      ownerBId: string;
    const installation = 8765401,
      repoA = 8765402,
      repoB = 8765403;
    const form = (values: Record<string, string>) => {
      const data = new FormData();
      for (const [k, v] of Object.entries(values)) data.set(k, v);
      return data;
    };
    async function login(email: string) {
      await context.auth.api.sendVerificationOTP({
        body: { email, type: "sign-in" },
      });
      const response: Response = await context.auth.api.signInEmailOTP({
        body: { email, otp: "3" },
        asResponse: true,
      });
      expect(response.ok).toBe(true);
      const headers = new Headers({
        origin,
        cookie: response.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; "),
      });
      const session = await context.auth.api.getSession({ headers });
      users.push(session.user.id);
      return { headers, id: session.user.id };
    }
    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL!);
      vi.stubEnv("APP_URL", origin);
      vi.stubEnv("SIGNUP_MODE", "open");
      vi.stubEnv("ADMIN_EMAILS", "");
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEV_AUTH_BYPASS", "true");
      vi.stubEnv(
        "BETTER_AUTH_SECRET",
        "workspace-test-secret-012345678901234567890",
      );
      vi.stubEnv("GITHUB_APP_ID", "9876");
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      vi.stubEnv(
        "GITHUB_PRIVATE_KEY_BASE64",
        Buffer.from(
          privateKey.export({ type: "pkcs8", format: "pem" }),
        ).toString("base64"),
      );
      context.auth = createAuth();
      const a = await login("workspace-a@example.test"),
        b = await login("workspace-b@example.test"),
        c = await login("workspace-reader@example.test");
      ownerA = a.headers;
      ownerB = b.headers;
      reader = c.headers;
      readerId = c.id;
      ownerAId = a.id;
      ownerBId = b.id;
      for (const [headers, name] of [
        [ownerA, "A"],
        [ownerB, "B"],
      ] as const) {
        const org = await context.auth.api.createOrganization({
          headers,
          body: { name, slug: `test-${randomUUID()}` },
        });
        organizations.push(org.id);
        await context.auth.api.setActiveOrganization({
          headers,
          body: { organizationId: org.id },
        });
      }
      [orgA, orgB] = organizations;
      await db().query(
        "INSERT INTO installations(id,organization_id) VALUES($1,$2),($3,$4)",
        [installation, orgA, installation + 10, orgB],
      );
      await db().query(
        "INSERT INTO repositories(id,installation_id,full_name,organization_id,enabled) VALUES($1,$2,'a/private',$3,true),($4,$5,'b/secret',$6,true)",
        [repoA, installation, orgA, repoB, installation + 10, orgB],
      );
      for (const [index, repo] of [repoA, repoB].entries()) {
        await db().query(
          "INSERT INTO runs(id,repository_id,pr_number,title,head_sha,base_sha,status,tokens,started_at,completed_at) VALUES($1,$2,1,$3,'abc','def','completed',$4,now()-interval '10 seconds',now())",
          [
            runs[index],
            repo,
            index === 0 ? "Company A" : "Company B",
            index === 0 ? 10 : 9000,
          ],
        );
      }
    });
    afterAll(async () => {
      vi.unstubAllGlobals();
      await db().query("DELETE FROM runs WHERE repository_id IN ($1,$2)", [
        repoA,
        repoB,
      ]);
      await db().query("DELETE FROM repositories WHERE id IN ($1,$2)", [
        repoA,
        repoB,
      ]);
      await db().query(
        "DELETE FROM installations WHERE organization_id=ANY($1::text[])",
        [organizations],
      );
      await db().query("DELETE FROM organization WHERE id=ANY($1::text[])", [
        organizations,
      ]);
      await db().query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
      await db().end();
      vi.unstubAllEnvs();
    });
    it("creates owners without an email allowlist, and grants no access to the legacy workspace", async () => {
      expect((await workspaceFor(ownerAId, orgA))?.role).toBe("owner");
      expect(await workspaceFor(ownerAId, orgB)).toBeNull();
      expect(await workspaceFor(ownerAId, "codelean-legacy")).toBeNull();
      expect((await workspacesFor(ownerAId)).map((w) => w.id)).toEqual([orgA]);
      await expect(
        context.auth.api.setActiveOrganization({
          headers: ownerA,
          body: { organizationId: orgB },
        }),
      ).rejects.toThrow();
      await context.auth.api.setActiveOrganization({
        headers: ownerA,
        body: { organizationId: orgA },
      });
    });
    it("requires GitHub identity to create production workspaces and applies the restricted gate to direct APIs", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DEV_AUTH_BYPASS", "false");
      try {
        const productionAuth = createAuth();
        await expect(
          productionAuth.api.createOrganization({
            headers: ownerA,
            body: { name: "Email only", slug: "email-only-denied" },
          }),
        ).rejects.toThrow();
        vi.stubEnv("SIGNUP_MODE", "restricted");
        await expect(
          productionAuth.api.getFullOrganization({
            headers: ownerA,
            query: { organizationId: orgA },
          }),
        ).rejects.toThrow("authorized verified account");
      } finally {
        vi.stubEnv("SIGNUP_MODE", "open");
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("DEV_AUTH_BYPASS", "true");
      }
    });
    it("isolates review lists, counts, token usage, statistics and direct run URLs", async () => {
      context.headers = ownerA;
      const data = await overview();
      expect(data.runs.map((r) => r.id)).toEqual([runs[0]]);
      expect(data.repositories.map((r) => String(r.id))).toEqual([
        String(repoA),
      ]);
      expect(data.counts.total).toBe(1);
      expect(Number(data.counts.tokens)).toBe(10);
      expect(await runDetails(runs[1])).toBeNull();
      expect((await runDetails(runs[0]))?.title).toBe("Company A");
      expect((await overview("Company B")).runs).toEqual([]);
      expect((await statistics()).daily.reduce((n, r) => n + r.count, 0)).toBe(
        1,
      );
    });
    it("does not update or retry another company's records using forged IDs", async () => {
      context.headers = ownerA;
      await db().query("UPDATE runs SET status='failed' WHERE id=$1", [
        runs[1],
      ]);
      await updateRepository(form({ id: String(repoB) }));
      await retryRun(form({ id: runs[1] }));
      expect(
        (
          await db().query("SELECT enabled FROM repositories WHERE id=$1", [
            repoB,
          ])
        ).rows[0].enabled,
      ).toBe(true);
      expect(
        (await db().query("SELECT status FROM runs WHERE id=$1", [runs[1]]))
          .rows[0].status,
      ).toBe("failed");
    });
    it("binds invitations to verified email and enforces read-only membership", async () => {
      const invite = await context.auth.api.createInvitation({
        headers: ownerA,
        body: {
          organizationId: orgA,
          email: "workspace-reader@example.test",
          role: "member",
        },
      });
      await expect(
        context.auth.api.acceptInvitation({
          headers: ownerB,
          body: { invitationId: invite.id },
        }),
      ).rejects.toThrow();
      await context.auth.api.acceptInvitation({
        headers: reader,
        body: { invitationId: invite.id },
      });
      await context.auth.api.setActiveOrganization({
        headers: reader,
        body: { organizationId: orgA },
      });
      context.headers = reader;
      expect((await overview()).runs).toHaveLength(1);
      await expect(
        updateRepository(form({ id: String(repoA) })),
      ).rejects.toThrow("administrator");
      await expect(retryRun(form({ id: runs[0] }))).rejects.toThrow(
        "administrator",
      );
      await expect(
        context.auth.api.createInvitation({
          headers: reader,
          body: {
            organizationId: orgA,
            email: "other@example.test",
            role: "admin",
          },
        }),
      ).rejects.toThrow();
    });
    it("revokes an existing session's data access when membership is removed", async () => {
      const member = (
        await db().query(
          'SELECT id FROM member WHERE "organizationId"=$1 AND "userId"=$2',
          [orgA, readerId],
        )
      ).rows[0];
      await context.auth.api.removeMember({
        headers: ownerA,
        body: { organizationId: orgA, memberIdOrEmail: member.id },
      });
      context.headers = reader;
      await expect(requireWorkspace()).rejects.toThrow("/workspaces");
      await expect(
        context.auth.api.setActiveOrganization({
          headers: reader,
          body: { organizationId: orgA },
        }),
      ).rejects.toThrow();
    });
    const userGh = (type = "User", ownerId = 42, role = "admin") =>
      ({
        request: async () => ({
          installations: [
            {
              id: installation,
              app_id: 9876,
              suspended_at: null,
              account: { id: ownerId, login: "account", type },
            },
          ],
        }),
        pages: async () => [
          { state: "active", role, organization: { id: ownerId } },
        ],
      }) as unknown as GitHub;
    it("requires the personal account owner or an active GitHub organization owner", async () => {
      await expect(
        authorizeInstallation(userGh(), String(installation), "99"),
      ).rejects.toThrow("account owner");
      await expect(
        authorizeInstallation(userGh(), "99999", "42"),
      ).rejects.toThrow("unavailable");
      await expect(
        authorizeInstallation(
          userGh("Organization", 42, "member"),
          String(installation),
          "42",
        ),
      ).rejects.toThrow("organization owner");
      expect(
        (
          await authorizeInstallation(
            userGh("Organization"),
            String(installation),
            "99",
          )
        ).id,
      ).toBe(installation);
    });
    it("rejects claiming another workspace's installation and rolls back all changes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("/access_tokens"))
            return Response.json({ token: "test-installation-token" });
          if (url.includes("/installation/repositories"))
            return Response.json({
              repositories: [{ id: repoA, full_name: "a/private" }],
            });
          throw new Error("Unexpected GitHub API call");
        }),
      );
      await expect(
        syncRepositories(orgB, String(installation), ownerBId, "42", userGh()),
      ).rejects.toThrow("another workspace");
      await syncRepositories(
        orgA,
        String(installation),
        ownerAId,
        "42",
        userGh(),
      );
      expect(
        (
          await db().query("SELECT connected FROM repositories WHERE id=$1", [
            repoB,
          ])
        ).rows[0].connected,
      ).toBe(true);
      await expect(
        syncRepositories(orgA, String(installation), readerId, "42", userGh()),
      ).rejects.toThrow("access denied");
    });
    it("serializes simultaneous installation claims so only one company wins", async () => {
      const id = installation + 20;
      const gh = {
        request: async () => ({
          installations: [
            {
              id,
              app_id: 9876,
              suspended_at: null,
              account: { id: 42, login: "race", type: "User" },
            },
          ],
        }),
      } as unknown as GitHub;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("/access_tokens"))
            return Response.json({ token: "test-installation-token" });
          if (url.includes("/installation/repositories"))
            return Response.json({ repositories: [] });
          throw new Error("Unexpected GitHub API call");
        }),
      );
      const results = await Promise.allSettled([
        syncRepositories(orgA, String(id), ownerAId, "42", gh),
        syncRepositories(orgB, String(id), ownerBId, "42", gh),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        (await db().query("SELECT 1 FROM installations WHERE id=$1", [id]))
          .rowCount,
      ).toBe(1);
    });
    it("enforces the installation/workspace association in PostgreSQL too", async () => {
      await expect(
        db().query("UPDATE repositories SET organization_id=$1 WHERE id=$2", [
          orgB,
          repoA,
        ]),
      ).rejects.toThrow("repositories_installation_workspace");
    });
  },
);
