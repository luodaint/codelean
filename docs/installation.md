# Installation and operations

This source-built v0.1 bundle contains the app, worker, scanner and PostgreSQL. It has been exercised locally with Docker Compose. A real Dokploy deployment, GitHub sign-in and GitHub/NaN review require your credentials and test repository.

## 1. Choose the installation mode

Use your existing Dokploy host for the pilot. Inventory available memory/disk and current application health; do not reinstall Dokploy or change its firewall/Swarm configuration to add this app. The configured memory caps total about 3.5 GiB across running services, with extra headroom needed for the host and image builds. Runtime caps are ceilings, not a capacity guarantee.

For a fresh Hetzner server, follow [server-bootstrap.txt](server-bootstrap.txt). It covers verified SSH access, firewall/recovery precautions, Dokploy setup and handover. It is an operator/agent brief, not an unattended root installer. Read current [Dokploy installation instructions](https://docs.dokploy.com/docs/core/installation) for supported platforms and [Docker firewall guidance](https://docs.docker.com/engine/network/packet-filtering-firewalls/) before changing host networking.

## 2. Prepare configuration

Clone `git@github.com:luodaint/codelean.git` with an authorized GitHub account, or use a reviewed source archive. No public container registry is assumed. See [domain setup](domain-setup.md) for Cloudflare and exact Codelean URLs. Use Node.js 22+:

```sh
npm ci
npm run setup
chmod 600 .env
```

Setup creates `.env` with random secrets and refuses to overwrite an existing file. Keep it outside version control and protect it in backups. You can also configure variables in Dokploy's protected environment editor without a server-side Node installation; generate independent 32-byte random secrets there/with your password manager and use `.env.example` as the field reference. Do not paste private credentials into an agent conversation.

| Variable                                   | Configuration                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `APP_URL`                                  | Canonical public origin, e.g. `https://codelean.dev`; no trailing slash                 |
| `APP_DOMAIN`                               | Same hostname without scheme, for the supplied Traefik override                         |
| `SIGNUP_MODE`                              | `open` (default) for self-service GitHub signup; `restricted` for a private pilot       |
| `ADMIN_EMAILS`                             | Optional restricted-mode allowlist; also used once to migrate existing workspace owners |
| `BETTER_AUTH_SECRET`                       | Generated random secret, at least 32 characters                                         |
| `DEV_AUTH_BYPASS`                          | `false` on servers; Compose forces this value                                           |
| `SMTP_HOST`, `SMTP_PORT`                   | Your SMTP server; usually port 587                                                      |
| `SMTP_SECURE`                              | `true` for implicit TLS, usually 465; `false` uses mandatory STARTTLS                   |
| `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | SMTP credentials and verified sender; use an application credential                     |
| `POSTGRES_PASSWORD`                        | Generated database password; use hex/alphanumeric or URL-encode a custom password       |
| `DATABASE_URL`                             | Used by host-run Node commands; Compose constructs its own internal URL                 |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub App user authorization credentials for sign-in; Client ID differs from App ID    |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`         | Dedicated GitHub App numeric ID and URL slug                                            |
| `GITHUB_PRIVATE_KEY_BASE64`                | Base64-encoded PEM key in one line; still a secret                                      |
| `GITHUB_WEBHOOK_SECRET`                    | Same generated value configured in GitHub                                               |
| `NAN_BASE_URL`                             | `https://api.nan.builders/v1`, or an explicitly trusted HTTPS-compatible provider       |
| `NAN_API_KEY`, `NAN_MODEL`                 | Provider credential and exact model ID from your account                                |
| `SCANNER_TOKEN`                            | Generated shared scanner credential; Compose supplies the private scanner URL           |

For a PEM key, encode it locally and copy through a secure channel; avoid logging the output in automation. The application never requests your personal GitHub access token. The configured NaN model must support chat completions and returning JSON. [NaN documents its API](https://nan.builders/docs); the app validates JSON itself and does not depend on a provider-specific structured-output flag.

## 3. Deploy with Dokploy

Create a dedicated project/environment and **Docker Compose** service using this source checkout. Set the Compose command to use both files:

```sh
docker compose -p codelean -f compose.yml -f compose.dokploy.yml up -d --build
```

In Dokploy, configure the equivalent Compose file/command through its service settings and environment editor; let Dokploy own subsequent deploys. The override assumes the existing `dokploy-network`, `websecure` entrypoint and `letsencrypt` resolver. Match those names to your installation. For multiple instances, use a unique Compose project and Traefik router/service label prefix. See [Dokploy Compose documentation](https://docs.dokploy.com/docs/core/docker-compose).

Alternatively, select only `compose.yml` and use Dokploy's Domains UI to route the web service's internal port **3000**, attaching that service to the proxy network through Dokploy. Choose one routing approach to avoid duplicate/conflicting routers. Do not expose PostgreSQL, worker or scanner ports, and do not use `compose.dev.yml` on a server.

The initial deployment builds local images, starts PostgreSQL, runs application and Better Auth migrations, then starts web/worker/scanner. No Docker socket or privileged container is required. Image builds can be resource-intensive; schedule the first build when the shared host has headroom.

For a production-mode smoke test on a local machine only:

```sh
docker compose -p codelean-smoke -f compose.yml -f compose.local.yml up -d --build
```

This exposes web on loopback port 3100. It still requires GitHub sign-in or real SMTP sign-in. For local numeric bypass development, use the README's host-run Next.js flow instead.

## 4. Register the GitHub App

Create a dedicated GitHub App for this Codelean instance under your account or organization:

- Homepage/setup URL: your app origin (setup can point to `/repositories`). Add user authorization **Callback URL** `https://YOUR_HOST/api/auth/callback/github`. Leave **Request user authorization (OAuth) during installation** unchecked; sign in through Codelean first.
- Webhook URL: `https://YOUR_HOST/api/webhooks/github`; active, with the configured webhook secret.
- Repository permissions: **Contents: Read**, **Pull requests: Read and write**, **Checks: Read and write**. Add **Issues: Read and write** if labels will be enabled. Metadata read access is inherent.
- Organization permissions: **Members: Read-only**, to verify that the connecting user owns the organization. Existing organization installations must approve this permission update before syncing.
- Account permissions: **Email addresses: Read-only**, for verified sign-in identity. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from this same App.
- Subscribe to **Pull request** events. Installation and repository installation changes are also handled.
- Install on selected test repositories. Put the app ID, slug and private key in configuration and redeploy.

Choose **Any account** under installation availability so other personal accounts and organizations can install the same App. Sign in with GitHub using a verified email and create a company workspace. Optional SMTP configuration enables email-code fallback. In Repositories, install the App if needed, select its installation, click **Sync repositories**, then explicitly enable the desired repository. You must be the personal account owner or an active GitHub organization owner, and a Codelean workspace owner/admin. The installation can belong to only one workspace. New repositories start paused. Enabling labels is optional. A new/update PR event after enabling queues a run; existing PRs are not bulk-imported.

The permissions support the [GitHub checks](https://docs.github.com/en/rest/checks/runs) and [reviews](https://docs.github.com/en/rest/pulls/reviews) APIs. Never enable auto-approval based on this release: it publishes advisory COMMENT reviews only.

## 5. Verify before normal use

1. Confirm `/api/health` returns 200 over HTTPS and the login page is accessible. This checks web/database readiness, not external credentials.
2. Sign in with GitHub and confirm your profile appears in Settings. An unverified email must fail. In open mode, a new verified user must be able to create a workspace but must not see another company’s data. In restricted mode, a non-allowlisted email must fail. If email fallback is configured, a wrong code must fail. Confirm the numeric bypass is off and PostgreSQL/scanner are unreachable externally.
3. Confirm the dashboard worker status is online and scanner container health is healthy. Review only scoped logs; avoid dumping environments.
4. Open a designated PR with a small known issue. Verify delivery response, queued/running/completed stages, check progress, findings and comments. Push another commit during review and check stale publication is stopped.
5. Exercise a provider failure and manual retry; incomplete work must never appear as a clean approval. Review the comment volume and findings quality before enabling more repositories.
6. Recheck existing applications, capacity and disk space after deployment.

The local test suite mocks SMTP and external API responses; these live checks remain necessary. If a provider/scanner fails, the run records a generic failure without storing potentially sensitive response bodies. Check configuration and service health, then retry the run from its detail page. After publication has started, retries reconcile existing bot output.

## 6. Back up and restore

Back up PostgreSQL and the protected deployment configuration/keys to an encrypted off-host destination. Findings contain private code excerpts. A copied live volume is not a consistent database backup. Run these from the deployment directory with the same project name/env; commands below use only the base Compose file for database access:

```sh
umask 077
docker compose -p codelean exec -T postgres pg_dump -U codelean -d codelean -Fc > codelean-backup.dump
```

Keep, for example, seven daily and four weekly encrypted backups, with a retention choice appropriate to your repositories. Verify a restore in a **new database** first (the target name must not already exist):

```sh
docker compose -p codelean exec -T postgres createdb -U codelean codelean_restore_check
docker compose -p codelean exec -T postgres pg_restore -U codelean -d codelean_restore_check --no-owner --exit-on-error < codelean-backup.dump
docker compose -p codelean exec -T postgres psql -U codelean -d codelean_restore_check -c 'SELECT count(*) FROM runs;'
```

For disaster recovery, provision a separate instance/database, restore into it, recover matching configuration, validate with outgoing worker activity disabled, then switch routing/webhook ownership deliberately. Do not run two workers on separate restored databases against the same GitHub App during recovery. Never overwrite a live database as a backup test.

Rotate GitHub/NaN/SMTP/scanner credentials when required, updating both ends where applicable. Changing the PostgreSQL environment password alone does not change an initialized database role's password; coordinate a database credential change and application URL update. Keep `BETTER_AUTH_SECRET` stable across ordinary deploys.

## 7. Upgrade, rollback and maintenance

For installations created before the Codelean rename, follow the [rename compatibility notes](domain-setup.md#existing-installations) before changing any Compose command.

Record the source revision and local image IDs for each deployment. Pause enabled repositories, allow the worker to finish, and take a consistent backup before schema-changing upgrades. Build the new version and deploy through Dokploy; its one-shot migration service must complete before web/worker start. Check release migration compatibility, health and one test PR, then re-enable repositories.

There are no down-migrations in v0.1. If a schema change is incompatible, image rollback alone is insufficient: restore the matching backup into a separate target and account for intervening writes before cutover. Keep the prior source and images until the upgrade is verified.

Monitor failed runs, worker heartbeat, database/disk usage and scanner health. There is no automatic run/delivery retention cleanup yet; set a retention policy before sustained use and implement scoped cleanup against it. Configure Docker log rotation at the platform/service level. Never run global Docker prune or `down -v` as routine maintenance; the named PostgreSQL volume contains your state.

## Workspace upgrades and recovery

Before upgrading the original single-workspace version, stop web/worker, back up PostgreSQL, and retain the prior `ADMIN_EMAILS` value while running `npm run migrate`. Better Auth schema changes run first, followed by application migrations. Migration 002 preserves repository/run IDs in **Original workspace** and grants ownership only to matching users already in the database. Afterward, `SIGNUP_MODE=open` allows public signup without that list. Existing users choose their workspace after signing in.

If the old list is empty or contains no existing users, the historical workspace stays inaccessible. A trusted database operator must explicitly assign an existing verified user; it is never claimed automatically by the next visitor. In a protected database session, substitute the intended verified user's email in this statement, review the returned user ID, and confirm it is the correct account:

```sql
INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
SELECT gen_random_uuid()::text, 'codelean-legacy', id, 'owner', now()
FROM "user" WHERE lower(email)=lower('YOUR_VERIFIED_EMAIL') AND "emailVerified"=true
ON CONFLICT ("organizationId", "userId") DO NOTHING
RETURNING "userId", "organizationId", role;
```

For a fresh installation, leave that empty legacy workspace alone and create your company from the UI. See [workspace onboarding](../README.md#company-workspaces) for roles and invitations. Billing, company budgets, installation transfers and company deletion are not included in this release.
