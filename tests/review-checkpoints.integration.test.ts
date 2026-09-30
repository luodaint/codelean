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
  billingAccount,
  saveReviewResult,
  withReviewBilling,
} from "../src/lib/billing";
import { withReviewCheckpoints } from "../src/lib/review-checkpoints";
import { modelReview } from "../src/lib/review";
import {
  ReviewOrchestrator,
  type ReviewPhase,
} from "../src/lib/review-orchestrator";
import type { Run } from "../src/lib/types";

const files = Array.from({ length: 6 }, (_, i) => ({
  path: `file${i}.ts`,
  content: "const value = 1;",
  patch: "@@ -0,0 +1 @@\n+const value = 1;",
}));
const answer = () =>
  Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: "Reviewed this batch",
            findings: [],
          }),
        },
      },
    ],
    usage: { total_tokens: 10 },
  });
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "durable review checkpoints",
  () => {
    let run: Run, organizationId: string, repositoryId: number;
    let serial = 992_500_000;
    beforeAll(() => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    });
    beforeEach(async () => {
      vi.stubEnv("BILLING_ENABLED", "false");
      vi.stubEnv("NAN_API_KEY", "test");
      vi.stubEnv("NAN_MODEL", "test-model");
      vi.stubEnv("NAN_FALLBACK_MODEL", "");
      organizationId = `checkpoint-${randomUUID()}`;
      repositoryId = ++serial;
      await db().query(
        'INSERT INTO organization(id,name,slug,"createdAt") VALUES($1,$1,$1,now())',
        [organizationId],
      );
      await db().query(
        "INSERT INTO installations(id,organization_id) VALUES($1,$2)",
        [repositoryId, organizationId],
      );
      await db().query(
        "INSERT INTO repositories(id,installation_id,organization_id,full_name,enabled) VALUES($1,$1,$2,'checkpoint/test',true)",
        [repositoryId, organizationId],
      );
      run = (
        await db().query<Run>(
          "INSERT INTO runs(id,repository_id,pr_number,title,head_sha,base_sha) VALUES($1,$2,1,'Checkpoint test',$3,$4) RETURNING *",
          [randomUUID(), repositoryId, "a".repeat(40), "b".repeat(40)],
        )
      ).rows[0];
      await billingAccount(organizationId);
      await db().query(
        "UPDATE billing_accounts SET subscription_status='active',period_start=now()-interval '1 day',period_end=now()+interval '29 days',hourly_limit=100 WHERE organization_id=$1",
        [organizationId],
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
      await db().query("DELETE FROM runs WHERE repository_id=$1", [
        repositoryId,
      ]);
      await db().query("DELETE FROM billing_periods WHERE organization_id=$1", [
        organizationId,
      ]);
      await db().query(
        "DELETE FROM billing_accounts WHERE organization_id=$1",
        [organizationId],
      );
      await db().query("DELETE FROM repositories WHERE id=$1", [repositoryId]);
      await db().query("DELETE FROM installations WHERE id=$1", [repositoryId]);
      await db().query("DELETE FROM organization WHERE id=$1", [
        organizationId,
      ]);
    });
    afterAll(async () => {
      await db().end();
    });
    async function execute({
      instructions = "Checkpoint test",
      phase = "Review",
      settle = false,
      beforeBatch,
    }: {
      instructions?: string;
      phase?: ReviewPhase;
      settle?: boolean;
      beforeBatch?: () => Promise<void>;
    } = {}) {
      // Every call constructs a fresh orchestrator and execution scope, just as
      // a worker retry/restart does. PostgreSQL is the only shared result store.
      return withReviewCheckpoints(run, () =>
        withReviewBilling(run, async () => {
          const pool = new ReviewOrchestrator(async () => {}, 1);
          try {
            const reviewed = await modelReview(files, [], {
              instructions,
              phase,
              orchestrator: pool,
              beforeBatch,
            });
            if (settle)
              await saveReviewResult(
                run,
                {
                  summary: reviewed.summary,
                  findings: reviewed.findings,
                  files: 6,
                  skipped: [],
                  coverage: "partial",
                  scanners: [],
                  warnings: reviewed.warnings,
                  resumedBatches: reviewed.resumedBatches,
                },
                reviewed.tokens,
                reviewed.model,
              );
            return reviewed;
          } finally {
            await pool.close();
          }
        }),
      );
    }
    it("keeps completed batches after a failure and charges only fresh inference on retry", async () => {
      vi.stubEnv("BILLING_ENABLED", "true");
      const fetcher = vi
        .fn()
        .mockImplementationOnce(async () => answer())
        .mockResolvedValueOnce(new Response("", { status: 503 }));
      vi.stubGlobal("fetch", fetcher);
      await expect(execute()).rejects.toThrow("503");
      expect(
        (
          await db().query("SELECT * FROM review_checkpoints WHERE run_id=$1", [
            run.id,
          ])
        ).rowCount,
      ).toBe(1);
      expect((await billingAccount(organizationId)).included_used).toBe("0");
      fetcher.mockReset().mockImplementation(async () => answer());
      const reviewed = await execute({ settle: true });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(reviewed.resumedBatches).toBe(1);
      expect(reviewed.tokens).toBe(20);
      expect((await billingAccount(organizationId)).included_used).toBe("10");
      expect(
        (
          await db().query(
            "SELECT sum(reuse_count)::int AS n FROM review_checkpoints WHERE run_id=$1",
            [run.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await db().query("SELECT * FROM billing_charges WHERE run_id=$1", [
            run.id,
          ])
        ).rowCount,
      ).toBe(1);
    });
    it("invalidates reuse when instructions, phase, model or revision change", async () => {
      const fetcher = vi.fn(async () => answer());
      vi.stubGlobal("fetch", fetcher);
      await execute();
      expect((await execute()).resumedBatches).toBe(2);
      expect(fetcher).toHaveBeenCalledTimes(2);
      await execute({ instructions: "Different instructions" });
      await execute({ phase: "Security audit" });
      vi.stubEnv("NAN_MODEL", "different-model");
      await execute();
      run = { ...run, head_sha: "c".repeat(40) };
      await db().query("UPDATE runs SET head_sha=$2 WHERE id=$1", [
        run.id,
        run.head_sha,
      ]);
      await execute();
      expect(fetcher).toHaveBeenCalledTimes(10);
    });
    it("never reuses another run's output even with identical inputs", async () => {
      const fetcher = vi.fn(async () => answer());
      vi.stubGlobal("fetch", fetcher);
      await execute();
      run = (
        await db().query<Run>(
          "INSERT INTO runs(id,repository_id,pr_number,title,head_sha,base_sha) VALUES($1,$2,2,'Another PR',$3,$4) RETURNING *",
          [randomUUID(), repositoryId, run.head_sha, run.base_sha],
        )
      ).rows[0];
      expect((await execute()).resumedBatches).toBe(0);
      expect(fetcher).toHaveBeenCalledTimes(4);
    });
    it("recomputes a corrupt checkpoint rather than returning an invalid review", async () => {
      const fetcher = vi.fn(async () => answer());
      vi.stubGlobal("fetch", fetcher);
      await execute();
      await db().query(
        "UPDATE review_checkpoints SET result=$2 WHERE run_id=$1",
        [run.id, JSON.stringify({ summary: 42 })],
      );
      expect((await execute()).resumedBatches).toBe(0);
      expect(fetcher).toHaveBeenCalledTimes(4);
    });
    it("still rechecks current PR authorization and paid access before using saved work", async () => {
      const fetcher = vi.fn(async () => answer());
      vi.stubGlobal("fetch", fetcher);
      await execute();
      fetcher.mockClear();
      await expect(
        execute({
          beforeBatch: async () => {
            throw new Error("PR is no longer current");
          },
        }),
      ).rejects.toThrow("no longer current");
      vi.stubEnv("BILLING_ENABLED", "true");
      await db().query(
        "UPDATE billing_accounts SET period_end=NULL WHERE organization_id=$1",
        [organizationId],
      );
      await expect(execute()).rejects.toThrow("paid Codelean subscription");
      expect(fetcher).not.toHaveBeenCalled();
    });
  },
);
