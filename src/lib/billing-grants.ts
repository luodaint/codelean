import { randomUUID } from "node:crypto";
import { billingAccount } from "./billing";
import { transaction } from "./db";
import { creemRequest, getSubscription } from "./creem";

const pendingHold =
  "Complimentary access is awaiting cancellation confirmation.";

export async function grantComplimentary(
  organizationId: string,
  actorId: string,
  reason: string,
  until: string | null,
) {
  await transaction(async (c) => {
    const b = await billingAccount(organizationId, c);
    if (b.grant_pending) return; // Resume the original durable intent.
    if (b.hold_reason)
      throw new Error("Resolve the billing hold before granting free access.");
    if (
      (
        await c.query(
          "SELECT 1 FROM billing_attempts WHERE organization_id=$1 AND state='running'",
          [organizationId],
        )
      ).rowCount
    )
      throw new Error(
        "Wait for the current review to finish before changing billing.",
      );
    if (
      (
        await c.query(
          "SELECT 1 FROM billing_outbox WHERE organization_id=$1 AND delivered_at IS NULL",
          [organizationId],
        )
      ).rowCount
    )
      throw new Error(
        "Reconcile pending usage before making this workspace free.",
      );
    if (
      (
        await c.query(
          "SELECT 1 FROM billing_checkouts WHERE organization_id=$1 AND kind='plan' AND completed_at IS NULL AND expired_at IS NULL",
          [organizationId],
        )
      ).rowCount
    )
      throw new Error(
        "Resolve pending subscription checkouts before granting free access.",
      );
    const intent = {
      id: randomUUID(),
      subscriptionId: b.subscription_id,
      actorId,
      reason,
      until,
      before: b,
    };
    await c.query(
      "UPDATE billing_accounts SET grant_pending=$2,hold_reason=$3 WHERE organization_id=$1",
      [organizationId, JSON.stringify(intent), pendingHold],
    );
  });
  await completeComplimentaryGrant(organizationId);
}

export async function completeComplimentaryGrant(organizationId: string) {
  const pending = (await billingAccount(organizationId)).grant_pending;
  if (!pending) return;
  // External side effects happen after intent commits, without holding DB locks.
  // A lost response or local rollback leaves this operation available for retry.
  if (pending.subscriptionId) {
    if ((await getSubscription(pending.subscriptionId)).status !== "canceled")
      await creemRequest(
        `/subscriptions/${encodeURIComponent(pending.subscriptionId)}/cancel`,
        "POST",
        { mode: "immediate" },
      );
    if ((await getSubscription(pending.subscriptionId)).status !== "canceled")
      throw new Error(
        "Creem has not confirmed cancellation; retry or reconcile the pending grant.",
      );
  }
  await transaction(async (c) => {
    const b = await billingAccount(organizationId, c);
    if (!b.grant_pending || b.grant_pending.id !== pending.id) return;
    if (b.subscription_id !== pending.subscriptionId)
      throw new Error(
        "Subscription changed during cancellation; operator reconciliation is required.",
      );
    await c.query(
      "UPDATE billing_accounts SET complimentary=true,complimentary_until=$2,subscription_status=CASE WHEN subscription_id IS NULL THEN subscription_status ELSE 'canceled' END,grant_pending=NULL,hold_reason=CASE WHEN hold_reason=$3 THEN NULL ELSE hold_reason END WHERE organization_id=$1",
      [organizationId, pending.until, pendingHold],
    );
    const after = await billingAccount(organizationId, c);
    await c.query(
      "INSERT INTO billing_audit(organization_id,actor_id,action,reason,details) VALUES($1,$2,'grant',$3,$4)",
      [
        organizationId,
        pending.actorId,
        pending.reason,
        JSON.stringify({ before: pending.before, after }),
      ],
    );
  });
}
