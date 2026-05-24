import { Pool, PoolClient } from 'pg';
export type DbTransaction = PoolClient;
export declare function query<T = any>(sql: string, params?: unknown[], transaction?: DbTransaction): Promise<{
    rows: T[];
    rowCount: number;
}>;
export declare function transaction<T>(callback: (client: DbTransaction) => Promise<T>): Promise<T>;
declare const db: {
    query: typeof query;
    transaction: typeof transaction;
    pool: Pool;
};
export default db;
//# sourceMappingURL=db.d.ts.map