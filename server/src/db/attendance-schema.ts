/**
 * Standalone attendance schema migration.
 * Run: pnpm ts-node src/db/attendance-schema.ts
 *
 * Creates ONLY the attendance_sessions and attendance_records tables and indexes,
 * idempotently. Use this if the main `pnpm db:schema` aborts on legacy duplicate
 * constraints before reaching the attendance migrations.
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const sql = `
-- ── Attendance Sessions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  trainer_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  title          TEXT        NOT NULL,
  session_date   DATE        NOT NULL,
  start_time     TIME,
  end_time       TIME,
  duration_min   INTEGER,
  topic          TEXT,
  notes          TEXT,
  status         TEXT        NOT NULL DEFAULT 'SCHEDULED',
  created_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_att_sessions_batch   ON attendance_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_att_sessions_trainer ON attendance_sessions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_att_sessions_date    ON attendance_sessions(session_date);

-- ── Attendance Records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'ABSENT',
  marked_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  marked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remarks     TEXT,
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_att_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_att_records_student ON attendance_records(student_id);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('Creating attendance tables...');
    await client.query(sql);
    console.log('  attendance_sessions ready.');
    console.log('  attendance_records ready.');
    console.log('Done.');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
