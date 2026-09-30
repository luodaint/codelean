import Link from "next/link";
import { Search, Plus, GitPullRequest, Activity } from "lucide-react";
import { overview } from "@/lib/data";
import { RunsTable } from "@/components/runs";
import { LiveRefresh } from "@/components/refresh";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const data = await overview(params.q, params.status);
  const connectedRepositories = data.repositories.filter((r) => r.connected);
  const enabledRepositories = connectedRepositories.filter(
    (r) => r.enabled,
  ).length;
  return (
    <>
      <LiveRefresh />
      <div className="page-heading">
        <div>
          <h1>Review runs</h1>
          <p>A clear view of what changed, and what needs a closer look.</p>
        </div>
        <Link className="button" href="/repositories">
          <Plus size={17} />{" "}
          {connectedRepositories.length
            ? "Manage repositories"
            : "Add repository"}
        </Link>
      </div>
      <div className="metrics">
        <div>
          <span>Total reviews</span>
          <strong>
            {data.counts.total}
            <GitPullRequest size={21} />
          </strong>
          <small>Across your connected repositories</small>
        </div>
        <div>
          <span>In progress</span>
          <strong>
            {data.counts.active}
            <Activity size={21} />
          </strong>
          <small>Queued and running reviews</small>
        </div>
        <div>
          <span>Findings</span>
          <strong>{data.counts.findings}</strong>
          <small>Static checks and AI observations</small>
        </div>
        <div>
          <span>Needs attention</span>
          <strong className={data.counts.failed ? "attention-number" : ""}>
            {data.counts.failed}
          </strong>
          <small>Runs that need another attempt</small>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent activity</h2>
            <p>The latest 100 runs, with results tied to each commit.</p>
          </div>
          <span
            className={`worker-status ${data.online ? "online" : "offline"}`}
          >
            <i />
            {data.online ? "Worker online" : "Worker offline"}
          </span>
        </div>
        <form className="filters">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search reviews"
              name="q"
              placeholder="Search repository or pull request…"
              defaultValue={params.q}
            />
          </label>
          <select
            name="status"
            aria-label="Filter by status"
            defaultValue={params.status || ""}
          >
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Reviewed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="button secondary">Filter</button>
        </form>
        <RunsTable
          runs={data.runs}
          connectedRepositories={connectedRepositories.length}
          enabledRepositories={enabledRepositories}
          filtered={Boolean(params.q || params.status)}
        />
      </section>
      <div className="under-panel">
        <span>
          {enabledRepositories}{" "}
          {enabledRepositories === 1 ? "repository" : "repositories"} enabled
        </span>
        <span>
          Advisory mode <span className="tiny-dot" />
        </span>
      </div>
    </>
  );
}
