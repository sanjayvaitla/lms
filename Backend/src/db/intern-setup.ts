/**
 * Intern Module Setup Script
 * Creates intern tables + seeds test intern user + sample program data
 * Run: pnpm ts-node src/db/intern-setup.ts  (from /Backend)
 */

import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function q(sql: string, params: unknown[] = []) {
  return pool.query(sql, params);
}

async function main() {
  console.log('\n🌱 Setting up Intern module...\n');

  // ── Ensure INTERN role is in the constraint ───────────────────────────────────
  await q(`DO $$ BEGIN ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check; EXCEPTION WHEN others THEN NULL; END $$`);
  await q(`DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN','ADMIN','TRAINER','STUDENT','FEES_ADMIN','LD_MANAGER','OPERATIONAL_MANAGER','INTERN')); EXCEPTION WHEN others THEN NULL; END $$`);

  // ── Create Tables ─────────────────────────────────────────────────────────────
  console.log('📋 Creating intern tables...');

  await q(`
    CREATE TABLE IF NOT EXISTS internship_programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      company VARCHAR(200) NOT NULL,
      batch_name VARCHAR(200),
      mentor_name VARCHAR(200),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      stipend_per_month INTEGER DEFAULT 0,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
      join_date DATE,
      status VARCHAR(50) DEFAULT 'ACTIVE',
      progress INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, program_id)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_references (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
      ref_no INTEGER NOT NULL,
      title VARCHAR(300) NOT NULL,
      type VARCHAR(20) NOT NULL CHECK(type IN ('pdf','video','website','ppt')),
      url TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
      sprint_no INTEGER NOT NULL,
      title VARCHAR(300) NOT NULL,
      description TEXT,
      artifact_type VARCHAR(50) DEFAULT 'Other',
      project_pdf_url TEXT DEFAULT '',
      project_pdf_name VARCHAR(200) DEFAULT '',
      template_repo_url TEXT DEFAULT '',
      due_date DATE,
      priority VARCHAR(20) DEFAULT 'MEDIUM',
      linked_ref_ids TEXT[] DEFAULT '{}',
      solution_file_url TEXT,
      solution_file_key TEXT,
      solution_file_name TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add solution columns to existing intern_tasks tables (idempotent)
  await q(`ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS solution_file_url TEXT`);
  await q(`ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS solution_file_key TEXT`);
  await q(`ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS solution_file_name TEXT`);
  await q(`ALTER TABLE intern_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_task_progress (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id UUID NOT NULL REFERENCES intern_tasks(id) ON DELETE CASCADE,
      status VARCHAR(30) DEFAULT 'NOT_STARTED',
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
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_work_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
      log_date DATE NOT NULL,
      hours_worked NUMERIC(4,1) NOT NULL,
      description TEXT NOT NULL,
      challenges TEXT DEFAULT '',
      mentor_comment TEXT DEFAULT '',
      status VARCHAR(20) DEFAULT 'PENDING',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_attendance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
      session_date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'PRESENT',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, program_id, session_date)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_evaluations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
      category VARCHAR(100) NOT NULL,
      score INTEGER DEFAULT 0,
      max_score INTEGER DEFAULT 10,
      feedback TEXT DEFAULT '',
      evaluated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_stipends (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
      month VARCHAR(20) NOT NULL,
      amount INTEGER NOT NULL,
      status VARCHAR(20) DEFAULT 'PENDING',
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS intern_certificates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_id UUID NOT NULL REFERENCES internship_programs(id) ON DELETE CASCADE,
      is_eligible BOOLEAN DEFAULT false,
      status VARCHAR(20) DEFAULT 'PENDING',
      certificate_id VARCHAR(100),
      certificate_url TEXT,
      grade VARCHAR(50),
      issued_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, program_id)
    )
  `);

  console.log('  ✓ All intern tables created\n');

  // ── Create Test Intern User ────────────────────────────────────────────────────
  console.log('👤 Creating test intern user...');
  const hash = await bcrypt.hash('password123', 10);

  const userRes = await q(`
    INSERT INTO users (name, email, password_hash, role, account_status)
    VALUES ('Ravi Kumar', 'intern@vtricks.in', $1, 'INTERN', 'ACTIVE')
    ON CONFLICT (email) DO UPDATE SET password_hash = $1, name = 'Ravi Kumar', role = 'INTERN', account_status = 'ACTIVE'
    RETURNING id
  `, [hash]);
  const internId = userRes.rows[0].id as string;
  console.log(`  ✓ intern@vtricks.in (id: ${internId})\n`);

  // ── Clean old data for this intern (idempotent re-run) ───────────────────────
  await q(`DELETE FROM intern_allocations WHERE student_id = $1`, [internId]);

  // ── Create Internship Program ─────────────────────────────────────────────────
  console.log('🏢 Creating internship program...');

  // Delete any old program that looks like our seed program (handles stale/truncated rows from prior runs)
  await q(`
    DELETE FROM internship_programs
    WHERE title ILIKE '%Full Stack%'
      AND company ILIKE '%TechCorp%'
  `);

  const progRes = await q(`
    INSERT INTO internship_programs (title, company, batch_name, mentor_name, start_date, end_date, stipend_per_month, description)
    VALUES (
      'Full Stack Development Internship',
      'TechCorp Solutions',
      'Batch A – Full Stack 2026',
      'Priya Sharma',
      '2026-06-01',
      '2026-08-31',
      15000,
      'A 3-month intensive Full Stack internship covering Node.js backend, React frontend, PostgreSQL databases, and GitHub-based project delivery.'
    ) RETURNING id
  `);
  const programId = progRes.rows[0].id as string;
  console.log(`  ✓ Program created (id: ${programId})\n`);

  // ── Create Intern Allocation ──────────────────────────────────────────────────
  await q(`
    INSERT INTO intern_allocations (student_id, program_id, join_date, status, progress)
    VALUES ($1, $2, '2026-06-01', 'ACTIVE', 45)
  `, [internId, programId]);
  console.log('  ✓ Intern allocated to program\n');

  // ── Create References ─────────────────────────────────────────────────────────
  // Each ref_no is a GROUP. Multiple rows with the same ref_no = multiple resource types in that group.
  console.log('📚 Seeding references...');

  const refGroups = [
    {
      no: 1, title: 'JavaScript Fundamentals',
      desc: 'Core JS: closures, async/await, ES6+ features with practical examples',
      items: [
        { type: 'pdf',     url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', title: 'JS Guide PDF' },
        { type: 'video',   url: 'https://www.youtube.com/watch?v=W6NZfCO5SIk',                  title: 'JS Crash Course (YouTube)' },
        { type: 'website', url: 'https://developer.mozilla.org',                                  title: 'MDN Web Docs' },
      ],
    },
    {
      no: 2, title: 'Node.js & Express Backend',
      desc: '4-hour video covering Express.js, middleware, and REST API design',
      items: [
        { type: 'video',   url: 'https://www.youtube.com/watch?v=Oe421EPjeBE', title: 'Node.js Full Tutorial (YouTube)' },
        { type: 'website', url: 'https://expressjs.com',                        title: 'Express.js Official Docs' },
        { type: 'pdf',     url: 'https://nodejs.org/en/docs/',                  title: 'Node.js Docs PDF' },
      ],
    },
    {
      no: 3, title: 'Database Design & SQL',
      desc: 'ER diagrams, normalisation (1NF–3NF), indexing and query optimisation',
      items: [
        { type: 'pdf',     url: 'https://www.guru99.com/database-normalization.html', title: 'DB Normalization Guide' },
        { type: 'video',   url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY',       title: 'SQL Mastery Full Course (YouTube)' },
        { type: 'ppt',     url: 'https://docs.google.com/presentation/d/1',           title: 'DB Architecture PPT' },
      ],
    },
    {
      no: 4, title: 'React Frontend Development',
      desc: 'Hooks, components, state management with React 18 concurrency model',
      items: [
        { type: 'website', url: 'https://react.dev',                             title: 'React Official Docs (v18)' },
        { type: 'video',   url: 'https://www.youtube.com/watch?v=b9eMGE7QtTk',  title: 'React Full Course (YouTube)' },
        { type: 'ppt',     url: 'https://docs.google.com/presentation/d/2',      title: 'React Architecture PPT' },
      ],
    },
    {
      no: 5, title: 'Git & GitHub Workflow',
      desc: 'Branching strategies, PR creation, forking workflow, code review process',
      items: [
        { type: 'pdf',     url: 'https://docs.github.com/en/get-started/quickstart/fork-a-repo', title: 'GitHub Quickstart PDF' },
        { type: 'website', url: 'https://docs.github.com',                                        title: 'GitHub Docs' },
        { type: 'video',   url: 'https://www.youtube.com/watch?v=RGOj5yH7evk',                   title: 'Git & GitHub Crash Course (YouTube)' },
      ],
    },
  ];

  const firstRefIds: string[] = []; // first row ID per group (used for task linking)
  for (const group of refGroups) {
    let firstId: string | null = null;
    for (const item of group.items) {
      // description stores the GROUP title so controller can use it as group display name
      const rRes = await q(`
        INSERT INTO intern_references (program_id, ref_no, title, type, url, description)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
      `, [programId, group.no, item.title, item.type, item.url, group.title]);
      if (!firstId) firstId = rRes.rows[0].id as string;
    }
    firstRefIds.push(firstId!);
  }
  const refIds = firstRefIds;
  console.log(`  ✓ ${refGroups.length} reference groups (${refGroups.reduce((a, g) => a + g.items.length, 0)} items) created\n`);

  // ── Create Sprint Tasks ───────────────────────────────────────────────────────
  console.log('📋 Seeding sprint tasks...');

  const tasks = [
    {
      sprint: 1, title: 'Build Authentication Module',
      desc: 'Implement a complete JWT-based authentication system: bcrypt password hashing, login / signup / logout endpoints, refresh-token rotation, and auth middleware guards for protected routes.',
      artifact: 'Node.js', pdfName: 'sprint-1-auth-module-guide.pdf',
      repo: 'https://github.com/vtricks-org/auth-module-template',
      dueDate: '2026-06-21', priority: 'HIGH',
      refIdxs: [0, 1, 4], // Ref 1 (JS), Ref 2 (Node.js), Ref 5 (Git)
    },
    {
      sprint: 2, title: 'Create RESTful API Endpoints',
      desc: 'Design and build CRUD REST endpoints for User, Product, and Order resources. Follow REST naming conventions, add Joi input validation, return correct HTTP status codes, and include pagination for list endpoints.',
      artifact: 'Node.js', pdfName: 'sprint-2-rest-api-guide.pdf',
      repo: 'https://github.com/vtricks-org/rest-api-template',
      dueDate: '2026-07-05', priority: 'HIGH',
      refIdxs: [0, 1], // Ref 1 (JS), Ref 2 (Node.js)
    },
    {
      sprint: 3, title: 'Build React Analytics Dashboard',
      desc: 'Create a fully responsive analytics dashboard in React 18 with Recharts for data visualisation, a sortable/filterable data table with pagination, and a WebSocket-powered live activity feed.',
      artifact: 'React', pdfName: 'sprint-3-react-dashboard-guide.pdf',
      repo: 'https://github.com/vtricks-org/dashboard-template',
      dueDate: '2026-07-20', priority: 'MEDIUM',
      refIdxs: [3], // Ref 4 (React)
    },
    {
      sprint: 4, title: 'Database Schema & SQL Queries',
      desc: 'Design a normalised relational schema for an e-commerce system (Customers, Products, Orders, Reviews). Write complex SQL: multi-table JOINs, correlated subqueries, CTEs, and window functions (RANK, LAG).',
      artifact: 'SQL', pdfName: 'sprint-4-sql-tasks-guide.pdf',
      repo: 'https://github.com/vtricks-org/sql-tasks-template',
      dueDate: '2026-08-03', priority: 'MEDIUM',
      refIdxs: [2], // Ref 3 (DB & SQL)
    },
  ];

  const taskIds: string[] = [];
  for (const t of tasks) {
    const linkedRefs = t.refIdxs.map(i => refIds[i]);
    const tRes = await q(`
      INSERT INTO intern_tasks (program_id, sprint_no, title, description, artifact_type, project_pdf_name, template_repo_url, due_date, priority, linked_ref_ids)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
    `, [programId, t.sprint, t.title, t.desc, t.artifact, t.pdfName, t.repo, t.dueDate, t.priority, linkedRefs]);
    taskIds.push(tRes.rows[0].id as string);
  }
  console.log(`  ✓ ${tasks.length} sprint tasks created\n`);

  // ── Seed Task Progress ────────────────────────────────────────────────────────
  console.log('🔄 Seeding task progress...');

  // Sprint 1 — AI_GRADED (already done)
  await q(`
    INSERT INTO intern_task_progress (student_id, task_id, status, fork_url, pr_url, commit_count, last_push_at, ai_score, ai_breakdown, ai_feedback, submitted_at, graded_at)
    VALUES ($1, $2, 'AI_GRADED',
      'https://github.com/ravi-kumar-dev/auth-module-template',
      'https://github.com/vtricks-org/auth-module-template/pull/12',
      8, NOW() - INTERVAL '5 days',
      4.2,
      '[{"label":"Code Quality","score":4,"max":5},{"label":"Functionality","score":5,"max":5},{"label":"Documentation","score":3,"max":5},{"label":"Test Coverage","score":4,"max":5},{"label":"Performance","score":5,"max":5}]',
      'Excellent JWT implementation with proper refresh-token rotation. Functionality is complete and robust. Improve documentation — add JSDoc to all exported functions. Consider unit tests for middleware edge cases.',
      NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days')
    ON CONFLICT (student_id, task_id) DO UPDATE SET status = 'AI_GRADED'
  `, [internId, taskIds[0]]);

  // Sprint 2 — CODING (in progress)
  await q(`
    INSERT INTO intern_task_progress (student_id, task_id, status, fork_url, commit_count, last_push_at)
    VALUES ($1, $2, 'CODING',
      'https://github.com/ravi-kumar-dev/rest-api-template',
      3, NOW() - INTERVAL '1 day')
    ON CONFLICT (student_id, task_id) DO UPDATE SET status = 'CODING'
  `, [internId, taskIds[1]]);

  // Sprint 3, 4 — NOT_STARTED (no progress record needed — controller will handle)
  console.log('  ✓ Task progress seeded\n');

  // ── Seed Work Logs ────────────────────────────────────────────────────────────
  console.log('📝 Seeding work logs...');

  const logs = [
    { date: '2026-07-01', hours: 6, desc: 'Completed user routes and auth middleware setup in Express', challenges: 'CORS issues with credentials in preflight requests', mentor: 'Good work on the middleware chain. Try adding request logging.', status: 'APPROVED' },
    { date: '2026-06-30', hours: 5, desc: 'Wrote Joi validation schemas for all REST endpoints', challenges: 'Understanding nested object validation for array fields', mentor: '', status: 'PENDING' },
    { date: '2026-06-29', hours: 7, desc: 'Set up PostgreSQL schema and Sequelize ORM models with relations', challenges: 'N+1 query problem when loading nested relations', mentor: 'Consider using Sequelize include strategically to avoid N+1.', status: 'APPROVED' },
    { date: '2026-06-28', hours: 4, desc: 'Implemented JWT refresh token rotation logic', challenges: 'Managing token blacklisting on logout', mentor: '', status: 'PENDING' },
    { date: '2026-06-27', hours: 5, desc: 'Set up the project boilerplate and folder structure', challenges: 'Deciding on the right project architecture', mentor: 'Good start! The folder structure looks clean and scalable.', status: 'APPROVED' },
  ];

  for (const l of logs) {
    await q(`
      INSERT INTO intern_work_logs (student_id, program_id, log_date, hours_worked, description, challenges, mentor_comment, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [internId, programId, l.date, l.hours, l.desc, l.challenges, l.mentor, l.status]);
  }
  console.log(`  ✓ ${logs.length} work logs seeded\n`);

  // ── Seed Attendance ───────────────────────────────────────────────────────────
  console.log('📅 Seeding attendance...');

  const attendance = [
    { date: '2026-06-16', status: 'PRESENT' },
    { date: '2026-06-17', status: 'PRESENT' },
    { date: '2026-06-18', status: 'HALF_DAY' },
    { date: '2026-06-19', status: 'PRESENT' },
    { date: '2026-06-20', status: 'PRESENT' },
    { date: '2026-06-23', status: 'ABSENT' },
    { date: '2026-06-24', status: 'PRESENT' },
    { date: '2026-06-25', status: 'PRESENT' },
    { date: '2026-06-26', status: 'PRESENT' },
    { date: '2026-06-27', status: 'LEAVE' },
    { date: '2026-06-30', status: 'PRESENT' },
    { date: '2026-07-01', status: 'PRESENT' },
    { date: '2026-07-02', status: 'PRESENT' },
    { date: '2026-07-03', status: 'PRESENT' },
  ];

  for (const a of attendance) {
    await q(`
      INSERT INTO intern_attendance (student_id, program_id, session_date, status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (student_id, program_id, session_date) DO UPDATE SET status = $4
    `, [internId, programId, a.date, a.status]);
  }
  console.log(`  ✓ ${attendance.length} attendance records seeded\n`);

  // ── Seed Evaluation ───────────────────────────────────────────────────────────
  console.log('⭐ Seeding evaluation...');

  const evals = [
    { category: 'Attendance',        score: 8,  max: 10, feedback: 'Consistent attendance with minor absences.' },
    { category: 'Technical Skills',  score: 14, max: 20, feedback: 'Strong backend skills, growing in React.' },
    { category: 'Communication',     score: 12, max: 15, feedback: 'Clear written communication, improve verbal updates.' },
    { category: 'Problem Solving',   score: 15, max: 20, feedback: 'Approaches problems methodically and seeks help early.' },
    { category: 'Teamwork',          score: 8,  max: 10, feedback: 'Good team player, participates actively in code reviews.' },
    { category: 'Project Completion',score: 15, max: 25, feedback: 'Completed 1 of 4 sprints fully. On track for rest.' },
  ];

  for (const e of evals) {
    await q(`
      INSERT INTO intern_evaluations (student_id, program_id, category, score, max_score, feedback)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [internId, programId, e.category, e.score, e.max, e.feedback]);
  }
  console.log(`  ✓ ${evals.length} evaluation categories seeded\n`);

  // ── Seed Stipends ─────────────────────────────────────────────────────────────
  console.log('💰 Seeding stipends...');

  await q(`
    INSERT INTO intern_stipends (student_id, program_id, month, amount, status, paid_at)
    VALUES ($1, $2, 'June 2026', 15000, 'PAID', '2026-07-01')
  `, [internId, programId]);

  await q(`
    INSERT INTO intern_stipends (student_id, program_id, month, amount, status)
    VALUES ($1, $2, 'July 2026', 15000, 'PENDING')
  `, [internId, programId]);

  console.log('  ✓ 2 stipend records seeded\n');

  // ── Seed Certificate ──────────────────────────────────────────────────────────
  await q(`
    INSERT INTO intern_certificates (student_id, program_id, is_eligible, status)
    VALUES ($1, $2, false, 'PENDING')
    ON CONFLICT (student_id, program_id) DO NOTHING
  `, [internId, programId]);

  console.log(`
  ✨ Intern module setup complete!

     🎓 Intern Login
     📧 Email    : intern@vtricks.in
     🔑 Password : password123

     Program: Full Stack Development Internship (TechCorp Solutions)
     Mentor: Priya Sharma | Batch: Batch A – Full Stack 2026
     Duration: 2026-06-01 → 2026-08-31 | Stipend: ₹15,000/month

     Tasks: Sprint 1 (AI_GRADED ✅), Sprint 2 (CODING 🔄), Sprint 3-4 (NOT_STARTED)
     References: 5 groups (15 resources: PDF, Video, Website, PPT per group)
     Work Logs: 5 entries | Attendance: 14 days
  `);

  await pool.end();
}

main().catch(e => {
  console.error('❌ Intern setup failed:', e.message || e);
  process.exit(1);
});
