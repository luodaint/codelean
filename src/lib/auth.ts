import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth-server";
import { appUrl } from "./config";
import { signupAllowed } from "./auth-policy";
import { workspaceFor, canManage } from "./workspaces";
export { auth } from "./auth-server";
export async function userSession() {
  const session = await auth().api.getSession({ headers: await headers() });
  return session &&
    session.user.emailVerified &&
    signupAllowed(session.user.email)
    ? session
    : null;
}
export async function isSignedIn() {
  return Boolean(await userSession());
}
export async function requireUser() {
  const session = await userSession();
  if (!session) redirect("/login");
  return session;
}
export async function requireMutation() {
  const session = await requireUser();
  if ((await headers()).get("origin") !== new URL(appUrl()).origin)
    throw new Error("Invalid request origin");
  return session;
}
export async function requireWorkspace(manage = false) {
  const session = await requireUser();
  const id = session.session.activeOrganizationId;
  const workspace = id ? await workspaceFor(session.user.id, id) : null;
  if (!workspace) redirect("/workspaces");
  if (manage && !canManage(workspace))
    throw new Error("A workspace owner or administrator is required");
  return { session, workspace };
}
