"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMutation, requireWorkspace } from "@/lib/auth";
import { billingAccount, complimentary } from "@/lib/billing";
import { billingEnabled, parseLimit } from "@/lib/billing-policy";
import {
  createBillingCheckout,
  refreshBillingSubscription,
} from "@/lib/billing-creem";
import { creemRequest, creemRedirect } from "@/lib/creem";
import { transaction } from "@/lib/db";

async function owner() {
  await requireMutation();
  const context = await requireWorkspace();
  if (context.workspace.role !== "owner")
    throw new Error("Only workspace owners can manage billing.");
  if (!billingEnabled())
    throw new Error("Payments are disabled on this instance.");
  return context;
}
export async function checkout(form: FormData) {
  const { session, workspace } = await owner();
  const kind = form.get("kind");
  if (kind !== "plan" && kind !== "tokens") throw new Error("Invalid purchase");
  if (form.get("accept") !== "on")
    throw new Error("Accept the displayed price before continuing.");
  let url: string;
  try {
    url = await createBillingCheckout(
      workspace.id,
      session.user.email,
      workspace.name,
      kind,
    );
  } catch {
    redirect("/billing?error=checkout");
  }
  redirect(url);
}
export async function portal() {
  const { workspace } = await owner();
  const b = await billingAccount(workspace.id);
  if (!b.customer_id) throw new Error("No billing customer yet.");
  const result = await creemRequest<{ customer_portal_link: string }>(
    "/customers/billing",
    "POST",
    { customer_id: b.customer_id },
  );
  redirect(creemRedirect(result.customer_portal_link));
}
export async function setLimit(form: FormData) {
  const { workspace, session } = await owner();
  let cap: bigint | null;
  try {
    cap = parseLimit(String(form.get("limit") || ""));
  } catch {
    redirect("/billing?error=limit");
  }
  await transaction(async (c) => {
    const b = await billingAccount(workspace.id, c);
    await c.query(
      "UPDATE billing_accounts SET extra_limit_cents=$2 WHERE organization_id=$1",
      [workspace.id, cap?.toString() ?? null],
    );
    await c.query(
      "INSERT INTO billing_audit(organization_id,actor_id,action,reason,details) VALUES($1,$2,'spending_limit','Customer changed their spending limit',$3)",
      [
        workspace.id,
        session.user.id,
        JSON.stringify({
          before: b.extra_limit_cents,
          after: cap?.toString() ?? null,
        }),
      ],
    );
  });
  revalidatePath("/billing");
  redirect("/billing?saved=1");
}
export async function refreshBilling() {
  const { workspace } = await owner();
  await refreshBillingSubscription(workspace.id);
  revalidatePath("/billing");
}
export async function cancelPlan() {
  const { workspace } = await owner();
  const b = await billingAccount(workspace.id);
  if (!b.subscription_id || complimentary(b))
    throw new Error("No paid subscription to cancel.");
  await creemRequest(
    `/subscriptions/${encodeURIComponent(b.subscription_id)}/cancel`,
    "POST",
    { mode: "scheduled", onExecute: "cancel" },
  );
  await refreshBillingSubscription(workspace.id);
  revalidatePath("/billing");
}
