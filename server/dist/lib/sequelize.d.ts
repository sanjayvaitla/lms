/**
 * sequelize.ts — Sequelize v6 instance
 *
 * Uses the same DATABASE_URL as the raw pg pool.
 * Models are registered explicitly via sequelize.addModels() in src/models/index.ts.
 * Raw pg queries in services continue to work alongside Sequelize.
 */
import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
declare const sequelize: Sequelize;
export default sequelize;
//# sourceMappingURL=sequelize.d.ts.map