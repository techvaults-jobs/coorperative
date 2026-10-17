import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/coop_dev" },
});
