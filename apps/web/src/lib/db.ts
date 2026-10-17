import "server-only";
import { createDb, type Database } from "@techvaults/db";

let cached: Database | undefined;

/** Shared connection pool, connected as the restricted coop_app role. */
export function db(): Database {
  cached ??= createDb().db;
  return cached;
}
