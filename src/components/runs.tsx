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
export function RunsTable({
  runs,
  connectedRepositories,
  enabledRepositories,
  filtered,
}: {
  runs: Run[];
  connectedRepositories: number;
  enabledRepositories: number;
  filtered: boolean;
}) {
  const empty = filtered
    ? {
        title: "No reviews match your filters",
        description:
          "Try another repository or pull request, or clear your filters to see all reviews.",
        action: "Clear filters",
        href: "/",
      }
    : enabledRepositories > 0
      ? {
          title: "Waiting for your first review",
          description:
            "Reviews are enabled. Open a pull request, push a new commit to an existing one, or mark a draft ready for review in an enabled repository. Its progress and results will appear here automatically.",
          action: "Manage repositories",
          href: "/repositories",
        }
      : connectedRepositories > 0
        ? {
            title: "Enable reviews to get started",
            description:
              "Your repositories are connected. Enable Review PRs on a repository and save to start reviewing new pull request activity.",
            action: "Enable reviews",
            href: "/repositories",
          }
        : {
            title: "Your next PR starts here",
            description:
              "Connect a repository and enable reviews. New pull requests will appear here with checks, findings, and a clear review history.",
            action: "Connect a repository",
            href: "/repositories",
          };
  if (!runs.length)
    return (
      <div className="empty">
        <div className="empty-icon">
          <GitPullRequest size={32} strokeWidth={1.3} />
        </div>
        <h2>{empty.title}</h2>
        <p>{empty.description}</p>
        <Link className="button" href={empty.href}>
          {empty.action} <ArrowUpRight size={16} />
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
