// Applies every migrations/*.sql file that hasn't run yet, in name order.
// Usage: npm run db:migrate   (safe to run again and again)
import { readdir, readFile } from "node:fs/promises";
import { pool, withTransaction } from "./client.ts";

const dir = new URL("../../migrations/", import.meta.url);

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  await withTransaction(async (tx) => {
    // If two deploys run at once, the second waits here instead of applying twice.
    await tx.query("SELECT pg_advisory_xact_lock(20261028)");

    const done = await tx.query("SELECT 1 FROM schema_migrations WHERE version = $1", [file]);
    if (done.rowCount) return;

    await tx.query(await readFile(new URL(file, dir), "utf8"));
    await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
    console.log(`✅ applied ${file}`);
  });
}

console.log("Migrations up to date");
await pool.end();
