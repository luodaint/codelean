import pg from "pg";
import { required } from "./config";
const globalDb = globalThis as unknown as { codeleanPool?: pg.Pool };
export function db() {
  return (globalDb.codeleanPool ??= new pg.Pool({
    connectionString: required("DATABASE_URL"),
    max: 8,
    connectionTimeoutMillis: 5000,
  }));
}
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
