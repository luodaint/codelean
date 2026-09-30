# luoda-pr-checker

A self-hosted GitHub PR reviewer with a Next.js admin, PostgreSQL queue, Semgrep/Gitleaks static checks, and AI review through NaN. Designed for a small Dokploy installation on Hetzner.

**v0.1 proof of concept.** The app and Docker deployment run locally. Connecting a real GitHub App, SMTP account and NaN key is required for live reviews. No hosted service or public image registry is assumed.

## What works

- Better Auth email-code sign-in, an explicit administrator email allowlist, and PostgreSQL sessions. Local development can accept any numeric code.
- GitHub App repository discovery, enable/pause controls, signed PR webhooks and durable jobs.
- Bounded source snapshots at an exact commit, static checks, secret redaction, and validated AI findings.
- GitHub check progress, an updated summary comment, up to five inline AI comments, and optional status labels.
- Run history, findings, retry controls, worker status and usage statistics.
- Source-built Docker images, Compose/Dokploy configuration, migrations, health checks, and installation/backup instructions.

Reviews are **advisory**: no auto-approval, requests for changes, merges, dependency installation, or execution of repository test suites in this version. Those need their own policies and a stronger execution sandbox. Existing CI results are not yet aggregated.

## Quick start

Requires Node.js 22+ with npm and a running Docker engine with Compose v2 (for example, Docker Desktop or OrbStack on macOS). Python 3 is only needed to run the scanner unit tests on the host. Run from this directory:

```sh
npm ci
npm run setup
```

Edit these values in the new `.env`:

```dotenv
APP_URL=http://localhost:3100
ADMIN_EMAILS=you@example.com
DEV_AUTH_BYPASS=true
```

Replace the example email with yours. Setup generates credentials and the local database URL; keep those generated values. If `.env` already exists, skip `npm run setup` and update that file instead. SMTP, GitHub and NaN credentials can remain empty while exploring the admin locally.

```sh
docker compose -p luoda-pr-checker-dev -f compose.yml -f compose.dev.yml up -d --build --wait postgres scanner
npm run migrate
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Open [localhost:3100](http://localhost:3100), enter an allowed email, request a code, then enter any number. No mail is sent in this mode. The bypass requires `next dev` and a loopback `APP_URL`; Docker production deployments force it off.

The development override publishes dependencies only on loopback and permits network egress for host access. Production uses internal networks; never deploy with `compose.dev.yml` on a server.

In another terminal in the same directory, start the worker:

```sh
npm run worker
```

The worker can start without provider credentials and will show as online in the dashboard. Processing actual reviews requires the GitHub and NaN configuration described in the [installation guide](docs/installation.md). Live webhooks require a reachable HTTPS URL; use a dedicated test installation with real email authentication for internet-accessible testing.

### Check, stop and restart locally

```sh
curl --fail http://localhost:3100/api/health
curl --fail http://localhost:18080/health
docker compose -p luoda-pr-checker-dev -f compose.yml -f compose.dev.yml ps
```

Both health endpoints should return `{"status":"ready"}`. GitHub and NaN configuration is checked when used, not by these health endpoints.

Stop Next.js and the worker with `Ctrl+C` in their terminals, then stop Docker dependencies:

```sh
docker compose -p luoda-pr-checker-dev -f compose.yml -f compose.dev.yml stop
```

To resume, repeat the Compose `up` command, `npm run migrate`, and the web/worker commands above. PostgreSQL data persists in a named Docker volume. Do not use `down -v` unless you intend to delete that local database. Restart the worker after changing `.env`.

### Local troubleshooting

- **Port already in use:** the defaults are web `3100`, PostgreSQL `55439` and scanner `18080`. Stop your previous development instance, or set `DEV_DATABASE_PORT`/`DEV_SCANNER_PORT` in `.env` and update `DATABASE_URL`/`SCANNER_URL` to match. A different web port also needs a matching `APP_URL` and `--port` argument.
- **Database connection refused:** verify Docker is running and PostgreSQL is healthy before migrations. Check that `DATABASE_URL` matches the configured port and credentials. Changing `POSTGRES_PASSWORD` does not change the password inside an existing database volume.
- **Email not authorized:** the email must appear in `ADMIN_EMAILS`. Local numeric sign-in still requires requesting a code first; no actual email is sent.
- **Local code rejected:** run `npm run dev`, use a loopback `APP_URL`, and set `DEV_AUTH_BYPASS=true`. A production build or Compose web container intentionally requires the real emailed code.
- **Worker offline:** run `npm run worker` in a second terminal. Only one worker can hold the database lock; stop an older worker before starting another.
- **Scanner still starting:** the first image build downloads the scanner dependencies and can take several minutes. Check its scoped logs with `docker compose -p luoda-pr-checker-dev -f compose.yml -f compose.dev.yml logs --tail 50 scanner`.

## Deployment and operation

- [Installation, configuration, GitHub setup, backups and upgrades](docs/installation.md)
- [Standalone Codex/Claude server preparation brief](docs/server-bootstrap.txt)
- [Architecture and current boundaries](docs/architecture.md)

Use the existing Dokploy host first, with one review at a time. No cluster is needed. The scanner has a 2 GiB memory cap; assess headroom alongside existing applications before deployment.

## Architecture

```mermaid
flowchart LR
  GH[GitHub App webhook] --> WEB[Next.js admin and API]
  WEB --> DB[(PostgreSQL jobs and history)]
  DB --> WORK[Node worker — concurrency 1]
  WORK --> SCAN[Private static scanner service]
  SCAN --> WORK
  WORK --> NAN[NaN model API]
  NAN --> WORK
  WORK --> PUB[Validate and publish]
  PUB --> GH
  PUB --> DB
```

PostgreSQL also provides the queue and worker lock, so Redis is unnecessary for this milestone. Scanners run in a non-root, restricted container with a private network, fixed commands and temporary source directories. They receive no GitHub or NaN credentials. This is process/container isolation on a shared kernel, not a VM sandbox or a disposable container for every run.

## Validation

```sh
npm run typecheck
npm test
python3 -m unittest discover -s scanner -p 'test_*.py'
npm run build
```

The database/auth/publication suites run only with `TEST_DATABASE_URL` set to a **disposable, migrated database**. They create and delete fixtures. CI provisions its own PostgreSQL instance. Real SMTP delivery and GitHub/NaN round trips need operator credentials and a designated test PR.
