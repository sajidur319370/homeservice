import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { pool } from "./db/client.ts";

await pool.query("SELECT 1"); // fail fast if the database is unreachable
console.log("✅ Postgres connected");

const server = app.listen(env.PORT, () => {
  console.log(`🚀 API running on http://localhost:${env.PORT}`);
});

// Render sends SIGTERM before a redeploy: stop taking requests, finish open ones, close the pool.
process.on("SIGTERM", () => {
  server.close(() => void pool.end());
});
