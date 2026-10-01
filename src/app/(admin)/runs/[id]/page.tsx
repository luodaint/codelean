import { requireWorkspace } from "@/lib/auth";
import { canManage } from "@/lib/workspaces";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, FileCode2, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { runDetails } from "@/lib/data";
import { Status, date } from "@/components/runs";
import { LiveRefresh } from "@/components/refresh";
import { Submit } from "@/components/submit";
import { retryRun } from "@/app/actions";
export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retryError?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const run = await runDetails((await params).id);
  if (!run) notFound();
  const { retryError } = await searchParams;
  return (
    <>
      <LiveRefresh />
      {retryError && (
        <p role="alert" className="notice danger">
          {retryError === "queue-limit"
            ? "The workspace review queue is full. Retry after a current review finishes."
            : retryError === "unavailable"
              ? "This review cannot be retried in its current state. Check that the repository is enabled and connected, then refresh the page."
              : "Billing access or a usage limit prevents this retry. Open Billing to check your workspace access and limits."}
        </p>
      )}
      <Link className="back" href="/dashboard">
        <ArrowLeft size={15} /> All reviews
      </Link>
      <div className="page-heading">
        <div>
          <span className="muted">
            {run.full_name} / #{run.pr_number}
          </span>
          <h1>{run.title}</h1>
          <p>{run.stage}</p>
        </div>
        <a
          className="button secondary"
          target="_blank"
          rel="noreferrer"
          href={`https://github.com/${run.full_name}/pull/${run.pr_number}`}
        >
          Open pull request <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="run-meta">
        <Status status={run.status} />
        <span>
          Head <code>{run.head_sha.slice(0, 12)}</code>
        </span>
        <span>
          Base <code>{run.base_sha.slice(0, 12)}</code>
        </span>
        <span>{date(run.created_at)} UTC</span>
      </div>
      {run.error && (
        <div className="notice danger">
          <p>{run.error}</p>
          {canManage(workspace) &&
            ["failed", "cancelled"].includes(run.status) && (
              <form action={retryRun}>
                <input type="hidden" name="id" value={run.id} />
                <Submit className="button secondary" pending="Queuing…">
                  Retry this revision
                </Submit>
                <p className="help-text">
                  Completed batches are reused when the revision, model and
                  review instructions still match. Only unfinished work runs
                  again.
                </p>
              </form>
            )}
        </div>
      )}
      {run.result ? (
        <>
          <section className="panel review-summary">
            <div className="section-icon">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2>Review summary</h2>
              <p className="prose">{run.result.summary}</p>
              <div className="summary-tags">
                <span>{run.result.files} files reviewed</span>
                <span>{run.result.coverage} coverage</span>
                <span>{BigInt(run.tokens).toLocaleString()} tokens</span>
                <span>{run.model}</span>
                {run.result.reviewBatches && (
                  <span>{run.result.reviewBatches} review batches</span>
                )}
                {!!run.result.resumedBatches && (
                  <span>{run.result.resumedBatches} batches resumed</span>
                )}
              </div>
              {run.result.reviewSkills?.map((skill) => (
                <p key={skill.id}>
                  {skill.name} · skill version{" "}
                  <code title={skill.sha256}>{skill.sha256.slice(0, 12)}</code>
                </p>
              ))}
            </div>
          </section>
          {run.result.securityAudit ? (
            <section className="panel workspace-panel">
              <h2>PR security audit</h2>
              <p className="prose">{run.result.securityAudit.summary}</p>
              <div className="summary-tags">
                <span>{run.result.securityAudit.status}</span>
                {run.result.securityAudit.discoveryBatches && (
                  <span>
                    {run.result.securityAudit.discoveryBatches} security batches
                  </span>
                )}
                <span>
                  {run.result.securityAudit.retained} retained findings
                </span>
                <span>
                  {run.result.securityAudit.tokens.toLocaleString()} tokens
                </span>
                {run.result.securityAudit.model && (
                  <span>{run.result.securityAudit.model}</span>
                )}
                <span>
                  {run.result.securityAudit.verification === "source-model-pass"
                    ? "Separate source verification pass"
                    : run.result.securityAudit.verification === "no-candidates"
                      ? "No candidates to verify"
                      : "Verification not run"}
                </span>
              </div>
              <p>
                Reviews the supplied changed files and added lines. Does not
                execute code or audit the whole repository.
              </p>
              {run.result.securityAudit.skills.map((skill) => (
                <p key={skill.id}>
                  {skill.name} · skill version{" "}
                  <code title={skill.sha256}>{skill.sha256.slice(0, 12)}</code>
                </p>
              ))}
            </section>
          ) : (
            <p className="help-text">
              The separate PR security audit was not recorded for this run.
              Earlier reviews are not retroactively audited.
            </p>
          )}
          <div className="section-title">
            <h2>
              Findings <span>{run.result.findings.length}</span>
            </h2>
            <p>Evidence to consider before merging.</p>
          </div>
          {run.result.findings.length === 0 && (
            <div className="panel empty compact">
              <ShieldCheck size={30} />
              <h3>No findings in the analyzed scope</h3>
              <p>
                This does not establish that the PR is free of bugs or security
                issues.
              </p>
            </div>
          )}
          {run.result.findings.map((finding, i) => (
            <article className="panel finding" key={i}>
              <div className="finding-top">
                <span className={`severity ${finding.severity}`}>
                  {finding.severity}
                </span>
                <span className="muted">
                  {finding.source === "ai"
                    ? "AI review"
                    : finding.source === "security-audit"
                      ? "PR security audit"
                      : finding.source}
                </span>
              </div>
              <h3>{finding.title}</h3>
              <a
                className="file-location"
                target="_blank"
                rel="noreferrer"
                href={`https://github.com/${run.full_name}/blob/${run.head_sha}/${finding.path.split("/").map(encodeURIComponent).join("/")}#L${finding.line}`}
              >
                <FileCode2 size={15} />
                {finding.path}:{finding.line}
              </a>
              <p className="prose">{finding.description}</p>
              <pre>{finding.evidence}</pre>
              <div className="recommendation">
                <strong>Suggested fix</strong>
                <p>{finding.recommendation}</p>
              </div>
            </article>
          ))}
          {(run.result.warnings.length > 0 ||
            run.result.skipped.length > 0) && (
            <details className="panel coverage">
              <summary>Coverage and limitations</summary>
              <ul>
                {run.result.warnings.map((w, i) => (
                  <li key={`w${i}`}>{w}</li>
                ))}
                {run.result.skipped.map((s, i) => (
                  <li key={i}>Not analyzed: {s}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="help-text">
            Scanners: {run.result.scanners.join(", ")}. Analysis covers bounded
            changed-file snapshots, not the whole repository.
          </p>
        </>
      ) : (
        <div className="panel empty">
          <FileCode2 size={32} strokeWidth={1.3} />
          <h2>
            {run.status === "failed"
              ? "The review needs attention"
              : run.status === "cancelled"
                ? "This review was cancelled"
                : "The review is on its way"}
          </h2>
          <p>{run.stage}. Results will appear here automatically.</p>
        </div>
      )}
    </>
  );
}
