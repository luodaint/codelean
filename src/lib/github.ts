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
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
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
export async function syncRepositories() {
  const installations = await new GitHub(appJwt()).pages<{
    id: number;
    suspended_at: string | null;
  }>("/app/installations");
  const repos: { id: number; full_name: string; installation: number }[] = [];
  for (const install of installations.filter((i) => !i.suspended_at)) {
    const gh = await installationClient(String(install.id));
    for (let page = 1; page <= 100; page++) {
      const result = await gh.request<{
        repositories: { id: number; full_name: string }[];
      }>(`/installation/repositories?per_page=100&page=${page}`);
      repos.push(
        ...result.repositories.map((r) => ({ ...r, installation: install.id })),
      );
      if (result.repositories.length < 100) break;
      if (page === 100) throw new Error("Repository listing limit reached");
    }
  }
  await transaction(async (c) => {
    await c.query("UPDATE repositories SET connected=false");
    for (const r of repos)
      await c.query(
        `INSERT INTO repositories(id, installation_id, full_name) VALUES ($1,$2,$3)
      ON CONFLICT(id) DO UPDATE SET installation_id=$2, full_name=$3, connected=true`,
        [r.id, r.installation, r.full_name],
      );
    await c.query(
      "UPDATE runs SET status='cancelled', stage='Repository disconnected', completed_at=now() WHERE status IN ('queued','running') AND repository_id IN (SELECT id FROM repositories WHERE NOT connected)",
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
