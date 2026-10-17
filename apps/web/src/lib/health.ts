import "server-only";
import { sql } from "@techvaults/db";
import { db } from "./db";

export type Health =
  | { ok: true; database: "connected"; guardedTables: number; appendOnlyTriggers: number; checkedAt: string }
  | { ok: false; database: "unavailable"; error: string; checkedAt: string };

/** Confirms the app can reach Postgres as its restricted role and that the guardrails are installed. */
export async function checkHealth(): Promise<Health> {
  const checkedAt = new Date().toISOString();
  if (!process.env.DATABASE_URL) {
    return { ok: false, database: "unavailable", error: "DATABASE_URL is not set", checkedAt };
  }
  try {
    const [row] = await db().execute<{ guarded: number; triggers: number }>(sql`
      select
        (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) as guarded,
        (select count(*)::int from pg_trigger where tgname like '%append_only') as triggers
    `);
    return { ok: true, database: "connected", guardedTables: row!.guarded, appendOnlyTriggers: row!.triggers, checkedAt };
  } catch (e) {
    // Never echo connection strings or driver detail to the client.
    console.error("Health check failed", e);
    return { ok: false, database: "unavailable", error: "Database check failed", checkedAt };
  }
}
