# Codelean domain and GitHub setup

The product is **Codelean**, the repository is `luodaint/codelean.dev`, and the intended production origin is `https://codelean.dev`. Owning the domain does not deploy the app. Local development continues at `http://localhost:3100`.

## Production on the existing Dokploy server

1. Create a dedicated Codelean Compose service from the repository following [installation.md](installation.md). Use the existing Dokploy installation.
2. In its protected environment configuration, set `APP_URL=https://codelean.dev`, `APP_DOMAIN=codelean.dev`, and `DEV_AUTH_BYPASS=false`. Configure the allowed administrators and GitHub credentials before exposing the service.
3. Route `codelean.dev` to the **web** service on internal port **3000** using the supplied Dokploy override or Dokploy's Domains UI. Obtain a valid origin TLS certificate.
4. In Cloudflare DNS, create an `A` record named `@` pointing at the verified public IPv4 address of that Dokploy server. Add `AAAA` only if IPv6 is configured and reachable. Do not use the server's Tailscale/private IP.
5. Verify origin TLS, then use Cloudflare's proxy with **Full (strict)** SSL/TLS. If certificate issuance needs direct validation, complete that before proxying. Do not cache authenticated admin pages or `/api/*` responses with custom cache rules.
6. Verify `https://codelean.dev/api/health`, GitHub sign-in, and a designated test PR. Leave scanner and database private. The domain can remain without an origin record until the deployment is ready.

The example email sender is `Codelean <reviews@codelean.dev>`. It is only a placeholder until your SMTP provider verifies the sender/domain. Add only the exact SPF/DKIM records supplied by that provider. GitHub sign-in works without SMTP.

## GitHub App values

| Field     | Local testing                                                                   | Production                                      |
| --------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| App name  | Codelean (or Codelean Dev if unavailable)                                       | Codelean                                        |
| Homepage  | `https://codelean.dev`                                                          | `https://codelean.dev`                          |
| Callback  | `http://localhost:3100/api/auth/callback/github`                                | `https://codelean.dev/api/auth/callback/github` |
| Webhook   | `https://hooks-dev.codelean.dev/api/webhooks/github` once the tunnel is running | `https://codelean.dev/api/webhooks/github`      |
| Setup URL | Optional: `http://localhost:3100/repositories`                                  | Optional: `https://codelean.dev/repositories`   |

Keep user authorization during installation unchecked; Better Auth initiates login with browser-bound state. Follow the exact permissions in [installation.md](installation.md#4-register-the-github-app). The displayed App name may differ from its URL slug: copy the actual slug into `GITHUB_APP_SLUG`.

A GitHub App has one active webhook destination. For concurrent local and production reviews, use separate development and production GitHub Apps with independent credentials, webhook secrets, and selected repositories. Choose **Any account** if installing a personally owned App into the `luodaint` organization; **Only on this account** limits installation to its owner. Repository visibility and App installation visibility are separate settings.

## Quick Tunnel for local PR events

Install `cloudflared` using `brew install cloudflared` on macOS or [Cloudflare's official downloads](https://developers.cloudflare.com/tunnel/downloads/) on another platform. With Next.js running on port 3100, start these in separate terminals:

```sh
npm run webhook:proxy
```

```sh
cloudflared tunnel --url http://127.0.0.1:3101 --no-autoupdate
```

Copy the generated `https://…trycloudflare.com` origin and append `/api/webhooks/github` for the GitHub App's webhook URL. Enable the webhook and enter the same `GITHUB_WEBHOOK_SECRET` as your local `.env`. Keep the callback URL and `APP_URL` on localhost. The proxy permits only `POST /api/webhooks/github`, caps request bodies at 2 MB, and passes the original payload bytes and GitHub signature headers to the app. Other paths/methods return 404. Do not point the tunnel directly at the Next.js port.

The Quick Tunnel uses a temporary Cloudflare hostname and does not change `codelean.dev` DNS. Restarting it generates a new URL: update the App webhook each time. Keep the app, proxy, tunnel and worker running during PR testing; stop the proxy and tunnel with Ctrl+C afterwards. If local ports differ, set `LOCAL_APP_PORT` and/or `WEBHOOK_PROXY_PORT` for the proxy and adjust the tunnel target to match.

Before trusting the setup, check that the public `/login` and `/api/auth/sign-in/email-otp` return 404 and that an unsigned POST to the webhook with a valid `x-github-delivery` header returns 401. A signed GitHub delivery must return 200. See [Cloudflare's Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/#quick-tunnels-development).

## Optional named tunnel for a stable development hostname

This forwards only the webhook path. Login and the admin remain on localhost, including when the local numeric-code bypass is enabled. Do not tunnel the whole development server.

Install `cloudflared` from [Cloudflare's official distribution](https://developers.cloudflare.com/tunnel/downloads/). On macOS with Homebrew:

```sh
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create codelean-dev
```

Authorize the `codelean.dev` zone. Keep the generated credentials outside the repository. Create a separate `~/.cloudflared/codelean-dev.yml`, replacing both placeholders with the actual UUID and absolute credentials path:

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /ABSOLUTE/PATH/.cloudflared/YOUR_TUNNEL_UUID.json
ingress:
  - hostname: hooks-dev.codelean.dev
    path: ^/api/webhooks/github$
    service: http://127.0.0.1:3100
  - service: http_status:404
```

Validate before creating the public route:

```sh
cloudflared tunnel --config ~/.cloudflared/codelean-dev.yml ingress validate
cloudflared tunnel --config ~/.cloudflared/codelean-dev.yml ingress rule https://hooks-dev.codelean.dev/api/webhooks/github
cloudflared tunnel --config ~/.cloudflared/codelean-dev.yml ingress rule https://hooks-dev.codelean.dev/login
```

The webhook must match the first rule; `/login` must match the final 404 rule. Then:

```sh
cloudflared tunnel route dns codelean-dev hooks-dev.codelean.dev
cloudflared tunnel --config ~/.cloudflared/codelean-dev.yml run codelean-dev
```

Keep the tunnel and local app running. Set the GitHub App webhook URL from the table, activate deliveries, and configure the same `GITHUB_WEBHOOK_SECRET` on both sides. Verify `/login` returns 404 through the public hostname and an unsigned webhook is rejected; then use GitHub's delivery log to verify a signed event. Leave `APP_URL=http://localhost:3100`; review links are local during development. Stop the tunnel to stop forwarding.

See Cloudflare's [tunnel creation guide](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/) and [ingress configuration reference](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/).

## Existing installations

Fresh installs use the Compose project, images, database and role named `codelean`. A rename must not silently switch an existing installation to an empty volume:

- Keep your previous Compose project name: substitute `-p luoda-pr-checker` (or `-p luoda-pr-checker-dev`) into the new documentation's commands if that was your original project. In Dokploy, preserve the service's existing project identity.
- Set `POSTGRES_USER=luoda` and `POSTGRES_DB=luoda` for volumes initialized by the old Compose bundle. Use your actual existing values for manually created databases. Preserve `POSTGRES_PASSWORD` and the host-run `DATABASE_URL`. The configurable role/database defaults affect only new installs; they do not migrate an existing database.
- Keep `BETTER_AUTH_SECRET` and provider credentials unchanged. Keep using the original checkout directory if an IDE, running process or deployment points to it; its folder name has no runtime effect.
- Use the existing role/database and Compose project when running backup commands. Take a backup before a deployment update; never remove the volume as part of the rebrand.
- GitHub publication recognizes the previous check name and comment markers. New output uses **Codelean review** and `codelean:*` labels; when labels are enabled, old status labels are removed from the reviewed PR. Update any external rules referencing the old check name. This release still produces advisory neutral checks.

The rebrand does not change the single-workspace access model or add billing/multi-tenancy.
