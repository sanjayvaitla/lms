import 'dotenv/config';
import db from '../lib/db';

export async function runMigrations() {
  console.log('  [DB] Running schema migrations…');

  // ── Step 1: patch users table (always exists) ────────────────────────────────
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'ACTIVE';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_access_token TEXT;
  `).catch(err => console.warn('[DB MIGRATION] users:', err.message));

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_github_username_ci
      ON users (LOWER(github_username))
      WHERE github_username IS NOT NULL AND github_username <> '';
  `).catch(err => console.warn('[DB MIGRATION] github unique:', err.message));

  await db.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN','ADMIN','TRAINER','STUDENT','FEES_ADMIN','LD_MANAGER','OPERATIONAL_MANAGER','INTERN'));
  `).catch(err => console.warn('[DB MIGRATION] users role update:', err.message));

  // ── Step 2: Create intern tables that don't exist yet ────────────────────────
  await db.query(`
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS placement_matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES placement_jobs(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_percentage INTEGER DEFAULT 0,
      matching_skills JSONB,
      missing_skills JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(job_id, student_id)
    );
  `).catch(err => console.warn('[DB MIGRATION] Create intern tables:', err.message));

  // Helper SQL function for normalizing GitHub repo URLs (used by webhook fork matching).
  // Idempotent — safe to re-run. Strips protocol/host/.git and lowercases owner/repo.
  await db.query(`
    CREATE OR REPLACE FUNCTION normalize_github_url(url TEXT) RETURNS TEXT AS $$
    DECLARE
      path TEXT;
      parts TEXT[];
    BEGIN
      IF url IS NULL THEN RETURN ''; END IF;
      path := LOWER(BTRIM(url));
      path := REPLACE(path, 'https://github.com/', '');
      path := REPLACE(path, 'http://github.com/', '');
      path := REPLACE(path, 'git@github.com:', '');
      path := REPLACE(path, '.git', '');
      path := BTRIM(path, '/');
      parts := string_to_array(path, '/');
      IF array_length(parts, 1) >= 2 THEN
        RETURN parts[1] || '/' || parts[2];
      END IF;
      RETURN path;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `).catch(err => console.warn('[DB MIGRATION] normalize_github_url function:', err.message));

  // ── Step 3: Patch columns that may be missing on pre-existing tables ─────────
  await db.query(`
    ALTER TABLE internship_programs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE internship_programs ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE internship_programs ADD COLUMN IF NOT EXISTS batch_name TEXT;
    ALTER TABLE internship_programs ADD COLUMN IF NOT EXISTS mentor_name TEXT;
    ALTER TABLE internship_programs ADD COLUMN IF NOT EXISTS stipend_per_month INTEGER DEFAULT 0;
    ALTER TABLE internship_programs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `).catch(err => console.warn('[DB MIGRATION] internship_programs columns:', err.message));

  await db.query(`
    ALTER TABLE intern_batches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'UPCOMING';
    ALTER TABLE intern_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `).catch(err => console.warn('[DB MIGRATION] intern_batches columns:', err.message));

  await db.query(`
    ALTER TABLE intern_allocations ADD COLUMN IF NOT EXISTS batch_id UUID;
    ALTER TABLE intern_allocations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
    ALTER TABLE intern_allocations ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;
    ALTER TABLE intern_allocations ADD COLUMN IF NOT EXISTS join_date DATE;
    ALTER TABLE intern_allocations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `).catch(err => console.warn('[DB MIGRATION] intern_allocations columns:', err.message));

  await db.query(`
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS solution_file_url TEXT;
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS solution_file_key TEXT;
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS solution_file_name TEXT;
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS solution_file_text TEXT;
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS artifact_type TEXT DEFAULT 'Other';
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'MEDIUM';
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS template_repo_url TEXT DEFAULT '';
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS project_pdf_url TEXT DEFAULT '';
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS project_pdf_name TEXT DEFAULT '';
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS due_date DATE;
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS linked_ref_ids TEXT[] DEFAULT '{}';
    ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `).catch(err => console.warn('[DB MIGRATION] intern_tasks columns:', err.message));

  await db.query(`
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS fork_url TEXT DEFAULT '';
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS pr_url TEXT DEFAULT '';
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS commit_count INTEGER DEFAULT 0;
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS last_push_sha TEXT;
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS ai_score NUMERIC(4,1);
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS ai_breakdown JSONB;
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS ai_feedback TEXT DEFAULT '';
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
    ALTER TABLE intern_task_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `).catch(err => console.warn('[DB MIGRATION] intern_task_progress columns:', err.message));

  await db.query(`
    ALTER TABLE intern_work_logs ADD COLUMN IF NOT EXISTS challenges TEXT DEFAULT '';
    ALTER TABLE intern_work_logs ADD COLUMN IF NOT EXISTS mentor_comment TEXT DEFAULT '';
    ALTER TABLE intern_work_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';
  `).catch(err => console.warn('[DB MIGRATION] intern_work_logs columns:', err.message));

  await db.query(`
    ALTER TABLE intern_certificates ADD COLUMN IF NOT EXISTS certificate_url TEXT;
    ALTER TABLE intern_certificates ADD COLUMN IF NOT EXISTS grade TEXT;
    ALTER TABLE intern_certificates ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;
  `).catch(err => console.warn('[DB MIGRATION] intern_certificates columns:', err.message));

  // Add source column to intern_webhook_events to identify event origin
  await db.query(`
    ALTER TABLE intern_webhook_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'webhook';
  `).catch(err => console.warn('[DB MIGRATION] intern_webhook_events source column:', err.message));

  // GitHub assignment / git-task columns (assignment poller + student fork workflow)
  await db.query(`
    ALTER TABLE assignments ADD COLUMN IF NOT EXISTS github_template_url TEXT;
    ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS github_fork_url TEXT;
    ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS github_latest_commit_sha TEXT;
  `).catch(err => console.warn('[DB MIGRATION] assignment github columns:', err.message));

  await db.query(`
    ALTER TABLE assignment_submissions DROP CONSTRAINT IF EXISTS assignment_submissions_status_check;
    ALTER TABLE assignment_submissions ADD CONSTRAINT assignment_submissions_status_check
      CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'LATE'));
  `).catch(err => console.warn('[DB MIGRATION] assignment_submissions status constraint:', err.message));

  // Fees: ensure course_id column; keep both uniqueness strategies without runtime DDL races.
  // Prefer (student_id, course_id) when course_id is set; allow multiple NULL course rows via partial unique on month.
  await db.query(`
    ALTER TABLE student_fees ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;
  `).catch(err => console.warn('[DB MIGRATION] student_fees.course_id:', err.message));

  await db.query(`
    ALTER TABLE student_fees DROP CONSTRAINT IF EXISTS student_fees_student_id_enrolled_month_key;
  `).catch(err => console.warn('[DB MIGRATION] drop month unique:', err.message));

  await db.query(`
    DO $$ BEGIN
      ALTER TABLE student_fees ADD CONSTRAINT student_fees_student_id_course_id_key UNIQUE (student_id, course_id);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END $$;
  `).catch(err => console.warn('[DB MIGRATION] student_fees course unique:', err.message));

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS student_fees_student_month_null_course_uidx
      ON student_fees (student_id, enrolled_month)
      WHERE course_id IS NULL;
  `).catch(err => console.warn('[DB MIGRATION] student_fees null-course month unique:', err.message));

  await db.query(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_proof_id UUID;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS installment_key TEXT;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS installment_label TEXT;
  `).catch(err => console.warn('[DB MIGRATION] invoices installment columns:', err.message));

  await db.query(`
    ALTER TABLE session_references DROP CONSTRAINT IF EXISTS session_references_type_check;
    ALTER TABLE session_references ADD CONSTRAINT session_references_type_check
      CHECK (type IN ('LINK','PDF','VIDEO','DOCUMENT','OTHER','SLM','PPT'));
  `).catch(err => console.warn('[DB MIGRATION] session_references type constraint:', err.message));

  console.log('  [DB] Migrations complete.');

  // ── Step 4: Patch mock_interviews table ──────────────────────────────────────
  await db.query(`
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS is_ai_driven BOOLEAN DEFAULT false;
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS ai_topic TEXT;
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS ai_context_file_url TEXT;
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS key_strengths TEXT;
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS areas_of_improvement TEXT;
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS proctor_logs JSONB;
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS ai_domain TEXT;
    ALTER TABLE mock_interviews ADD COLUMN IF NOT EXISTS ai_experience TEXT;
  `).catch(err => console.warn('[DB MIGRATION] mock_interviews columns:', err.message));

  // ── Step 5: Add Performance Optimization Indexes ─────────────────────────────
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_course_modules_course_id ON course_modules(course_id);
    CREATE INDEX IF NOT EXISTS idx_intern_task_progress_student_id ON intern_task_progress(student_id);
    CREATE INDEX IF NOT EXISTS idx_intern_task_progress_task_id ON intern_task_progress(task_id);
    CREATE INDEX IF NOT EXISTS idx_intern_work_logs_student_id ON intern_work_logs(student_id);
    CREATE INDEX IF NOT EXISTS idx_intern_allocations_student_id ON intern_allocations(student_id);
  `).catch(err => console.warn('[DB MIGRATION] performance indexes:', err.message));

  // ── Step 6: Extend invoices table for per-payment invoicing ──────────────────
  // Each invoice is now tied to a specific verified payment proof (one per proof).
  await db.query(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_proof_id UUID REFERENCES payment_proofs(id) ON DELETE SET NULL;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS installment_key   TEXT;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS installment_label TEXT;
  `).catch(err => console.warn('[DB MIGRATION] invoices per-payment columns:', err.message));

  // Unique index: one invoice per verified payment proof (prevents duplicates)
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_payment_proof
      ON invoices (payment_proof_id)
      WHERE payment_proof_id IS NOT NULL;
  `).catch(err => console.warn('[DB MIGRATION] invoices unique proof index:', err.message));

  console.log('  [DB] Step 6 (invoices per-payment) complete.');

  // ── Step 7: Clean up bad old invoices & backfill from verified proofs ─────────
  // Old invoices were cumulative totals (e.g. reg ₹2,000 + inst1 ₹10,000 = ₹12,000).
  // We delete all those legacy invoices (they have payment_proof_id = NULL) and
  // regenerate one correct per-payment invoice for every VERIFIED proof.
  try {
    console.log('  [DB] Step 7: Cleaning up old cumulative invoices…');

    // 1. Delete every old invoice that is not linked to a specific proof.
    //    These are the bad cumulative / duplicate / manually-generated ones.
    await db.query(`DELETE FROM invoices WHERE payment_proof_id IS NULL`);

    // 2. Fetch every verified payment proof that does NOT already have an invoice.
    const { rows: proofs } = await db.query<any>(`
      SELECT
        pp.id          AS proof_id,
        pp.student_id,
        pp.installment_key,
        pp.amount,
        u.assigned_program_id AS program_id
      FROM payment_proofs pp
      JOIN users u ON u.id = pp.student_id
      WHERE pp.status = 'VERIFIED'
        AND NOT EXISTS (
          SELECT 1 FROM invoices i WHERE i.payment_proof_id = pp.id
        )
    `);

    const labelMap: Record<string, string> = {
      registration: 'Registration Fee',
      installment1: '1st Installment',
      installment2: '2nd Installment',
      installment3: '3rd Installment',
    };

    let created = 0;
    for (const proof of proofs) {
      const installmentLabel = labelMap[proof.installment_key as string] ?? proof.installment_key;
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      // Add small random suffix to guarantee uniqueness even within same loop iteration
      const randPart = Math.random().toString(36).substring(2, 7).toUpperCase();
      const invoiceNumber = `INV-${datePart}-${randPart}`;

      await db.query(
        `INSERT INTO invoices
           (invoice_number, student_id, program_id, amount,
            payment_proof_id, installment_key, installment_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          invoiceNumber,
          proof.student_id,
          proof.program_id,
          proof.amount,
          proof.proof_id,
          proof.installment_key,
          installmentLabel,
        ],
      );
      created++;
    }

    console.log(`  [DB] Step 7 complete: deleted old invoices, created ${created} backfill invoice(s).`);
  } catch (err: any) {
    console.warn('[DB MIGRATION] Step 7 (invoice cleanup + backfill):', err.message);
  }

  // ── Step 8: DISABLED — do not auto-map assignments/quizzes to all batches ───
  // Content must stay unmapped until admin maps batches from Edit UI.
  // (Previously re-ran every startup and wiped intentional unmapped/partial maps.)
  console.log('  [DB] Step 8 skipped: assignment/quiz/assessment batch auto-backfill disabled.');

  // ── Step 9: batch_module_progress table + backfill from course_modules ───────
  try {
    console.log('  [DB] Step 9: Creating batch_module_progress and backfilling…');
    await db.query(`
      CREATE TABLE IF NOT EXISTS batch_module_progress (
        batch_id     UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        module_id    UUID        NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
        status       TEXT        NOT NULL DEFAULT 'LOCKED'
                       CHECK (status IN ('LOCKED','RELEASED','COMPLETED')),
        completed_at TIMESTAMPTZ,
        completed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
        PRIMARY KEY (batch_id, module_id)
      )
    `);
    const bmpRes = await db.query(`
      INSERT INTO batch_module_progress (batch_id, module_id, status, completed_at, completed_by)
      SELECT bc.batch_id, cm.id,
        CASE cm.status
          WHEN 'COMPLETED' THEN 'COMPLETED'
          WHEN 'RELEASED'  THEN 'RELEASED'
          ELSE CASE WHEN cm.sort_order = 0 THEN 'RELEASED' ELSE 'LOCKED' END
        END,
        CASE WHEN cm.status = 'COMPLETED' THEN cm.completed_at ELSE NULL END,
        CASE WHEN cm.status = 'COMPLETED' THEN cm.completed_by ELSE NULL END
      FROM batch_courses bc
      JOIN course_modules cm ON cm.course_id = bc.course_id
      ON CONFLICT (batch_id, module_id) DO NOTHING
    `);
    await db.query(`
      UPDATE enrollments e
      SET completion_pct = COALESCE((
        SELECT ROUND(AVG(course_pct))::int
        FROM (
          SELECT ROUND(
            COALESCE(
              COUNT(*) FILTER (WHERE bmp.status = 'COMPLETED')::numeric * 100.0
              / NULLIF(COUNT(*), 0),
              0
            )
          )::int AS course_pct
          FROM batch_courses bc
          JOIN course_modules cm ON cm.course_id = bc.course_id
          LEFT JOIN batch_module_progress bmp
            ON bmp.batch_id = bc.batch_id AND bmp.module_id = cm.id
          WHERE bc.batch_id = e.batch_id
          GROUP BY bc.course_id
        ) sub
      ), 0)
    `);
    console.log(`  [DB] Step 9 complete: ${bmpRes.rowCount ?? 0} progress row(s), enrollments recalculated.`);
  } catch (err: any) {
    console.warn('[DB MIGRATION] Step 9 (batch_module_progress):', err.message);
  }

  // ── Step 10: Course-first recordings (nullable batch_id) ─────────────────────
  try {
    console.log('  [DB] Step 10: Allow course-level session recordings…');
    await db.query('ALTER TABLE session_recordings ALTER COLUMN batch_id DROP NOT NULL');
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_session_recordings_course_module
        ON session_recordings(module_id) WHERE batch_id IS NULL
    `);
    console.log('  [DB] Step 10 complete.');
  } catch (err: any) {
    console.warn('[DB MIGRATION] Step 10 (course recordings):', err.message);
  }

  // ── Step 11: Hot-path indexes ────────────────────────────────────────────────
  try {
    console.log('  [DB] Step 11: Adding performance indexes…');
    await db.query('CREATE INDEX IF NOT EXISTS idx_session_refs_module_type ON session_references(module_id, type)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_live_class_links_batch_module ON live_class_links(batch_id, module_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_quiz ON quiz_attempts(student_id, quiz_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_assignment_subs_assign_student ON assignment_submissions(assignment_id, student_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_enrollments_enrolled_at ON enrollments(enrolled_at)');
    console.log('  [DB] Step 11 complete.');
  } catch (err: any) {
    console.warn('[DB MIGRATION] Step 11 (indexes):', err.message);
  }

  // ── Step 12: Quiz schema guard (quiz_batches, availability windows, question_ids) ─
  try {
    console.log('  [DB] Step 12: Ensuring quiz tables/columns…');
    await db.query(`
      CREATE TABLE IF NOT EXISTS quiz_batches (
        quiz_id  UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        PRIMARY KEY (quiz_id, batch_id)
      );
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS available_from  TIMESTAMPTZ;
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS available_until TIMESTAMPTZ;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS question_ids JSONB;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS passed BOOLEAN;
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_quiz_batches_quiz  ON quiz_batches(quiz_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_quiz_batches_batch ON quiz_batches(batch_id)');
    console.log('  [DB] Step 12 complete.');
  } catch (err: any) {
    console.warn('[DB MIGRATION] Step 12 (quiz schema):', err.message);
  }

  // ── Step 13: Coding module tables + columns ────────────────────────────────
  try {
    console.log('  [DB] Step 13: Ensuring coding module schema…');
    await db.query(`
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

      CREATE INDEX IF NOT EXISTS idx_coding_tc_problem     ON coding_test_cases(problem_id);
      CREATE INDEX IF NOT EXISTS idx_coding_assign_batch   ON coding_assignments(batch_id);
      CREATE INDEX IF NOT EXISTS idx_coding_assign_problem ON coding_assignments(problem_id);
      CREATE INDEX IF NOT EXISTS idx_coding_sub_assignment ON coding_submissions(assignment_id);
      CREATE INDEX IF NOT EXISTS idx_coding_sub_student    ON coding_submissions(student_id);

      ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
      ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS time_limit_mins INT;
      ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3;
    `);
    console.log('  [DB] Step 13 complete.');
  } catch (err: any) {
    console.warn('[DB MIGRATION] Step 13 (coding schema):', err.message);
  }

  // ── Step 14: per-batch assignment/quiz release (Done on batch A ≠ unlock batch B) ─
  try {
    await db.query(`
      ALTER TABLE assignment_batches
        ADD COLUMN IF NOT EXISTS released BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE quiz_batches
        ADD COLUMN IF NOT EXISTS released BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await db.query(`
      UPDATE assignment_batches ab
      SET released = TRUE
      FROM assignments a, batch_module_progress bmp
      WHERE ab.assignment_id = a.id
        AND bmp.batch_id = ab.batch_id
        AND bmp.module_id = a.module_id
        AND a.module_id IS NOT NULL
        AND bmp.status = 'COMPLETED'
        AND ab.released = FALSE
    `);

    await db.query(`
      UPDATE quiz_batches qb
      SET released = TRUE
      FROM quizzes q, batch_module_progress bmp
      WHERE qb.quiz_id = q.id
        AND bmp.batch_id = qb.batch_id
        AND bmp.module_id = q.module_id
        AND q.module_id IS NOT NULL
        AND bmp.status = 'COMPLETED'
        AND qb.released = FALSE
    `);

    await db.query(`
      UPDATE assignment_batches ab
      SET released = TRUE
      FROM assignments a
      WHERE ab.assignment_id = a.id
        AND a.module_id IS NULL
        AND a.status = 'PUBLISHED'
        AND ab.released = FALSE
    `);

    await db.query(`
      UPDATE quiz_batches qb
      SET released = TRUE
      FROM quizzes q
      WHERE qb.quiz_id = q.id
        AND q.module_id IS NULL
        AND q.status = 'ACTIVE'
        AND qb.released = FALSE
    `);

    console.log('  [DB] Step 14 complete (per-batch released).');
  } catch (err: any) {
    console.warn('[DB MIGRATION] Step 14 (per-batch released):', err.message);
  }
}

if (require.main === module) {
  runMigrations().then(() => {
    console.log('Migrations completed successfully.');
    process.exit(0);
  }).catch((err) => {
    console.error('Migrations failed:', err);
    process.exit(1);
  });
}
