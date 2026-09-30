# Codelean pricing and billing proposal

Prepared 30 September 2026. Status: **approved; implemented on `codex/creem-metered-billing`, pending Creem account configuration and sandbox acceptance**. See [implementation and operations](billing.md); the research below records the original proposal. Repository reviewed at `581cb35`. Prices below are USD unless stated otherwise; competitor annual prices are monthly equivalents with an annual commitment. Research uses official vendor pages accessed on this date.

**Recommendation: launch one $10/month plan per workspace, including 20 million review tokens, with additional usage at $0.50 per million tokens.** Offer a $5 purchase of 10 million additional tokens. Use Creem for all payments. No public free plan or automatic free trial. Permanently waive billing for workspaces owned by the verified `mllopart` identity, and let that identity grant complimentary access to selected other workspaces.

The intended default is metered overage enabled after disclosed customer acceptance, with **no customer spending cap configured**. A customer can set a cap, including $0 for no postpaid overage. The owner approved this default.

## Market evidence and lessons

| Product                                                          | Current published pricing                                                                                     | Billing strategy and lesson for Codelean                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CodeRabbit](https://www.coderabbit.ai/pricing)                  | Essentials $30/developer/month or $24 annually; Team $60 or $48 annually; Advanced displayed at $72 annually. | Seats plus feature packages and usage expansion. Essentials lists five PR reviews/developer/hour, subject to fair use. Eligible extra reviews cost $0.25 per reviewed file; admins select Automatic, On demand, or Off and a spending cap. The page now calls the former Pro plan Essentials. Codelean can offer a lower workspace entry price and a visibly measured allowance. |
| [Greptile](https://www.greptile.com/pricing)                     | Pro $30/seat/month, 50 credits/seat; extra credits $1 each.                                                   | Base/Plus/Apex reviews consume 1/3/10 credits. A free one-developer plan includes 50 credits. Separates subscription access from depth of review. Avoid copying its free tier or multiple effort packages for this launch.                                                                                                                                                       |
| [Qodo](https://www.qodo.ai/pricing/)                             | Pro Team starts at $30/month: 2,500 pooled credits, advertised as about 18 reviews. $0.012/credit.            | No permanent public free tier, but a 14-day trial. Overage uses the same credit rate with a customer-set cap; monthly credits expire. Supports up to 30 users. Its pooled usage is the closest match to a workspace subscription, although its credits are not comparable to our tokens.                                                                                         |
| [Cursor Bugbot](https://cursor.com/blog/may-2026-bugbot-changes) | Usage based; vendor-reported average $1–$1.50/run.                                                            | Announced May 11, 2026: removal of the old $40 seat fee, transitioning existing accounts at renewal after June 8. Individuals draw from included usage; Teams use on-demand spend. Shows that actual review workload is becoming a billing unit. The quoted average is not a fixed per-review price.                                                                             |
| [Graphite](https://www.graphite.com/pricing)                     | Starter $20/user/month annually; Team $40/user/month annually.                                                | Bundles review with a broader collaboration workflow. Limited AI on Starter; unlimited AI reviews advertised on Team. Its higher subscription funds more than a reviewer, so a feature-for-feature price comparison would mislead.                                                                                                                                               |
| [Sourcery](https://www.sourcery.ai/pricing)                      | Pro $15/developer/month or $12 annually; Team $30 or $24 annually.                                            | Assigned seats, feature differentiation, trial and free public repositories. Team adds nightly scans of 50 repositories and higher review limits. A relevant low-price hosted competitor; Codelean's workspace pricing matters more than claiming every rival costs $30+.                                                                                                        |
| [Kodus](https://kodus.io/pricing/)                               | Teams $10/developer/month or $8 annually, plus separately paid model tokens.                                  | BYOK shifts inference expense to the customer. Free Community also uses BYOK. This is an important budget substitute: Codelean should sell simple setup and included inference, rather than claim to be the cheapest tool in existence.                                                                                                                                          |

**My interpretation:** the useful pattern is a modest subscription, pooled included usage, and an understandable expansion rate. Pricing per workspace fits this app's existing ownership boundary. Charging for each teammate would create seat accounting and discourage invitations without accurately measuring inference demand.

For three developers, entry subscription fees alone are $90/month at CodeRabbit Essentials or Greptile Pro, $45 at Sourcery Pro, and $30 plus provider costs at Kodus Teams. Codelean would start at $10 for the workspace. These are price comparisons, not claims of equivalent coverage, quality, or included capacity. Free competitors remain attractive to individual developers; the paid offer should emphasize managed setup and useful reviews for small private projects.

Codelean currently performs bounded PR reviews, static checks and a separate security pass. It does not offer repository-wide architectural indexing, a merge queue, autonomous fixes or enterprise controls. Position it as a focused GitHub reviewer for indie projects and small teams. Do not advertise enterprise parity or an unlimited review service.

## The proposed offer

| Item               | Launch decision                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Public plans       | One: **Codelean — $10/workspace/month**                                                             |
| Billing unit       | One existing company workspace, shared by its members and repositories                              |
| Included usage     | 20,000,000 tokens per paid subscription period                                                      |
| Additional usage   | $0.50 per 1,000,000 tokens, proportional to actual measured usage                                   |
| Optional purchase  | $5 for 10,000,000 additional tokens; not another plan                                               |
| Features           | All current review features, including static checks and PR security review                         |
| Seats              | No per-seat charge; retain the existing 100-member technical ceiling                                |
| Repositories       | Propose 10 enabled repositories/workspace initially; connected but paused repositories do not count |
| Billing period     | Monthly anniversary period, using Creem's confirmed period boundaries                               |
| Included rollover  | None; refresh only after a verified successful renewal                                              |
| Purchased rollover | Remains available across renewals; no expiry at launch, no transfer between workspaces              |
| Public free access | None; sign-in/setup and old results may remain accessible without running reviews                   |
| Annual plan        | Defer until costs and retention are measured                                                        |
| Cancellation       | Stop renewal; retain access through the paid period, then pause new reviews                         |

An active paid subscription or a complimentary grant is required to run reviews. A token purchase alone does not replace the subscription. Purchased balances remain recorded after cancellation and usable on reactivation; communicate this before purchase.

The subscription allowance is used first, then purchased tokens, then postpaid overage. A token must never consume both a wallet balance and a postpaid charge. Complimentary access waives both subscription and usage charges; it is a private entitlement, not a second public tier.

At checkout, show the base price, allowance, overage rate and the selected cap together. Suggested copy:

> $10 per workspace per month includes 20 million review tokens. Additional usage is $0.50 per million. Your monthly extra-usage limit is currently not set. You can set one in Billing. Applicable taxes are shown at checkout.

For a prepaid implementation, replace the last billing explanation with the exact $5 top-up behavior. Do not describe automatic pack purchases as a month-end usage invoice.

## Economics and allowance sizing

The owner's stated $70 for 3 billion tokens implies **$0.02333 per million tokens at full utilization**. This is an allocation of a fixed expense, not a verified price for buying more capacity after the pool is exhausted.

[NaN's current page](https://nan.builders/) lists 3B DeepSeek V4-Flash tokens/month. New membership is €70/month including VAT; the FAQ says older USD subscriptions retain their original price. This is consistent with the owner's $70 figure, but the account invoice, configured model, quota reset and any consumption by other projects have not been inspected. Calculations use the user's $70 as supplied.

[Creem's standard published fee](https://www.creem.io/pricing) is 3.9% + $0.40 per successful transaction. A $10 transaction leaves about **$9.21** before hosting and other expenses. The following estimates exclude customer taxes, foreign exchange, refunds, disputes, support and payout-specific costs.

| Workspace usage/month | Subscription + metered charge | Inference allocation at full pool utilization |
| --------------------- | ----------------------------: | --------------------------------------------: |
| 5M tokens             |                           $10 |                                         $0.12 |
| 20M tokens            |                           $10 |                                         $0.47 |
| 50M tokens            |                           $25 |                                         $1.17 |
| 100M tokens           |                           $50 |                                         $2.33 |
| 500M tokens           |                          $250 |                                        $11.67 |

The last row is deliberately visible: this is inexpensive for small projects, but not a promise that heavy use remains $10. Token telemetry and a visible spend estimate are essential.

At 20M usage, the base subscription leaves $8.74 after the illustrative token allocation and payment fee. **Do not then subtract the entire $70 again** when calculating total business profit: choose either a fixed-pool cash model or an allocated-cost model.

For fixed monthly cash spending, with every customer paying only the base fee and total usage staying within the pool:

| Assumed extra monthly hosting/operations | Paying workspaces to cover $70 inference + that amount |
| ---------------------------------------- | -----------------------------------------------------: |
| $0                                       |                                                      8 |
| $20                                      |                                                     10 |
| $30                                      |                                                     11 |
| $50                                      |                                                     14 |

Formula: `ceil((70 + extra_fixed_costs) / 9.21)`. For example, 10 customers produce about $92.10 after subscription transaction fees, leaving $22.10 after inference and before hosting. This is a small-project cost recovery target, not a salary or profit forecast.

A $5 token purchase leaves approximately $4.405 after its separate transaction fee. Ten million tokens allocate about $0.233 of inference, leaving $4.172 before other costs. Avoid $1 purchases: the same fee consumes about 44% of the payment. If Creem bills base and overage in separate transactions, budget the additional fixed transaction fee; combined invoicing is not yet verified.

The suggested $0.50/M is about 21.4 times the fully utilized inference allocation. That markup pays for unused pool capacity, scanner compute, operations and support. It is still only $0.05 for a hypothetical 100k-token review or $0.25 for a 500k-token review after the allowance. These token sizes are scenarios, not measured averages.

Why 20M? It keeps the entry price and allowance easy to explain and leaves room for expensive multi-pass reviews. The alternative 50M allowance would allocate $1.17 of inference but expose substantially more worker capacity per $10 subscriber. I would start at 20M, measure, and increase generosity if queue time and support remain small.

| Hypothetical total tokens per completed review | Reviews represented by 20M |
| ---------------------------------------------- | -------------------------: |
| 100k                                           |                        200 |
| 250k                                           |                         80 |
| 500k                                           |                         40 |
| 1M                                             |                         20 |

Do not publish a promised review count until representative production runs establish it. Count the ordinary review, security discovery and verification, including repeated context and provider-reported reasoning consumption without double-counting token subcategories.

## Capacity controls for a small service

The current app processes one PR at a time, with up to five concurrent model requests inside that PR. Large PRs are batched and may require multiple review phases. The 3B quota alone does not establish how many subscribers can be served.

Proposed launch controls:

- Keep the existing 30-file, 100,000-byte/file and 500,000-byte snapshot limits; make partial coverage visible. Keep the existing request and review timeouts until measurements justify changes.
- Add a workspace start rate of 6 reviews/hour with a burst of 2, and at most 10 pending current revisions. Queue excess work visibly; never silently drop the latest revision.
- Debounce pushes for 60 seconds, collapse pending work to the latest revision per PR, and prefer manual retry of a stable PR over repeated obsolete work.
- Add fair scheduling across workspaces. A FIFO global queue currently lets one tenant fill the queue ahead of others.
- Begin with roughly 10–20 paid workspaces as an operating target, then expand using measured queue delay and failure rates. This is not a second customer plan or a hidden paid usage allowance.
- Track a provisional 20% provider reserve for owner usage, complimentary accounts, failures and other projects. Increase that reserve if actual personal consumption requires it. Alert before reserve exhaustion and stop accepting unfunded new inference when the shared pool is depleted.

With 2.4B tokens available to paid workloads, token-only capacity is 120 workspaces at 20M each, 24 at 100M each, or fewer than five at 500M each. These are pool arithmetic, not supported customer counts. At a hypothetical three minutes per PR, a continuously busy single worker could finish 14,400 PRs in 30 days; reserving half the time for spikes and disruption reduces the planning figure to 7,200. Actual scanner and model latency must replace that assumption.

The customer spending limit and service capacity are separate controls. No spending cap means that additional billable usage is permitted; it does not disable queue fairness, source-size boundaries or the provider quota.

## What Creem supports, and what needs proof

[Creem advertises](https://www.creem.io/) both prepaid credits and postpaid period-end invoicing. Its [usage guide](https://docs.creem.io/features/usage-based-billing) documents events, sum meters, duplicate-event protection and prepaid settlement. Events alone do not charge a card. The [product API](https://docs.creem.io/api-reference/endpoint/create-product) exposes base subscription pricing, usage prices, included allowances and credit-grant features; the examples inspected specify prepaid settlement. Implementation follow-up: the raw product OpenAPI schema explicitly includes `settlement_mode: "postpaid"`, described as billing at renewal where the store supports it. The implementation uses this setting and rejects incompatible products; store-specific support and real invoice behavior still require sandbox verification.

The [auto-refill guide](https://docs.creem.io/features/customer-credits/auto-refill) requires customer consent. It currently says the hosted portal opt-in is unavailable and asks merchants to contact support. Its default monthly refill cap is uncapped, but the default maximum is one refill per rolling day. Its cap counts calendar-month purchases before tax. Those semantics differ from a subscription-period usage budget.

**Implementation prerequisite:** prove the requested postpaid flow in this Creem account's sandbox, including prepaid credits offsetting overage, invoice timing and cap behavior. If it is available, use it. If it is not, the documented Creem-only fallback is the same $10 plan plus $5 prepaid packs; automatic refills require the supported consent setup. This would change collection timing and needs to be presented explicitly before launch. No external payment provider is proposed.

The intended customer experience should remain one plan and one Billing page. Do not create a product per customer merely to implement their cap.

Proposed product specification, to translate to the verified account API:

| Configuration      | Value                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| Subscription       | Codelean, USD 1,000 cents, monthly, no trial                                           |
| Usage meter        | Sum of customer-billable review tokens, associated with the workspace's Creem customer |
| Included allowance | 20,000,000 tokens/subscription period                                                  |
| Overage rate       | USD 50 cents/M tokens, equivalent to 0.00005 cents/token                               |
| Optional pack      | USD 500 cents for 10,000,000 token-equivalent units                                    |
| Taxes              | Proposed exclusive pricing; show applicable tax in checkout                            |
| Price changes      | Version prices; do not silently reprice an existing customer's automatic top-up        |

Token-equivalent balances and monetary credits are not interchangeable API values. Verify the bucket's denomination and decimal precision using a known 1M-token test: its excess usage must cost exactly $0.50. Do not put `10,000,000` into a money-denominated bucket and assume it represents tokens.

Creem remains authoritative for payments, invoices and paid periods. The implementation fulfills confirmed pack payments into an exact PostgreSQL token balance, deducts included and purchased tokens first, and sends only excess tokens to the Creem postpaid meter. Creem usage prices have zero included allowance, preventing a second allowance or wallet debit. PostgreSQL stores usage, reservations, entitlement overrides and a reconciled local view needed to authorize inference. That is necessary for enforcing limits before compute, even when the provider settles asynchronously.

## Spending cap behavior

Store the workspace's optional **additional postpaid usage limit**, excluding the $10 base fee, as nullable cents:

- `null`: no customer-set cap.
- `0`: no postpaid overage; included and previously purchased tokens still work.
- Positive amount: maximum new postpaid usage in the subscription period, before tax.

For example, a $10 cap with no purchased balance permits up to 40M total tokens and $20 total charges before tax. A $0 cap permits the included 20M plus any prepaid balance. New manual pack purchases show their own price and confirmation; they are not silently authorized by the overage cap.

If the verified implementation uses auto-refill, label its control **automatic top-up spending limit** instead and show that purchases happen in $5 increments. A cap below $5 cannot permit a $5 refill. Keep Creem's calendar-month refill limit distinct from the subscription-period allowance.

Enforcement belongs before every provider call: atomically reserve available tokens and budget for all concurrent calls, then settle actual usage and release unused reservations. A conservative upper bound must cover serialized input plus maximum output for the chosen model; an average tokens-per-PR estimate is insufficient. If a call cannot fit, pause before starting it. Reducing a limit blocks further starts; already authorized work stays within its reservation, and the UI shows that pending exposure.

Show allowance, purchased balance, actual overage, reserved usage and next renewal on Billing. Notify in-app at 80% and 100% of the included allowance, at 80% of a set cap, and at each additional $5 when uncapped. Notifications do not substitute for enforcement.

## Code review findings relevant to billing

| Existing area                                                                                                                                                                 | Finding                                                                                     | Required change                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Usage persistence](/Users/mllopart/dev/luodaint/luoda-pr-checker/src/lib/pipeline.ts:512)                                                                                    | Run tokens are written only after all analysis phases succeed.                              | Write a durable per-call cost ledger independently of the final review result.                                                                 |
| [Model validation](/Users/mllopart/dev/luodaint/luoda-pr-checker/src/lib/review.ts:291)                                                                                       | Validation may throw after inference has already been consumed; missing usage becomes zero. | Capture usage before validation; represent missing usage as unknown and reconcile. Never bill invented estimates as measured tokens.           |
| [Stream parser](/Users/mllopart/dev/luodaint/luoda-pr-checker/src/lib/model-response.ts:65)                                                                                   | Only total tokens are retained.                                                             | Preserve available input/output/cache/reasoning counters and provider request identity, without retaining reasoning text.                      |
| [Job worker](/Users/mllopart/dev/luodaint/luoda-pr-checker/src/worker.ts:56)                                                                                                  | One global FIFO worker; automatic retries can consume more inference.                       | Add fair claiming, entitlement checks and cost accounting for every attempt.                                                                   |
| [Webhook enqueue](/Users/mllopart/dev/luodaint/luoda-pr-checker/src/lib/events.ts:20) and [manual retry](/Users/mllopart/dev/luodaint/luoda-pr-checker/src/app/actions.ts:68) | Both can schedule work without paid access or budget checks.                                | Gate enqueue/retry and recheck in the worker and before each model call. UI-only gating would be bypassable.                                   |
| [Identity and permissions](/Users/mllopart/dev/luodaint/luoda-pr-checker/src/lib/auth-server.ts:40)                                                                           | Stable GitHub identity exists, but only workspace roles are implemented.                    | Add separate operator authorization and complimentary entitlements. Preserve the existing protection against client writes to identity fields. |
| [Source limits](/Users/mllopart/dev/luodaint/luoda-pr-checker/src/lib/config.ts:16)                                                                                           | Several useful compute limits already exist.                                                | Retain them, document them in the product, and add workspace-level controls.                                                                   |

The existing `runs.tokens` field is a signed integer. Billing-period and global counters must use `bigint`: a 3B pool exceeds a signed 32-bit integer. Keep exact token counts and precise monetary arithmetic; round currency only at the verified settlement boundary, not per model request.

For customer fairness, propose two separate measures:

- **Provider cost usage:** every actual attempt, including free accounts, errors, cancellations and retries. Unknown amounts remain flagged as unknown with a conservative internal reserve.
- **Customer billable usage:** measured tokens for a completed, usable review, once per logical revision. Failed attempts and automatic retries are absorbed by Codelean; a publication-only retry reuses the result without a second charge. A later successful review of a new commit is new usage. Anti-abuse limits still cover failed work.

No historical run should be retroactively billed when this feature launches.

## Always-free owner and small operator console

Bind `mllopart` to the GitHub numeric account ID obtained through authenticated GitHub sign-in and a trusted operator configuration. Never grant operator access by display name, an editable email list or a client-supplied username. `ADMIN_EMAILS` currently controls signup eligibility and must not acquire unrelated super-admin powers.

Proposed rules:

- The verified owner's account is permanently exempt. Workspaces it owns receive a protected owner exemption, with no checkout or token purchases required. Joining someone else's workspace does not automatically waive that company's bill.
- On a user lookup, the operator can select specific workspaces and grant or revoke complimentary access, with a reason and optional expiry. Default grant: indefinite. No public redemption code.
- Complimentary workspaces pay $0 for both base and usage. Keep measuring their consumption and apply service capacity limits. The operator can raise their technical limits explicitly.
- Revoking a grant returns the workspace to payment-required unless it already has a valid paid entitlement. It must never silently start charging a saved card.
- If a paying customer is made free, also disable future provider charges and automatic refill. Show the change as pending until Creem confirms the billing change; reconcile already-recorded overage separately. Do not call a customer free while their subscription keeps renewing. Previously paid amounts are not automatically refunded.
- A workspace ownership transfer must reevaluate the owner exemption before the next inference call. Billing webhooks cannot remove the protected owner's entitlement.

Minimal `/super-admin` console, with server-side authorization on every read and mutation:

| View       | Contents/actions                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Workspaces | Owner identity, paid/complimentary/payment-required state, period usage, queue depth and provider links  |
| Access     | Grant/revoke complimentary access; optional expiry and reason; protected-owner indicator                 |
| Limits     | Set enabled-repository/start-rate limits, pause reviews, inspect the customer's budget                   |
| Service    | Shared quota consumption, estimated remaining pool, failed usage records, billing synchronization errors |
| Audit      | Actor, workspace, time, reason and before/after state for every operator action                          |

Keep the initial console focused on billing metadata and operation controls. Access to private repository contents is a separate permission. A normal workspace owner or admin cannot reach this console or change another workspace's billing.

## Implementation outline after approval

1. **Validate provider contract in sandbox.** Verify native postpaid settlement or document the prepaid fallback; credit denominations, allowance reset, final invoice on cancellation, duplicate events, refunds, refill activation and per-workspace customer mapping. No live products or charges during the review phase.
2. **Add persistence and access controls.** Organization billing record, paid periods, complimentary grants, per-call usage ledger, reservations, webhook receipts, billing outbox and operator audit records. Use unique keys for checkout orders, period grants and logical usage events.
3. **Instrument and reconcile.** Capture usage at the model boundary; retain raw cost usage even when reviews fail. Send billing events through a durable outbox. Use a distinct, noncharging analytics path for free-account usage. Reconcile local totals against Creem and the provider pool.
4. **Enforce entitlements and limits.** Add checks in webhook handling, retry actions, worker claiming and model dispatch. Keep blocked work distinguishable from analysis failures. A missing subscription cannot fall through to free service; a billing outage must not create unlimited credit exposure.
5. **Add Billing and operator UI.** Owner-controlled checkout, cap, top-up and portal links; usage readable by workspace members as appropriate. Connect the billing customer to the workspace, not whichever user most recently paid.
6. **Test and stage rollout.** Prove the protected owner remains free, migrate existing accounts deliberately, then enable charging only for newly accepted paid terms. Deploy metering in observation mode first to obtain real review cost distributions.

The existing Better Auth integration can remain for identity. Its [Creem plugin](https://docs.creem.io/code/sdks/better-auth) primarily maps customers to users, so a direct server-side Creem integration with explicit workspace mapping is likely simpler here. A person belonging to two companies must not merge their pools or expose both companies' invoices through a shared portal.

Use [verified Creem webhooks](https://docs.creem.io/code/webhooks) as payment evidence, with durable deduplication and reconciliation for delayed or out-of-order events. A checkout redirect is not payment confirmation. Canceled-at-period-end, unpaid, paused and refunded subscriptions require distinct access decisions. A past-due renewal does not refresh the allowance; existing paid entitlement remains bounded by its already-confirmed paid-through date.

Acceptance tests should cover: forged/duplicate webhooks; two workspaces with one user; one grant per paid period; concurrent calls at the cap; unknown usage; model and publication retries; worker restart; prepaid/postpaid double charging; cancellation and final usage; refunds of partially consumed packs; free grants on active subscriptions; revoked grants; owner identity spoofing; and period boundaries with delayed usage events. Read the installed Next.js guides before writing application code, as required by AGENTS.md.

## Approval scope and remaining verification

Approve the commercial proposal and implementation scope together: **one $10 workspace plan, 20M included tokens, $0.50/M extra, $5/10M purchases, optional uncapped-by-default overage, private complimentary access, and the small operator console**. The initial limits are proposals and can be adjusted before implementation.

Still to verify before live charging:

- The actual NaN invoice/model/quota and how much of the pool other projects use. Its [terms](https://nan.builders/terms) prohibit sharing or reselling the API key; Codelean must retain it server-side. The reviewed terms do not explicitly resolve serving paying customers through this shared membership, so confirm that use with the provider before making capacity commitments.
- Creem's account-specific postpaid and auto-refill availability. The raw schema establishes native postpaid configuration, but a sandbox invoice must verify this store supports it. Auto-refill is not used by this implementation.
- Real per-review token distribution, completion time and error rate. Initial allowance and workload limits are reasoned proposals, not benchmark results.

Only this research document was added. No application code, database, account privileges, Creem products, subscriptions or customer charges were changed.
