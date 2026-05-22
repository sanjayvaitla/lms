import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from './sequelize';

export type DbTransaction = Transaction;

function isSelectQuery(sql: string): boolean {
  return /^\s*SELECT\b/i.test(sql.trim());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T = any>(
  sql: string,
  params: unknown[] = [],
  transaction?: DbTransaction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ rows: T[]; rowCount: number }> {

  const opts = {
    bind:        params as never[],
    transaction: transaction ?? null,
  };

  if (/\bRETURNING\b/i.test(sql) || isSelectQuery(sql)) {
    // Run as SELECT type so Sequelize returns rows directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (await sequelize.query(sql, { ...opts, type: QueryTypes.SELECT })) as any[];
    return { rows: rows as T[], rowCount: rows.length };
  }

  // INSERT / UPDATE / DELETE without RETURNING
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [, meta] = (await sequelize.query(sql, { ...opts, type: QueryTypes.RAW })) as any;
  const rowCount: number = (meta as { rowCount?: number })?.rowCount ?? 0;
  return { rows: [], rowCount };
}

export async function transaction<T>(
  callback: (t: DbTransaction) => Promise<T>,
): Promise<T> {
  return sequelize.transaction(callback);
}

const db = { query, transaction };
export default db;
