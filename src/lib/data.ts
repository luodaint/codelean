import { db } from "./db";
import type { Repository, Run } from "./types";
import { requireWorkspace } from "./auth";
export async function overview(search = "", status = "") {
  const { workspace } = await requireWorkspace();
  const [runs, counts, repos, heartbeat] = await Promise.all([
    db().query<Run>(
      `SELECT r.*, p.full_name FROM runs r JOIN repositories p ON p.id=r.repository_id
      WHERE p.organization_id=$3 AND ($1='' OR p.full_name ILIKE '%'||$1||'%' OR r.title ILIKE '%'||$1||'%') AND ($2='' OR r.status=$2)
      ORDER BY r.created_at DESC LIMIT 100`,
      [search.slice(0, 150), status, workspace.id],
    ),
    db().query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('queued','running'))::int AS active,
      count(*) FILTER (WHERE status='failed')::int AS failed,
      COALESCE(sum(jsonb_array_length(result->'findings')),0)::int AS findings,
      COALESCE(sum(tokens),0)::bigint AS tokens FROM runs r JOIN repositories p ON p.id=r.repository_id WHERE p.organization_id=$1`,
      [workspace.id],
    ),
    db().query<Repository>(
      "SELECT * FROM repositories WHERE organization_id=$1 ORDER BY full_name",
      [workspace.id],
    ),
    db().query(
      "SELECT last_seen > now()-interval '60 seconds' AS online FROM worker_heartbeats WHERE name='review'",
    ),
  ]);
  return {
    workspace,
    runs: runs.rows,
    counts: counts.rows[0],
    repositories: repos.rows,
    online: heartbeat.rows[0]?.online || false,
  };
}
export async function runDetails(id: string) {
  const { workspace } = await requireWorkspace();
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  return (
    (
      await db().query<Run>(
        "SELECT r.*, p.full_name FROM runs r JOIN repositories p ON p.id=r.repository_id WHERE r.id=$1 AND p.organization_id=$2",
        [id, workspace.id],
      )
    ).rows[0] || null
  );
}

export async function statistics() {
  const { workspace } = await requireWorkspace();
  const daily = (
    await db().query(
      `SELECT date_trunc('day', r.created_at AT TIME ZONE 'UTC')::date::text AS day, count(*)::int AS count FROM runs r JOIN repositories p ON p.id=r.repository_id WHERE p.organization_id=$1 AND r.created_at>=now()-interval '14 days' GROUP BY 1 ORDER BY 1`,
      [workspace.id],
    )
  ).rows;
  const timings = (
    await db().query(
      "SELECT round(avg(extract(epoch from completed_at-started_at)))::int AS seconds FROM runs r JOIN repositories p ON p.id=r.repository_id WHERE p.organization_id=$1 AND status='completed'",
      [workspace.id],
    )
  ).rows[0];
  return { daily, timings };
}
