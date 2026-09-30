import Link from "next/link";
import {
  GitPullRequest,
  ArrowUpRight,
  Clock3,
  CircleCheck,
  CircleAlert,
  CircleDashed,
  Ban,
} from "lucide-react";
import type { Run } from "@/lib/types";
export function Status({ status }: { status: string }) {
  const Icon =
    status === "completed"
      ? CircleCheck
      : status === "failed"
        ? CircleAlert
        : status === "cancelled"
          ? Ban
          : status === "running"
            ? CircleDashed
            : Clock3;
  return (
    <span className={`status ${status}`}>
      <Icon size={14} />
      {status === "completed"
        ? "Reviewed"
        : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
export function date(value: string | Date) {
  return new Date(value).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
export function RunsTable({ runs }: { runs: Run[] }) {
  if (!runs.length)
    return (
      <div className="empty">
        <div className="empty-icon">
          <GitPullRequest size={32} strokeWidth={1.3} />
        </div>
        <h2>Your next PR starts here</h2>
        <p>
          Connect a repository and enable reviews. New pull requests will appear
          here with checks, findings, and a clear review history.
        </p>
        <Link className="button" href="/repositories">
          Connect a repository <ArrowUpRight size={16} />
        </Link>
      </div>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Pull request</th>
            <th>Status</th>
            <th>Findings</th>
            <th>Commit</th>
            <th>Started (UTC)</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <Link className="run-title" href={`/runs/${run.id}`}>
                  {run.title}
                </Link>
                <span className="row-meta">
                  {run.full_name} <span>#{run.pr_number}</span>
                </span>
              </td>
              <td>
                <Status status={run.status} />
              </td>
              <td>
                {run.result ? (
                  <span
                    className={
                      run.result.findings.length ? "finding-count" : "muted"
                    }
                  >
                    {run.result.findings.length}{" "}
                    <small>
                      {run.result.coverage === "partial" ? "· partial" : ""}
                    </small>
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <code>{run.head_sha.slice(0, 7)}</code>
              </td>
              <td className="muted nowrap">{date(run.created_at)}</td>
              <td>
                <Link
                  href={`/runs/${run.id}`}
                  aria-label={`Open review for PR ${run.pr_number}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
