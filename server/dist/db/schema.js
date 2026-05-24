"use strict";
/**
 * Vtricks LMS -- PostgreSQL Schema Runner
 * Run: pnpm db:schema   (from /server)
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

-- Auto-update trigger function (defined first so triggers below can use it)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         TEXT        UNIQUE,
  password_hash TEXT,
  role          TEXT        NOT NULL DEFAULT 'STUDENT'
                            CHECK (role IN ('SUPER_ADMIN','ADMIN','TRAINER','STUDENT')),
  avatar_url    TEXT,
  auth_provider TEXT        NOT NULL DEFAULT 'LOCAL',
  google_id     TEXT        UNIQUE,
  phone_number  TEXT        UNIQUE,
  is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
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

-- OTP Verifications (MSG91 flow)
CREATE TABLE IF NOT EXISTS otp_verifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT        NOT NULL,
  otp_hash    TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Course Syllabi (multi-version per course)
CREATE TABLE IF NOT EXISTS course_syllabi (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  filename        TEXT        NOT NULL,
  file_type       TEXT        NOT NULL CHECK (file_type IN ('PDF', 'EXCEL', 'CSV')),
  content_text    TEXT        NOT NULL,
  structured_data JSONB,
  label           TEXT,
  uploaded_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Batch Syllabus Assignment (which version a batch uses)
CREATE TABLE IF NOT EXISTS batch_syllabi (
  batch_id    UUID        PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE,
  syllabus_id UUID        NOT NULL REFERENCES course_syllabi(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course Modules
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

-- Quiz Reference Datasets
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

-- Question Bank
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

-- Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id             UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id             UUID        NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  description           TEXT,
  questions_per_attempt INT         NOT NULL DEFAULT 10 CHECK (questions_per_attempt > 0),
  time_limit_minutes    INT         CHECK (time_limit_minutes > 0),
  passing_score         INT         NOT NULL DEFAULT 70
                                    CHECK (passing_score BETWEEN 0 AND 100),
  randomize_questions   BOOLEAN     NOT NULL DEFAULT TRUE,
  randomize_options     BOOLEAN     NOT NULL DEFAULT TRUE,
  max_attempts          INT         NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  status                TEXT        NOT NULL DEFAULT 'DRAFT'
                                    CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quiz Attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id          UUID        NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  attempt_number   INT         NOT NULL DEFAULT 1,
  score            INT,
  passed           BOOLEAN,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at     TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'IN_PROGRESS'
                               CHECK (status IN ('IN_PROGRESS','SUBMITTED','EXPIRED')),
  UNIQUE (quiz_id, student_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id       UUID        NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id      UUID        NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_answer  TEXT,
  is_correct       BOOLEAN,
  points_awarded   INT         NOT NULL DEFAULT 0
);

-- Assignments
CREATE TABLE IF NOT EXISTS assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID        NOT NULL REFERENCES courses(id)        ON DELETE CASCADE,
  module_id       UUID        REFERENCES course_modules(id)          ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  pdf_filename    TEXT        NOT NULL,
  pdf_path        TEXT        NOT NULL,
  pdf_size_bytes  INT         NOT NULL DEFAULT 0,
  due_date        TIMESTAMPTZ,
  max_score       INT         NOT NULL DEFAULT 100 CHECK (max_score > 0),
  status          TEXT        NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_batches (
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  batch_id      UUID NOT NULL REFERENCES batches(id)     ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, batch_id)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  file_path       TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score           INT,
  feedback        TEXT,
  status          TEXT        NOT NULL DEFAULT 'SUBMITTED'
                              CHECK (status IN ('SUBMITTED','GRADED','LATE')),
  UNIQUE (assignment_id, student_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_courses_trainer        ON courses(trainer_id);
CREATE INDEX IF NOT EXISTS idx_batches_course         ON batches(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_batch      ON enrollments(batch_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student    ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender        ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver      ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_course_modules_course  ON course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_syllabi_course  ON course_syllabi(course_id);
CREATE INDEX IF NOT EXISTS idx_batch_syllabi_syllabus ON batch_syllabi(syllabus_id);
CREATE INDEX IF NOT EXISTS idx_quiz_datasets_course   ON quiz_datasets(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_course  ON quiz_questions(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_module  ON quiz_questions(module_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course         ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_module         ON quizzes(module_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz     ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course     ON assignments(course_id);

-- Triggers
DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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
`;
// Legacy migrations for existing databases that were created before the new schema
const migrations = `
DO $$ BEGIN
  ALTER TABLE course_syllabi ADD COLUMN IF NOT EXISTS structured_data JSONB;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE course_syllabi ADD COLUMN IF NOT EXISTS label TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE course_syllabi DROP CONSTRAINT IF EXISTS course_syllabi_file_type_check;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE course_syllabi ADD CONSTRAINT course_syllabi_file_type_check
    CHECK (file_type IN ('PDF', 'EXCEL', 'CSV'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS batch_syllabi (
    batch_id    UUID PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE,
    syllabus_id UUID NOT NULL REFERENCES course_syllabi(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_batch_syllabi_syllabus ON batch_syllabi(syllabus_id);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'LOCAL';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_google_id_unique UNIQUE (google_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_phone_number_unique UNIQUE (phone_number);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS otp_verifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       TEXT        NOT NULL,
    otp_hash    TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    verified    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON password_reset_tokens(user_id);
EXCEPTION WHEN others THEN NULL; END $$;
`;
async function runSchema() {
    const client = await pool.connect();
    try {
        console.log("Running schema...");
        await client.query(schema);
        console.log("  Base schema applied.");
        await client.query(migrations);
        console.log("  Migrations applied.");
        console.log("  Tables ready: users, courses, batches, enrollments,");
        console.log("    refresh_tokens, otp_verifications, trainer_profiles,");
        console.log("    course_syllabi, batch_syllabi, course_modules,");
        console.log("    quizzes, quiz_questions, quiz_attempts,");
        console.log("    assignments, assignment_submissions, messages,");
        console.log("    password_reset_tokens.");
        console.log("Schema complete.");
    }
    catch (err) {
        console.error("Schema error:", err);
        throw err;
    }
    finally {
        client.release();
        await pool.end();
    }
}
runSchema().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=schema.js.map