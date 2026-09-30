import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { handleEvent } from "../src/lib/events";
import { db } from "../src/lib/db";
import { current, Superseded } from "../src/lib/pipeline";
import { GitHub } from "../src/lib/github";
import type { Run, Repository } from "../src/lib/types";
const suite = describe.skipIf(!process.env.TEST_DATABASE_URL);
suite("PostgreSQL webhook and queue integration", () => {
  const repoId = 987654321,
    installation = 7654321;
  const deliveries: string[] = [];
  const repo: Repository = {
    id: String(repoId),
    installation_id: String(installation),
    full_name: "test/fixture",
    enabled: true,
    connected: true,
    labels_enabled: false,
  };
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    await db().query(
      "INSERT INTO repositories(id,installation_id,full_name,enabled) VALUES($1,$2,'test/fixture',true) ON CONFLICT(id) DO UPDATE SET enabled=true,connected=true",
      [repoId, installation],
    );
  });
  afterAll(async () => {
    await db().query("DELETE FROM runs WHERE repository_id=$1", [repoId]);
    await db().query("DELETE FROM repositories WHERE id=$1", [repoId]);
    await db().query("DELETE FROM deliveries WHERE id=ANY($1::text[])", [
      deliveries,
    ]);
    await db().end();
  });
  function event(head: string) {
    return {
      action: "opened",
      installation: { id: installation },
      repository: { id: repoId },
      pull_request: {
        number: 1,
        title: "Fixture review",
        state: "open",
        draft: false,
        head: { sha: head.repeat(40) },
        base: { sha: "a".repeat(40) },
      },
    };
  }
  function delivery() {
    const id = randomUUID();
    deliveries.push(id);
    return id;
  }
  it("atomically deduplicates simultaneous webhook deliveries", async () => {
    const id = delivery();
    const results = await Promise.all([
      handleEvent(id, "pull_request", event("b")),
      handleEvent(id, "pull_request", event("b")),
    ]);
    expect(results.sort()).toEqual(["duplicate", "queued"]);
    expect(
      (await db().query("SELECT * FROM runs WHERE repository_id=$1", [repoId]))
        .rowCount,
    ).toBe(1);
  });
  it("keeps the newest queued revision when an old webhook arrives late", async () => {
    await handleEvent(delivery(), "pull_request", event("c"));
    await handleEvent(delivery(), "pull_request", event("b"));
    expect(
      (
        await db().query(
          "SELECT status FROM runs WHERE repository_id=$1 AND head_sha=$2",
          [repoId, "c".repeat(40)],
        )
      ).rows[0].status,
    ).toBe("queued");
  });
  it("checks authoritative PR state before publishing a stale revision", async () => {
    const run = (
      await db().query<Run>(
        "UPDATE runs SET status='running' WHERE repository_id=$1 AND head_sha=$2 RETURNING *",
        [repoId, "b".repeat(40)],
      )
    ).rows[0];
    const gh = {
      request: async () => ({
        head: { sha: "c".repeat(40) },
        base: { sha: "a".repeat(40) },
        state: "open",
        draft: false,
      }),
    } as unknown as GitHub;
    await expect(current(run, gh, repo)).rejects.toBeInstanceOf(Superseded);
  });
  it("rolls back the delivery receipt when payload validation fails", async () => {
    const id = delivery();
    await expect(handleEvent(id, "pull_request", {})).rejects.toThrow();
    expect(
      (await db().query("SELECT 1 FROM deliveries WHERE id=$1", [id])).rowCount,
    ).toBe(0);
  });
  it("disconnecting an installation cancels its pending runs", async () => {
    await handleEvent(delivery(), "installation", {
      action: "deleted",
      installation: { id: installation },
    });
    expect(
      (
        await db().query(
          "SELECT 1 FROM runs WHERE repository_id=$1 AND status IN ('running','queued')",
          [repoId],
        )
      ).rowCount,
    ).toBe(0);
  });
});
