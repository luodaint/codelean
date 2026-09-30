import { db } from "./db";
import type { Repository, Run } from "./types";
import { requireAdmin } from "./auth";
export async function overview(search = "", status = "") {
  await requireAdmin();
  const [runs, counts, repos, heartbeat] = await Promise.all([
    db().query<Run>(
      `SELECT r.*, p.full_name FROM runs r JOIN repositories p ON p.id=r.repository_id
      WHERE ($1='' OR p.full_name ILIKE '%'||$1||'%' OR r.title ILIKE '%'||$1||'%') AND ($2='' OR r.status=$2)
      ORDER BY r.created_at DESC LIMIT 100`,
      [search.slice(0, 150), status],
    ),
    db()
      .query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('queued','running'))::int AS active,
      count(*) FILTER (WHERE status='failed')::int AS failed,
      COALESCE(sum(jsonb_array_length(result->'findings')),0)::int AS findings,
      COALESCE(sum(tokens),0)::bigint AS tokens FROM runs`),
    db().query<Repository>("SELECT * FROM repositories ORDER BY full_name"),
    db().query(
      "SELECT last_seen > now()-interval '60 seconds' AS online FROM worker_heartbeats WHERE name='review'",
    ),
  ]);
  return {
    runs: runs.rows,
    counts: counts.rows[0],
    repositories: repos.rows,
    online: heartbeat.rows[0]?.online || false,
  };
}
export async function runDetails(id: string) {
  await requireAdmin();
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  return (
    (
      await db().query<Run>(
        "SELECT r.*, p.full_name FROM runs r JOIN repositories p ON p.id=r.repository_id WHERE r.id=$1",
        [id],
      )
    ).rows[0] || null
  );
}
