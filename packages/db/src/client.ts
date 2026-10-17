import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Connects as the restricted application role. Row-level security applies to every query. */
export function createDb(url = process.env.DATABASE_URL): { db: Database; close: () => Promise<void> } {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

/**
 * Run `fn` in a transaction scoped to one society. The setting is transaction-local,
 * so a pooled connection can never leak one society's scope into another request.
 */
export async function withSociety<T>(db: Database, societyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.society_id', ${societyId}, true)`);
    return fn(tx);
  });
}
