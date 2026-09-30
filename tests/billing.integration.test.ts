import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "../src/lib/db";
import {
  assertReviewAccess,
  billingAccount,
  finishModelCall,
  recordModelUsage,
  reserveModelCall,
  saveReviewResult,
  withReviewBilling,
} from "../src/lib/billing";
import {
  handleCreemEvent,
  syncSubscription,
  flushBillingOutbox,
  createBillingCheckout,
} from "../src/lib/billing-creem";
import { planDefinition } from "../src/lib/creem";
import { updateAccess } from "../src/app/super-admin/actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../src/lib/auth", () => ({
  requireMutation: vi
    .fn()
    .mockResolvedValue({ user: { id: "operator", githubId: "1257083" } }),
  requireUser: vi
    .fn()
    .mockResolvedValue({ user: { id: "operator", githubId: "1257083" } }),
}));
import type { Run, ReviewResult } from "../src/lib/types";
const suite = describe.skipIf(!process.env.TEST_DATABASE_URL);
const result: ReviewResult = {
  summary: "Reviewed",
  findings: [],
  files: 1,
  skipped: [],
  coverage: "complete",
  scanners: [],
  warnings: [],
};
suite("billing PostgreSQL integration", () => {
  let organizationId: string,
    run: Run,
    repositoryId: number,
    customerId: string;
  let serial = 991_000_000;
  beforeAll(() => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  });
  beforeEach(async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    vi.stubEnv("APP_URL", "http://localhost:3100");
    vi.stubEnv("CREEM_PLAN_PRODUCT_ID", "prod_plan");
    vi.stubEnv("CREEM_TOKEN_PRODUCT_ID", "prod_tokens");
    vi.stubEnv("CREEM_API_KEY", "creem_test_fixture");
    vi.stubEnv("CREEM_WEBHOOK_SECRET", "test-webhook-secret");
    vi.stubEnv("CREEM_METER_ID", "mtr_test");
    vi.stubEnv("CREEM_TEST_MODE", "true");
    organizationId = `billing-${randomUUID()}`;
    repositoryId = ++serial;
    customerId = `cust_${randomUUID()}`;
    await db().query(
      'INSERT INTO organization(id,name,slug,"createdAt") VALUES($1,$1,$1,now())',
      [organizationId],
    );
    await db().query(
      "INSERT INTO installations(id,organization_id) VALUES($1,$2)",
      [repositoryId, organizationId],
    );
    await db().query(
      "INSERT INTO repositories(id,installation_id,organization_id,full_name,enabled) VALUES($1,$1,$2,'billing/test',true)",
      [repositoryId, organizationId],
    );
    run = (
      await db().query<Run>(
        "INSERT INTO runs(id,repository_id,pr_number,title,head_sha,base_sha) VALUES($1,$2,1,'Billing test',$3,$4) RETURNING *",
        [randomUUID(), repositoryId, "a".repeat(40), "b".repeat(40)],
      )
    ).rows[0];
    await billingAccount(organizationId);
    await db().query(
      "UPDATE billing_accounts SET customer_id=$2,subscription_id=$3,subscription_status='active',period_start=now()-interval '1 day',period_end=now()+interval '29 days',hourly_limit=100 WHERE organization_id=$1",
      [organizationId, customerId, `sub_${organizationId}`],
    );
    await db().query(
      "INSERT INTO billing_periods(organization_id,starts_at,ends_at) SELECT organization_id,period_start,period_end FROM billing_accounts WHERE organization_id=$1",
      [organizationId],
    );
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await db().query("DELETE FROM billing_charges WHERE organization_id=$1", [
      organizationId,
    ]);
    await db().query("DELETE FROM runs WHERE repository_id=$1", [repositoryId]);
    for (const table of [
      "billing_audit",
      "billing_checkouts",
      "billing_outbox",
      "billing_periods",
      "billing_accounts",
    ])
      await db().query(`DELETE FROM ${table} WHERE organization_id=$1`, [
        organizationId,
      ]);
    await db().query("DELETE FROM repositories WHERE id=$1", [repositoryId]);
    await db().query("DELETE FROM installations WHERE id=$1", [repositoryId]);
    await db().query('DELETE FROM member WHERE "organizationId"=$1', [
      organizationId,
    ]);
    await db().query("DELETE FROM organization WHERE id=$1", [organizationId]);
    await db().query('DELETE FROM "user" WHERE id=$1', [
      `owner-${organizationId}`,
    ]);
    await db().query("DELETE FROM billing_webhooks WHERE id LIKE $1", [
      `test-${organizationId}%`,
    ]);
  });
  afterAll(async () => {
    await db().end();
  });
  async function call(tokens: number, bound = tokens, success = true) {
    const id = await reserveModelCall("test-model", "Review", bound);
    await recordModelUsage(id, { total_tokens: tokens });
    await finishModelCall(id, success);
    return id;
  }
  it("blocks unpaid work and preserves permanent owner access without a subscription", async () => {
    await db().query(
      "UPDATE billing_accounts SET period_end=NULL,subscription_status='none' WHERE organization_id=$1",
      [organizationId],
    );
    await expect(assertReviewAccess(organizationId)).rejects.toThrow(
      "paid Codelean subscription",
    );
    await db().query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt","githubId") VALUES($1,\'Owner\',$2,true,now(),now(),\'1257083\')',
      [`owner-${organizationId}`, `${organizationId}@example.test`],
    );
    await db().query(
      'INSERT INTO member(id,"organizationId","userId",role,"createdAt") VALUES($1,$2,$3,\'owner\',now())',
      [randomUUID(), organizationId, `owner-${organizationId}`],
    );
    await expect(assertReviewAccess(organizationId)).resolves.toBeUndefined();
    await withReviewBilling(run, async () => {
      await call(30_000_000);
      await saveReviewResult(run, result, 30_000_000, "test-model");
    });
    expect(
      (
        await db().query(
          "SELECT * FROM billing_outbox WHERE organization_id=$1",
          [organizationId],
        )
      ).rowCount,
    ).toBe(0);
  });
  it("serializes concurrent reservations so parallel agents cannot overshoot a cap", async () => {
    await db().query(
      "UPDATE billing_accounts SET extra_limit_cents=100 WHERE organization_id=$1",
      [organizationId],
    );
    await db().query(
      "UPDATE billing_periods SET included_used=20000000 WHERE organization_id=$1",
      [organizationId],
    );
    await withReviewBilling(run, async () => {
      const reservations = await Promise.allSettled([
        reserveModelCall("test", "a", 1_500_000),
        reserveModelCall("test", "b", 1_500_000),
      ]);
      expect(reservations.filter((r) => r.status === "fulfilled")).toHaveLength(
        1,
      );
      expect(reservations.filter((r) => r.status === "rejected")).toHaveLength(
        1,
      );
    });
    expect((await billingAccount(organizationId)).reserved_tokens).toBe("0");
  });
  it("settles allowance and prepaid balances atomically and bills a revision only once", async () => {
    await db().query(
      "UPDATE billing_periods SET included_used=19000000 WHERE organization_id=$1",
      [organizationId],
    );
    await db().query(
      "UPDATE billing_accounts SET prepaid_tokens=1000000 WHERE organization_id=$1",
      [organizationId],
    );
    await withReviewBilling(run, async () => {
      await call(3_000_000);
      await saveReviewResult(run, result, 3_000_000, "test");
      await saveReviewResult(run, result, 3_000_000, "test");
    });
    const b = await billingAccount(organizationId);
    expect(b).toMatchObject({
      included_used: "20000000",
      prepaid_tokens: "0",
      overage_tokens: "1000000",
      reserved_tokens: "0",
    });
    const events = (
      await db().query(
        "SELECT payload FROM billing_outbox WHERE organization_id=$1",
        [organizationId],
      )
    ).rows;
    expect(events).toHaveLength(1);
    expect(events[0].payload.properties.tokens).toBe(1_000_000);
  });
  it("retains failed provider costs without billing failed attempts or format repair", async () => {
    await withReviewBilling(run, async () => {
      await call(50, 100, false);
      await call(60, 100);
      await saveReviewResult(run, result, 110, "test");
    });
    expect((await billingAccount(organizationId)).included_used).toBe("60");
    expect(
      (
        await db().query(
          "SELECT sum(total_tokens)::text AS n FROM model_usage u JOIN billing_attempts a ON a.id=u.attempt_id WHERE a.organization_id=$1",
          [organizationId],
        )
      ).rows[0].n,
    ).toBe("110");
  });
  it("does not convert unknown provider usage into a customer charge", async () => {
    await withReviewBilling(run, async () => {
      const id = await reserveModelCall("test", "Review", 100);
      await finishModelCall(id, true);
      await saveReviewResult(run, result, 0, "test");
    });
    expect((await billingAccount(organizationId)).included_used).toBe("0");
  });
  it("grants a token pack exactly once across different duplicate event IDs", async () => {
    const requestId = randomUUID();
    await db().query(
      "INSERT INTO billing_checkouts(id,organization_id,kind,customer_id,checkout_id) VALUES($1,$2,'tokens',$3,'ch_fixture')",
      [requestId, organizationId, customerId],
    );
    const event = {
      id: `test-${organizationId}-1`,
      eventType: "checkout.completed",
      object: {
        id: "ch_fixture",
        request_id: requestId,
        customer: customerId,
        product: "prod_tokens",
        order: {
          id: `ord_${organizationId}`,
          status: "paid",
          amount: 605,
          sub_total: 500,
          tax_amount: 105,
          currency: "USD",
        },
      },
    };
    await Promise.all([
      handleCreemEvent(event),
      handleCreemEvent({ ...event, id: `test-${organizationId}-2` }),
    ]);
    expect((await billingAccount(organizationId)).prepaid_tokens).toBe(
      "10000000",
    );
    await expect(
      handleCreemEvent({
        ...event,
        id: `test-${organizationId}-3`,
        object: { ...event.object, customer: "cust_other" },
      }),
    ).rejects.toThrow("binding");
  });
  it("does not reset usage for duplicate renewals or regress newer subscription state", async () => {
    const start = new Date(Date.now() - 60_000).toISOString();
    const end = new Date(Date.now() + 29 * 86400000).toISOString();
    const sub = {
      id: `sub_${organizationId}`,
      customer: customerId,
      product: "prod_plan",
      status: "active",
      current_period_start_date: start,
      current_period_end_date: end,
      last_transaction_id: "tran_paid",
      last_transaction_date: start,
      updated_at: start,
    };
    await syncSubscription(sub);
    await db().query(
      "UPDATE billing_periods SET included_used=123 WHERE organization_id=$1 AND starts_at=$2",
      [organizationId, start],
    );
    await syncSubscription(sub);
    expect((await billingAccount(organizationId)).included_used).toBe("123");
    await syncSubscription({
      ...sub,
      status: "unpaid",
      updated_at: new Date().toISOString(),
    });
    await syncSubscription(sub);
    await expect(assertReviewAccess(organizationId)).rejects.toThrow();
  });
  it("does not refresh the included allowance on an unpaid period", async () => {
    const before = (await billingAccount(organizationId)).period_start;
    await syncSubscription({
      id: `sub_${organizationId}`,
      customer: customerId,
      product: "prod_plan",
      status: "past_due",
      current_period_start_date: new Date().toISOString(),
      current_period_end_date: new Date(Date.now() + 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    expect((await billingAccount(organizationId)).period_start).toEqual(before);
  });
  it("allows paid-through credits after cancellation but blocks new metered debt", async () => {
    await db().query(
      "UPDATE billing_accounts SET subscription_status='canceled',prepaid_tokens=100 WHERE organization_id=$1",
      [organizationId],
    );
    await db().query(
      "UPDATE billing_periods SET included_used=20000000 WHERE organization_id=$1",
      [organizationId],
    );
    await withReviewBilling(run, async () => {
      await expect(reserveModelCall("test", "Review", 101)).rejects.toThrow(
        "subscription is canceled",
      );
      await call(100);
      await saveReviewResult(run, result, 100, "test");
    });
    expect((await billingAccount(organizationId)).prepaid_tokens).toBe("0");
    expect((await billingAccount(organizationId)).overage_tokens).toBe("0");
  });
  it("preserves ambiguous checkout intent instead of creating a second payable session", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/products/prod_plan"))
        return Response.json(planDefinition("mtr_test"));
      if (url.endsWith("/products/prod_tokens"))
        return Response.json({
          price: 500,
          currency: "USD",
          billing_type: "onetime",
        });
      throw new Error("Response lost");
    });
    vi.stubGlobal("fetch", fetch);
    await expect(
      createBillingCheckout(
        organizationId,
        "owner@example.test",
        "Test",
        "tokens",
      ),
    ).rejects.toThrow("reconciliation");
    await expect(
      createBillingCheckout(
        organizationId,
        "owner@example.test",
        "Test",
        "tokens",
      ),
    ).rejects.toThrow("operator attention");
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith("/checkouts")),
    ).toHaveLength(1);
    expect(
      (
        await db().query(
          "SELECT * FROM billing_checkouts WHERE organization_id=$1 AND checkout_id IS NULL",
          [organizationId],
        )
      ).rowCount,
    ).toBe(1);
  });
  it("confirms provider cancellation before granting free access and audits the change", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: "active" }))
      .mockResolvedValueOnce(Response.json({ status: "canceled" }))
      .mockResolvedValueOnce(Response.json({ status: "canceled" }));
    vi.stubGlobal("fetch", fetch);
    const form = new FormData();
    form.set("organizationId", organizationId);
    form.set("action", "grant");
    form.set("reason", "Approved complimentary workspace");
    await updateAccess(form);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      mode: "immediate",
    });
    expect(await billingAccount(organizationId)).toMatchObject({
      complimentary: true,
      subscription_status: "canceled",
    });
    expect(
      (
        await db().query(
          "SELECT * FROM billing_audit WHERE organization_id=$1 AND actor_id='operator'",
          [organizationId],
        )
      ).rowCount,
    ).toBe(1);
  });
  it("does not grant free access while an unresolved checkout can create a subscription", async () => {
    await db().query(
      "INSERT INTO billing_checkouts(id,organization_id,kind,customer_id) VALUES($1,$2,'plan',$3)",
      [randomUUID(), organizationId, customerId],
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const form = new FormData();
    form.set("organizationId", organizationId);
    form.set("action", "grant");
    form.set("reason", "Approved complimentary workspace");
    await expect(updateAccess(form)).rejects.toThrow(
      "pending subscription checkouts",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect((await billingAccount(organizationId)).complimentary).toBe(false);
  });
  it("retries usage with the same event ID and holds access on a rejected meter", async () => {
    await db().query(
      "INSERT INTO billing_outbox(id,organization_id,payload) VALUES($1,$2,$3)",
      [
        `review-${run.id}`,
        organizationId,
        JSON.stringify({
          event_id: `review-${run.id}`,
          customer_id: customerId,
          name: "codelean_overage_tokens",
          properties: { tokens: 10 },
        }),
      ],
    );
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(
        Response.json({ warnings: [{ code: "no_matching_meter" }] }),
      );
    vi.stubGlobal("fetch", fetch);
    await flushBillingOutbox();
    await expect(assertReviewAccess(organizationId)).rejects.toThrow(
      "synchronization",
    );
    await db().query(
      "UPDATE billing_outbox SET available_at=now() WHERE organization_id=$1",
      [organizationId],
    );
    await flushBillingOutbox();
    expect(JSON.parse(fetch.mock.calls[0][1].body).events[0].event_id).toBe(
      JSON.parse(fetch.mock.calls[1][1].body).events[0].event_id,
    );
    expect(
      (
        await db().query(
          "SELECT delivered_at,error FROM billing_outbox WHERE organization_id=$1",
          [organizationId],
        )
      ).rows[0],
    ).toMatchObject({
      delivered_at: null,
      error: "Accepted event did not aggregate; manual reconciliation required",
    });
  });
});
