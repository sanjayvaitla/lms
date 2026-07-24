/**
 * Vtricks LMS -- PostgreSQL Schema Runner
 * Run: pnpm db:schema   (from /server)
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
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

-- Users (full definition — includes all columns added by migrations so fresh DBs get them immediately)
CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  email            TEXT        UNIQUE,
  password_hash    TEXT,
  role             TEXT        NOT NULL DEFAULT 'STUDENT'
                               CHECK (role IN ('SUPER_ADMIN','ADMIN','TRAINER','STUDENT','FEES_ADMIN','LD_MANAGER','OPERATIONAL_MANAGER','INTERN')),
  avatar_url       TEXT,
  auth_provider    TEXT        NOT NULL DEFAULT 'LOCAL',
  google_id        TEXT        UNIQUE,
  phone_number     TEXT        UNIQUE,
  is_phone_verified BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  file_path       TEXT,
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
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  description      TEXT,
  section          TEXT,                          -- e.g. "SQL", "POWERBI" (sheet name from Excel)
  session_number   TEXT,                          -- e.g. "1", "2", "6A"
  topics           JSONB       NOT NULL DEFAULT '[]', -- array of topic strings from syllabus
  duration_minutes INT,                           -- from Excel Duration column
  sort_order       INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'LOCKED'
                               CHECK (status IN ('LOCKED','RELEASED','COMPLETED')),
  completed_at     TIMESTAMPTZ,
  completed_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, section, session_number)     -- prevent duplicate sync
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
  points_earned    INT         NOT NULL DEFAULT 0
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
                              CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_batches (
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  batch_id      UUID NOT NULL REFERENCES batches(id)     ON DELETE CASCADE,
  released      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (assignment_id, batch_id)
);

-- Assessments
CREATE TABLE IF NOT EXISTS assessments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  description         TEXT,
  pdf_filename        TEXT        NOT NULL,
  pdf_path            TEXT        NOT NULL,
  pdf_size_bytes      INT         NOT NULL DEFAULT 0,
  due_date            TIMESTAMPTZ,
  total_marks         FLOAT         NOT NULL DEFAULT 100,
  part_a_marks        FLOAT         NOT NULL DEFAULT 25,
  part_b_marks        FLOAT         NOT NULL DEFAULT 75,
  part_b_approach_pct FLOAT         NOT NULL DEFAULT 40,
  part_b_viva_pct     FLOAT         NOT NULL DEFAULT 25,
  status              TEXT        NOT NULL DEFAULT 'DRAFT'
                                  CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  part_a_questions    JSONB,
  part_a_filename     TEXT,
  ai_rubric           TEXT,
  created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_batches (
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  batch_id      UUID NOT NULL REFERENCES batches(id)     ON DELETE CASCADE,
  PRIMARY KEY (assessment_id, batch_id)
);

CREATE TABLE IF NOT EXISTS assessment_submissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID        NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  pdf_key         TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  part_a_score    FLOAT,
  part_a_answers  JSONB,
  approach_score  FLOAT,
  viva_score      FLOAT,
  solution_score  FLOAT,
  feedback        TEXT,
  ai_approach_score FLOAT,
  ai_solution_score FLOAT,
  ai_feedback     TEXT,
  ai_status       TEXT,
  status          TEXT        NOT NULL DEFAULT 'SUBMITTED'
                              CHECK (status IN ('SUBMITTED','GRADED')),
  graded_at       TIMESTAMPTZ,
  UNIQUE (assessment_id, student_id)
);

-- Quiz Batches mapping (parallel to assignment_batches)
CREATE TABLE IF NOT EXISTS quiz_batches (
  quiz_id  UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  released BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (quiz_id, batch_id)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  file_path       TEXT,
  pdf_key         TEXT,
  zip_key         TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graded_at       TIMESTAMPTZ,
  score           INT,
  feedback        TEXT,
  status          TEXT        NOT NULL DEFAULT 'SUBMITTED'
                              CHECK (status IN ('SUBMITTED','GRADED','LATE')),
  ai_score        INT,
  ai_feedback     TEXT,
  ai_breakdown    JSONB,
  ai_graded_at    TIMESTAMPTZ,
  ai_model        TEXT,
  UNIQUE (assignment_id, student_id)
);

-- Attendance Sessions
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  trainer_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  title        TEXT        NOT NULL DEFAULT 'Session',
  session_date DATE        NOT NULL,
  start_time   TIME,
  end_time     TIME,
  duration_min INTEGER,
  topic        TEXT,
  notes        TEXT,
  status       TEXT        NOT NULL DEFAULT 'SCHEDULED',
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attendance Records
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


-- Session References (additional materials per module/session)
CREATE TABLE IF NOT EXISTS session_references (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   UUID        NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'LINK'
                          CHECK (type IN ('LINK','PDF','VIDEO','DOCUMENT','OTHER','SLM','PPT')),
  url         TEXT,
  file_path   TEXT,
  description TEXT,
  added_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session Artifacts & Demonstrations
CREATE TABLE IF NOT EXISTS session_artifacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   UUID        NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'DEMO'
                          CHECK (type IN ('DEMO','PROJECT','GITHUB','VIDEO','OTHER','WORD_DOC')),
  url         TEXT,
  file_path   TEXT,
  description TEXT,
  added_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Permissions (for ADMIN and TRAINER roles)
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id                 UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Sidebar visibility
  can_view_dashboard      BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_courses        BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_batches        BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_content        BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_learners       BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_trainers       BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_assignments    BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_quizzes        BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_projects       BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_placements     BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_attendance     BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_fees           BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_messaging      BOOLEAN     NOT NULL DEFAULT TRUE,
  can_view_ai_tutor       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Action permissions
  can_edit_courses        BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_courses      BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_batches        BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_batches      BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_learners       BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_learners     BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_trainers       BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_trainers     BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_assignments    BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_assignments  BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_quizzes        BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_quizzes      BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_attendance     BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_attendance   BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_fees           BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_fees         BOOLEAN     NOT NULL DEFAULT FALSE,
  can_soft_delete_only    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by              UUID        REFERENCES users(id) ON DELETE SET NULL
);

-- Keep trainer_permissions for backward compatibility (will be migrated)
CREATE TABLE IF NOT EXISTS trainer_permissions (
  trainer_id              UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  can_edit_courses        BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_courses      BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_batches        BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_batches      BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_learners       BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_learners     BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_assignments    BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_assignments  BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_quizzes        BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_quizzes      BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit_attendance     BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete_attendance   BOOLEAN     NOT NULL DEFAULT FALSE,
  can_soft_delete_only    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by              UUID        REFERENCES users(id) ON DELETE SET NULL
);

-- Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student    ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_batches_assignment     ON assignment_batches(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_batches_batch          ON assignment_batches(batch_id);
CREATE INDEX IF NOT EXISTS idx_quiz_batches_quiz                  ON quiz_batches(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_batches_batch                 ON quiz_batches(batch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_batch         ON attendance_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_trainer       ON attendance_sessions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session        ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student        ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_user                    ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_permissions_trainer       ON trainer_permissions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_users_email            ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role             ON users(role);
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_users_google_id    ON users(google_id);    EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_otp_phone          ON otp_verifications(phone); EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_session_refs_module  ON session_references(module_id);
CREATE INDEX IF NOT EXISTS idx_session_arts_module ON session_artifacts(module_id);
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

-- Activity Logs
CREATE TABLE IF NOT EXISTS "ActivityLogs" (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"         UUID        REFERENCES users(id) ON DELETE SET NULL,
  "actionType"     TEXT        NOT NULL,
  "resourceType"   TEXT,
  "resourceId"     TEXT,
  "ipAddress"      TEXT,
  metadata         JSONB,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN
  CREATE TRIGGER trg_activitylogs_updated_at BEFORE UPDATE ON "ActivityLogs" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Grievances
CREATE TABLE IF NOT EXISTS grievances (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject          TEXT        NOT NULL,
  description      TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'OPEN'
                               CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN
  CREATE TRIGGER trg_grievances_updated_at BEFORE UPDATE ON grievances FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

// Migrations — only needed for existing databases created before the consolidated schema above.
// All tables are now in the base schema, so migrations just handle safe ALTERs and constraint fixes.
const migrations = `
-- Ensure all migration-added columns exist (safe on both old and new DBs)
DO $$ BEGIN ALTER TABLE course_syllabi ADD COLUMN IF NOT EXISTS structured_data JSONB;   EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE course_syllabi ADD COLUMN IF NOT EXISTS label TEXT;               EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE course_syllabi ADD COLUMN IF NOT EXISTS file_path TEXT;           EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users          ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'LOCAL'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users          ADD COLUMN IF NOT EXISTS google_id TEXT;           EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users          ADD COLUMN IF NOT EXISTS phone_number TEXT;        EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users          ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users          ALTER COLUMN password_hash DROP NOT NULL;          EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE quiz_attempts  ADD COLUMN IF NOT EXISTS passed BOOLEAN;           EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE attendance_sessions ALTER COLUMN title DROP NOT NULL;             EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE attendance_sessions ALTER COLUMN title SET DEFAULT 'Session';    EXCEPTION WHEN others THEN NULL; END $$;

-- Unique constraints (safe — skip if already exists)
DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_google_id_unique    UNIQUE (google_id);    EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_phone_number_unique UNIQUE (phone_number); EXCEPTION WHEN others THEN NULL; END $$;

-- Mock Interviews extra columns
-- Add detailed scores to mock_interviews
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS score_technical NUMERIC; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS score_problem_solving NUMERIC; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS score_coding NUMERIC; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS score_project NUMERIC; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS score_debugging NUMERIC; EXCEPTION WHEN others THEN NULL; END $$;


DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS key_strengths TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS areas_of_improvement TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS ai_domain TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS ai_experience TEXT; EXCEPTION WHEN others THEN NULL; END $$;

-- Quiz availability window
DO $$ BEGIN ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS available_from  TIMESTAMPTZ; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS available_until TIMESTAMPTZ; EXCEPTION WHEN others THEN NULL; END $$;



-- Make old session_feedbacks columns nullable to support new format
DO $$ BEGIN ALTER TABLE session_feedbacks ALTER COLUMN conceptual_understanding DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ALTER COLUMN problem_solving DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ALTER COLUMN hands_on_experience DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ALTER COLUMN class_participation DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ALTER COLUMN punctuality DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;

-- Add new Session Feedback columns
DO $$ BEGIN ALTER TABLE session_feedbacks ADD COLUMN IF NOT EXISTS session_content_relevance INT CHECK (session_content_relevance >= 1 AND session_content_relevance <= 5); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ADD COLUMN IF NOT EXISTS concept_explanation INT CHECK (concept_explanation >= 1 AND concept_explanation <= 5); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ADD COLUMN IF NOT EXISTS practical_demonstration INT CHECK (practical_demonstration >= 1 AND practical_demonstration <= 5); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ADD COLUMN IF NOT EXISTS learning_material_quality INT CHECK (learning_material_quality >= 1 AND learning_material_quality <= 5); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ADD COLUMN IF NOT EXISTS overall_session_satisfaction INT CHECK (overall_session_satisfaction >= 1 AND overall_session_satisfaction <= 5); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ADD COLUMN IF NOT EXISTS valuable_takeaway TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE session_feedbacks ADD COLUMN IF NOT EXISTS suggestions_improvement TEXT; EXCEPTION WHEN others THEN NULL; END $$;

-- Course Feedbacks
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS course_feedbacks (
    id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id                       UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    course_id                      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_content_quality         INT NOT NULL CHECK (course_content_quality >= 1 AND course_content_quality <= 5),
    concept_clarity                INT NOT NULL CHECK (concept_clarity >= 1 AND concept_clarity <= 5),
    practical_exercises            INT NOT NULL CHECK (practical_exercises >= 1 AND practical_exercises <= 5),
    course_assessment_structure    INT NOT NULL CHECK (course_assessment_structure >= 1 AND course_assessment_structure <= 5),
    overall_course_satisfaction    INT NOT NULL CHECK (overall_course_satisfaction >= 1 AND overall_course_satisfaction <= 5),
    additional_comments            TEXT,
    most_useful_topic              TEXT,
    additional_topics              TEXT,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, course_id, student_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

-- Program Feedbacks
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS program_feedbacks (
    id                                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id                         UUID NOT NULL,
    student_id                         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_name                       TEXT NOT NULL,
    student_email                      TEXT NOT NULL,
    program_curriculum_relevance       INT NOT NULL CHECK (program_curriculum_relevance >= 1 AND program_curriculum_relevance <= 5),
    learning_outcome_achievement       INT NOT NULL CHECK (learning_outcome_achievement >= 1 AND learning_outcome_achievement <= 5),
    practical_learning_experience      INT NOT NULL CHECK (practical_learning_experience >= 1 AND practical_learning_experience <= 5),
    placement_career_readiness_support INT NOT NULL CHECK (placement_career_readiness_support >= 1 AND placement_career_readiness_support <= 5),
    overall_program_satisfaction       INT NOT NULL CHECK (overall_program_satisfaction >= 1 AND overall_program_satisfaction <= 5),
    most_liked                         TEXT,
    improvements_suggested             TEXT,
    additional_comments                TEXT,
    created_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (program_id, student_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

-- Fix assignments status constraint (ARCHIVED -> CLOSED)
DO $$ BEGIN ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_status_check; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE assignments ADD CONSTRAINT assignments_status_check
    CHECK (status IN ('DRAFT','PUBLISHED','CLOSED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fix syllabus file_type constraint
DO $$ BEGIN ALTER TABLE course_syllabi DROP CONSTRAINT IF EXISTS course_syllabi_file_type_check; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE course_syllabi ADD CONSTRAINT course_syllabi_file_type_check
    CHECK (file_type IN ('PDF', 'EXCEL', 'CSV'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- course_modules syllabus fields
DO $$ BEGIN ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS section          TEXT;                       EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS session_number   TEXT;                       EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS topics           JSONB NOT NULL DEFAULT '[]'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS duration_minutes INT;                        EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE course_modules ADD CONSTRAINT course_modules_section_session_unique UNIQUE (course_id, section, session_number); EXCEPTION WHEN others THEN NULL; END $$;

-- Fix trainer_permissions default
DO $$ BEGIN ALTER TABLE trainer_permissions ALTER COLUMN can_soft_delete_only SET DEFAULT FALSE; EXCEPTION WHEN others THEN NULL; END $$;

-- Add sidebar visibility columns to trainer_permissions (default TRUE so existing trainers keep access)
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_courses     BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_batches     BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_learners    BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_assignments BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_quizzes     BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_attendance  BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_content     BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_recordings  BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_dashboard   BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_trainers    BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_projects    BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_placements  BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_fees        BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_messaging   BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trainer_permissions ADD COLUMN can_view_ai_tutor   BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- Migrate existing trainer_permissions to user_permissions
INSERT INTO user_permissions (
  user_id,
  can_view_dashboard, can_view_courses, can_view_batches, can_view_content,
  can_view_learners, can_view_trainers, can_view_assignments, can_view_quizzes,
  can_view_projects, can_view_placements, can_view_attendance, can_view_fees,
  can_view_messaging, can_view_ai_tutor,
  can_edit_courses, can_delete_courses,
  can_edit_batches, can_delete_batches,
  can_edit_learners, can_delete_learners,
  can_edit_assignments, can_delete_assignments,
  can_edit_quizzes, can_delete_quizzes,
  can_edit_attendance, can_delete_attendance,
  can_soft_delete_only,
  updated_at, updated_by
)
SELECT 
  tp.trainer_id,
  TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, TRUE, TRUE,
  tp.can_edit_courses, tp.can_delete_courses,
  tp.can_edit_batches, tp.can_delete_batches,
  tp.can_edit_learners, tp.can_delete_learners,
  tp.can_edit_assignments, tp.can_delete_assignments,
  tp.can_edit_quizzes, tp.can_delete_quizzes,
  tp.can_edit_attendance, tp.can_delete_attendance,
  tp.can_soft_delete_only,
  tp.updated_at, tp.updated_by
FROM trainer_permissions tp
ON CONFLICT (user_id) DO NOTHING;

-- Create default permissions for all ADMIN users (full access)
INSERT INTO user_permissions (
  user_id,
  can_view_dashboard, can_view_courses, can_view_batches, can_view_content,
  can_view_learners, can_view_trainers, can_view_assignments, can_view_quizzes,
  can_view_projects, can_view_placements, can_view_attendance, can_view_fees,
  can_view_messaging, can_view_ai_tutor,
  can_edit_courses, can_delete_courses,
  can_edit_batches, can_delete_batches,
  can_edit_learners, can_delete_learners,
  can_edit_trainers, can_delete_trainers,
  can_edit_assignments, can_delete_assignments,
  can_edit_quizzes, can_delete_quizzes,
  can_edit_attendance, can_delete_attendance,
  can_edit_fees, can_delete_fees,
  can_soft_delete_only
)
SELECT 
  id,
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  FALSE
FROM users
WHERE role = 'ADMIN'
ON CONFLICT (user_id) DO NOTHING;

-- Create default permissions for TRAINER users without existing permissions
INSERT INTO user_permissions (
  user_id,
  can_view_dashboard, can_view_courses, can_view_batches, can_view_content,
  can_view_learners, can_view_trainers, can_view_assignments, can_view_quizzes,
  can_view_projects, can_view_placements, can_view_attendance, can_view_fees,
  can_view_messaging, can_view_ai_tutor,
  can_edit_courses, can_delete_courses,
  can_edit_batches, can_delete_batches,
  can_edit_learners, can_delete_learners,
  can_edit_trainers, can_delete_trainers,
  can_edit_assignments, can_delete_assignments,
  can_edit_quizzes, can_delete_quizzes,
  can_edit_attendance, can_delete_attendance,
  can_edit_fees, can_delete_fees,
  can_soft_delete_only
)
SELECT 
  id,
  TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, TRUE, TRUE,
  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
  FALSE
FROM users
WHERE role = 'TRAINER'
ON CONFLICT (user_id) DO NOTHING;

-- Ensure all indexes exist (idempotent)
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_batch_syllabi_syllabus    ON batch_syllabi(syllabus_id);      EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_att_sessions_batch        ON attendance_sessions(batch_id);   EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_att_sessions_trainer      ON attendance_sessions(trainer_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_att_sessions_date         ON attendance_sessions(session_date); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_att_records_session       ON attendance_records(session_id);  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_att_records_student       ON attendance_records(student_id);  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_users_google_id           ON users(google_id);                EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_users_phone_number        ON users(phone_number);             EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_otp_phone                 ON otp_verifications(phone);        EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_pwd_reset_user            ON password_reset_tokens(user_id);  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_trainer_permissions_trainer ON trainer_permissions(trainer_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id); EXCEPTION WHEN others THEN NULL; END $$;

-- NEW PERFORMANCE OPTIMIZATION INDEXES

-- Foreign Key Indexes
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_attempt  ON quiz_attempt_answers(attempt_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_question ON quiz_attempt_answers(question_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_course_syllabi_uploaded_by    ON course_syllabi(uploaded_by);      EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_course_modules_completed_by   ON course_modules(completed_by);     EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_quiz_datasets_uploaded_by     ON quiz_datasets(uploaded_by);       EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_quizzes_created_by            ON quizzes(created_by);              EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_assignments_created_by        ON assignments(created_by);          EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_assessments_created_by        ON assessments(created_by);          EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_session_references_added_by   ON session_references(added_by);     EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_session_artifacts_added_by    ON session_artifacts(added_by);      EXCEPTION WHEN others THEN NULL; END $$;

-- Status Indexes (For fast WHERE filtering)
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_courses_status                ON courses(status);                  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_batches_status                ON batches(status);                  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_quiz_attempts_status          ON quiz_attempts(status);            EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_assignments_status            ON assignments(status);              EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_assessments_status            ON assessments(status);              EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_course_modules_status         ON course_modules(status);           EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_grievances_status             ON grievances(status);               EXCEPTION WHEN others THEN NULL; END $$;

-- Feedback Indexes
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_course_feedbacks_batch        ON course_feedbacks(batch_id);       EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_course_feedbacks_course       ON course_feedbacks(course_id);      EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_course_feedbacks_student      ON course_feedbacks(student_id);     EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_program_feedbacks_student     ON program_feedbacks(student_id);    EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_program_feedbacks_program     ON program_feedbacks(program_id);    EXCEPTION WHEN others THEN NULL; END $$;

-- ── Section Schedules (one time slot per section per batch) ────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS section_schedules (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id     UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    section      TEXT        NOT NULL,          -- e.g. "SQL", "POWERBI"
    start_time   TEXT        NOT NULL,          -- "09:00" (HH:MM 24h)
    end_time     TEXT        NOT NULL,          -- "11:00"
    class_days   TEXT,                          -- e.g. "Mon,Wed,Fri"
    notes        TEXT,
    updated_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, section)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_section_schedules_batch ON section_schedules(batch_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Session Recordings (YouTube links) ────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS session_recordings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id       UUID        NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    batch_id        UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    youtube_url     TEXT,                       -- YouTube private/unlisted video URL
    recorded_date   DATE,
    available_from  TIMESTAMPTZ,               -- class end_time + 4 hours
    uploaded_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, batch_id)               -- one recording per session per batch
  );
EXCEPTION WHEN others THEN NULL; END $$;

-- Migrate existing table: drop Bunny columns, add youtube_url
DO $$ BEGIN
  ALTER TABLE session_recordings DROP COLUMN IF EXISTS bunny_video_id;
  ALTER TABLE session_recordings DROP COLUMN IF EXISTS bunny_library_id;
  ALTER TABLE session_recordings DROP COLUMN IF EXISTS duration_sec;
  ALTER TABLE session_recordings DROP COLUMN IF EXISTS status;
  ALTER TABLE session_recordings DROP COLUMN IF EXISTS thumbnail_url;
  ALTER TABLE session_recordings DROP COLUMN IF EXISTS playback_url;
  ALTER TABLE session_recordings ADD COLUMN IF NOT EXISTS youtube_url TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_session_recordings_module ON session_recordings(module_id);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_session_recordings_batch ON session_recordings(batch_id);
EXCEPTION WHEN others THEN NULL; END $$;
-- Course-first: allow recordings without batch (propagate when batch links course)
DO $$ BEGIN
  ALTER TABLE session_recordings ALTER COLUMN batch_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_session_recordings_course_module
    ON session_recordings(module_id) WHERE batch_id IS NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_batches_trainer ON batches(trainer_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Batch schedule columns ───────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS class_start_time TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS class_end_time TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS class_days TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE batches ADD COLUMN IF NOT EXISTS schedule_notes TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Fee Structures ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS fee_structures (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id    UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    currency     TEXT        NOT NULL DEFAULT 'INR',
    description  TEXT,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_fee_structures_course ON fee_structures(course_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Fee Instalments ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS fee_instalments (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_structure_id   UUID        NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    instalment_number  INT         NOT NULL,
    label              TEXT        NOT NULL,
    amount             NUMERIC(10,2) NOT NULL,
    due_date           DATE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_fee_instalments_structure ON fee_instalments(fee_structure_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Fee Scholarships ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS fee_scholarships (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    type       TEXT        NOT NULL CHECK (type IN ('PERCENTAGE','FIXED')),
    value      NUMERIC(10,2) NOT NULL,
    criteria   TEXT,
    course_id  UUID        REFERENCES courses(id) ON DELETE CASCADE,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_fee_scholarships_course ON fee_scholarships(course_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Fee Discounts ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS fee_discounts (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    type       TEXT        NOT NULL CHECK (type IN ('PERCENTAGE','FIXED')),
    value      NUMERIC(10,2) NOT NULL,
    code       TEXT        UNIQUE,
    max_uses   INT,
    used_count INT         NOT NULL DEFAULT 0,
    valid_from DATE,
    valid_to   DATE,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Fee Payments ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS fee_payments (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fee_structure_id    UUID        NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    instalment_id       UUID        REFERENCES fee_instalments(id) ON DELETE SET NULL,
    amount_due          NUMERIC(10,2) NOT NULL,
    amount_paid         NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
    scholarship_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_date        DATE,
    payment_mode        TEXT        CHECK (payment_mode IN ('CASH','BANK_TRANSFER','UPI','CARD','CHEQUE','OTHER')),
    status              TEXT        NOT NULL DEFAULT 'PENDING'
                                    CHECK (status IN ('PENDING','PARTIAL','PAID','OVERDUE','WAIVED')),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_fee_payments_student   ON fee_payments(student_id);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_fee_payments_structure ON fee_payments(fee_structure_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Triggers for fees tables ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_fee_structures_updated_at BEFORE UPDATE ON fee_structures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fee_scholarships_updated_at BEFORE UPDATE ON fee_scholarships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fee_discounts_updated_at BEFORE UPDATE ON fee_discounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fee_payments_updated_at BEFORE UPDATE ON fee_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Quiz Batches mapping (parallel to assignment_batches) ────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS quiz_batches (
    quiz_id  UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    released BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (quiz_id, batch_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_quiz_batches_quiz  ON quiz_batches(quiz_id);  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_quiz_batches_batch ON quiz_batches(batch_id); EXCEPTION WHEN others THEN NULL; END $$;

-- ── Live Class Links ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS live_class_links (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id    UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    module_id   UUID        NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    meet_link   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, module_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_live_class_links_batch ON live_class_links(batch_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_live_class_links_module ON live_class_links(module_id); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_live_class_links_updated_at BEFORE UPDATE ON live_class_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

-- Batch mapping is explicit via Assignment/Quiz Master Edit UI (no schema auto-map).

-- ══════════════════════════════════════════════════════════════════════════════
-- SERIAL ID — Human-readable auto-increment ID for every table
-- Starts at 1, increments by 1 for each new row. Unique per table.
-- The UUID remains the primary key; serial_id is for display/verification.
-- ══════════════════════════════════════════════════════════════════════════════

-- (SERIAL ID columns already added in previous migrations — kept here as a marker)

-- Fix session_references type constraint to allow 'SLM'
DO $$ BEGIN
  ALTER TABLE session_references DROP CONSTRAINT IF EXISTS session_references_type_check;
  ALTER TABLE session_references ADD CONSTRAINT session_references_type_check CHECK (type IN ('LINK','PDF','VIDEO','DOCUMENT','OTHER','SLM'));
EXCEPTION WHEN others THEN NULL; END $$;

-- Fix session_artifacts type constraint to allow 'WORD_DOC'
DO $$ BEGIN
  ALTER TABLE session_artifacts DROP CONSTRAINT IF EXISTS session_artifacts_type_check;
  ALTER TABLE session_artifacts ADD CONSTRAINT session_artifacts_type_check CHECK (type IN ('DEMO','PROJECT','GITHUB','VIDEO','OTHER','WORD_DOC'));
EXCEPTION WHEN others THEN NULL; END $$;

-- Ensure question_ids column exists on quiz_attempts (stores the randomized question set per attempt)
DO $$ BEGIN
  ALTER TABLE quiz_attempts ADD COLUMN question_ids JSONB;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Activate DRAFT quizzes that have questions
UPDATE quizzes q SET status = 'ACTIVE'
WHERE q.status = 'DRAFT'
  AND EXISTS (SELECT 1 FROM quiz_questions qq WHERE qq.module_id = q.module_id);

-- Clean stale IN_PROGRESS attempts (from previous bugs) so students can retry
DELETE FROM quiz_attempts WHERE status = 'IN_PROGRESS';

-- Programs (bundles of multiple courses)
CREATE TABLE IF NOT EXISTS programs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','DRAFT','ARCHIVED')),
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Program courses (many-to-many)
CREATE TABLE IF NOT EXISTS program_courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  sort_order  INT  NOT NULL DEFAULT 0,
  UNIQUE (program_id, course_id)
);

-- updated_at trigger for programs
DO $$ BEGIN
  CREATE TRIGGER trg_programs_updated_at
    BEFORE UPDATE ON programs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- MERGED FEATURES (programs enrollment, signup intake, student_fees, payment
-- proofs, invoices, coding module). Superset columns + new tables, all idempotent.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Courses: link to a program (friend's program-centric course master) ───────
DO $$ BEGIN ALTER TABLE courses ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_courses_program ON courses(program_id); EXCEPTION WHEN others THEN NULL; END $$;

-- ── Attendance sessions: allow direct course link (friend's attendance master) ─
DO $$ BEGIN ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE attendance_sessions ALTER COLUMN batch_id DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_att_sessions_course ON attendance_sessions(course_id); EXCEPTION WHEN others THEN NULL; END $$;

-- ── Users: allow FEES_ADMIN role (friend's fees-admin user) ───────────────────
DO $$ BEGIN ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN','ADMIN','TRAINER','STUDENT','FEES_ADMIN','LD_MANAGER','OPERATIONAL_MANAGER','INTERN')); EXCEPTION WHEN others THEN NULL; END $$;

-- ── Internship portal core tables ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS internship_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    batch_name TEXT,
    mentor_name TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    stipend_per_month INTEGER DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING','ACTIVE','COMPLETED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES intern_batches(id) ON DELETE SET NULL,
    join_date DATE,
    status TEXT DEFAULT 'ACTIVE',
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, program_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE intern_allocations ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES intern_batches(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    ref_no INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('pdf','video','website','ppt')),
    url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    sprint_no INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    artifact_type TEXT DEFAULT 'Other',
    project_pdf_url TEXT DEFAULT '',
    project_pdf_name TEXT DEFAULT '',
    template_repo_url TEXT DEFAULT '',
    due_date DATE,
    priority TEXT DEFAULT 'MEDIUM',
    linked_ref_ids TEXT[] DEFAULT '{}',
    solution_file_url TEXT,
    solution_file_key TEXT,
    solution_file_name TEXT,
    solution_file_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS solution_file_text TEXT; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_task_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES intern_tasks(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'NOT_STARTED',
    fork_url TEXT DEFAULT '',
    pr_url TEXT DEFAULT '',
    commit_count INTEGER DEFAULT 0,
    last_push_at TIMESTAMPTZ,
    ai_score NUMERIC(4,1),
    ai_breakdown JSONB,
    ai_feedback TEXT DEFAULT '',
    submitted_at TIMESTAMPTZ,
    graded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, task_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    hours_worked NUMERIC(4,1) NOT NULL,
    description TEXT NOT NULL,
    challenges TEXT DEFAULT '',
    mentor_comment TEXT DEFAULT '',
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES intern_batches(id) ON DELETE SET NULL,
    session_date DATE NOT NULL,
    status TEXT DEFAULT 'PRESENT',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, program_id, session_date)
  );
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE intern_attendance ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES intern_batches(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 10,
    feedback TEXT DEFAULT '',
    evaluated_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_stipends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    is_eligible BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'PENDING',
    certificate_id TEXT,
    certificate_url TEXT,
    grade TEXT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, program_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_ppo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
    company TEXT,
    internship_rating INTEGER,
    ppo_offered BOOLEAN DEFAULT false,
    ppo_date DATE,
    package_offered TEXT,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','OFFERED','ACCEPTED','DECLINED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, program_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Batches: bridge course-centric (yours) + program-centric (friend) models ──
-- Both FKs nullable so a batch may belong to a course, a program, or both.
DO $$ BEGIN ALTER TABLE batches ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE batches ALTER COLUMN course_id DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_batches_program ON batches(program_id); EXCEPTION WHEN others THEN NULL; END $$;

-- ── Programs: superset columns (friend's color/sort/active alongside status) ──
DO $$ BEGIN ALTER TABLE programs ADD COLUMN IF NOT EXISTS color_token TEXT    NOT NULL DEFAULT 'cyan'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE programs ADD COLUMN IF NOT EXISTS sort_order  INT     NOT NULL DEFAULT 0;      EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE;   EXCEPTION WHEN others THEN NULL; END $$;

-- ── Users: signup-intake + program-assignment columns ─────────────────────────
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status      TEXT NOT NULL DEFAULT 'ACTIVE'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active           BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username     TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_program_id UUID REFERENCES programs(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS program_assigned_at TIMESTAMPTZ; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS program_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_source         TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth       DATE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation          TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS qualification       TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year     TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS class_preference    TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS address             TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE users ADD  CONSTRAINT users_account_status_check CHECK (account_status IN ('PENDING','ACTIVE','REJECTED','BLOCKED')); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_users_assigned_program ON users(assigned_program_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_users_account_status   ON users(account_status);       EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_users_github_username  ON users(github_username);      EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_users_github_username_ci
    ON users (LOWER(github_username))
    WHERE github_username IS NOT NULL AND github_username <> '';
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Program enrollments (student → program) ───────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS program_enrollments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    program_id  UUID        NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, program_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Program course selections (enrollment → course) ───────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS program_course_selections (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_enrollment_id UUID NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
    course_id             UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (program_enrollment_id, course_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_prog_enroll_student ON program_enrollments(student_id);              EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_prog_sel_enrollment ON program_course_selections(program_enrollment_id); EXCEPTION WHEN others THEN NULL; END $$;

-- ── Student fees docket (monthly, registration + 3 instalments) ───────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS student_fees (
    id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id                    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id                     UUID        REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_month                DATE        NOT NULL,
    fees_offered                  NUMERIC(10,2) NOT NULL DEFAULT 0,
    registration_expected         NUMERIC(10,2),
    registration_amount           NUMERIC(10,2),
    registration_date             DATE,
    registration_reminder_status  TEXT,
    registration_reminder_date    DATE,
    installment1_expected         NUMERIC(10,2),
    installment1_amount           NUMERIC(10,2),
    installment1_date             DATE,
    installment1_reminder_status  TEXT,
    installment1_reminder_date    DATE,
    installment2_expected         NUMERIC(10,2),
    installment2_amount           NUMERIC(10,2),
    installment2_date             DATE,
    installment2_reminder_status  TEXT,
    installment2_reminder_date    DATE,
    installment3_expected         NUMERIC(10,2),
    installment3_amount           NUMERIC(10,2),
    installment3_date             DATE,
    installment3_reminder_status  TEXT,
    installment3_reminder_date    DATE,
    due_amount                    NUMERIC(10,2),
    remarks                       TEXT,
    created_by                    UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, course_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_student_fees_student ON student_fees(student_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_student_fees_updated_at BEFORE UPDATE ON student_fees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Payment proofs (UPI proof upload → admin verify) ──────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS payment_proofs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_id          UUID        NOT NULL REFERENCES student_fees(id) ON DELETE CASCADE,
    student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    installment_key TEXT        NOT NULL,
    amount          NUMERIC(10,2) NOT NULL,
    proof_path      TEXT,
    status          TEXT        NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
    student_upi     TEXT,
    payment_date    DATE,
    verified_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    verified_at     TIMESTAMPTZ,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_payment_proofs_fee     ON payment_proofs(fee_id);     EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_payment_proofs_student ON payment_proofs(student_id); EXCEPTION WHEN others THEN NULL; END $$;

-- ── LMS settings (key/value, e.g. UPI id/name) ────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS lms_settings (
    key        TEXT        PRIMARY KEY,
    value      TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Invoices ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS invoices (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT        NOT NULL UNIQUE,
    student_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id     UUID        REFERENCES programs(id) ON DELETE SET NULL,
    amount         NUMERIC(10,2) NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'GENERATED',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id); EXCEPTION WHEN others THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- CODING MODULE (Judge0-backed problems, test cases, assignments, submissions)
-- ══════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS coding_problems (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title             TEXT        NOT NULL,
    description       TEXT        NOT NULL,
    language          TEXT        NOT NULL,
    difficulty        TEXT        NOT NULL,
    starter_code      TEXT,
    solution_hint     TEXT,
    expected_concepts TEXT,
    points            INT         NOT NULL DEFAULT 100,
    course_id         UUID        REFERENCES courses(id) ON DELETE SET NULL,
    created_by        UUID        REFERENCES users(id)   ON DELETE SET NULL,
    status            TEXT        NOT NULL DEFAULT 'ACTIVE',
    due_date          TIMESTAMPTZ,
    time_limit_mins   INT,
    max_attempts      INT         NOT NULL DEFAULT 3,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS coding_test_cases (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id      UUID        NOT NULL REFERENCES coding_problems(id) ON DELETE CASCADE,
    input           TEXT,
    expected_output TEXT,
    is_hidden       BOOLEAN     NOT NULL DEFAULT FALSE,
    explanation     TEXT,
    sort_order      INT         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS coding_assignments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id      UUID        NOT NULL REFERENCES coding_problems(id) ON DELETE CASCADE,
    batch_id        UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    assigned_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    due_date        TIMESTAMPTZ,
    time_limit_mins INT,
    max_attempts    INT         NOT NULL DEFAULT 3,
    status          TEXT        NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (problem_id, batch_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS coding_submissions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     UUID        NOT NULL REFERENCES coding_assignments(id) ON DELETE CASCADE,
    problem_id        UUID        NOT NULL REFERENCES coding_problems(id) ON DELETE CASCADE,
    student_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code              TEXT        NOT NULL,
    language          TEXT        NOT NULL,
    execution_status  TEXT,
    execution_output  TEXT,
    stderr            TEXT,
    runtime_ms        NUMERIC,
    test_cases_passed INT,
    test_cases_total  INT,
    ai_score          NUMERIC,
    ai_feedback       TEXT,
    ai_suggestions    TEXT,
    ai_grade          TEXT,
    attempt_number    INT         NOT NULL DEFAULT 1,
    status            TEXT        NOT NULL DEFAULT 'RUNNING',
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluated_at      TIMESTAMPTZ
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_coding_tc_problem      ON coding_test_cases(problem_id);   EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_coding_assign_batch    ON coding_assignments(batch_id);    EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_coding_assign_problem  ON coding_assignments(problem_id);  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_coding_sub_assignment  ON coding_submissions(assignment_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_coding_sub_student     ON coding_submissions(student_id);  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_coding_problems_updated_at    BEFORE UPDATE ON coding_problems    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_coding_assignments_updated_at BEFORE UPDATE ON coding_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- BATCH ↔ COURSE MANY-TO-MANY
-- A batch can cover multiple courses (admin selects via checkboxes).
-- course_id on batches kept nullable for backward compat; primary source is batch_courses.
-- ══════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS batch_courses (
    batch_id  UUID NOT NULL REFERENCES batches(id)  ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (batch_id, course_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_batch_courses_batch  ON batch_courses(batch_id);  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_batch_courses_course ON batch_courses(course_id); EXCEPTION WHEN others THEN NULL; END $$;

-- Per-batch session progress (isolates Done/Lock/Release per batch for shared courses)
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS batch_module_progress (
    batch_id     UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    module_id    UUID        NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'LOCKED'
                   CHECK (status IN ('LOCKED','RELEASED','COMPLETED')),
    completed_at TIMESTAMPTZ,
    completed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (batch_id, module_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bmp_batch  ON batch_module_progress(batch_id);  EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bmp_module ON batch_module_progress(module_id); EXCEPTION WHEN others THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- MOCK INTERVIEWS
-- ══════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS mock_interviews (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trainer_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time   TIMESTAMPTZ NOT NULL,
    end_time     TIMESTAMPTZ NOT NULL,
    meeting_link TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED')),
    score        NUMERIC,
    feedback     TEXT,
    key_strengths TEXT,
    areas_of_improvement TEXT,
    course_id    UUID REFERENCES courses(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_mock_interviews_student ON mock_interviews(student_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_mock_interviews_trainer ON mock_interviews(trainer_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_mock_interviews_updated_at BEFORE UPDATE ON mock_interviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- PLACEMENT MASTER
-- ══════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS placement_jobs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name    TEXT        NOT NULL,
    job_description TEXT        NOT NULL,
    ctc             TEXT        NOT NULL,
    qualification   TEXT        NOT NULL,
    experience      TEXT        NOT NULL,
    attachment_url  TEXT,
    created_by      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED'))
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_placement_jobs_updated_at BEFORE UPDATE ON placement_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS placement_materials (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    description TEXT,
    file_url    TEXT        NOT NULL,
    uploaded_by UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_placement_materials_updated_at BEFORE UPDATE ON placement_materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS student_resumes (
    student_id  UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    resume_url  TEXT        NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_student_resumes_updated_at BEFORE UPDATE ON student_resumes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS job_applications (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id     UUID        NOT NULL REFERENCES placement_jobs(id) ON DELETE CASCADE,
    student_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status     TEXT        NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('APPLIED', 'REJECTED', 'SHORTLISTED')),
    UNIQUE (job_id, student_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS batch_session_feedback_config (
    batch_id          UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    module_id         UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    requires_feedback BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (batch_id, module_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS session_feedbacks (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id                 UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    module_id                UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    student_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conceptual_understanding INT NOT NULL CHECK (conceptual_understanding >= 1 AND conceptual_understanding <= 5),
    problem_solving          INT NOT NULL CHECK (problem_solving >= 1 AND problem_solving <= 5),
    hands_on_experience      INT NOT NULL CHECK (hands_on_experience >= 1 AND hands_on_experience <= 5),
    class_participation      INT NOT NULL CHECK (class_participation >= 1 AND class_participation <= 5),
    punctuality              INT NOT NULL CHECK (punctuality >= 1 AND punctuality <= 5),
    additional_comments      TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, module_id, student_id)
  );
EXCEPTION WHEN others THEN NULL; END $$;

-- Add AI grading fields for Assessments
DO $$ BEGIN ALTER TABLE assessments ADD COLUMN IF NOT EXISTS ai_rubric TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS ai_approach_score FLOAT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS ai_solution_score FLOAT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS ai_feedback TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS ai_status TEXT; EXCEPTION WHEN others THEN NULL; END $$;

-- Add AI Voice Mock Interview fields
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS is_ai_driven BOOLEAN DEFAULT FALSE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS ai_context_file_url TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS ai_topic TEXT; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS proctor_logs JSONB; EXCEPTION WHEN others THEN NULL; END $$;

-- Intern commit polling + webhook support
DO $$ BEGIN ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS last_push_sha TEXT; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS intern_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pusher_login TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    repo_owner TEXT NOT NULL,
    ref TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    commit_message TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    source TEXT DEFAULT 'webhook',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN others THEN NULL; END $$;

CREATE OR REPLACE FUNCTION normalize_github_url(url TEXT) RETURNS TEXT AS $$
DECLARE
  path TEXT;
  parts TEXT[];
BEGIN
  IF url IS NULL THEN RETURN ''; END IF;
  path := LOWER(BTRIM(url));
  path := REPLACE(path, 'https://github.com/', '');
  path := REPLACE(path, 'http://github.com/', '');
  path := REPLACE(path, 'github.com/', '');
  IF RIGHT(path, 4) = '.git' THEN path := LEFT(path, LENGTH(path) - 4); END IF;
  parts := STRING_TO_ARRAY(path, '/');
  IF array_length(parts, 1) >= 2 THEN
    RETURN parts[1] || '/' || parts[2];
  END IF;
  RETURN path;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Performance Optimization Indexes ──────────────────────────────────────────
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_course_modules_course_id ON course_modules(course_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_intern_task_progress_student_id ON intern_task_progress(student_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_intern_task_progress_task_id ON intern_task_progress(task_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_intern_work_logs_student_id ON intern_work_logs(student_id); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_intern_allocations_student_id ON intern_allocations(student_id); EXCEPTION WHEN others THEN NULL; END $$;
`;

async function runSchema() {
  const client = await pool.connect();
  try {
    console.log('[schema] Running base schema...');
    try {
      await client.query(schema);
    } catch (schemaErr: any) {
      console.warn('[schema] Base schema warning (non-fatal):', schemaErr.message);
    }
    console.log('[schema] Running migrations...');
    try {
      await client.query(migrations);
    } catch (migErr: any) {
      console.warn('[schema] Migration warning (non-fatal):', migErr.message);
    }
    console.log('[schema] Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

runSchema().catch((err) => {
  console.error('[schema] Fatal error:', err);
  process.exit(1);
});
