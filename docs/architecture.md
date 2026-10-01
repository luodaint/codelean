# Architecture and boundaries

Codelean supports multiple company workspaces using Better Auth organizations, memberships, invitations and active workspace sessions. PostgreSQL holds those records alongside repositories, delivery receipts, runs, results and worker heartbeats. The operator shares infrastructure and provider credentials across companies; Creem billing and usage limits are described in [Billing](billing.md). Workspaces share a single worker, which prefers the least recently served workspace.

## Components

| Component   | Responsibility                                                         | Access                                                  |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Next.js web | GitHub sign-in, workspaces, dashboard, repository management, webhooks | PostgreSQL, SMTP, GitHub App credentials                |
| Node worker | Claim jobs, fetch bounded source, call scanners and an LLM, publish       | PostgreSQL, GitHub App, LLM provider, scanner token              |
| Scanner     | Gitleaks and four initial Semgrep rules                                | Temporary files and scanner token only; private network |
| PostgreSQL  | Durable queue, records and sessions                                    | Private backend network                                 |

A single worker holds a PostgreSQL advisory session lock. Jobs are transactionally claimed with `FOR UPDATE SKIP LOCKED`. Losing the lock connection stops the worker. Duplicate webhook delivery IDs and revision uniqueness constraints prevent duplicate jobs. Automatic analysis retries stop after three attempts; once publication starts, an ambiguous failure requires an explicit retry that reconciles existing GitHub objects.

Each validated model batch is saved as a PostgreSQL checkpoint scoped to its run, revisions and exact input/configuration fingerprint. Retrying or restarting the worker reuses those batches after current authorization checks; unfinished or incompatible batches execute again. Cache hits generate no new inference usage. See [resumable reviews](resumable-reviews.md).

## Review lifecycle

1. Verify HMAC over the original webhook bytes; persist its delivery and job atomically. Only a synced, enabled installation repository can enqueue work.
2. Query authoritative GitHub PR state and require matching base/head SHAs, open status and an enabled repository. Out-of-order webhooks do not cancel newer jobs.
3. Create or resume a check run. Compare the pinned base and head (GitHub uses their merge base) and fetch changed text files at that head.
4. Apply limits: 30 files, 100 KB per file, 500 KB total content plus patches. Deleted/binary/oversized/omitted files produce partial coverage. An empty snapshot fails rather than passing.
5. Send snapshots to the private scanner. Gitleaks scans for secrets and redacts detected values from source and patches before any model call. Worker redaction adds common token/key patterns. Detection is best effort; enabling a repository authorizes sending its bounded, redacted code to the configured provider.
6. Run pinned Semgrep with bundled rules: JavaScript eval, disabled JavaScript TLS verification, Python eval/exec, and Python subprocess shell use. Repository scanner configs and ignore files cannot weaken these commands. This is deliberately small rule coverage, not a comprehensive audit.
7. Request structured review JSON from the configured chat model. Repository text is untrusted input; the model has no tools or shell access. Validate fields, paths, added-line locations and quoted evidence, redact output, and deduplicate findings. Invalid output fails the run.
8. Recheck current revision and repository authorization before each publication stage. Update an advisory neutral check, one bot-owned summary comment, at most five inline AI comments, and optional `codelean:*` labels. Findings remain available in the dashboard.

A push can still race with an individual GitHub API call; the checks and review are explicitly tied to a commit. No approval or merge decision is made. Summary comments identify the reviewed SHA. No promise of exactly-once delivery is made across external systems; stable markers, stored IDs and reconciliation reduce duplicates.

## Isolation

Scanner commands are fixed; they never install dependencies, invoke repository scripts or accept model-selected commands. Each request gets its own temporary directory. The service is long-lived, handles one scan at a time and starts bounded scanner subprocesses. Containers use non-root users, dropped capabilities, read-only roots, no-new-privileges, bounded tmpfs, CPU/memory/process limits and no Docker socket. The scanner has no external route through its internal Compose network.

Parsers still process attacker-controlled source. On the shared Dokploy server, begin with selected repositories and static analysis. Move the scanner to an authenticated private service on a separate VM before accepting a broader untrusted workload; arbitrary test/build execution is a separate future runner design.

## Authentication

Better Auth owns GitHub OAuth (state, PKCE, token exchange), OTP verification and database sessions. The same GitHub App provides the client ID/secret for sign-in and installation credentials for reviews. The authenticated GitHub email API must return a verified email; public profile email alone does not authorize access. Profile name, username, stable GitHub ID and avatar are stored, and OAuth tokens are encrypted using Better Auth. Verified email-code users can link the matching GitHub identity. Client requests cannot set GitHub identity fields. GitHub authorization is separate from App installation. Workspace membership is checked against PostgreSQL on every data access and management action. Owners/admins manage repositories, retries and teammates; members read reviews and statistics.

SMTP is optional for the email-code fallback. Codes are six digits, hashed at rest, valid five minutes and limited to five attempts; HTTP rate limits are database-backed. Signup is open by default. `SIGNUP_MODE=restricted` optionally gates signup/session access using `ADMIN_EMAILS`, without granting any workspace permissions. SMTP requires TLS. Session lifetime is 12 hours, and verified identity is checked at each authenticated data/mutation boundary.

`DEV_AUTH_BYPASS=true` maps numeric input to a deterministic development OTP only when `NODE_ENV=development` and `APP_URL` is loopback. A code request is still required, and consumed codes cannot be reused. Production rejects the bypass configuration; Compose explicitly sets it false.

## Workspace authorization

The active workspace ID is only a selector: it must match a current membership for the authenticated user. Run lists, individual runs, repository settings, retries and statistics include the workspace constraint in SQL. Removing membership invalidates access even for an existing session. Better Auth enforces invitation email, role and membership rules. Invitations are visible in-app, without email delivery in this release.

Installation discovery uses the signed-in user's GitHub token, not the global app installation list. Connecting requires the personal account owner or an active GitHub organization owner (checked using the authenticated user's membership in that exact organization; requires Organization Members read permission). A missing permission approval produces a specific remediation message, rather than treating an empty membership list as proof that the user is not an owner. The server rechecks workspace management membership after GitHub network requests and locks installation ownership during sync. An installation can belong to only one workspace; a composite foreign key prevents repositories from crossing that boundary. A sync only disconnects repositories within that workspace and installation. Webhooks and the worker use the stored installation/repository mapping, never a workspace ID supplied by an external caller.

This is application-level tenant isolation, not PostgreSQL row-level security or dedicated infrastructure per company. The trusted operator and worker still have database-wide access. Deleted GitHub installations remain associated with their original workspace; transferring installations or historical reviews between companies is intentionally unsupported.

Migration 002 keeps pre-existing repositories in an Original workspace and assigns ownership only to users already present in the old `ADMIN_EMAILS` list. Unknown/new users cannot claim legacy data. New databases have an empty inaccessible legacy workspace; it has no effect on onboarding.

## Known first-release limits

- Multiple workspaces share one active worker and a basic rule set. No custom trusted policy UI, multi-model validation, approval policy, CI aggregation or repository test execution.
- Source snapshots are temporary; result evidence can contain code fragments and should be treated as private repository data. No automated retention deletion yet.
- Token usage is recorded when returned by the provider. Billable usage and provider capacity have separate ledgers. Provider model discovery is not implemented; `LLM_MODEL` (or legacy `NAN_MODEL`) must be supplied by the operator.
- Worker and trusted publisher share a process/credentials in this version. Scanners are separated; model inference is a bounded HTTP call.
- Images build from source; the version tags are local image names. A signed, digest-pinned release registry and multi-architecture CI publication remain release work.
