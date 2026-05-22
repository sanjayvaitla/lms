import { Transaction } from 'sequelize';
export type DbTransaction = Transaction;
export declare function query<T = any>(sql: string, params?: unknown[], transaction?: DbTransaction): Promise<{
    rows: T[];
    rowCount: number;
}>;
export declare function transaction<T>(callback: (t: DbTransaction) => Promise<T>): Promise<T>;
declare const db: {
    query: typeof query;
    transaction: typeof transaction;
};
export default db;
//# sourceMappingURL=db.d.ts.map