import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { db } from "./db";
import type { Run } from "./types";
import type { ReviewPhase } from "./review-orchestrator";

type Scope = Pick<Run, "id" | "repository_id" | "head_sha" | "base_sha">;
const context = new AsyncLocalStorage<Scope>();

export async function pruneReviewCheckpoints() {
  // Only terminal, unfinished reviews age out. Lock run rows so a concurrent
  // manual retry cannot change their state while its checkpoints are removed.
  await db().query(`DELETE FROM review_checkpoints WHERE run_id IN (
    SELECT id FROM runs WHERE status IN ('failed','cancelled') AND result IS NULL
    AND completed_at < now()-interval '30 days' FOR UPDATE SKIP LOCKED
  )`);
}

export function withReviewCheckpoints<T>(run: Scope, task: () => Promise<T>) {
  return context.run(
    {
      id: run.id,
      repository_id: run.repository_id,
      head_sha: run.head_sha,
      base_sha: run.base_sha,
    },
    task,
  );
}

export async function checkpointBatch<T>(
  phase: ReviewPhase,
  inputs: unknown,
  task: () => Promise<T>,
  validate: (value: unknown) => T,
): Promise<{ result: T; reused: boolean }> {
  const scope = context.getStore();
  if (!scope) return { result: await task(), reused: false };
  // Bump this version if validation or model request semantics change. Store
  // only a fingerprint of the source/prompt, never the raw request or reasoning.
  const key = createHash("sha256")
    .update(JSON.stringify({ version: 1, scope, phase, inputs }))
    .digest("hex");
  const row = (
    await db().query(
      "SELECT result FROM review_checkpoints WHERE run_id=$1 AND cache_key=$2",
      [scope.id, key],
    )
  ).rows[0];
  if (row) {
    let result: T | undefined;
    try {
      result = validate(row.result);
    } catch {
      // An incompatible/corrupt checkpoint cannot turn into a clean review.
      await db().query(
        "DELETE FROM review_checkpoints WHERE run_id=$1 AND cache_key=$2",
        [scope.id, key],
      );
    }
    if (result !== undefined) {
      await db().query(
        "UPDATE review_checkpoints SET reuse_count=reuse_count+1,last_used_at=now() WHERE run_id=$1 AND cache_key=$2",
        [scope.id, key],
      );
      return { result, reused: true };
    }
  }
  const result = validate(await task());
  // Persist each completed batch before returning to the shared orchestrator.
  // A sibling failure or worker restart must not discard this validated work.
  await db().query(
    "INSERT INTO review_checkpoints(run_id,cache_key,phase,result) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [scope.id, key, phase, JSON.stringify(result)],
  );
  return { result, reused: false };
}
