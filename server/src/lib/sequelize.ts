/**
 * sequelize.ts — Sequelize v6 instance
 *
 * Uses the same DATABASE_URL as the raw pg pool.
 * Models are registered explicitly via sequelize.addModels() in src/models/index.ts.
 * Raw pg queries in services continue to work alongside Sequelize.
 */

import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';

const DATABASE_URL = process.env.DATABASE_URL!;

if (!DATABASE_URL) {
  throw new Error('[sequelize] DATABASE_URL env var is required');
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development'
    ? (msg: string) => console.log('[sequelize]', msg)
    : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions:
    process.env.NODE_ENV === 'production'
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
  // Models registered explicitly in src/models/index.ts via addModels()
});

export default sequelize;
