"use strict";
/**
 * Vtricks LMS -- PostgreSQL Schema Runner
 * Run: pnpm db:schema   (from /server)
 *
 * Creates all tables with CHECK constraints (no Prisma, no ORM).
 * Safe to re-run -- uses CREATE TABLE IF NOT EXISTS.
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
const schema = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'STUDENT'
                            CHECK (role IN ('SUPER_ADMIN','ADMIN','TRAINER','STUDENT')),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  category         TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'ACTIVE'
                               CHECK (status IN ('ACTIVE','NEW','DRAFT','ARCHIVED')),
  level            TEXT        NOT NULL DEFAULT 'INTERMEDIATE'
                               CHECK (level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
  duration_months  INT         NOT NULL CHECK (duration_months BETWEEN 1 AND 24),
  description      TEXT,
  trainer_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
  color_token      TEXT        NOT NULL DEFAULT 'emerald',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Batches
CREATE TABLE IF NOT EXISTS batches (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  course_id  UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date   TIMESTAMPTZ NOT NULL,
  capacity   INT         NOT NULL DEFAULT 30 CHECK (capacity > 0),
  status     TEXT        NOT NULL DEFAULT 'UPCOMING'
             CHECK (status IN ('UPCOMING','ONGOING','COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  batch_id       UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completion_pct FLOAT       NOT NULL DEFAULT 0
                             CHECK (completion_pct BETWEEN 0 AND 100),
  grade          TEXT,
  UNIQUE (student_id, batch_id)
);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID        NOT NULL REFERENCES users(id),
  receiver_id UUID        NOT NULL REFERENCES users(id),
  content     TEXT        NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trainer Profiles
CREATE TABLE IF NOT EXISTS trainer_profiles (
  user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio        TEXT,
  skills     TEXT,
  linkedin   TEXT,
  phone      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course Syllabi
CREATE TABLE IF NOT EXISTS course_syllabi (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  filename     TEXT        NOT NULL,
  file_type    TEXT        NOT NULL CHECK (file_type IN ('PDF', 'EXCEL')),
  content_text TEXT        NOT NULL,
  uploaded_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_courses_trainer       ON courses(trainer_id);
CREATE INDEX IF NOT EXISTS idx_courses_status        ON courses(status);
CREATE INDEX IF NOT EXISTS idx_batches_course        ON batches(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student   ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_batch     ON enrollments(batch_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user   ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver     ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_course_syllabi_course ON course_syllabi(course_id);

-- ── Course Modules (sequential release for quizzes) ─────────────────────────
CREATE TABLE IF NOT EXISTS course_modules (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT,
  sort_order    INT         NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'LOCKED'
                            CHECK (status IN ('LOCKED','RELEASED','COMPLETED')),
  completed_at  TIMESTAMPTZ,
  completed_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Quiz reference datasets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_datasets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  filename      TEXT        NOT NULL,
  file_type     TEXT        NOT NULL CHECK (file_type IN ('PDF','EXCEL','CSV','JSON')),
  content_text  TEXT,
  file_path     TEXT,
  uploaded_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Question bank ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_questions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id       UUID        REFERENCES course_modules(id) ON DELETE SET NULL,
  dataset_id      UUID        REFERENCES quiz_datasets(id) ON DELETE SET NULL,
  question_text   TEXT        NOT NULL,
  question_type   TEXT        NOT NULL DEFAULT 'MCQ'
                              CHECK (question_type IN ('MCQ','TRUE_FALSE','SHORT_ANSWER')),
  options         JSONB,
  correct_answer  TEXT        NOT NULL,
  explanation     TEXT,
  points          INT         NOT NULL DEFAULT 1 CHECK (points > 0),
  difficulty      TEXT        NOT NULL DEFAULT 'MEDIUM'
                              CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  tags            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Quizzes (linked to modules; released when module completed) ───────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id             UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id             UUID        NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  description           TEXT,
  questions_per_attempt INT         NOT NULL DEFAULT 10 CHECK (questions_per_attempt > 0),
  time_limit_minutes    INT         CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  passing_score         INT         NOT NULL DEFAULT 60 CHECK (passing_score BETWEEN 0 AND 100),
  randomize_questions   BOOLEAN     NOT NULL DEFAULT true,
  randomize_options     BOOLEAN     NOT NULL DEFAULT true,
  max_attempts          INT         NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  status                TEXT        NOT NULL DEFAULT 'DRAFT'
                                    CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_id)
);

-- ── Quiz attempts (randomized question set per student) ───────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         UUID        NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_number  INT         NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  question_ids    JSONB       NOT NULL,
  shuffled_options JSONB,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMPTZ,
  score           FLOAT       CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  total_points    INT,
  earned_points   INT,
  status          TEXT        NOT NULL DEFAULT 'IN_PROGRESS'
                              CHECK (status IN ('IN_PROGRESS','SUBMITTED','GRADED')),
  UNIQUE (quiz_id, student_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id       UUID        NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id      UUID        NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_answer  TEXT,
  is_correct       BOOLEAN,
  points_earned    INT         NOT NULL DEFAULT 0,
  UNIQUE (attempt_id, question_id)
);

-- ── Assignments (PDF uploads) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id       UUID        REFERENCES course_modules(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  pdf_filename    TEXT        NOT NULL,
  pdf_path        TEXT        NOT NULL,
  pdf_size_bytes  INT,
  due_date        TIMESTAMPTZ,
  max_score       INT         NOT NULL DEFAULT 100 CHECK (max_score > 0),
  status          TEXT        NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_batches (
  assignment_id   UUID        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  batch_id        UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, batch_id)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  file_path       TEXT,
  score           FLOAT       CHECK (score IS NULL OR score >= 0),
  feedback        TEXT,
  status          TEXT        NOT NULL DEFAULT 'SUBMITTED'
                              CHECK (status IN ('PENDING','SUBMITTED','GRADED')),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_course_modules_course     ON course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_datasets_course      ON quiz_datasets(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_course     ON quiz_questions(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_module     ON quiz_questions(module_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course            ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_module            ON quizzes(module_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz        ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course        ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignment_batches_batch  ON assignment_batches(batch_id);

DO $$ BEGIN
  CREATE TRIGGER trg_course_modules_updated_at BEFORE UPDATE ON course_modules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_quiz_questions_updated_at BEFORE UPDATE ON quiz_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_quizzes_updated_at BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at   BEFORE UPDATE ON users   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;
async function runSchema() {
    const client = await pool.connect();
    try {
        console.log('Running schema migration...\n');
        await client.query(schema);
        console.log('Schema applied successfully!\n');
        console.log('  Tables: users, courses, batches, enrollments, refresh_tokens, messages, trainer_profiles, course_syllabi');
        console.log('           course_modules, quiz_datasets, quiz_questions, quizzes, quiz_attempts, assignments');
        console.log('  Indexes + updated_at triggers added\n');
    }
    catch (err) {
        console.error('Schema failed:', err);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
runSchema();
//# sourceMappingURL=schema.js.map