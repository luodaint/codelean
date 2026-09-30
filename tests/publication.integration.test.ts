import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { beginCheck, publish, Superseded } from "../src/lib/pipeline";
import type { GitHub } from "../src/lib/github";
import type { Repository, ReviewResult, Run } from "../src/lib/types";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "GitHub publication reconciliation",
  () => {
    const repositoryId = "987654322";
    const repo: Repository = {
      id: repositoryId,
      installation_id: "7654322",
      full_name: "test/publication",
      enabled: true,
      connected: true,
      labels_enabled: false,
    };
    let run: Run;
    const checks: { id: number; external_id: string }[] = [];
    const comments: {
      id: number;
      body: string;
      performed_via_github_app: { id: number };
    }[] = [];
    const reviews: { id: number; body: string; user: { login: string } }[] = [];
    let head = "b".repeat(40);
    const writes: { method: string; body: Record<string, unknown> }[] = [];
    const result: ReviewResult = {
      summary: "Check this issue",
      files: 1,
      skipped: [],
      coverage: "complete",
      warnings: [],
      scanners: ["semgrep"],
      findings: [
        {
          source: "ai",
          severity: "high",
          path: "code.js",
          line: 1,
          title: "Unsafe evaluation",
          description: "Input reaches eval",
          evidence: "eval(input)",
          recommendation: "Parse structured input",
        },
      ],
    };
    const gh = {
      request: async (
        path: string,
        method = "GET",
        body: Record<string, unknown> = {},
      ) => {
        if (path.endsWith("/pulls/1"))
          return {
            state: "open",
            draft: false,
            head: { sha: head },
            base: { sha: "a".repeat(40) },
          };
        if (method === "GET" && path.includes("/check-runs?"))
          return { check_runs: checks };
        writes.push({ method, body });
        if (path.endsWith("/check-runs") && method === "POST") {
          checks.push({ id: 101, external_id: String(body.external_id) });
          return { id: 101 };
        }
        if (path.endsWith("/check-runs/101")) return { id: 101 };
        if (path.endsWith("/comments") && method === "POST") {
          comments.push({
            id: 201,
            body: String(body.body),
            performed_via_github_app: { id: 123 },
          });
          return { id: 201 };
        }
        if (path.endsWith("/comments/201")) {
          comments[0].body = String(body.body);
          return { id: 201 };
        }
        if (path.endsWith("/reviews") && method === "POST") {
          reviews.push({
            id: 301,
            body: String(body.body),
            user: { login: "luoda-test[bot]" },
          });
          return { id: 301 };
        }
        throw new Error(`Unexpected fake GitHub request: ${method} ${path}`);
      },
      pages: async (path: string) =>
        path.endsWith("/comments")
          ? comments
          : path.endsWith("/reviews")
            ? reviews
            : [],
    } as unknown as GitHub;
    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL!);
      vi.stubEnv("GITHUB_APP_ID", "123");
      vi.stubEnv("GITHUB_APP_SLUG", "luoda-test");
      vi.stubEnv("APP_URL", "http://localhost:3100");
      await db().query(
        "INSERT INTO repositories(id,installation_id,full_name,enabled) VALUES($1,$2,$3,true)",
        [repo.id, repo.installation_id, repo.full_name],
      );
      run = (
        await db().query<Run>(
          "INSERT INTO runs(id,repository_id,pr_number,title,head_sha,base_sha,status) VALUES($1,$2,1,'Fixture',$3,$4,'running') RETURNING *",
          [randomUUID(), repo.id, head, "a".repeat(40)],
        )
      ).rows[0];
    });
    afterAll(async () => {
      await db().query("DELETE FROM runs WHERE repository_id=$1", [
        repositoryId,
      ]);
      await db().query("DELETE FROM repositories WHERE id=$1", [repositoryId]);
      await db().end();
      vi.unstubAllEnvs();
    });
    it("resumes the check and reconciles comments/reviews on repeated publication", async () => {
      await beginCheck(run, repo, gh);
      await publish(run, result, repo, gh);
      await publish(run, result, repo, gh);
      expect(checks).toHaveLength(1);
      expect(comments).toHaveLength(1);
      expect(reviews).toHaveLength(1);
      expect(writes.find((w) => w.body.event)?.body.event).toBe("COMMENT");
      expect(writes.some((w) => w.body.conclusion === "neutral")).toBe(true);
      const saved = (
        await db().query(
          "SELECT check_id,summary_id,review_id,publication_started FROM runs WHERE id=$1",
          [run.id],
        )
      ).rows[0];
      expect(saved).toEqual({
        check_id: "101",
        summary_id: "201",
        review_id: "301",
        publication_started: true,
      });
    });
    it("makes no further writes after GitHub reports a new head", async () => {
      head = "c".repeat(40);
      const count = writes.length;
      await expect(publish(run, result, repo, gh)).rejects.toBeInstanceOf(
        Superseded,
      );
      expect(writes).toHaveLength(count);
    });
  },
);
