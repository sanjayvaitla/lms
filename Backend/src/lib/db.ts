import { Pool, PoolClient } from 'pg';

const isProd = process.env.NODE_ENV === 'production';

// Pool tuned for production: max 20 connections, fail-fast on unreachable DB.
const pool = new Pool({
  connectionString:        process.env.DATABASE_URL,
  ssl:                     isProd ? { rejectUnauthorized: false } : false,
  max:                     20,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 10_000,
  application_name:        'vtricks-lms',
  statement_timeout:       15_000,   // kill queries exceeding 15s
});

export type DbTransaction = PoolClient;

export async function query<T = any>(
  sql: string,
  params: unknown[] = [],
  transaction?: DbTransaction
): Promise<{ rows: T[]; rowCount: number }> {
  const client = transaction ?? pool;
  const result = await client.query(sql, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export async function transaction<T>(
  callback: (client: DbTransaction) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const db = { query, transaction, pool };
export default db;
