"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, requireMutation, requireWorkspace } from "@/lib/auth";
import { db, transaction } from "@/lib/db";
import { syncRepositories, OrganizationAccessError } from "@/lib/github";
import { userGitHub } from "@/lib/github-user";

export async function logout() {
  await requireMutation();
  await auth().api.signOut({ headers: await headers() });
  const jar = await cookies();
  for (const cookie of jar.getAll())
    if (
      cookie.name.startsWith("better-auth.") ||
      cookie.name.startsWith("__Secure-better-auth.")
    )
      jar.delete(cookie.name);
  redirect("/login");
}
export async function sync(form: FormData) {
  await requireMutation();
  const { session, workspace } = await requireWorkspace(true);
  const installation = z
    .string()
    .regex(/^\d+$/)
    .parse(form.get("installation"));
  try {
    await syncRepositories(
      workspace.id,
      installation,
      session.user.id,
      session.user.githubId || "",
      await userGitHub(),
    );
  } catch (error) {
    redirect(
      `/repositories?error=${error instanceof OrganizationAccessError ? error.reason : "sync"}`,
    );
  }
  revalidatePath("/", "layout");
  redirect("/repositories?synced=1");
}
export async function updateRepository(form: FormData) {
  await requireMutation();
  const { workspace } = await requireWorkspace(true);
  const id = z.string().regex(/^\d+$/).parse(form.get("id"));
  await transaction(async (c) => {
    await c.query(
      "UPDATE repositories SET enabled=$2, labels_enabled=$3 WHERE id=$1 AND organization_id=$4 AND connected=true",
      [
        id,
        form.get("enabled") === "on",
        form.get("labels") === "on",
        workspace.id,
      ],
    );
    if (form.get("enabled") !== "on")
      await c.query(
        "UPDATE runs SET status='cancelled', completed_at=now(), stage='Repository paused' WHERE repository_id=$1 AND repository_id IN (SELECT id FROM repositories WHERE organization_id=$2) AND status IN ('queued','running')",
        [id, workspace.id],
      );
  });
  revalidatePath("/", "layout");
}
export async function retryRun(form: FormData) {
  await requireMutation();
  const { workspace } = await requireWorkspace(true);
  const id = z.uuid().parse(form.get("id"));
  await db().query(
    `UPDATE runs SET status='queued', stage='Retry requested', error=NULL, attempts=0, completed_at=NULL, available_at=now()
    WHERE id=$1 AND status IN ('failed','cancelled') AND repository_id IN (SELECT id FROM repositories WHERE organization_id=$2 AND enabled AND connected)`,
    [id, workspace.id],
  );
  revalidatePath(`/runs/${id}`);
  revalidatePath("/");
}
