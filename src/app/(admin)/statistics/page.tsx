import { db } from "@/lib/db";
import { overview } from "@/lib/data";
export default async function Statistics() {
  const data = await overview();
  const daily = (
    await db().query(
      `SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date::text AS day, count(*)::int AS count FROM runs WHERE created_at>=now()-interval '14 days' GROUP BY 1 ORDER BY 1`,
    )
  ).rows;
  const timings = (
    await db().query(
      "SELECT round(avg(extract(epoch from completed_at-started_at)))::int AS seconds FROM runs WHERE status='completed'",
    )
  ).rows[0];
  const max = Math.max(1, ...daily.map((r) => r.count));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Statistics</h1>
          <p>Understand review volume, model usage, and turnaround.</p>
        </div>
      </div>
      <div className="metrics">
        <div>
          <span>Reviews</span>
          <strong>{data.counts.total}</strong>
          <small>All time</small>
        </div>
        <div>
          <span>Model tokens</span>
          <strong>{Number(data.counts.tokens).toLocaleString()}</strong>
          <small>Reported by your provider</small>
        </div>
        <div>
          <span>Average duration</span>
          <strong>
            {timings.seconds ?? "—"}
            <small>{timings.seconds !== null ? " sec" : ""}</small>
          </strong>
          <small>Completed reviews</small>
        </div>
        <div>
          <span>Findings surfaced</span>
          <strong>{data.counts.findings}</strong>
          <small>Not a measure of confirmed bugs</small>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Review activity</h2>
            <p>Runs per day over the last 14 days (UTC).</p>
          </div>
        </div>
        {daily.length ? (
          <div className="bar-chart">
            {daily.map((row) => (
              <div className="bar-row" key={row.day}>
                <span>{row.day}</span>
                <div className="bar-track">
                  <div style={{ width: `${(row.count / max) * 100}%` }} />
                </div>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty compact">
            <h3>Your first reviews will tell the story</h3>
            <p>Activity and duration statistics appear as runs complete.</p>
          </div>
        )}
      </section>
    </>
  );
}
