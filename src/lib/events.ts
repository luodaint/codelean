import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "./db";
import { assertReviewAccess } from "./billing";
import { BillingBlocked, billingEnabled } from "./billing-policy";
const id = z.number().int().positive().safe();
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const prEvent = z.object({
  action: z.string(),
  installation: z.object({ id }),
  repository: z.object({ id }),
  pull_request: z.object({
    number: z.number().int().positive(),
    title: z.string().max(2000),
    draft: z.boolean().optional(),
    state: z.enum(["open", "closed"]),
    head: z.object({ sha }),
    base: z.object({ sha }),
  }),
});

export async function handleEvent(
  delivery: string,
  event: string,
  payload: unknown,
) {
  return transaction(async (c) => {
    if (
      !(
        await c.query(
          "INSERT INTO deliveries(id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id",
          [delivery],
        )
      ).rowCount
    )
      return "duplicate";
    if (event === "installation" || event === "installation_repositories") {
      const data = z
        .object({
          action: z.string(),
          installation: z.object({ id }),
          repositories_removed: z.array(z.object({ id })).optional(),
        })
        .parse(payload);
      if (["deleted", "suspend"].includes(data.action))
        await c.query(
          "UPDATE repositories SET connected=false WHERE installation_id=$1",
          [data.installation.id],
        );
      for (const repo of data.repositories_removed || [])
        await c.query(
          "UPDATE repositories SET connected=false WHERE id=$1 AND installation_id=$2",
          [repo.id, data.installation.id],
        );
      await c.query(
        "UPDATE runs SET status='cancelled', stage='Repository disconnected', completed_at=now() WHERE status IN ('queued','running') AND repository_id IN (SELECT id FROM repositories WHERE NOT connected)",
      );
      return "installation updated";
    }
    if (event !== "pull_request") return "ignored";
    const {
      action,
      installation,
      repository,
      pull_request: pr,
    } = prEvent.parse(payload);
    // Lock workspace billing before repositories, matching settings/retry actions.
    const mapping = (
      await c.query(
        "SELECT organization_id FROM repositories WHERE id=$1 AND installation_id=$2",
        [repository.id, installation.id],
      )
    ).rows[0];
    if (!mapping) return "repository disabled";
    try {
      await assertReviewAccess(mapping.organization_id, c);
    } catch (error) {
      if (error instanceof BillingBlocked) return "billing paused";
      throw error;
    }
    // Serialize authorization and enqueueing against concurrent repository changes.
    const repo = (
      await c.query(
        "SELECT * FROM repositories WHERE id=$1 AND installation_id=$2 FOR UPDATE",
        [repository.id, installation.id],
      )
    ).rows[0];
    if (
      !repo?.enabled ||
      !repo.connected ||
      repo.organization_id !== mapping.organization_id
    )
      return "repository disabled";
    if (pr.state === "closed" || pr.draft) {
      // Deliveries can arrive out of order. The worker checks authoritative PR state.
      return "ignored";
    }
    if (
      ![
        "opened",
        "synchronize",
        "reopened",
        "ready_for_review",
        "edited",
      ].includes(action)
    )
      return "ignored";
    const result = await c.query(
      `INSERT INTO runs(id, repository_id, pr_number, title, head_sha, base_sha) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT(repository_id, pr_number, head_sha, base_sha) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        repository.id,
        pr.number,
        pr.title,
        pr.head.sha,
        pr.base.sha,
      ],
    );
    if (result.rowCount && billingEnabled()) {
      await c.query(
        "UPDATE runs SET available_at=now()+interval '60 seconds' WHERE id=$1",
        [result.rows[0].id],
      );
      const queued = (
        await c.query(
          "SELECT count(*)::int AS n FROM runs r JOIN repositories p ON p.id=r.repository_id WHERE p.organization_id=$1 AND r.status='queued'",
          [repo.organization_id],
        )
      ).rows[0].n;
      if (queued > 10)
        await c.query(
          "UPDATE runs SET status='failed',stage='Review paused · Queue limit',error='Workspace queue is full. Retry after current reviews finish.',completed_at=now() WHERE id=$1",
          [result.rows[0].id],
        );
    }
    return result.rowCount ? "queued" : "already reviewed";
  });
}
