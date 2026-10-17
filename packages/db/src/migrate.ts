/**
 * Applies migrations as the database owner (DATABASE_ADMIN_URL), never as the app role,
 * then sets the app role's password from APP_DB_PASSWORD so no secret lives in the repo.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL is not set");
const appPassword = process.env.APP_DB_PASSWORD;

const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
if (appPassword) {
  if (appPassword.length < 24) throw new Error("APP_DB_PASSWORD must be at least 24 characters");
  await client.unsafe(`alter role coop_app password '${appPassword.replaceAll("'", "''")}'`);
}
await client.end();
console.log(`Migrations applied${appPassword ? "; app role password set" : ""}`);
