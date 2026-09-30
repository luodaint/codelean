"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutation } from "@/lib/auth";
import { requireOperator } from "@/lib/operator";
import { billingAccount } from "@/lib/billing";
import { transaction } from "@/lib/db";
import { creemRequest, getSubscription } from "@/lib/creem";
export async function updateAccess(form: FormData) {
  await requireMutation();
  const session = await requireOperator();
  const id = z.string().min(1).max(255).parse(form.get("organizationId"));
  const reason = z.string().min(3).max(500).parse(form.get("reason"));
  const action = z
    .enum(["grant", "revoke", "limits", "clear-hold"])
    .parse(form.get("action"));
  await transaction(async (c) => {
    const b = await billingAccount(id, c);
    if (action === "grant") {
      const date = String(form.get("until") || "");
      const until = date ? z.iso.date().parse(date) + "T23:59:59.999Z" : null;
      if (until && Date.parse(until) <= Date.now())
        throw new Error("Expiry must be in the future.");
      if (
        (
          await c.query(
            "SELECT 1 FROM billing_attempts WHERE organization_id=$1 AND state='running'",
            [id],
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
            [id],
          )
        ).rowCount
      )
        throw new Error(
          "Reconcile pending usage before making this workspace free.",
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM billing_checkouts WHERE organization_id=$1 AND kind='plan' AND completed_at IS NULL",
            [id],
          )
        ).rowCount
      )
        throw new Error(
          "Resolve pending subscription checkouts before granting free access.",
        );
      if (b.subscription_id) {
        const current = await getSubscription(b.subscription_id);
        if (current.status !== "canceled")
          await creemRequest(
            `/subscriptions/${encodeURIComponent(b.subscription_id)}/cancel`,
            "POST",
            { mode: "immediate" },
          );
        if ((await getSubscription(b.subscription_id)).status !== "canceled")
          throw new Error(
            "Creem has not confirmed cancellation; complimentary access was not applied.",
          );
        await c.query(
          "UPDATE billing_accounts SET subscription_status='canceled' WHERE organization_id=$1",
          [id],
        );
      }
      await c.query(
        "UPDATE billing_accounts SET complimentary=true,complimentary_until=$2 WHERE organization_id=$1",
        [id, until],
      );
    } else if (action === "revoke") {
      if (b.owner_exempt)
        throw new Error("The owner's permanent exemption cannot be revoked.");
      await c.query(
        "UPDATE billing_accounts SET complimentary=false,complimentary_until=NULL WHERE organization_id=$1",
        [id],
      );
    } else if (action === "limits") {
      const repositories = z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .parse(form.get("repositories"));
      const hourly = z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .parse(form.get("hourly"));
      await c.query(
        "UPDATE billing_accounts SET repository_limit=$2,hourly_limit=$3,paused=$4 WHERE organization_id=$1",
        [id, repositories, hourly, form.get("paused") === "on"],
      );
    } else {
      if (
        (
          await c.query(
            "SELECT 1 FROM billing_outbox WHERE organization_id=$1 AND delivered_at IS NULL",
            [id],
          )
        ).rowCount
      )
        throw new Error("Pending metering must be reconciled first.");
      await c.query(
        "UPDATE billing_accounts SET hold_reason=NULL WHERE organization_id=$1",
        [id],
      );
    }
    const after = await billingAccount(id, c);
    await c.query(
      "INSERT INTO billing_audit(organization_id,actor_id,action,reason,details) VALUES($1,$2,$3,$4,$5)",
      [
        id,
        session.user.id,
        action,
        reason,
        JSON.stringify({ before: b, after }),
      ],
    );
  });
  revalidatePath("/super-admin");
  revalidatePath("/billing");
}
