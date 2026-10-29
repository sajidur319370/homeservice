import pg from "pg";
import { env } from "../config/env.ts";

// A pool keeps a few open connections and lends one to each query.
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

// Neon closes idle connections. Without this handler that error would crash the process.
pool.on("error", (err) => console.error("Idle database client error:", err.message));

// Either the pool (one-off queries) or one client inside a transaction.
export type Db = pg.Pool | pg.PoolClient;
type Row = pg.QueryResultRow;

// Values ALWAYS go in `params` ($1, $2 …), never into the SQL string: no SQL injection.
export async function query<T extends Row = Row>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const result = await db.query<T>(sql, params);
  return result.rows;
}

export async function queryOne<T extends Row = Row>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T | undefined> {
  const rows = await query<T>(sql, params, db);
  return rows[0];
}

// Runs fn inside BEGIN … COMMIT. Any error → ROLLBACK, so it's all or nothing.
export async function withTransaction<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
export function isPgError(err: unknown, code: string): boolean {
  return err instanceof Error && "code" in err && err.code === code;
}
