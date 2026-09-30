import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewOrchestrator } from "../src/lib/review-orchestrator";
import { ModelReviewError } from "../src/lib/model-response";
import { modelReview } from "../src/lib/review";
import { securityAudit } from "../src/lib/security-audit";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("review agent orchestration", () => {
  it("shares the concurrency cap across specialists and reports completed work", async () => {
    const progress: string[] = [];
    const pool = new ReviewOrchestrator(async (message) => {
      progress.push(message);
    }, 2);
    const gates = Array.from({ length: 5 }, () => deferred());
    const started: number[] = [];
    let active = 0,
      peak = 0;
    const jobs = gates.map((gate, i) =>
      pool.run(i < 3 ? "Review" : "Security audit", async () => {
        started.push(i);
        peak = Math.max(peak, ++active);
        await gate.promise;
        active--;
        return i;
      }),
    );
    const done = Promise.all(jobs);
    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    gates[1].resolve();
    // The waiting security specialist gets a turn before the next review batch.
    await vi.waitFor(() => expect(started).toEqual([0, 1, 3]));
    for (const gate of gates) gate.resolve();
    expect(await done).toEqual([0, 1, 2, 3, 4]);
    await pool.close();
    expect(peak).toBe(2);
    expect(progress.at(-1)).toContain("Review: 3/3 complete");
    expect(progress.at(-1)).toContain("Security audit: 2/2 complete");
    expect(progress.at(-1)).toContain("0 active");
  });

  it("aborts active siblings and never starts queued work after failure", async () => {
    const pool = new ReviewOrchestrator(async () => {}, 2);
    const fail = deferred();
    const original = new ModelReviewError("Invalid answer");
    const stopped = vi.fn();
    const siblingStarted = deferred();
    const queued = vi.fn();
    const results = Promise.allSettled([
      pool.run("Review", async () => {
        await fail.promise;
        throw original;
      }),
      pool.run(
        "Security audit",
        async (signal) =>
          new Promise((_, reject) => {
            siblingStarted.resolve();
            signal.addEventListener(
              "abort",
              () => {
                stopped();
                reject(signal.reason);
              },
              { once: true },
            );
          }),
      ),
      pool.run("Review", queued),
    ]);
    await siblingStarted.promise;
    fail.resolve();
    const settled = await results;
    await pool.close();
    expect(stopped).toHaveBeenCalledOnce();
    expect(queued).not.toHaveBeenCalled();
    expect(
      settled.every((r) => r.status === "rejected" && r.reason === original),
    ).toBe(true);
  });

  it("ends all pending work at the shared deadline without automatic budget retries", async () => {
    vi.useFakeTimers();
    const pool = new ReviewOrchestrator(async () => {}, 1, 1000);
    const queued = vi.fn();
    const results = Promise.allSettled([
      pool.run(
        "Review",
        async (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      ),
      pool.run("Security audit", queued),
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    const settled = await results;
    await pool.close();
    expect(queued).not.toHaveBeenCalled();
    for (const result of settled) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ModelReviewError);
        expect(result.reason.message).toContain("total time limit");
        expect(result.reason.retryable).toBe(false);
      }
    }
  });

  it("overlaps real review and security calls while keeping their outputs separate", async () => {
    vi.stubEnv("NAN_API_KEY", "test");
    vi.stubEnv("NAN_MODEL", "test-model");
    const gates = [deferred(), deferred()];
    let active = 0,
      peak = 0,
      calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const i = calls++;
        peak = Math.max(peak, ++active);
        await gates[i].promise;
        active--;
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: `Result ${i}`,
                  findings: [],
                }),
              },
            },
          ],
          usage: { total_tokens: 10 },
        });
      }),
    );
    const pool = new ReviewOrchestrator();
    const files = [
      {
        path: "app.ts",
        content: "const x = 1;",
        patch: "@@ -0,0 +1 @@\n+const x = 1;",
      },
    ];
    const results = Promise.all([
      modelReview(files, [], { orchestrator: pool }),
      securityAudit(files, [], undefined, undefined, pool),
    ]);
    await vi.waitFor(() => expect(calls).toBe(2));
    gates[1].resolve();
    gates[0].resolve();
    const [review, security] = await results;
    await pool.close();
    expect(peak).toBe(2);
    expect(review.skills.map((s) => s.id)).toContain("simplify");
    expect(security.audit.skills.map((s) => s.id)).toContain(
      "cloudflare-security-audit",
    );
    expect(security.audit.verification).toBe("no-candidates");
    expect(review.tokens + security.audit.tokens).toBe(20);
  });
});
