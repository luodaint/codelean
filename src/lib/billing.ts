import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { db, transaction } from "./db";
import {
  allocateTokens,
  billingEnabled,
  BillingBlocked,
  fitsBudget,
  ownerGitHubId,
  pricing,
} from "./billing-policy";
import type { ReviewResult, Run } from "./types";

export type BillingAccount = {
  organization_id: string;
  customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string;
  period_start: Date | null;
  period_end: Date | null;
  prepaid_tokens: string;
  extra_limit_cents: string | null;
  complimentary: boolean;
  complimentary_until: Date | null;
  owner_exempt: boolean;
  paused: boolean;
  hold_reason: string | null;
  repository_limit: number;
  hourly_limit: number;
  included_used: string;
  overage_tokens: string;
  reserved_tokens: string;
};
export async function billingAccount(
  organizationId: string,
  client?: PoolClient,
): Promise<BillingAccount> {
  const c = client || db();
  await c.query(
    "INSERT INTO billing_accounts(organization_id) VALUES($1) ON CONFLICT DO NOTHING",
    [organizationId],
  );
  if (client)
    await c.query(
      "SELECT organization_id FROM billing_accounts WHERE organization_id=$1 FOR UPDATE",
      [organizationId],
    );
  return (
    await c.query<BillingAccount>(
      `SELECT b.*,
    EXISTS(SELECT 1 FROM member m JOIN "user" u ON u.id=m."userId" WHERE m."organizationId"=b.organization_id AND m.role='owner' AND u."githubId"=$2 AND u."emailVerified"=true) AS owner_exempt,
    COALESCE(p.included_used,0)::text AS included_used, COALESCE(p.overage_tokens,0)::text AS overage_tokens,
    COALESCE((SELECT sum(u.reserved_tokens) FROM model_usage u JOIN billing_attempts a ON a.id=u.attempt_id WHERE a.organization_id=b.organization_id AND a.state='running' AND NOT a.exempt),0)::text AS reserved_tokens
    FROM billing_accounts b LEFT JOIN billing_periods p ON p.organization_id=b.organization_id AND p.starts_at=b.period_start WHERE b.organization_id=$1`,
      [organizationId, ownerGitHubId],
    )
  ).rows[0];
}
export function complimentary(account: BillingAccount) {
  return (
    account.owner_exempt ||
    (account.complimentary &&
      (!account.complimentary_until ||
        new Date(account.complimentary_until).getTime() > Date.now()))
  );
}
export function checkAccess(account: BillingAccount) {
  if (account.paused)
    throw new BillingBlocked("Reviews are paused by the service owner.");
  if (complimentary(account)) return;
  if (account.hold_reason) throw new BillingBlocked(account.hold_reason);
  if (
    !account.period_end ||
    new Date(account.period_end).getTime() <= Date.now() ||
    !account.period_start ||
    !["active", "scheduled_cancel", "canceled", "past_due"].includes(
      account.subscription_status,
    )
  )
    throw new BillingBlocked(
      "A paid Codelean subscription is required. Open Billing to continue.",
    );
}
export async function assertReviewAccess(
  organizationId: string,
  c?: PoolClient,
) {
  if (!billingEnabled()) return;
  checkAccess(await billingAccount(organizationId, c));
}
export async function assertRepositoryLimit(
  organizationId: string,
  repositoryId: string,
  c: PoolClient,
) {
  if (!billingEnabled()) return;
  const b = await billingAccount(organizationId, c);
  checkAccess(b);
  // The verified service owner's workspaces are not subject to plan repo caps.
  if (b.owner_exempt) return;
  const count = (
    await c.query(
      "SELECT count(*)::int AS n FROM repositories WHERE organization_id=$1 AND enabled AND id<>$2",
      [organizationId, repositoryId],
    )
  ).rows[0].n;
  if (count >= b.repository_limit)
    throw new BillingBlocked(
      `This workspace allows ${b.repository_limit} enabled repositories.`,
    );
}

type ReviewBilling = {
  attemptId: string;
  organizationId: string;
  runId: string;
  exempt: boolean;
};
const context = new AsyncLocalStorage<ReviewBilling>();
export async function withReviewBilling<T>(run: Run, task: () => Promise<T>) {
  if (!billingEnabled()) return task();
  const scope = await transaction(async (c) => {
    const repo = (
      await c.query("SELECT organization_id FROM repositories WHERE id=$1", [
        run.repository_id,
      ])
    ).rows[0];
    if (!repo) throw new BillingBlocked("Repository workspace is unavailable.");
    const b = await billingAccount(repo.organization_id, c);
    checkAccess(b);
    if (!run.result) {
      const n = (
        await c.query(
          "SELECT count(*)::int AS n FROM billing_attempts WHERE organization_id=$1 AND created_at>now()-interval '1 hour'",
          [repo.organization_id],
        )
      ).rows[0].n;
      if (n >= b.hourly_limit)
        throw new BillingBlocked(
          "Hourly review limit reached. Retry after an hour.",
        );
    }
    const attemptId = randomUUID();
    await c.query(
      "INSERT INTO billing_attempts(id,run_id,organization_id,period_start,period_end,exempt) VALUES($1,$2,$3,$4,$5,$6)",
      [
        attemptId,
        run.id,
        repo.organization_id,
        b.period_start,
        b.period_end,
        complimentary(b),
      ],
    );
    await c.query(
      "UPDATE billing_accounts SET last_started_at=now() WHERE organization_id=$1",
      [repo.organization_id],
    );
    return {
      attemptId,
      runId: run.id,
      organizationId: repo.organization_id,
      exempt: complimentary(b),
    };
  });
  try {
    return await context.run(scope, task);
  } finally {
    // Successful calls remain reserved until result settlement. Failed runs are
    // absorbed by Codelean; their provider usage remains in model_usage.
    await transaction(async (c) => {
      await billingAccount(scope.organizationId, c);
      await c.query(
        "UPDATE model_usage SET reserved_tokens=0,state=CASE WHEN state='pending' THEN 'unknown' ELSE state END WHERE attempt_id=$1",
        [scope.attemptId],
      );
      await c.query(
        "UPDATE billing_attempts SET state='failed' WHERE id=$1 AND state='running'",
        [scope.attemptId],
      );
    });
  }
}

export type UsageRecord = {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  [key: string]: unknown;
};
function validTotal(usage: UsageRecord | undefined) {
  const n = usage?.total_tokens;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
export async function reserveModelCall(
  model: string,
  phase: string,
  upperBound: number,
) {
  const scope = context.getStore();
  if (!scope) return null;
  const id = randomUUID();
  await transaction(async (c) => {
    // Lock provider quota before the workspace, always in the same order.
    await c.query("SELECT pg_advisory_xact_lock(7043923)");
    const b = await billingAccount(scope.organizationId, c);
    checkAccess(b);
    const a = (
      await c.query("SELECT * FROM billing_attempts WHERE id=$1", [
        scope.attemptId,
      ])
    ).rows[0];
    if (
      !scope.exempt &&
      (!a.period_end ||
        new Date(a.period_end).getTime() <= Date.now() ||
        new Date(a.period_start).getTime() !==
          new Date(b.period_start!).getTime())
    )
      throw new BillingBlocked(
        "The billing period changed. Retry this review in the new period.",
      );
    const quota = BigInt(
      process.env.BILLING_PROVIDER_TOKEN_BUDGET || "3000000000",
    );
    const used = (
      await c.query(
        `SELECT COALESCE(sum(COALESCE(total_tokens,max_tokens)),0)::text AS n FROM model_usage WHERE created_at >= COALESCE($1::timestamptz,date_trunc('month',now()))`,
        [process.env.BILLING_PROVIDER_PERIOD_START || null],
      )
    ).rows[0].n;
    if (BigInt(used) + BigInt(upperBound) > quota)
      throw new BillingBlocked(
        "Shared inference capacity is temporarily exhausted.",
      );
    if (
      !scope.exempt &&
      b.subscription_status === "canceled" &&
      allocateTokens(
        BigInt(upperBound) + BigInt(b.reserved_tokens),
        BigInt(b.included_used),
        BigInt(b.prepaid_tokens),
      ).overage > 0n
    )
      throw new BillingBlocked(
        "The subscription is canceled. Remaining included and purchased tokens can be used until the paid period ends; new metered usage requires an active subscription.",
      );
    if (
      !scope.exempt &&
      !fitsBudget(
        BigInt(upperBound) + BigInt(b.reserved_tokens),
        BigInt(b.included_used),
        BigInt(b.prepaid_tokens),
        BigInt(b.overage_tokens),
        b.extra_limit_cents === null ? null : BigInt(b.extra_limit_cents),
      )
    )
      throw new BillingBlocked(
        "This review would exceed your extra-usage limit. Open Billing to add tokens or raise the limit.",
      );
    await c.query(
      "INSERT INTO model_usage(id,attempt_id,model,phase,max_tokens,reserved_tokens) VALUES($1,$2,$3,$4,$5,$5)",
      [id, scope.attemptId, model, phase, upperBound],
    );
  });
  return id;
}
export async function recordModelUsage(id: string | null, usage?: UsageRecord) {
  if (!id) return;
  // Whitelist counts; never store arbitrary provider response or reasoning text.
  const details: Record<string, number> = {};
  for (const key of ["total_tokens", "prompt_tokens", "completion_tokens"]) {
    const n = usage?.[key];
    if (typeof n === "number" && Number.isSafeInteger(n) && n >= 0)
      details[key] = n;
  }
  for (const key of ["prompt_tokens_details", "completion_tokens_details"]) {
    const value = usage?.[key];
    if (value && typeof value === "object")
      for (const sub of ["cached_tokens", "reasoning_tokens"]) {
        const n = (value as Record<string, unknown>)[sub];
        if (typeof n === "number" && Number.isSafeInteger(n) && n >= 0)
          details[sub] = n;
      }
  }
  await db().query(
    "UPDATE model_usage SET total_tokens=$2,usage=$3 WHERE id=$1",
    [id, validTotal(usage), JSON.stringify(details)],
  );
}
export async function finishModelCall(id: string | null, success: boolean) {
  if (!id) return;
  await db().query(
    `UPDATE model_usage SET state=CASE WHEN total_tokens IS NULL THEN 'unknown' WHEN $2 THEN 'succeeded' ELSE 'failed' END,
    reserved_tokens=CASE WHEN $2 THEN COALESCE(total_tokens,max_tokens) ELSE 0 END WHERE id=$1`,
    [id, success],
  );
}

export async function saveReviewResult(
  run: Run,
  result: ReviewResult,
  tokens: number,
  model: string,
) {
  const scope = context.getStore();
  await transaction(async (c) => {
    if (scope) {
      const b = await billingAccount(scope.organizationId, c);
      const a = (
        await c.query("SELECT * FROM billing_attempts WHERE id=$1", [
          scope.attemptId,
        ])
      ).rows[0];
      const rows = (
        await c.query(
          "SELECT total_tokens,state,max_tokens FROM model_usage WHERE attempt_id=$1 AND state<>'failed'",
          [scope.attemptId],
        )
      ).rows;
      const known = rows.every(
        (r) =>
          r.state === "succeeded" &&
          r.total_tokens !== null &&
          BigInt(r.total_tokens) <= BigInt(r.max_tokens),
      );
      const billable = known
        ? rows.reduce((n, r) => n + BigInt(r.total_tokens), 0n)
        : 0n;
      const p = (
        await c.query(
          "SELECT * FROM billing_periods WHERE organization_id=$1 AND starts_at=$2",
          [scope.organizationId, a.period_start],
        )
      ).rows[0];
      // If a waiver was granted mid-run, do not charge. Unknown/provider-invalid
      // usage is absorbed, never converted from estimates into customer charges.
      const exempt = scope.exempt || complimentary(b);
      const allocation = allocateTokens(
        exempt ? 0n : billable,
        BigInt(p?.included_used || 0),
        BigInt(b.prepaid_tokens),
      );
      const charged = await c.query(
        "INSERT INTO billing_charges(run_id,organization_id,attempt_id,included_tokens,prepaid_tokens,overage_tokens) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING run_id",
        [
          run.id,
          scope.organizationId,
          scope.attemptId,
          allocation.included.toString(),
          allocation.prepaid.toString(),
          allocation.overage.toString(),
        ],
      );
      if (charged.rowCount && !exempt) {
        if (!p) throw new Error("Missing paid billing period");
        await c.query(
          "UPDATE billing_periods SET included_used=included_used+$3,overage_tokens=overage_tokens+$4 WHERE organization_id=$1 AND starts_at=$2",
          [
            scope.organizationId,
            a.period_start,
            allocation.included.toString(),
            allocation.overage.toString(),
          ],
        );
        await c.query(
          "UPDATE billing_accounts SET prepaid_tokens=prepaid_tokens-$2 WHERE organization_id=$1",
          [scope.organizationId, allocation.prepaid.toString()],
        );
        if (allocation.overage > 0n) {
          // Backdate to the authorized billing period if a review crosses renewal.
          const timestamp = new Date(
            Math.min(Date.now(), new Date(a.period_end).getTime() - 1),
          ).toISOString();
          const payload = {
            name: pricing.eventName,
            customer_id: b.customer_id,
            event_id: `review-${run.id}`,
            timestamp,
            properties: { tokens: Number(allocation.overage) },
          };
          await c.query(
            "INSERT INTO billing_outbox(id,organization_id,payload) VALUES($1,$2,$3)",
            [payload.event_id, scope.organizationId, JSON.stringify(payload)],
          );
        }
      }
      await c.query(
        "UPDATE model_usage SET reserved_tokens=0 WHERE attempt_id=$1",
        [scope.attemptId],
      );
      await c.query(
        "UPDATE billing_attempts SET state='completed' WHERE id=$1",
        [scope.attemptId],
      );
    }
    await c.query("UPDATE runs SET result=$2,tokens=$3,model=$4 WHERE id=$1", [
      run.id,
      JSON.stringify(result),
      tokens,
      model,
    ]);
  });
}

export async function recoverBillingReservations() {
  if (!billingEnabled()) return;
  // Called only after acquiring the existing exclusive worker lock.
  await transaction(async (c) => {
    await c.query(
      "UPDATE model_usage SET reserved_tokens=0,state=CASE WHEN state='pending' THEN 'unknown' ELSE state END WHERE attempt_id IN (SELECT id FROM billing_attempts WHERE state='running')",
    );
    await c.query(
      "UPDATE billing_attempts SET state='failed' WHERE state='running'",
    );
  });
}
