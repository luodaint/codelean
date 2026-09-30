import { headers } from "next/headers";
import { auth, requireUser } from "./auth";
import { db } from "./db";
import { GitHub } from "./github";
export async function userGitHub() {
  const session = await requireUser();
  if (!session.user.githubId) throw new Error("Sign in with GitHub first");
  const account = (
    await db().query(
      'SELECT id FROM account WHERE "userId"=$1 AND "providerId"=$2',
      [session.user.id, "github"],
    )
  ).rows[0];
  if (!account) throw new Error("GitHub identity unavailable");
  const token = await auth().api.getAccessToken({
    body: { accountId: account.id },
    headers: await headers(),
  });
  return new GitHub(token.accessToken);
}
