import { requireOperator } from "@/lib/operator";
import { db } from "@/lib/db";
import { billingAccounts, complimentary } from "@/lib/billing";
import { tokenLabel } from "@/lib/billing-policy";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { updateAccess } from "./actions";
export const dynamic = "force-dynamic";
export default async function SuperAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireOperator();
  const { q = "" } = await searchParams;
  const workspaces = (
    await db().query(
      `SELECT o.id,o.name,string_agg(DISTINCT u.email,', ') AS owners FROM organization o LEFT JOIN member m ON m."organizationId"=o.id AND m.role='owner' LEFT JOIN "user" u ON u.id=m."userId" WHERE o.name ILIKE $1 OR u.email ILIKE $1 OR u."githubUsername" ILIKE $1 GROUP BY o.id ORDER BY o.name LIMIT 50`,
      [`%${q.slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`],
    )
  ).rows;
  const accounts = await billingAccounts(workspaces.map((w) => w.id));
  const usage = (
    await db().query(
      "SELECT COALESCE(sum(COALESCE(total_tokens,max_tokens)),0)::text AS tokens,count(*) FILTER(WHERE total_tokens IS NULL)::int AS unknown FROM model_usage WHERE created_at>=COALESCE($1::timestamptz,date_trunc('month',now()))",
      [process.env.BILLING_PROVIDER_PERIOD_START || null],
    )
  ).rows[0];
  const pending = (
    await db().query(
      "SELECT count(*)::int AS n FROM billing_outbox WHERE delivered_at IS NULL",
    )
  ).rows[0].n;
  const audit = (
    await db().query(
      "SELECT a.*,o.name FROM billing_audit a JOIN organization o ON o.id=a.organization_id ORDER BY a.created_at DESC LIMIT 30",
    )
  ).rows;
  return (
    <Shell
      email={session.user.email}
      githubUsername={session.user.githubUsername}
      name={session.user.name}
      image={session.user.image}
      operator
    >
      <div className="page-heading">
        <div>
          <h1>Super admin</h1>
          <p>Complimentary access, service limits and billing health.</p>
        </div>
      </div>
      <section className="panel workspace-panel">
        <h2>Inference & billing</h2>
        <p>
          {tokenLabel(usage.tokens)} tokens used or conservatively reserved of{" "}
          {tokenLabel(
            process.env.BILLING_PROVIDER_TOKEN_BUDGET || "3000000000",
          )}
          . {usage.unknown} calls have unknown usage. {pending} usage events
          await Creem.
        </p>
      </section>
      <form className="workspace-form">
        <label>
          Find workspace or owner
          <input
            name="q"
            defaultValue={q}
            placeholder="Workspace, email or GitHub username"
          />
        </label>
        <button className="button secondary">Search</button>
      </form>
      {workspaces.map((w, i) => {
        const b = accounts[i];
        return (
          <section className="panel workspace-panel" key={w.id}>
            <h2>{w.name}</h2>
            <p>
              {w.owners || "No owner"} ·{" "}
              {b.owner_exempt
                ? "Permanent owner exemption"
                : complimentary(b)
                  ? "Complimentary"
                  : b.subscription_status}
            </p>
            <p>
              Included: {tokenLabel(b.included_used)} · Purchased:{" "}
              {tokenLabel(b.prepaid_tokens)} · Overage:{" "}
              {tokenLabel(b.overage_tokens)}
            </p>
            {b.hold_reason && <p className="notice danger">{b.hold_reason}</p>}
            <form action={updateAccess} className="workspace-form">
              <input type="hidden" name="organizationId" value={w.id} />
              <label>
                Action
                <select name="action">
                  <option value="grant">
                    Grant complimentary access and cancel paid renewal
                  </option>
                  {!b.owner_exempt && (
                    <option value="revoke">Revoke complimentary access</option>
                  )}
                  <option value="limits">Update service limits</option>
                  <option value="clear-hold">
                    Clear hold after reconciliation
                  </option>
                </select>
              </label>
              <label>
                Complimentary expiry (optional)
                <input type="date" name="until" />
              </label>
              <label>
                Enabled repositories
                <input
                  type="number"
                  name="repositories"
                  min="1"
                  max="1000"
                  defaultValue={b.repository_limit}
                />
              </label>
              <label>
                Reviews per hour
                <input
                  type="number"
                  name="hourly"
                  min="1"
                  max="1000"
                  defaultValue={b.hourly_limit}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  name="paused"
                  defaultChecked={b.paused}
                />{" "}
                Pause reviews
              </label>
              <label>
                Reason
                <input name="reason" required minLength={3} maxLength={500} />
              </label>
              <p>
                Granting free access cancels an existing subscription
                immediately after pending usage is settled. Existing charges are
                not automatically refunded.
              </p>
              <Submit className="button secondary">Apply change</Submit>
            </form>
          </section>
        );
      })}
      <section className="panel workspace-panel">
        <h2>Recent operator activity</h2>
        {audit.map((a) => (
          <p key={a.id}>
            {new Date(a.created_at).toISOString()} · {a.name} · {a.action} ·{" "}
            {a.reason}
          </p>
        ))}
      </section>
    </Shell>
  );
}
