import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  mutation: vi.fn(),
  workspace: vi.fn(),
  account: vi.fn(),
  event: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  requireUser: mocks.user,
  requireMutation: mocks.mutation,
  requireWorkspace: mocks.workspace,
}));
vi.mock("../src/lib/billing", () => ({
  billingAccount: mocks.account,
  complimentary: vi.fn(),
}));
vi.mock("../src/lib/billing-creem", () => ({
  handleCreemEvent: mocks.event,
  createBillingCheckout: vi.fn(),
  refreshBillingSubscription: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { updateAccess } from "../src/app/super-admin/actions";
import { setLimit } from "../src/app/billing/actions";
import { requireOperator } from "../src/lib/operator";
import { POST } from "../src/app/api/webhooks/creem/route";
describe("billing authorization boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({
      user: { id: "ordinary", githubId: "1", githubUsername: "mllopart" },
    });
    mocks.mutation.mockResolvedValue({ user: { id: "ordinary" } });
    mocks.workspace.mockResolvedValue({
      workspace: { id: "untrusted", role: "admin" },
    });
  });
  it("rejects a forged operator form even for a username matching the owner", async () => {
    await expect(updateAccess(new FormData())).rejects.toThrow(
      "operator access",
    );
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("does not let workspace administrators change billing", async () => {
    await expect(setLimit(new FormData())).rejects.toThrow(
      "Only workspace owners",
    );
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("checks mutation origin before a privileged action", async () => {
    mocks.mutation.mockRejectedValueOnce(new Error("Invalid request origin"));
    await expect(updateAccess(new FormData())).rejects.toThrow(
      "Invalid request origin",
    );
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("recognizes only the owner's verified server-side GitHub identity", async () => {
    mocks.user.mockResolvedValueOnce({
      user: { id: "owner", githubId: "1257083" },
    });
    await expect(requireOperator()).resolves.toMatchObject({
      user: { id: "owner" },
    });
  });
  it("rejects forged webhooks before they reach payment fulfillment", async () => {
    vi.stubEnv("CREEM_WEBHOOK_SECRET", "test-secret");
    try {
      const response = await POST(
        new Request("http://localhost/api/webhooks/creem", {
          method: "POST",
          body: JSON.stringify({ eventType: "checkout.completed" }),
          headers: { "creem-signature": "0".repeat(64) },
        }),
      );
      expect(response.status).toBe(401);
      expect(mocks.event).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
