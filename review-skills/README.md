# Review skills

Edit this folder to tune Codelean's **code review and separate PR security audit**.
The security audit runs after Gitleaks, Semgrep, and normal AI review. Enabled skills
are loaded from this deployed copy of Codelean, never from the PR being reviewed.

## Included Cloudflare skill

`cloudflare-security-audit/SKILL.md` is the editable Codelean adapter. It applies
Cloudflare's security-audit **guidance mode** to the changed-file snapshots.
`cloudflare-security-audit/upstream/ATTACK-CLASSES.md` supplies the original attack
classes. See `cloudflare-security-audit/UPSTREAM.md` for the pinned source revision
and `LICENSE` for the upstream MIT notice. `upstream/SKILL.md` is retained as a
reference; its full workflow is not loaded or executed.

This is not the upstream six-phase repository-wide audit. It does not clone the
whole target, execute target code, run upstream scripts, spawn tool-using agents,
produce upstream report-schema artifacts, or establish runtime proof.

Each PR runs a dedicated discovery model call. If it produces valid candidates,
a fresh model call attempts to disprove them against the same source and retains
only exact candidates. Findings still need valid added-line evidence. Both calls
use `NAN_MODEL` and the NaN credentials used by the ordinary review. This adds one
model call per run, plus one when there are candidates, and increases latency and
provider usage. Source-only verification can still miss or misclassify issues.

## Included Simplify skill

`simplify/SKILL.md` is an independently written adapter for the user-requested
[opencode-simplify skill](https://github.com/AbdoKnbGit/opencode-simplify/tree/main/simplify).
It adds reuse, clarity, and efficiency criteria to the ordinary code-review call.
It uses the supplied snapshots, suggests changes, and does not edit code or spawn
agents. `simplify/UPSTREAM.md` records the inspected revision and provenance.

## Add your own skill

1. Create `review-skills/my-security-rules/SKILL.md`.
2. Write focused Markdown review criteria, for example:

   ```markdown
   # Tenant security

   Trace every user-supplied tenant or record identifier to its database query.
   Report only reachable cross-tenant access on added lines, with the existing
   authorization controls considered. Do not infer a missing guard in unseen code.
   ```

3. Add an entry to `review-skills/skills.json`:

   ```json
   {
     "id": "my-security-rules",
     "name": "Tenant security",
     "enabled": true,
     "phase": "security-audit",
     "files": ["SKILL.md"]
   }
   ```

   The manifest is an array. `id` is the folder name. `files` lists Markdown paths
   inside that folder in prompt order. References and links are not followed; add
   companion Markdown files explicitly. `phase` selects `review` (ordinary AI
   review) or `security-audit` (discovery and verification). Enabled entries are
   combined within their phase, not run as separate agents per skill.

4. Edit the existing adapter if you only want to tune the Cloudflare checks.
   Set an entry's `enabled` to `false` to disable it. If all security entries are disabled,
   the report explicitly says the security audit is disabled; normal review and
   static scanners still run.

Limits: 10 entries, 8 files per entry, 32 KB per file, and 64 KB combined enabled
content per phase. Missing, malformed, oversized, or escaping files fail the run; they are
not silently ignored. Only Markdown is read. Scripts are never executed. Keep
credentials out of skill files: enabled text is sent to your NaN model.

## Apply changes and inspect results

Local workers read skills anew for each analysis; no restart is needed for a
Markdown/manifest-only edit. Restart `npm run worker` after changing worker code.
For Docker/Dokploy, rebuild and redeploy the worker image because it copies this
folder at build time. No extra environment variable or database migration is needed.

Push a new commit or open a PR to trigger a fresh run. Completed runs are immutable;
publication retries reuse their saved analysis rather than rerunning new skills.

Open a run to see **PR security audit**, its summary, retained candidate count,
verification status, model/tokens, and skill-content SHA-256 versions. The GitHub
summary includes the security pass, and its findings participate in advisory inline
comments and existing labels. Token totals include ordinary review and both security
calls. A model or skill-loading failure leaves the run incomplete and uses the normal
retry flow. Older runs show that no separate security audit was recorded.

The ordinary review also records its skill versions. `src/lib/config.ts` controls
`modelOutputTokens` (32,768) and `modelTimeoutMs` (360,000). The output budget includes
reasoning, not just the final answer. DeepSeek requests use JSON object mode. A
truncated answer is rejected and produces a specific error; it never counts as a
clean review. See [NaN's model contract](https://nan.builders/docs/models).

Changes here apply to all workspaces served by this deployment. Per-workspace or
per-repository skill selection is not implemented. A PR editing this folder is
reviewed as untrusted code until an operator deploys that revision.
