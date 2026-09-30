import { db } from "../src/lib/db";
import { creemRequest } from "../src/lib/creem";
import {
  flushBillingOutbox,
  handleCreemEvent,
  refreshBillingSubscription,
} from "../src/lib/billing-creem";
try {
  const accounts = (
    await db().query(
      "SELECT organization_id FROM billing_accounts WHERE subscription_id IS NOT NULL",
    )
  ).rows;
  for (const b of accounts) {
    try {
      await refreshBillingSubscription(b.organization_id);
    } catch {
      console.error(
        `Subscription reconciliation failed for workspace ${b.organization_id}`,
      );
      process.exitCode = 1;
    }
  }
  const checkouts = (
    await db().query(
      "SELECT checkout_id FROM billing_checkouts WHERE completed_at IS NULL AND checkout_id IS NOT NULL",
    )
  ).rows;
  for (const row of checkouts) {
    try {
      const checkout = await creemRequest<{ status: string }>(
        `/checkouts?checkout_id=${encodeURIComponent(row.checkout_id)}`,
      );
      if (checkout.status === "completed")
        await handleCreemEvent({
          id: `reconcile-${row.checkout_id}`,
          eventType: "checkout.completed",
          object: checkout,
        });
    } catch {
      console.error(`Checkout reconciliation failed for ${row.checkout_id}`);
      process.exitCode = 1;
    }
  }
  await flushBillingOutbox();
  const unresolved = (
    await db().query(
      "SELECT id,error FROM billing_outbox WHERE delivered_at IS NULL AND error IS NOT NULL",
    )
  ).rows;
  const ambiguous = (
    await db().query(
      "SELECT id FROM billing_checkouts WHERE checkout_id IS NULL AND completed_at IS NULL",
    )
  ).rows;
  console.log(
    JSON.stringify(
      { unresolvedUsage: unresolved, ambiguousCheckoutRequests: ambiguous },
      null,
      2,
    ),
  );
  if (unresolved.length || ambiguous.length) process.exitCode = 1;
} finally {
  await db().end();
}
