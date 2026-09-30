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
    const checks: { id: number; external_id: string; name: string }[] = [];
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
      securityAudit: {
        status: "completed",
        scope: "changed-files",
        summary: "One retained security candidate.",
        skills: [{ id: "demo", name: "Demo audit", sha256: "a".repeat(64) }],
        tokens: 24,
        model: "test-model",
        candidates: 1,
        retained: 1,
        verification: "source-model-pass",
      },
      findings: [
        {
          source: "security-audit",
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
        if (method === "GET" && path.includes("/check-runs?")) {
          const name = new URL(path, "https://api.github.com").searchParams.get(
            "check_name",
          );
          return { check_runs: checks.filter((check) => check.name === name) };
        }
        writes.push({ method, body });
        if (path.endsWith("/check-runs") && method === "POST") {
          checks.push({
            id: 101,
            external_id: String(body.external_id),
            name: String(body.name),
          });
          return { id: 101 };
        }
        if (path.endsWith("/check-runs/101")) {
          checks[0].name = String(body.name);
          return { id: 101 };
        }
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
            user: { login: "codelean-test[bot]" },
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
      vi.stubEnv("GITHUB_APP_SLUG", "codelean-test");
      vi.stubEnv("APP_URL", "http://localhost:3100");
      await db().query(
        "INSERT INTO installations(id,organization_id) VALUES($1,'codelean-legacy')",
        [repo.installation_id],
      );
      await db().query(
        "INSERT INTO repositories(id,installation_id,full_name,enabled,organization_id) VALUES($1,$2,$3,true,'codelean-legacy')",
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
      await db().query("DELETE FROM installations WHERE id=$1", [
        repo.installation_id,
      ]);
      await db().end();
      vi.unstubAllEnvs();
    });
    it("resumes the check and reconciles comments/reviews on repeated publication", async () => {
      await beginCheck(run, repo, gh);
      await publish(run, result, repo, gh);
      await publish(run, result, repo, gh);
      expect(checks).toHaveLength(1);
      expect(comments).toHaveLength(1);
      expect(comments[0].body).toContain("### PR security audit");
      expect(comments[0].body).toContain("Demo audit");
      expect(reviews).toHaveLength(1);
      expect(writes.find((w) => w.body.event)?.body.event).toBe("COMMENT");
      expect(writes.find((w) => w.body.event)?.body.comments).toEqual([
        expect.objectContaining({
          path: "code.js",
          line: 1,
          side: "RIGHT",
          body: expect.stringContaining("Parse structured input"),
        }),
      ]);
      expect(
        writes
          .filter((w) => w.body.event)
          .every((w) => w.body.event === "COMMENT"),
      ).toBe(true);
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
    it("reuses pre-Codelean checks and bot comments after the rename", async () => {
      checks[0].name = "Luoda review";
      comments[0].body = "<!-- luoda-pr-checker:summary -->\nOld review";
      reviews[0].body = `<!-- luoda-pr-checker:run:${run.id} -->`;
      await beginCheck(run, repo, gh);
      await publish(run, result, repo, gh);
      expect(checks).toHaveLength(1);
      expect(checks[0].name).toBe("Codelean review");
      expect(comments).toHaveLength(1);
      expect(comments[0].body).toContain("## Codelean review");
      expect(reviews).toHaveLength(1);
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
