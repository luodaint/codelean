# Extending Codelean

Start with [architecture](architecture.md) and [CONTRIBUTING](../CONTRIBUTING.md). Run the local environment and tests before changing behavior. Read [AGENTS.md](../AGENTS.md) and the installed Next.js guides when editing the app.

## Source map

| Area                                     | Entry points                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Admin pages and server actions           | `src/app/(admin)/`, `src/app/actions.ts`                                     |
| Authentication, workspace authorization  | `src/lib/auth*.ts`, `src/lib/workspaces.ts`, `src/lib/github-identity.ts`    |
| GitHub webhook and queue                 | `src/app/api/webhooks/github/route.ts`, `src/lib/events.ts`, `src/worker.ts` |
| Snapshot, scan, review, publication      | `src/lib/pipeline.ts`, `src/lib/github.ts`, `src/lib/review.ts`              |
| Model orchestration and response parsing | `src/lib/review-orchestrator.ts`, `src/lib/model-response.ts`                |
| Resumable batches                        | `src/lib/review-checkpoints.ts`                                              |
| Security candidate verification          | `src/lib/security-audit.ts`                                                  |
| Skills and source limits                 | `src/lib/review-skills.ts`, `review-skills/`, `src/lib/config.ts`            |
| Scanner service and fixed rules          | `scanner/server.py`, `scanner/rules.yml`, `scanner/gitleaks.toml`            |
| Optional payments and administration     | `src/lib/billing*.ts`, `src/lib/creem.ts`, `src/lib/operator.ts`             |
| Schema changes                           | `migrations/`, `scripts/migrate.ts`                                          |

## Add or tune a review skill

Follow the full [review-skills guide](../review-skills/README.md): create a Markdown skill, register it in `review-skills/skills.json`, select its phase, and bump its version when behavior changes. Keep guidance advisory, bounded, and explicit about exact source evidence. Security candidates require the separate verification phase. Preserve upstream licenses and attribution. Run `tests/review-skills.test.ts`, `tests/security-audit.test.ts`, and review/checkpoint tests. Prompts and versions contribute to checkpoint compatibility.

## Add a scanner rule or engine

For Semgrep rules, edit `scanner/rules.yml` and add representative safe fixtures and rejection cases to scanner tests. For another engine, add a fixed operator-controlled command to the scanner and normalize output into the existing finding contract. Bound input/output bytes, execution time, processes, memory, paths, and severity values. Do not execute repository scripts, install PR dependencies, load commands from PR files, or give the scanner the Docker socket, provider credentials, or GitHub keys. Rebuild the scanner image after changes.

## Add provider-specific behavior

Try configuration first. Keep endpoint and credential resolution in `src/lib/config.ts`, request changes in `src/lib/review.ts`, and protocol parsing in `src/lib/model-response.ts`. Retain abort signals, stream limits, output validation, redaction, usage accounting, and failure semantics. Add mocked tests for the actual wire format, unsupported parameters, incomplete streams, and usage on failures. Never turn a provider error into a clean review or log full provider bodies. If a request policy affects reusable output, include it in checkpoint identity. Live testing uses your own test repository and secrets outside version control.

## Add an admin feature

Authenticate every server action and route. Resolve workspace membership server-side and include the workspace ID in every data query. Mutations require origin validation and the correct owner/admin role; a hidden button is not authorization. Cross-workspace administration requires the configured immutable operator ID. Keep secrets in server modules and out of `NEXT_PUBLIC_*` variables and client props. Add authorization regression tests for another workspace, insufficient roles, and forged input.

## Database changes

Add a new numbered SQL file; do not rewrite applied migrations. The migration script runs Better Auth migrations first and records application migrations. Use transactions and constraints for concurrency-sensitive changes. Back up before deployment and test on a disposable migrated database. There are no automatic down-migrations, so document compatibility and rollback requirements in the PR.

## Validation and review

Run typecheck, Vitest, Python scanner tests, and a production build. Integration tests need `TEST_DATABASE_URL` pointing at a disposable database. Include a minimal reproduction and what you verified in the PR. Document configuration changes in `.env.example`, Compose mappings, and the environment guide together. CI runs untrusted PR code without production secrets; never add `pull_request_target` execution of contributor code.
