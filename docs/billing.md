# Billing setup and operations

Implemented on `codex/creem-metered-billing`. One public plan: **$10/workspace/month, 20M tokens included, $0.50/M additional tokens**. Owners can purchase **10M tokens for $5**. Prices exclude applicable taxes. There is no public free plan or trial.

The code and PostgreSQL integration tests are ready for review. No remote Creem products, checkouts or charges have been created by this implementation task. Real checkout, renewal invoice and cancellation settlement verification require a Creem test API key and store support for native postpaid settlement.

## Customer behavior

- `/billing` shows subscription state, included usage, purchased balance, estimated overage and active reservations. Workspace owners manage billing; teammates can read it.
- Included tokens are used first, then purchased tokens, then postpaid usage. Included tokens reset only after a confirmed paid renewal. Purchased tokens never expire or transfer between workspaces.
- The optional extra-usage cap is **unset by default**. Blank permits uncapped overage; `$0` stops before new usage would exceed included and purchased tokens. The cap excludes subscription fees, manual purchases and taxes. Reducing a cap cannot undo work already authorized or charges already incurred.
- Every model call reserves a conservative upper bound before inference. Reservations include concurrent requests in all phases. A review can pause slightly before a cap because the remaining balance must cover its maximum possible next request. Add tokens or raise the cap, then retry.
- Failed analysis attempts are absorbed by the service. A completed analysis is charged once per revision, even if publishing to GitHub needs retries. Unknown/invalid provider usage is never estimated into a customer charge. Provider quota accounting still retains failed and unknown calls.
- Cancellation is scheduled for period end. Paid-through included and purchased tokens remain usable. An immediately canceled subscription cannot accumulate new metered usage. After the paid period ends, a subscription or private complimentary grant is required; purchased balances remain for reactivation.
- Existing results remain readable without payment. Before deployment, queued unpaid work will pause; historical runs are never retroactively billed.

## Owner and super admin

The verified GitHub identity for `mllopart` is numeric ID `1257083`. Authorization uses this immutable ID from authenticated server-side records, not an email allowlist or mutable username. Its owned workspaces are permanently exempt from subscription and usage billing. The normal checkout action refuses complimentary workspaces.

Sign in with that GitHub identity to use `/super-admin`. Search by workspace, owner email or GitHub username; grant or revoke complimentary workspace access, set an optional expiry, adjust service limits, pause reviews and inspect billing health. A workspace grant includes all teammates. Every change needs a reason and writes an audit record. The permanent owner exemption cannot be revoked. Workspaces owned by the verified service owner also bypass the enabled-repository cap; ordinary paid and complimentary workspaces keep their configured cap. Other resource and safety limits still apply.

Granting complimentary access to a paid workspace waits for running reviews and pending usage/checkouts to be resolved, then cancels the Creem subscription immediately and confirms cancellation before recording the grant. The cancellation intent and a billing hold are committed before contacting Creem; provider calls run without holding database locks. If a response or final database commit fails, repeat the grant or run `billing:reconcile` to finish the original intent. Other billing changes remain blocked until it is resolved. Existing charges are not automatically refunded. Revoking or expiring a grant never automatically reactivates paid billing; the customer must subscribe again. Do not transfer ownership of an already paid workspace to the protected owner without first canceling its existing subscription through this grant flow.

## Protected identity recovery

Protect the owner GitHub account with phishing-resistant MFA/passkeys and offline recovery codes. The permanent exemption is intentionally not revocable through the product console. After compromise, restrict service ingress, revoke affected Codelean sessions and GitHub App tokens, recover the GitHub account, and rotate deployment credentials that could have been exposed. If ownership must transfer, verify the replacement account’s immutable numeric GitHub ID through GitHub, change `ownerGitHubId` in `src/lib/billing-policy.ts` in a reviewed deployment, update identity tests, and restart web and worker. Revoke old sessions before reopening ingress. This removes the old identity’s operator access and automatic exemption; separately review any manually granted workspace exemptions. Never authorize a replacement by username alone.

## Creem configuration

1. Apply migrations with `npm run migrate`. Migration `003_billing.sql` adds billing accounts, paid periods, model usage/reservations, durable payment intents, usage outbox, webhook receipts and an audit log. Use a database backup for normal production migration procedures. The token-column conversion in migration 003 takes an exclusive table lock and may rewrite existing rows: stop web/worker writers and schedule a maintenance window for an established database. Migrations 004–006 add resumable checkpoints, automatic cleanup, billing indexes and recovery state.
2. Set `CREEM_TEST_MODE=true` and a test `CREEM_API_KEY` in the deployment's secret environment. Run `npm run billing:setup` to inspect the proposed configuration without network changes. Run `npm run billing:setup -- --apply` to create test products and the meter. IDs are persisted incrementally in ignored `artifacts/creem-test-products.json`; keep that file for subsequent setup runs. If a create request loses its response, inspect the provider dashboard before repeating it.
3. Configure the returned `CREEM_PLAN_PRODUCT_ID`, `CREEM_TOKEN_PRODUCT_ID` and `CREEM_METER_ID` in both web and worker. Add `CREEM_WEBHOOK_SECRET`; configure Creem to deliver subscription lifecycle, `checkout.completed`, `refund.created` and `dispute.created` events to `https://YOUR_HOST/api/webhooks/creem`. `APP_URL` controls return URLs and mutation-origin validation. Use separate test/live secrets and product IDs.
4. Keep `BILLING_ENABLED=true` (default). Missing Creem configuration blocks checkout and unpaid reviews; it does not grant public free access. `BILLING_ENABLED=false` is an explicit local testing/rollout override and disables usage instrumentation and enforcement, so do not use it during paid operation.
5. Set `BILLING_PROVIDER_TOKEN_BUDGET=3000000000` and `BILLING_PROVIDER_PERIOD_START` to the provider's actual quota reset timestamp. Blank uses the current UTC calendar month. This is a shared cap, including owner, complimentary and failed usage. Reduce it if other applications use the same provider allocation; Codelean cannot observe their calls. An uncapped workspace can consume the shared pool. Monitor it in Super admin and set workspace spending caps or lower hourly limits where appropriate; customer caps remain unset by default. When the shared pool is exhausted, new model calls pause for every workspace, including the owner and complimentary workspaces, until capacity is restored.
6. Verify in Creem test mode: paid checkout and access, a duplicate webhook, 20M included plus 1M excess producing exactly **$0.50**, a $5 pack with tax fulfilled once, renewal without duplicate allowance, cancellation/final settlement and a complimentary grant. Confirm the real renewal invoice combines/collects the base and postpaid amounts as expected. Local mocks do not establish account-specific availability or invoice behavior.
7. For production, obtain a live key and use `CREEM_TEST_MODE=false npm run billing:setup -- --apply --live`, then configure the resulting live IDs and live webhook secret. The implementation does not silently fall back to prepaid-only collection if postpaid is unavailable.

The [product API schema](https://docs.creem.io/api-reference/endpoint/create-product) documents `settlement_mode: "postpaid"` with store-specific availability. The plan uses USD `price: 1000`, `billing_period: "every-month"`, and one sum meter with `unit_price: 0.00005` **cents/token** and `free_allowance: 0`. Checkout validates the product configuration before creating a payment session.

The included allowance and purchased **token** balance are fulfilled in PostgreSQL. Only excess tokens go to Creem's meter. The $5 product is an ordinary one-time payment with no Creem monetary credit grant. This avoids mixing monetary credits with token quantities or granting the allowance twice. There is no auto-refill or second payment processor. See [Creem usage events](https://docs.creem.io/features/usage-based-billing), [API introduction](https://docs.creem.io/api-reference/introduction) and [getting started](https://docs.creem.io/getting-started/introduction).

## Reliability and reconciliation

Raw-body HMAC verification precedes webhook processing. A redirect never grants access. Checkout fulfillment binds the durable request ID, workspace customer, product, checkout and paid order; unique order/checkout keys prevent duplicate pack grants. Subscription events fetch current provider state so reordered delivery cannot reset an allowance. Payment intents survive ambiguous checkout failures; retrying does not create another payable session.

The review result, balance deduction and usage outbox event commit in one database transaction. The worker delivers excess usage with a stable `event_id` (`review-<run UUID>`). Network retries reuse that ID. Meter warnings about an unmatched/archived meter or an expired aggregation window require manual reconciliation; an accepted-but-unaggregated event must not be treated as successfully billed. Delayed metering pauses further paid inference until delivery recovers. Complimentary work never creates usage-charge events.

Run `npm run billing:reconcile` with the matching environment to refresh subscriptions, recover pending complimentary grants, reconcile completed or expired known checkout sessions and retry eligible outbox events. Expired checkouts are replaced only after Creem confirms expiry; their records remain for reconciliation. It exits nonzero and lists unresolved usage or checkout request IDs that need attention. The worker also flushes the outbox; no separate recurring job is required for ordinary delivery. Long worker downtime needs explicit reconciliation before resuming paid usage.

For ambiguous customer/session creation, find the customer in Creem by external ID `workspace_<SHA256 of organization ID>` or checkout by the stored request ID. Verify its product and customer before restoring the corresponding `customer_id` or `checkout_id`/`checkout_url` in the database. Run reconciliation after restoring a completed checkout. If the provider definitively confirms no session exists (or it is permanently expired), document that finding in an audit record before removing the unresolved intent and clearing its hold. Never delete a possibly payable session to enable a second subscription.

Refunds/disputes put the account on hold rather than silently restoring credits from a delayed checkout webhook. Reconcile the actual paid order, consumed tokens and any outstanding invoice with Creem, adjust/revoke the balance in an audited database transaction if necessary, then use the operator console to clear the hold. Partially consumed pack refunds and ambiguous provider transactions intentionally require operator handling in this small-project release. Never clear a meter hold by issuing a new event ID without establishing whether the original event was aggregated and billed.

Default resource controls are 10 enabled repositories, 6 review starts/hour, 10 queued runs/workspace, a 60-second webhook delay, least-recently-served workspace scheduling and the shared provider token budget. The worker rechecks the authoritative PR revision; obsolete revisions do not invoke the model. Existing source-size, scanner and inference timeouts remain enforced. Burst buckets, automatic queue coalescing, automated retention, email usage alerts and separate owner quota reserves remain outside this implementation.

## Local validation

Use a disposable PostgreSQL database, apply all migrations, then run:

```sh
TEST_DATABASE_URL=postgresql://... npm test
npm run typecheck
npm run build
python3 -m unittest discover -s scanner -p 'test_*.py'
```

Billing tests explicitly enable enforcement and cover caps with concurrent reservations, exact allowance/prepaid allocation, failed/unknown usage, duplicate fulfillment including tax, stale renewals, cancellation, ambiguous checkout recovery, authenticated owner/operator boundaries, free grants and usage-delivery failures. Provider calls in these tests are mocked; live credentials and invoice verification remain separate deployment steps.
