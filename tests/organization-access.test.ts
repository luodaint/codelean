import { afterEach, expect, it, vi } from "vitest";
import {
  authorizeInstallation,
  GitHub,
  OrganizationAccessError,
} from "../src/lib/github";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function setup(status = 200, role = "admin", state = "active", id = 42) {
  vi.stubEnv("GITHUB_APP_ID", "123");
  const request = vi.fn(async (url: string) => {
    if (url.includes("/user/installations?"))
      return Response.json({
        installations: [
          {
            id: 10,
            app_id: 123,
            suspended_at: null,
            account: { id: 42, login: "company", type: "Organization" },
          },
        ],
      });
    if (url.endsWith("/user/memberships/orgs/company"))
      return Response.json({ role, state, organization: { id } }, { status });
    throw new Error("Unexpected GitHub request");
  });
  vi.stubGlobal("fetch", request);
  return { gh: new GitHub("test-token"), request };
}
it("checks the selected organization directly and accepts its active owner", async () => {
  const { gh, request } = setup();
  expect((await authorizeInstallation(gh, "10", "99")).account.login).toBe(
    "company",
  );
  expect(request.mock.calls.map(([url]) => url)).toContain(
    "https://api.github.com/user/memberships/orgs/company",
  );
});
it("reports missing membership permissions separately from non-ownership", async () => {
  const { gh } = setup(403);
  await expect(authorizeInstallation(gh, "10", "99")).rejects.toMatchObject({
    reason: "organization-permission",
  });
});
it.each([
  [200, "member", "active", 42],
  [200, "admin", "pending", 42],
  [200, "admin", "active", 43],
  [404, "admin", "active", 42],
])(
  "denies membership that cannot prove ownership (%s, %s, %s, %s)",
  async (status, role, state, id) => {
    const { gh } = setup(status, role, state, id);
    await expect(authorizeInstallation(gh, "10", "99")).rejects.toBeInstanceOf(
      OrganizationAccessError,
    );
  },
);
