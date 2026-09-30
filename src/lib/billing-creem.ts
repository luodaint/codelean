import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db, transaction } from "./db";
import { appUrl, required } from "./config";
import { billingAccount, checkAccess, complimentary } from "./billing";
import { pricing } from "./billing-policy";
import {
  creemRequest,
  creemRedirect,
  getSubscription,
  objectId,
  type CreemSubscription,
} from "./creem";

type Product = {
  id: string;
  price: number;
  currency: string;
  billing_type: string;
  billing_period?: string;
  trial_period_days?: number;
  usage_prices?: {
    meter_id: string;
    unit_price: number;
    free_allowance: number;
    settlement_mode: string;
    cap?: number | null;
  }[];
  features?: unknown[];
};
export async function verifyBillingProducts() {
  required("CREEM_WEBHOOK_SECRET");
  const [plan, pack] = await Promise.all([
    creemRequest<Product>(
      `/products/${encodeURIComponent(required("CREEM_PLAN_PRODUCT_ID"))}`,
    ),
    creemRequest<Product>(
      `/products/${encodeURIComponent(required("CREEM_TOKEN_PRODUCT_ID"))}`,
    ),
  ]);
  const price = plan.usage_prices?.[0];
  if (
    plan.price !== 1000 ||
    plan.currency !== "USD" ||
    plan.billing_type !== "recurring" ||
    plan.billing_period !== "every-month" ||
    plan.trial_period_days ||
    plan.usage_prices?.length !== 1 ||
    price?.meter_id !== required("CREEM_METER_ID") ||
    Number(price.unit_price) !== 0.00005 ||
    price.free_allowance !== 0 ||
    price.settlement_mode !== "postpaid" ||
    price.cap != null
  )
    throw new Error(
      "Creem plan does not match the approved metered price. Run billing:setup and verify postpaid support.",
    );
  if (
    pack.price !== 500 ||
    pack.currency !== "USD" ||
    pack.billing_type !== "onetime" ||
    pack.features?.length
  )
    throw new Error(
      "Creem token product must be $5 USD with no automatic credit grant.",
    );
}

export async function createBillingCheckout(
  organizationId: string,
  email: string,
  name: string,
  kind: "plan" | "tokens",
) {
  await verifyBillingProducts();
  const outcome = await transaction(async (c) => {
    const b = await billingAccount(organizationId, c);
    if (complimentary(b))
      throw new Error("This workspace is complimentary. No payment is needed.");
    if (b.hold_reason)
      throw new Error(
        "Billing needs operator attention before another purchase.",
      );
    if (kind === "tokens") checkAccess(b);
    else if (
      b.subscription_id &&
      !["none", "canceled", "expired"].includes(b.subscription_status)
    )
      throw new Error(
        "Manage the existing subscription in the billing portal.",
      );
    let customerId = b.customer_id;
    if (!customerId) {
      const externalId = `workspace_${createHash("sha256").update(organizationId).digest("hex")}`;
      try {
        const customer = await creemRequest<{ id: string }>(
          "/customers",
          "POST",
          {
            email,
            name,
            external_id: externalId,
            metadata: { organization_id: organizationId },
          },
        );
        customerId = z.string().startsWith("cust_").parse(customer.id);
        await c.query(
          "UPDATE billing_accounts SET customer_id=$2 WHERE organization_id=$1",
          [organizationId, customerId],
        );
      } catch {
        await c.query(
          "UPDATE billing_accounts SET hold_reason='Customer creation needs provider reconciliation.' WHERE organization_id=$1",
          [organizationId],
        );
        return null;
      }
    }
    // Reuse a pending session: double-clicking Subscribe must not create two plans.
    const pending = (
      await c.query(
        "SELECT * FROM billing_checkouts WHERE organization_id=$1 AND kind=$2 AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1",
        [organizationId, kind],
      )
    ).rows[0];
    if (pending?.checkout_url) return creemRedirect(pending.checkout_url);
    if (pending)
      throw new Error("A checkout is awaiting provider reconciliation.");
    const id = randomUUID();
    await c.query(
      "INSERT INTO billing_checkouts(id,organization_id,kind,customer_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [id, organizationId, kind, customerId],
    );
    try {
      const checkout = await creemRequest<{ id: string; checkout_url: string }>(
        "/checkouts",
        "POST",
        {
          request_id: id,
          product_id: required(
            kind === "plan"
              ? "CREEM_PLAN_PRODUCT_ID"
              : "CREEM_TOKEN_PRODUCT_ID",
          ),
          customer: { id: customerId },
          success_url: `${appUrl()}/billing?checkout=returned`,
          metadata: { organization_id: organizationId, billing_request_id: id },
        },
      );
      const url = creemRedirect(checkout.checkout_url);
      await c.query(
        "UPDATE billing_checkouts SET checkout_id=$2,checkout_url=$3 WHERE id=$1",
        [id, checkout.id, url],
      );
      return url;
    } catch {
      // Commit the intent on ambiguous provider failures. Never create another
      // payable session just because the first response was lost.
      await c.query(
        "UPDATE billing_accounts SET hold_reason='Checkout creation needs provider reconciliation.' WHERE organization_id=$1",
        [organizationId],
      );
      return null;
    }
  });
  if (!outcome) throw new Error("Billing setup needs provider reconciliation.");
  return outcome;
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return null;
  return new Date(value);
}
export async function syncSubscription(subscription: CreemSubscription) {
  if (objectId(subscription.product) !== required("CREEM_PLAN_PRODUCT_ID"))
    return;
  const customerId = objectId(subscription.customer);
  await transaction(async (c) => {
    const row = (
      await c.query(
        "SELECT organization_id FROM billing_accounts WHERE customer_id=$1",
        [customerId],
      )
    ).rows[0];
    if (!row) throw new Error("Unknown billing customer");
    const b = await billingAccount(row.organization_id, c);
    if (
      b.subscription_id &&
      b.subscription_id !== subscription.id &&
      !["canceled", "expired", "none"].includes(b.subscription_status)
    ) {
      await c.query(
        "UPDATE billing_accounts SET hold_reason='Multiple subscriptions need operator reconciliation.' WHERE organization_id=$1",
        [row.organization_id],
      );
      return;
    }
    const updated = validDate(subscription.updated_at);
    if (!updated) throw new Error("Subscription is missing its revision date");
    const newer = (
      await c.query(
        "SELECT 1 FROM billing_accounts WHERE organization_id=$1 AND subscription_id=$2 AND provider_updated_at>$3",
        [row.organization_id, subscription.id, updated],
      )
    ).rowCount;
    if (newer) return;
    await c.query(
      "UPDATE billing_accounts SET subscription_id=$2,subscription_status=$3,provider_updated_at=$4 WHERE organization_id=$1",
      [row.organization_id, subscription.id, subscription.status, updated],
    );
    const start = validDate(subscription.current_period_start_date);
    const end = validDate(subscription.current_period_end_date);
    const paidAt = validDate(subscription.last_transaction_date);
    if (
      start &&
      end &&
      end > start &&
      paidAt &&
      paidAt >= start &&
      subscription.last_transaction_id &&
      ["active", "scheduled_cancel"].includes(subscription.status)
    ) {
      await c.query(
        "INSERT INTO billing_periods(organization_id,starts_at,ends_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [row.organization_id, start, end],
      );
      await c.query(
        "UPDATE billing_accounts SET period_start=$2,period_end=$3 WHERE organization_id=$1 AND (period_start IS NULL OR period_start<=$2)",
        [row.organization_id, start, end],
      );
    }
  });
}

const envelope = z.object({
  id: z.string().min(1).max(200),
  eventType: z.string().max(100),
  object: z.record(z.string(), z.unknown()),
});
export async function handleCreemEvent(raw: unknown) {
  const event = envelope.parse(raw);
  if (
    (await db().query("SELECT 1 FROM billing_webhooks WHERE id=$1", [event.id]))
      .rowCount
  )
    return;
  const obj = event.object;
  if (event.eventType.startsWith("subscription.")) {
    const id = z.string().startsWith("sub_").parse(obj.id);
    // Fetch current state; delivery order is not subscription order.
    await syncSubscription(await getSubscription(id));
  } else if (event.eventType === "checkout.completed") {
    const checkout = z
      .object({
        id: z.string(),
        request_id: z.string().uuid(),
        status: z.string().optional(),
        product: z.unknown(),
        customer: z.unknown(),
        subscription: z.unknown().optional(),
        order: z.object({
          id: z.string(),
          status: z.literal("paid"),
          currency: z.literal("USD"),
          amount: z.number(),
          sub_total: z.number().optional(),
          tax_amount: z.number().optional(),
          product: z.unknown().optional(),
          customer: z.unknown().optional(),
        }),
      })
      .parse(obj);
    await transaction(async (c) => {
      const request = (
        await c.query(
          "SELECT organization_id FROM billing_checkouts WHERE id=$1",
          [checkout.request_id],
        )
      ).rows[0];
      if (!request) throw new Error("Unrecognized checkout request");
      const b = await billingAccount(request.organization_id, c);
      const pending = (
        await c.query(
          "SELECT * FROM billing_checkouts WHERE id=$1 FOR UPDATE",
          [checkout.request_id],
        )
      ).rows[0];
      const productId = required(
        pending.kind === "plan"
          ? "CREEM_PLAN_PRODUCT_ID"
          : "CREEM_TOKEN_PRODUCT_ID",
      );
      if (
        objectId(checkout.customer) !== b.customer_id ||
        pending.customer_id !== b.customer_id ||
        objectId(checkout.product) !== productId ||
        (pending.checkout_id && pending.checkout_id !== checkout.id)
      )
        throw new Error("Checkout binding mismatch");
      if (pending.completed_at) return;
      if (pending.kind === "tokens") {
        // Exact base amount and fixed product; no user-supplied units or custom price.
        if (
          (checkout.order.sub_total ??
            checkout.order.amount - (checkout.order.tax_amount || 0)) !==
          pricing.packCents
        )
          throw new Error("Unexpected token purchase amount");
        await c.query(
          "UPDATE billing_accounts SET prepaid_tokens=prepaid_tokens+$2 WHERE organization_id=$1",
          [request.organization_id, pricing.packTokens.toString()],
        );
      }
      await c.query(
        "UPDATE billing_checkouts SET checkout_id=$2,order_id=$3,completed_at=now() WHERE id=$1",
        [pending.id, checkout.id, checkout.order.id],
      );
      await c.query(
        "UPDATE billing_accounts SET hold_reason=NULL WHERE organization_id=$1 AND hold_reason='Checkout creation needs provider reconciliation.'",
        [request.organization_id],
      );
    });
    const subscriptionId = objectId(checkout.subscription);
    if (subscriptionId)
      await syncSubscription(await getSubscription(subscriptionId));
  } else if (["refund.created", "dispute.created"].includes(event.eventType)) {
    // Freeze first; do not let a delayed checkout restore refunded credits.
    const transactionData =
      obj.transaction && typeof obj.transaction === "object"
        ? (obj.transaction as Record<string, unknown>)
        : {};
    const customerId =
      objectId(obj.customer) || objectId(transactionData.customer);
    if (!customerId)
      throw new Error("Refund/dispute requires customer reconciliation");
    await db().query(
      "UPDATE billing_accounts SET hold_reason='A refund or dispute needs billing reconciliation.' WHERE customer_id=$1",
      [customerId],
    );
  }
  await db().query(
    "INSERT INTO billing_webhooks(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [event.id, event.eventType],
  );
}

export async function flushBillingOutbox() {
  // The review worker owns this dispatcher. Delivery remains at-least-once;
  // Creem event_id is stable across timeouts and process crashes.
  const rows = (
    await db().query(
      "SELECT * FROM billing_outbox WHERE delivered_at IS NULL AND available_at<=now() ORDER BY created_at LIMIT 20",
    )
  ).rows;
  for (const row of rows) {
    try {
      const result = await creemRequest<unknown>("/events/ingest", "POST", {
        events: [row.payload],
      });
      const text = JSON.stringify(result);
      if (
        /no_matching_meter|meter_archived|timestamp_outside_late_window/.test(
          text,
        )
      ) {
        await db().query(
          "UPDATE billing_outbox SET error='Accepted event did not aggregate; manual reconciliation required',available_at='infinity' WHERE id=$1",
          [row.id],
        );
        await db().query(
          "UPDATE billing_accounts SET hold_reason='Usage meter requires operator reconciliation.' WHERE organization_id=$1 AND hold_reason IS NULL",
          [row.organization_id],
        );
        continue;
      }
      await db().query(
        "UPDATE billing_outbox SET delivered_at=now(),error=NULL WHERE id=$1",
        [row.id],
      );
    } catch {
      await db().query(
        "UPDATE billing_outbox SET attempts=attempts+1,error='Creem usage delivery needs retry or reconciliation',available_at=now()+interval '5 minutes' WHERE id=$1",
        [row.id],
      );
      // Bound exposure when metering is unavailable. Owner/complimentary access
      // remains exempt, and the console exposes the queue for reconciliation.
      await db().query(
        "UPDATE billing_accounts SET hold_reason='Usage billing synchronization is delayed. Reviews will resume after reconciliation.' WHERE organization_id=$1 AND hold_reason IS NULL",
        [row.organization_id],
      );
    }
  }
  await db().query(
    `UPDATE billing_accounts b SET hold_reason=NULL WHERE hold_reason='Usage billing synchronization is delayed. Reviews will resume after reconciliation.' AND NOT EXISTS(SELECT 1 FROM billing_outbox o WHERE o.organization_id=b.organization_id AND o.delivered_at IS NULL)`,
  );
}

export async function refreshBillingSubscription(organizationId: string) {
  const b = await billingAccount(organizationId);
  if (b.subscription_id)
    await syncSubscription(await getSubscription(b.subscription_id));
}
