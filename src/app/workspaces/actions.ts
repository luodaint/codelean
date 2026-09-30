"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth, requireMutation, requireWorkspace } from "@/lib/auth";

export async function createWorkspace(form: FormData) {
  await requireMutation();
  const name = z.string().trim().min(2).max(80).parse(form.get("name"));
  const organization = await auth().api.createOrganization({
    headers: await headers(),
    body: { name, slug: `workspace-${randomUUID()}` },
  });
  await auth().api.setActiveOrganization({
    headers: await headers(),
    body: { organizationId: organization!.id },
  });
  redirect("/");
}
export async function switchWorkspace(form: FormData) {
  await requireMutation();
  const organizationId = z
    .string()
    .min(1)
    .max(100)
    .parse(form.get("organizationId"));
  await auth().api.setActiveOrganization({
    headers: await headers(),
    body: { organizationId },
  });
  redirect("/");
}
export async function inviteMember(form: FormData) {
  await requireMutation();
  const { workspace } = await requireWorkspace(true);
  try {
    await auth().api.createInvitation({
      headers: await headers(),
      body: {
        organizationId: workspace.id,
        email: z.email().parse(form.get("email")),
        role: z.enum(["admin", "member"]).parse(form.get("role")),
      },
    });
  } catch {
    redirect("/settings?error=invitation");
  }
  redirect("/settings?invited=1");
}
export async function acceptInvitation(form: FormData) {
  await requireMutation();
  await auth().api.acceptInvitation({
    headers: await headers(),
    body: { invitationId: z.string().min(1).parse(form.get("invitationId")) },
  });
  revalidatePath("/workspaces");
  redirect("/workspaces");
}
export async function removeMember(form: FormData) {
  await requireMutation();
  const { workspace } = await requireWorkspace(true);
  await auth().api.removeMember({
    headers: await headers(),
    body: {
      organizationId: workspace.id,
      memberIdOrEmail: z.string().min(1).parse(form.get("memberId")),
    },
  });
  revalidatePath("/settings");
}
export async function cancelInvitation(form: FormData) {
  await requireMutation();
  const { workspace } = await requireWorkspace(true);
  const invitationId = z.string().min(1).parse(form.get("invitationId"));
  const invitation = await db().query(
    'SELECT id FROM invitation WHERE id=$1 AND "organizationId"=$2',
    [invitationId, workspace.id],
  );
  if (!invitation.rowCount) throw new Error("Invitation unavailable");
  // Better Auth also verifies the invitation's own workspace and caller role.
  await auth().api.cancelInvitation({
    headers: await headers(),
    body: { invitationId },
  });
  revalidatePath("/settings");
}
