import { setTimeout as delay } from "node:timers/promises";
import { db } from "./lib/db";
import { processRun, reportFailure, Superseded } from "./lib/pipeline";
import type { Run } from "./lib/types";

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const pool = db();
const lock = await pool.connect();
lock.on("error", () => {
  console.error(
    "Worker lock connection lost; stopping to prevent concurrent publication",
  );
  process.exit(1);
});
// One active worker for this first release. A session lock survives transaction boundaries.
const acquired = (
  await lock.query("SELECT pg_try_advisory_lock(7043922) AS acquired")
).rows[0].acquired;
if (!acquired) {
  console.error("Another worker is active");
  lock.release();
  await pool.end();
  process.exit(1);
}
await pool.query(`UPDATE runs SET status=CASE WHEN publication_started THEN 'failed' ELSE 'queued' END,
  stage='Recovered after worker interruption', error=CASE WHEN publication_started THEN 'Publication may have partially succeeded. Use Retry to reconcile existing GitHub output.' ELSE NULL END WHERE status='running'`);
let heartbeatBusy = false;
async function heartbeat() {
  if (heartbeatBusy) return;
  heartbeatBusy = true;
  try {
    await lock.query(
      "INSERT INTO worker_heartbeats(name) VALUES ('review') ON CONFLICT(name) DO UPDATE SET last_seen=now()",
    );
  } catch {
    console.error("Worker heartbeat failed");
    process.exit(1);
  } finally {
    heartbeatBusy = false;
  }
}
await heartbeat();
const timer = setInterval(() => {
  void heartbeat();
}, 15_000);
console.log("Luoda review worker ready (concurrency 1)");
try {
  while (!stopping) {
    const run = (
      await pool.query<Run>(`UPDATE runs SET status='running', stage='Starting review', started_at=now(), attempts=attempts+1
      WHERE id=(SELECT id FROM runs WHERE status='queued' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)
    ).rows[0];
    if (!run) {
      await delay(2000);
      continue;
    }
    try {
      await processRun(run);
    } catch (error) {
      const uncertain = (
        await pool.query("SELECT publication_started FROM runs WHERE id=$1", [
          run.id,
        ])
      ).rows[0]?.publication_started;
      const cancelled = error instanceof Superseded;
      const retry = !cancelled && !uncertain && run.attempts < 3;
      // Do not store provider response bodies, repository code, or arbitrary error strings.
      const message = cancelled
        ? "This revision is no longer current."
        : uncertain
          ? "Publication interrupted. Retry reconciles existing GitHub output before continuing."
          : "Review failed. Check service configuration, provider availability, and scanner health; no clean result was produced.";
      await pool.query(
        `UPDATE runs SET status=$2, stage=$3, error=$4, available_at=now()+interval '60 seconds', completed_at=CASE WHEN $2='queued' THEN NULL ELSE now() END WHERE id=$1 AND status='running'`,
        [
          run.id,
          cancelled ? "cancelled" : retry ? "queued" : "failed",
          cancelled
            ? "Superseded"
            : retry
              ? "Retry scheduled"
              : "Needs attention",
          message,
        ],
      );
      try {
        await reportFailure(run, cancelled, retry);
      } catch {
        console.error(`Run ${run.id}: could not update GitHub check`);
      }
      console.error(
        `Run ${run.id}: ${cancelled ? "superseded" : uncertain ? "publication interrupted" : "analysis failed"}`,
      );
    }
  }
} finally {
  clearInterval(timer);
  await lock.query("SELECT pg_advisory_unlock(7043922)");
  lock.release();
  await pool.end();
}
