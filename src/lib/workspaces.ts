import { db } from "./db";
export type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: string;
};
export async function workspacesFor(userId: string) {
  return (
    await db().query<Workspace>(
      `SELECT o.id,o.name,o.slug,m.role FROM organization o
    JOIN member m ON m."organizationId"=o.id WHERE m."userId"=$1 ORDER BY o.name`,
      [userId],
    )
  ).rows;
}
export async function workspaceFor(userId: string, organizationId: string) {
  return (
    (
      await db().query<Workspace>(
        `SELECT o.id,o.name,o.slug,m.role FROM organization o
    JOIN member m ON m."organizationId"=o.id WHERE m."userId"=$1 AND o.id=$2`,
        [userId, organizationId],
      )
    ).rows[0] ?? null
  );
}
export function canManage(workspace: Workspace) {
  return ["owner", "admin"].includes(workspace.role);
}
