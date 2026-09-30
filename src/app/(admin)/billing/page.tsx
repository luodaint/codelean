import { requireWorkspace } from "@/lib/auth";
import { billingAccount, complimentary } from "@/lib/billing";
import { billingEnabled, tokenLabel, usageDollars } from "@/lib/billing-policy";
import { creemConfigured } from "@/lib/creem";
import { Submit } from "@/components/submit";
import {
  checkout,
  portal,
  setLimit,
  refreshBilling,
  cancelPlan,
} from "@/app/billing/actions";

export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; checkout?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const b = await billingAccount(workspace.id);
  const params = await searchParams;
  const free = complimentary(b);
  const owner = workspace.role === "owner";
  const configured = creemConfigured();
  const paid = Boolean(
    b.period_end && new Date(b.period_end).getTime() > Date.now(),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Billing & usage</h1>
          <p>{workspace.name} · One plan, shared by your team.</p>
        </div>
      </div>
      {!billingEnabled() && (
        <p className="notice">
          Billing enforcement is disabled by the service operator.
        </p>
      )}
      {params.error && (
        <p role="alert" className="notice danger">
          {params.error === "limit"
            ? "Enter a valid dollar amount, or leave the limit blank."
            : "Checkout could not start. Check the Creem configuration or manage your existing subscription."}
        </p>
      )}
      {params.checkout && (
        <p role="status" className="notice">
          Payment confirmation is being synchronized. Access starts after Creem
          confirms payment.
        </p>
      )}
      {params.saved && (
        <p role="status" className="notice success">
          Spending limit saved. Existing usage and authorized work still count.
        </p>
      )}
      {b.hold_reason && !free && (
        <p className="notice danger">{b.hold_reason}</p>
      )}
      <section className="panel workspace-panel">
        <h2>{free ? "Complimentary access" : "Codelean · $10 / month"}</h2>
        <p>
          {free
            ? "Your workspace pays nothing for the subscription or review usage. Service capacity limits still apply."
            : "20 million review tokens per month. All review features included. Additional usage costs $0.50 per million tokens, plus applicable taxes."}
        </p>
        {b.owner_exempt && (
          <p className="notice success">Permanent owner exemption · mllopart</p>
        )}
        {b.complimentary_until && !b.owner_exempt && (
          <p>
            Complimentary until{" "}
            {new Date(b.complimentary_until).toLocaleDateString("en-GB", {
              timeZone: "UTC",
            })}
            .
          </p>
        )}
        {!free && (
          <p>
            Status: {b.subscription_status.replaceAll("_", " ")}
            {b.period_end
              ? ` · Paid period ends ${new Date(b.period_end).toLocaleDateString("en-GB", { timeZone: "UTC" })}`
              : " · Subscription required to review"}
          </p>
        )}
        {!configured && !free && (
          <p className="notice">
            Payments are being configured. No charges can be started yet.
          </p>
        )}
        {!free &&
          owner &&
          configured &&
          !paid &&
          ["none", "canceled", "expired"].includes(b.subscription_status) && (
            <form action={checkout} className="workspace-form">
              <input type="hidden" name="kind" value="plan" />
              <label>
                <input type="checkbox" name="accept" required /> I accept
                $10/month and $0.50 per million additional tokens. Extra-usage
                limit:{" "}
                {b.extra_limit_cents === null
                  ? "not set"
                  : `$${(Number(b.extra_limit_cents) / 100).toFixed(2)}`}
                , before tax.
              </label>
              <Submit className="button">Subscribe with Creem</Submit>
            </form>
          )}
        {owner && b.customer_id && (
          <div className="workspace-row">
            <form action={portal}>
              <Submit className="button secondary">
                Invoices & payment method
              </Submit>
            </form>
            <form action={refreshBilling}>
              <Submit className="button secondary">Refresh billing</Submit>
            </form>
            {!free &&
              b.subscription_id &&
              b.subscription_status === "active" && (
                <form action={cancelPlan}>
                  <Submit className="button secondary">
                    Cancel at period end
                  </Submit>
                </form>
              )}
          </div>
        )}
      </section>
      <section className="panel workspace-panel">
        <h2>This billing period</h2>
        <dl className="policy-list">
          <dt>Included tokens used</dt>
          <dd>{tokenLabel(b.included_used)} / 20,000,000</dd>
          <dt>Purchased tokens available</dt>
          <dd>{tokenLabel(b.prepaid_tokens)}</dd>
          <dt>Additional metered usage</dt>
          <dd>
            {tokenLabel(b.overage_tokens)} tokens · $
            {usageDollars(b.overage_tokens)}
          </dd>
          <dt>Reserved for current reviews</dt>
          <dd>{tokenLabel(b.reserved_tokens)} tokens</dd>
          <dt>Enabled repository limit</dt>
          <dd>{b.repository_limit}</dd>
          <dt>Review start limit</dt>
          <dd>{b.hourly_limit} per hour</dd>
        </dl>
        {BigInt(b.included_used) >= 16_000_000n && !free && (
          <p className="notice">
            {BigInt(b.included_used) >= 20_000_000n
              ? "Included allowance used. Reviews now use purchased tokens, then metered overage."
              : "You have used at least 80% of your included tokens."}
          </p>
        )}
        {!free &&
          b.extra_limit_cents !== null &&
          BigInt(b.extra_limit_cents) > 0n &&
          BigInt(b.overage_tokens) * 5n >=
            BigInt(b.extra_limit_cents) * 20_000n * 4n && (
            <p className="notice">
              Your additional usage is at or above 80% of your spending limit.
              New work pauses before it would exceed the limit.
            </p>
          )}
        <p>
          Monthly tokens reset after payment at renewal. Purchased tokens carry
          forward. Failed analysis attempts are not charged; publishing retries
          never charge a saved review twice. Review size varies, so tokens are
          not a guaranteed number of PRs.
        </p>
      </section>
      {!free && (
        <section className="panel workspace-panel">
          <h2>Additional usage limit</h2>
          <p>
            Leave blank for no cap. Set $0 to use only included and purchased
            tokens. This limits additional usage per subscription period,
            excluding the $10 plan, manual purchases and taxes. Lowering it
            stops new reservations; work already authorized can still finish at
            its previously reserved amount.
          </p>
          {owner ? (
            <form action={setLimit} className="workspace-form">
              <label>
                Maximum additional usage, USD
                <input
                  name="limit"
                  inputMode="decimal"
                  placeholder="No limit"
                  defaultValue={
                    b.extra_limit_cents === null
                      ? ""
                      : (Number(b.extra_limit_cents) / 100).toFixed(2)
                  }
                />
              </label>
              <Submit className="button secondary">Save limit</Submit>
            </form>
          ) : (
            <p>Only workspace owners can change billing.</p>
          )}
        </section>
      )}
      {!free && (
        <section className="panel workspace-panel">
          <h2>Add 10 million tokens · $5</h2>
          <p>
            Used after your monthly allowance and before metered overage. Tokens
            carry forward without expiry; an active subscription is required to
            use them. Taxes are shown at checkout.
          </p>
          {owner && paid && configured && (
            <form action={checkout} className="workspace-form">
              <input type="hidden" name="kind" value="tokens" />
              <label>
                <input type="checkbox" name="accept" required /> Buy 10 million
                additional tokens for $5 plus applicable tax.
              </label>
              <Submit className="button">Buy tokens with Creem</Submit>
            </form>
          )}
        </section>
      )}
    </>
  );
}
