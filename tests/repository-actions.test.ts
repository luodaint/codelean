import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  workspace: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  redirect: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  requireMutation: mocks.mutation,
  requireWorkspace: mocks.workspace,
  auth: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({
  transaction: (task: (c: { query: typeof mocks.query }) => Promise<unknown>) =>
    task({ query: mocks.query }),
}));
vi.mock("../src/lib/billing", () => ({
  assertRepositoryLimit: mocks.limit,
  assertReviewAccess: vi.fn(),
}));
vi.mock("../src/lib/github", () => ({
  syncRepositories: vi.fn(),
  OrganizationAccessError: class extends Error {},
}));
vi.mock("../src/lib/github-user", () => ({ userGitHub: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { updateRepository } from "../src/app/actions";
import { BillingBlocked } from "../src/lib/billing-policy";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue({ workspace: { id: "workspace" } });
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
});
function form(enabled = true) {
  const value = new FormData();
  value.set("id", "123");
  if (enabled) value.set("enabled", "on");
  return value;
}
it("turns expected billing errors into a repository notice without updating settings", async () => {
  const message = "This workspace allows 10 enabled repositories.";
  mocks.limit.mockRejectedValueOnce(
    new BillingBlocked(message, "repository-limit"),
  );
  await expect(updateRepository(form())).rejects.toThrow(
    "REDIRECT:/repositories?billingError=",
  );
  expect(mocks.redirect).toHaveBeenCalledWith(
    "/repositories?billingError=repository-limit",
  );
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("keeps unexpected failures out of the public billing notice", async () => {
  const error = new Error("private database details");
  mocks.limit.mockRejectedValueOnce(error);
  await expect(updateRepository(form())).rejects.toBe(error);
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("preserves workspace authorization before checking limits", async () => {
  mocks.workspace.mockRejectedValueOnce(new Error("Not authorized"));
  await expect(updateRepository(form())).rejects.toThrow("Not authorized");
  expect(mocks.limit).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});
it("allows a repository to be paused even when a workspace is at its limit", async () => {
  await updateRepository(form(false));
  expect(mocks.limit).not.toHaveBeenCalled();
  expect(mocks.query).toHaveBeenCalledTimes(2);
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
});
