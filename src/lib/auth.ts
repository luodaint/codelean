import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth-server";
import { appUrl } from "./config";
import { adminEmailAllowed } from "./auth-policy";
export { auth } from "./auth-server";
export async function adminSession() {
  const session = await auth().api.getSession({ headers: await headers() });
  return session &&
    adminEmailAllowed(session.user.email, process.env.ADMIN_EMAILS || "")
    ? session
    : null;
}
export async function isAdmin() {
  return Boolean(await adminSession());
}
export async function requireAdmin() {
  const session = await adminSession();
  if (!session) redirect("/login");
  return session;
}
export async function requireMutation() {
  await requireAdmin();
  if ((await headers()).get("origin") !== new URL(appUrl()).origin)
    throw new Error("Invalid request origin");
}
