import { createSign } from "node:crypto";
import { required } from "./config";
import { db, transaction } from "./db";
import type { Repository } from "./types";

function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const body = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat: now - 60, exp: now + 540, iss: required("GITHUB_APP_ID") })}`;
  const key = Buffer.from(
    required("GITHUB_PRIVATE_KEY_BASE64"),
    "base64",
  ).toString();
  return `${body}.${createSign("RSA-SHA256").update(body).sign(key).toString("base64url")}`;
}
export class GitHubAPIError extends Error {
  constructor(public status: number) {
    super(`GitHub API returned ${status}`);
  }
}
export class OrganizationAccessError extends Error {
  constructor(public reason: "organization-permission" | "organization-owner") {
    super(
      reason === "organization-permission"
        ? "GitHub organization membership access requires Members read permission"
        : "A GitHub organization owner must connect this installation",
    );
  }
}
export class GitHub {
  constructor(private token: string) {}
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Invalid GitHub API path");
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!response.ok) throw new GitHubAPIError(response.status);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  async pages<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; page <= 100; page++) {
      const rows = await this.request<T[]>(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      all.push(...rows);
      if (rows.length < 100) return all;
    }
    throw new Error("GitHub pagination limit reached");
  }
}
export async function installationClient(
  id: string,
  repoId?: string,
  write = false,
  labels = false,
) {
  const permissions = write
    ? {
        contents: "read",
        pull_requests: "write",
        checks: "write",
        ...(labels ? { issues: "write" } : {}),
      }
    : { contents: "read", pull_requests: "read" };
  const { token } = await new GitHub(appJwt()).request<{ token: string }>(
    `/app/installations/${id}/access_tokens`,
    "POST",
    { permissions, ...(repoId ? { repository_ids: [Number(repoId)] } : {}) },
  );
  return new GitHub(token);
}
export type UserInstallation = {
  id: number;
  app_id: number;
  suspended_at: string | null;
  account: { id: number; login: string; type: string };
};
export async function userInstallations(gh: GitHub) {
  const all: UserInstallation[] = [];
  for (let page = 1; page <= 100; page++) {
    const result = await gh.request<{ installations: UserInstallation[] }>(
      `/user/installations?per_page=100&page=${page}`,
    );
    all.push(
      ...result.installations.filter(
        (i) =>
          i.app_id === Number(required("GITHUB_APP_ID")) && !i.suspended_at,
      ),
    );
    if (result.installations.length < 100) return all;
  }
  throw new Error("Installation listing limit reached");
}
export async function authorizeInstallation(
  gh: GitHub,
  installationId: string,
  githubUserId: string,
) {
  const installation = (await userInstallations(gh)).find(
    (i) => String(i.id) === installationId,
  );
  if (!installation)
    throw new Error("Installation unavailable for this GitHub account");
  if (installation.account.type === "User") {
    if (String(installation.account.id) !== githubUserId)
      throw new Error(
        "Only the GitHub account owner can connect this installation",
      );
  } else if (installation.account.type === "Organization") {
    // The list endpoint can silently omit memberships. Query the selected org
    // explicitly, so missing Members:read approval produces an actionable error.
    let membership: {
      state: string;
      role: string;
      organization: { id: number };
    };
    try {
      membership = await gh.request(
        `/user/memberships/orgs/${encodeURIComponent(installation.account.login)}`,
      );
    } catch (error) {
      if (error instanceof GitHubAPIError && error.status === 403)
        throw new OrganizationAccessError("organization-permission");
      if (error instanceof GitHubAPIError && error.status === 404)
        throw new OrganizationAccessError("organization-owner");
      throw error;
    }
    if (
      membership.state !== "active" ||
      membership.role !== "admin" ||
      membership.organization.id !== installation.account.id
    )
      throw new OrganizationAccessError("organization-owner");
  } else throw new Error("Unsupported GitHub account type");
  return installation;
}
export async function syncRepositories(
  organizationId: string,
  installationId: string,
  userId: string,
  githubUserId: string,
  userGh: GitHub,
) {
  const install = await authorizeInstallation(
    userGh,
    installationId,
    githubUserId,
  );
  const gh = await installationClient(installationId);
  const repos: { id: number; full_name: string }[] = [];
  for (let page = 1; page <= 100; page++) {
    const result = await gh.request<{
      repositories: { id: number; full_name: string }[];
    }>(`/installation/repositories?per_page=100&page=${page}`);
    repos.push(...result.repositories);
    if (result.repositories.length < 100) break;
    if (page === 100) throw new Error("Repository listing limit reached");
  }
  await transaction(async (c) => {
    // Recheck membership after network I/O and hold it through the mutation.
    const member = await c.query(
      `SELECT role FROM member WHERE "organizationId"=$1 AND "userId"=$2 FOR SHARE`,
      [organizationId, userId],
    );
    if (!member.rows.some((m) => ["owner", "admin"].includes(m.role)))
      throw new Error("Workspace access denied");
    await c.query(
      `INSERT INTO installations(id,organization_id,account_id,account_login) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING`,
      [
        installationId,
        organizationId,
        install.account.id,
        install.account.login,
      ],
    );
    const claimed = (
      await c.query(
        "SELECT organization_id FROM installations WHERE id=$1 FOR UPDATE",
        [installationId],
      )
    ).rows[0];
    if (claimed.organization_id !== organizationId)
      throw new Error("Installation is already connected to another workspace");
    await c.query(
      "UPDATE installations SET account_id=$2,account_login=$3 WHERE id=$1",
      [installationId, install.account.id, install.account.login],
    );
    await c.query(
      "UPDATE repositories SET connected=false WHERE organization_id=$1 AND installation_id=$2",
      [organizationId, installationId],
    );
    for (const r of repos) {
      const saved = await c.query(
        `INSERT INTO repositories(id,installation_id,full_name,organization_id) VALUES($1,$2,$3,$4)
        ON CONFLICT(id) DO UPDATE SET installation_id=$2,full_name=$3,connected=true WHERE repositories.organization_id=$4 RETURNING id`,
        [r.id, installationId, r.full_name, organizationId],
      );
      if (!saved.rowCount)
        throw new Error("Repository belongs to another workspace");
    }
    await c.query(
      `UPDATE runs SET status='cancelled',stage='Repository disconnected',completed_at=now() WHERE status IN ('queued','running') AND repository_id IN (SELECT id FROM repositories WHERE organization_id=$1 AND NOT connected)`,
      [organizationId],
    );
  });
  return repos.length;
}
export async function getRepository(id: string) {
  return (
    await db().query<Repository>("SELECT * FROM repositories WHERE id=$1", [id])
  ).rows[0];
}
export function repoPath(name: string) {
  return `/repos/${name.split("/").map(encodeURIComponent).join("/")}`;
}
