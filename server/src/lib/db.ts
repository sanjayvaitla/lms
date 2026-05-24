import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
