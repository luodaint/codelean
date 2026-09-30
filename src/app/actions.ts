"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, requireMutation } from "@/lib/auth";
import { db, transaction } from "@/lib/db";
import { syncRepositories } from "@/lib/github";

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
export async function sync() {
  await requireMutation();
  try {
    await syncRepositories();
  } catch {
    redirect("/repositories?error=sync");
  }
  revalidatePath("/", "layout");
  redirect("/repositories?synced=1");
}
export async function updateRepository(form: FormData) {
  await requireMutation();
  const id = z.string().regex(/^\d+$/).parse(form.get("id"));
  await transaction(async (c) => {
    await c.query(
      "UPDATE repositories SET enabled=$2, labels_enabled=$3 WHERE id=$1 AND connected=true",
      [id, form.get("enabled") === "on", form.get("labels") === "on"],
    );
    if (form.get("enabled") !== "on")
      await c.query(
        "UPDATE runs SET status='cancelled', completed_at=now(), stage='Repository paused' WHERE repository_id=$1 AND status IN ('queued','running')",
        [id],
      );
  });
  revalidatePath("/", "layout");
}
export async function retryRun(form: FormData) {
  await requireMutation();
  const id = z.uuid().parse(form.get("id"));
  await db().query(
    `UPDATE runs SET status='queued', stage='Retry requested', error=NULL, attempts=0, completed_at=NULL, available_at=now()
    WHERE id=$1 AND status IN ('failed','cancelled') AND repository_id IN (SELECT id FROM repositories WHERE enabled AND connected)`,
    [id],
  );
  revalidatePath(`/runs/${id}`);
  revalidatePath("/");
}
