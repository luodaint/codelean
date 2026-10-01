# Local development and workspace onboarding

## Quick start

Requires Node.js 22+ with npm and a running Docker engine with Compose v2 (for example, Docker Desktop or OrbStack on macOS). Python 3 is only needed to run the scanner unit tests on the host. Clone the repository, then run:

```sh
git clone https://github.com/luodaint/codelean.git
cd codelean
npm ci
npm run setup
```

Edit these values in the new `.env`:

```dotenv
APP_URL=http://localhost:3100
SIGNUP_MODE=open
DEV_AUTH_BYPASS=true
BILLING_ENABLED=false
```

Setup generates credentials and the local database URL; keep those generated values. If `.env` already exists, skip `npm run setup` and update that file instead. SMTP, GitHub and LLM provider credentials can remain empty while exploring the admin locally.

```sh
docker compose -p codelean-dev -f compose.yml -f compose.dev.yml up -d --build --wait postgres scanner
npm run migrate
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Open [localhost:3100](http://localhost:3100), enter any email, request a code, then enter any number. No mail is sent in this mode. Create a company workspace on the next screen. The bypass requires `next dev` and a loopback `APP_URL`; Docker production deployments force it off.

The development override publishes dependencies only on loopback and permits network egress for host access. Production uses internal networks; never deploy with `compose.dev.yml` on a server.

In another terminal in the same directory, start the worker:

```sh
npm run worker
```

The worker can start without provider credentials and will show as online in the dashboard. Processing actual reviews requires the GitHub and LLM provider configuration described in the [installation guide](installation.md). Live webhooks require a reachable HTTPS URL; use a dedicated test installation with real email authentication for internet-accessible testing.

### Enable GitHub sign-in on localhost

You can use the **same GitHub App** for login and PR review; no separate OAuth App is needed. Login works on localhost without a public webhook or tunnel.

1. Open [New GitHub App](https://github.com/settings/apps/new), enter a unique name and set **Homepage URL** to `https://codelean.dev` (or your own instance URL).
2. Set **Callback URL** to `http://localhost:3100/api/auth/callback/github`. Leave **Request user authorization (OAuth) during installation** unchecked: Codelean starts the flow with browser-bound state.
3. For login-only testing, uncheck **Webhook → Active**. Under **Account permissions**, set **Email addresses → Read-only**.
4. Select **Only on this account** for a personal test, then create the App. Choose **Any account** when you need installation on other personal accounts or organizations.
5. Copy the **Client ID** (different from the numeric App ID), generate a **Client secret**, and put both in `.env`:

```dotenv
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SIGNUP_MODE=open
```

6. Run `npm run migrate` to add the GitHub profile fields, restart the Next.js dev server, sign out if necessary, and click **Continue with GitHub**. SMTP is not required. For production, use your HTTPS origin in both `APP_URL` and the callback URL.

GitHub must return a verified email. With the default `SIGNUP_MODE=open`, anyone can sign up; no personal email allowlist is needed. A verified matching email-code account is linked to the GitHub identity. Profile name, username, numeric GitHub ID and avatar are saved; OAuth tokens are encrypted server-side. Browser state and PKCE are handled by Better Auth.

After login, create a company workspace or accept an invitation. Signing in does **not** install the GitHub App or grant access to another company. For PR review permissions, private key and webhook setup, follow [the installation guide](installation.md#4-register-the-github-app). GitHub cannot send webhooks directly to localhost; PR-event testing needs a reachable webhook forwarder or a test deployment. Never expose the development login bypass publicly.

If GitHub reports an email/authorization error, verify the App's **Email addresses** permission and that your GitHub account has a verified email. In optional restricted mode, also check `ADMIN_EMAILS`. If GitHub reports a redirect mismatch, check the exact callback origin, port and path. See [Better Auth's GitHub setup](https://better-auth.com/docs/authentication/github) and [GitHub's sign-in guide](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app).

### Company workspaces

1. Sign in with GitHub and create a workspace; you become its owner. Use the sidebar workspace link to switch companies or create another workspace.
2. In **Repositories**, install the same GitHub App, select its installation, sync, and enable the desired repositories. For other customers, the GitHub App must allow **Any account** to install it.
3. Connecting a personal installation requires its GitHub account owner. Connecting an organization installation requires an active GitHub organization owner, plus owner/admin access in Codelean. Each installation belongs to exactly one workspace. Organization connections require the App’s **Organization permissions → Members: Read-only** permission; existing installations must approve updates to this permission.
4. In **Settings**, invite a teammate using their verified sign-in email. They see the invitation on **Workspaces** after login. Invitations are currently in-app; no invitation email is sent. Owners/admins manage repositories, retries, and members; members can view reviews and statistics.

One person can belong to several companies. The initial limits are 10 workspace creations per user and 100 members per workspace. GitHub-connected identity is required to create a workspace in production; local numeric login can create them for testing. Optional email-code login lets invited teammates join, but cannot connect a GitHub installation until they sign in with GitHub.

`ADMIN_EMAILS` is only an optional signup gate when `SIGNUP_MODE=restricted`. It never grants cross-company access. When upgrading an existing private instance, keep the old allowlist during the first migration: existing matching users become owners of **Original workspace**, which retains all previous repositories and reviews. A later signup never inherits these records. If no matching user exists, follow the explicit recovery procedure in [the installation guide](installation.md#workspace-upgrades-and-recovery).

Workspaces provide application-level data isolation on shared infrastructure. Creem subscriptions, metered usage, optional spending caps and workspace scheduling are implemented; see [billing setup and operations](billing.md). Automatic retention is not implemented yet.

### Check, stop and restart locally

```sh
curl --fail http://localhost:3100/api/health
curl --fail http://localhost:18080/health
docker compose -p codelean-dev -f compose.yml -f compose.dev.yml ps
```

Both health endpoints should return `{"status":"ready"}`. GitHub and LLM provider configuration is checked when used, not by these health endpoints.

Stop Next.js and the worker with `Ctrl+C` in their terminals, then stop Docker dependencies:

```sh
docker compose -p codelean-dev -f compose.yml -f compose.dev.yml stop
```

To resume, repeat the Compose `up` command, `npm run migrate`, and the web/worker commands above. PostgreSQL data persists in a named Docker volume. Do not use `down -v` unless you intend to delete that local database. Restart the worker after changing `.env`.

### Local troubleshooting

- **Port already in use:** the defaults are web `3100`, PostgreSQL `55439` and scanner `18080`. Stop your previous development instance, or set `DEV_DATABASE_PORT`/`DEV_SCANNER_PORT` in `.env` and update `DATABASE_URL`/`SCANNER_URL` to match. A different web port also needs a matching `APP_URL` and `--port` argument.
- **Database connection refused:** verify Docker is running and PostgreSQL is healthy before migrations. Check that `DATABASE_URL` matches the configured port and credentials. Changing `POSTGRES_PASSWORD` does not change the password inside an existing database volume.
- **Email not authorized:** if `SIGNUP_MODE=restricted`, the email must appear in `ADMIN_EMAILS`; use `SIGNUP_MODE=open` for public signup. Local numeric sign-in still requires requesting a code first; no actual email is sent.
- **Local code rejected:** run `npm run dev`, use a loopback `APP_URL`, and set `DEV_AUTH_BYPASS=true`. A production build or Compose web container requires GitHub sign-in or a real emailed code.
- **Only your personal GitHub account appears:** in the GitHub App’s **Advanced** settings, check that it is public (installable by any account). Install the same App separately on each organization, then refresh installations and sync. Each organization must grant repository access; signing in alone does not grant it.
- **Worker offline:** run `npm run worker` in a second terminal. Only one worker can hold the database lock; stop an older worker before starting another.
- **Scanner still starting:** the first image build downloads the scanner dependencies and can take several minutes. Check its scoped logs with `docker compose -p codelean-dev -f compose.yml -f compose.dev.yml logs --tail 50 scanner`.
