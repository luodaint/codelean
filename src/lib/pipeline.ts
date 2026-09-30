import { z } from "zod";
import { db } from "./db";
import { appUrl, limits, required } from "./config";
import { getRepository, GitHub, installationClient, repoPath } from "./github";
import { addedLines, findingSchema, modelReview } from "./review";
import { redact, safePath } from "./security";
import type {
  Finding,
  Repository,
  ReviewResult,
  Run,
  SourceFile,
} from "./types";

type Pull = {
  head: { sha: string };
  base: { sha: string };
  state: string;
  draft: boolean;
  changed_files: number;
};
export class Superseded extends Error {}
export async function current(run: Run, gh: GitHub, repo: Repository) {
  const stored = (
    await db().query(
      "SELECT r.status, p.enabled, p.connected FROM runs r JOIN repositories p ON p.id=r.repository_id WHERE r.id=$1",
      [run.id],
    )
  ).rows[0];
  const pr = await gh.request<Pull>(
    `${repoPath(repo.full_name)}/pulls/${run.pr_number}`,
  );
  if (
    !stored ||
    stored.status !== "running" ||
    !stored.enabled ||
    !stored.connected ||
    pr.state !== "open" ||
    pr.draft ||
    pr.head.sha !== run.head_sha ||
    pr.base.sha !== run.base_sha
  )
    throw new Superseded(
      "The PR changed, closed, became a draft, or the repository was disabled",
    );
  return pr;
}
async function stage(run: Run, text: string) {
  await db().query(
    "UPDATE runs SET stage=$2 WHERE id=$1 AND status='running'",
    [run.id, text],
  );
}

export async function snapshot(
  run: Run,
  gh: GitHub,
  repo: Repository,
  pr: Pull,
) {
  const comparison = await gh.request<{
    files?: {
      filename: string;
      status: string;
      patch?: string;
      additions: number;
    }[];
  }>(
    `${repoPath(repo.full_name)}/compare/${run.base_sha}...${run.head_sha}?per_page=100`,
  );
  const changes = comparison.files || [];
  const skipped: string[] = [];
  const files: SourceFile[] = [];
  let bytes = 0;
  if (changes.length < pr.changed_files)
    skipped.push(
      "GitHub did not return every changed file (comparison limit).",
    );
  for (const change of changes) {
    const path = change.filename;
    if (
      !safePath(path) ||
      path
        .split("/")
        .some(
          (p) =>
            p === ".git" || p === ".semgrepignore" || p === ".gitleaksignore",
        ) ||
      change.status === "removed" ||
      !change.patch ||
      files.length >= limits.files
    ) {
      skipped.push(path);
      continue;
    }
    if (addedLines(change.patch).size !== change.additions)
      skipped.push(`${path}: incomplete diff coverage`);
    const file = await gh.request<{
      type: string;
      size: number;
      encoding?: string;
      content?: string;
    }>(
      `${repoPath(repo.full_name)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${run.head_sha}`,
    );
    if (
      file.type !== "file" ||
      file.size > limits.fileBytes ||
      file.encoding !== "base64" ||
      !file.content
    ) {
      skipped.push(path);
      continue;
    }
    const buffer = Buffer.from(file.content, "base64");
    if (
      buffer.includes(0) ||
      buffer.length > limits.fileBytes ||
      bytes + buffer.length + Buffer.byteLength(change.patch) >
        limits.totalBytes
    ) {
      skipped.push(path);
      continue;
    }
    const content = buffer.toString("utf8");
    if (!Buffer.from(content).equals(buffer)) {
      skipped.push(path);
      continue;
    }
    bytes += buffer.length + Buffer.byteLength(change.patch);
    files.push({ path, content, patch: change.patch });
  }
  return { files, skipped };
}
const scannerSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string(),
        content: z.string().max(200_000),
        patch: z.string().max(500_000),
      }),
    )
    .max(30),
  findings: z
    .array(findingSchema.extend({ source: z.enum(["semgrep", "gitleaks"]) }))
    .max(100),
  scanners: z.array(z.string()).max(10),
  warnings: z.array(z.string()).max(30),
});
export async function scanFiles(files: SourceFile[]) {
  const response = await fetch(
    `${required("SCANNER_URL").replace(/\/$/, "")}/scan`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${required("SCANNER_TOKEN")}`,
      },
      body: JSON.stringify({ files }),
      signal: AbortSignal.timeout(220_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Static scanner returned ${response.status}; review is incomplete`,
    );
  const data = scannerSchema.parse(await response.json());
  if (
    data.files.length !== files.length ||
    new Set(data.files.map((f) => f.path)).size !== files.length ||
    data.files.some((f) => !files.some((original) => original.path === f.path))
  )
    throw new Error("Invalid scanner file coverage");
  return {
    ...data,
    files: data.files.map((f) => ({
      ...f,
      content: redact(f.content),
      patch: redact(f.patch),
    })),
    findings: data.findings.filter((f) => {
      const original = files.find((file) => file.path === f.path);
      return (
        original &&
        f.line <= original.content.split("\n").length &&
        addedLines(original.patch).has(f.line)
      );
    }),
  };
}
function md(value: string) {
  return redact(value)
    .replace(/@/g, "@\u200b")
    .replace(/[\\`*_{}\[\]()<>#+!|]/g, "\\$&");
}
export async function beginCheck(run: Run, repo: Repository, gh: GitHub) {
  const base = repoPath(repo.full_name);
  const checks = await gh.request<{
    check_runs: { id: number; external_id: string }[];
  }>(
    `${base}/commits/${run.head_sha}/check-runs?check_name=Luoda%20review&per_page=100`,
  );
  const existing = checks.check_runs.find((c) => c.external_id === run.id);
  const check = await gh.request<{ id: number }>(
    existing ? `${base}/check-runs/${existing.id}` : `${base}/check-runs`,
    existing ? "PATCH" : "POST",
    {
      name: "Luoda review",
      head_sha: run.head_sha,
      external_id: run.id,
      status: "in_progress",
      details_url: `${appUrl()}/runs/${run.id}`,
      output: {
        title: "Review in progress",
        summary:
          "Static checks and advisory AI review are running. No merge decision has been made.",
      },
    },
  );
  await db().query("UPDATE runs SET check_id=$2 WHERE id=$1", [
    run.id,
    check.id,
  ]);
}
export async function reportFailure(
  run: Run,
  cancelled: boolean,
  retrying: boolean,
) {
  const repo = await getRepository(run.repository_id);
  const row = (
    await db().query("SELECT check_id FROM runs WHERE id=$1", [run.id])
  ).rows[0];
  if (!repo || !row?.check_id) return;
  const gh = await installationClient(repo.installation_id, repo.id, true);
  await gh.request(
    `${repoPath(repo.full_name)}/check-runs/${row.check_id}`,
    "PATCH",
    {
      status: retrying ? "in_progress" : "completed",
      ...(!retrying ? { conclusion: cancelled ? "cancelled" : "failure" } : {}),
      output: {
        title: cancelled
          ? "Revision superseded"
          : retrying
            ? "Review retry scheduled"
            : "Review incomplete",
        summary: cancelled
          ? "The PR revision or repository settings changed."
          : "Analysis or publication did not finish. Check the run in Luoda; this is not a clean review.",
      },
    },
  );
}
function summaryBody(run: Run, result: ReviewResult) {
  return (
    `<!-- luoda-pr-checker:summary -->\n## Luoda review\n\n${md(result.summary)}\n\n` +
    `Reviewed commit \`${run.head_sha.slice(0, 12)}\` against \`${run.base_sha.slice(0, 12)}\`. ` +
    `${result.files} changed files analyzed. Coverage: **${result.coverage}**. This review is advisory.\n\n` +
    result.findings
      .slice(0, 20)
      .map(
        (f) => `- **${f.severity}** ${md(f.title)} — ${md(f.path)}:${f.line}`,
      )
      .join("\n") +
    (result.skipped.length
      ? `\n\n${result.skipped.length} files or coverage items omitted; see the full report.`
      : "") +
    (result.warnings.length ? `\n\n${result.warnings.map(md).join(" ")}` : "") +
    `\n\n[View review](${appUrl()}/runs/${run.id})`
  );
}
export async function publish(
  run: Run,
  result: ReviewResult,
  repo: Repository,
  gh: GitHub,
) {
  await current(run, gh, repo);
  await db().query("UPDATE runs SET publication_started=true WHERE id=$1", [
    run.id,
  ]);
  const base = repoPath(repo.full_name);
  const marker = `<!-- luoda-pr-checker:run:${run.id} -->`;
  const checks = await gh.request<{
    check_runs: { id: number; external_id: string }[];
  }>(
    `${base}/commits/${run.head_sha}/check-runs?check_name=Luoda%20review&per_page=100`,
  );
  const check = checks.check_runs.find((c) => c.external_id === run.id);
  const checkBody = {
    name: "Luoda review",
    head_sha: run.head_sha,
    external_id: run.id,
    status: "completed",
    conclusion: "neutral",
    details_url: `${appUrl()}/runs/${run.id}`,
    output: {
      title: `${result.findings.length} findings · ${result.coverage} coverage`,
      summary: summaryBody(run, result),
    },
  };
  const saved = await gh.request<{ id: number }>(
    check ? `${base}/check-runs/${check.id}` : `${base}/check-runs`,
    check ? "PATCH" : "POST",
    checkBody,
  );
  await db().query("UPDATE runs SET check_id=$2 WHERE id=$1", [
    run.id,
    saved.id,
  ]);
  await current(run, gh, repo);
  const comments = await gh.pages<{
    id: number;
    body: string;
    performed_via_github_app?: { id: number };
  }>(`${base}/issues/${run.pr_number}/comments`);
  const old = comments.find(
    (c) =>
      c.performed_via_github_app?.id === Number(required("GITHUB_APP_ID")) &&
      c.body.includes("<!-- luoda-pr-checker:summary -->"),
  );
  const summary = await gh.request<{ id: number }>(
    old
      ? `${base}/issues/comments/${old.id}`
      : `${base}/issues/${run.pr_number}/comments`,
    old ? "PATCH" : "POST",
    { body: summaryBody(run, result) },
  );
  await db().query("UPDATE runs SET summary_id=$2 WHERE id=$1", [
    run.id,
    summary.id,
  ]);
  const findings = result.findings
    .filter((f) => f.source === "ai")
    .slice(0, limits.comments);
  if (findings.length) {
    await current(run, gh, repo);
    const reviews = await gh.pages<{
      id: number;
      body: string;
      user: { login: string };
    }>(`${base}/pulls/${run.pr_number}/reviews`);
    let review = reviews.find(
      (r) =>
        r.user.login === `${required("GITHUB_APP_SLUG")}[bot]` &&
        r.body.includes(marker),
    );
    if (!review)
      review = await gh.request(
        `${base}/pulls/${run.pr_number}/reviews`,
        "POST",
        {
          commit_id: run.head_sha,
          event: "COMMENT",
          body: `${marker}\nAdvisory findings for this revision.`,
          comments: findings.map((f) => ({
            path: f.path,
            line: f.line,
            side: "RIGHT",
            body: `**${md(f.title)}** (${f.severity})\n\n${md(f.description)}\n\n${md(f.recommendation)}`,
          })),
        },
      );
    await db().query("UPDATE runs SET review_id=$2 WHERE id=$1", [
      run.id,
      review!.id,
    ]);
  }
  if (repo.labels_enabled) {
    await current(run, gh, repo);
    const label =
      result.coverage === "partial"
        ? "luoda:partial"
        : result.findings.length
          ? "luoda:findings"
          : "luoda:reviewed";
    const existing = await gh.pages<{ name: string }>(`${base}/labels`);
    if (!existing.some((l) => l.name === label))
      await gh.request(`${base}/labels`, "POST", {
        name: label,
        color: label === "luoda:reviewed" ? "2f7665" : "bf7b2c",
        description: "Advisory Luoda review status",
      });
    await gh.request(`${base}/issues/${run.pr_number}/labels`, "POST", {
      labels: [label],
    });
    const currentLabels = await gh.pages<{ name: string }>(
      `${base}/issues/${run.pr_number}/labels`,
    );
    for (const oldLabel of currentLabels.filter(
      (l) =>
        ["luoda:partial", "luoda:findings", "luoda:reviewed"].includes(
          l.name,
        ) && l.name !== label,
    ))
      await gh.request(
        `${base}/issues/${run.pr_number}/labels/${encodeURIComponent(oldLabel.name)}`,
        "DELETE",
      );
  }
}
export async function processRun(run: Run) {
  const repo = await getRepository(run.repository_id);
  if (!repo?.enabled || !repo.connected)
    throw new Superseded("Repository disabled");
  const reader = await installationClient(repo.installation_id, repo.id);
  const pr = await current(run, reader, repo);
  const writer = await installationClient(
    repo.installation_id,
    repo.id,
    true,
    repo.labels_enabled,
  );
  await beginCheck(run, repo, writer);
  let result = run.result;
  if (!result) {
    await stage(run, "Reading changed files");
    const source = await snapshot(run, reader, repo, pr);
    if (!source.files.length)
      throw new Error(
        "No reviewable text files within the configured limits; no clean result was produced",
      );
    await stage(run, "Running static checks");
    const scanned = await scanFiles(source.files);
    await current(run, reader, repo);
    await stage(run, "Reviewing with NaN");
    const model = await modelReview(
      scanned.files,
      scanned.findings as Finding[],
    );
    const warnings = [...scanned.warnings, ...model.warnings];
    result = {
      summary: model.summary,
      findings: [...scanned.findings, ...model.findings] as Finding[],
      files: source.files.length,
      skipped: source.skipped,
      coverage:
        source.skipped.length || warnings.length ? "partial" : "complete",
      scanners: scanned.scanners,
      warnings,
    };
    await db().query(
      "UPDATE runs SET result=$2, tokens=$3, model=$4 WHERE id=$1",
      [run.id, JSON.stringify(result), model.tokens, model.model],
    );
  }
  await stage(run, "Publishing review");
  await publish(run, result, repo, writer);
  await db().query(
    "UPDATE runs SET status='completed', stage='Review complete', completed_at=now(), error=NULL WHERE id=$1 AND status='running'",
    [run.id],
  );
}
