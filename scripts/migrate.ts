import { readdir, readFile } from "node:fs/promises";
import { db, transaction } from "../src/lib/db";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/lib/auth-server";
try {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(7043921)");
    const plan = await getMigrations(auth().options);
    await plan.runMigrations();
    console.log("Better Auth schema is ready");
  });
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(7043921)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await client.query(await readFile(`migrations/${name}`, "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [
        name,
      ]);
      if (name === "002_workspaces.sql") {
        // Only pre-existing allowlisted users inherit the original private workspace.
        const emails = (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        await client.query(
          `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
          SELECT gen_random_uuid()::text, 'codelean-legacy', id, 'owner', now() FROM "user" WHERE lower(email)=ANY($1::text[]) AND "emailVerified"=true`,
          [emails],
        );
      }
      console.log(`Applied ${name}`);
    }
  });
} finally {
  await db().end();
}
