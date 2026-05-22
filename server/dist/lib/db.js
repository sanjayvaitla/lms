"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
exports.transaction = transaction;
const sequelize_1 = require("sequelize");
const sequelize_2 = require("./sequelize");
function isSelectQuery(sql) {
    return /^\s*SELECT\b/i.test(sql.trim());
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function query(sql, params = [], transaction) {
    const opts = {
        bind: params,
        transaction: transaction ?? null,
    };
    if (/\bRETURNING\b/i.test(sql) || isSelectQuery(sql)) {
        // Run as SELECT type so Sequelize returns rows directly
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (await sequelize_2.sequelize.query(sql, { ...opts, type: sequelize_1.QueryTypes.SELECT }));
        return { rows: rows, rowCount: rows.length };
    }
    // INSERT / UPDATE / DELETE without RETURNING
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, meta] = (await sequelize_2.sequelize.query(sql, { ...opts, type: sequelize_1.QueryTypes.RAW }));
    const rowCount = meta?.rowCount ?? 0;
    return { rows: [], rowCount };
}
async function transaction(callback) {
    return sequelize_2.sequelize.transaction(callback);
}
const db = { query, transaction };
exports.default = db;
//# sourceMappingURL=db.js.map