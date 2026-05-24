"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
exports.transaction = transaction;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
async function query(sql, params = [], transaction) {
    const client = transaction ?? pool;
    const result = await client.query(sql, params);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}
async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
const db = { query, transaction, pool };
exports.default = db;
//# sourceMappingURL=db.js.map