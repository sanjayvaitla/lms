/**
 * Vtricks LMS — Seed Script (raw pg, no ORM)
 * Run: pnpm db:seed  (from /server)
 *
 * Seeds:
 *   1  Super Admin
 *   3  Trainers
 *   6  Courses  (across multiple categories)
 *   10 Students
 *   6  Batches
 *   ~60 Enrollments spread across the last 6 months
 */

import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const SALT_ROUNDS = 10;
const PWD = 'password123';

async function q(sql: string, params: unknown[] = []) {
  return pool.query(sql, params);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns an ISO timestamp N months ago (optionally plus extra days) */
function monthsAgo(n: number, plusDays = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(d.getDate() + plusDays);
  return d.toISOString();
}

/** Random integer in [min, max] */
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\u{1F331} Starting seed...\n');

  // Clean in FK-safe order
  await q('DELETE FROM quiz_attempt_answers');
  await q('DELETE FROM quiz_attempts');
  await q('DELETE FROM quiz_questions');
  await q('DELETE FROM quizzes');
  await q('DELETE FROM quiz_datasets');
  await q('DELETE FROM assignment_submissions');
  await q('DELETE FROM assignment_batches');
  await q('DELETE FROM assignments');
  await q('DELETE FROM course_modules');
  await q('DELETE FROM course_syllabi');
  await q('DELETE FROM enrollments');
  await q('DELETE FROM batches');
  await q('DELETE FROM courses');
  await q('DELETE FROM trainer_profiles');
  await q('DELETE FROM refresh_tokens');
  await q('DELETE FROM messages');
  await q('DELETE FROM users');

  const hash = await bcrypt.hash(PWD, SALT_ROUNDS);

  // ── Super Admin ──────────────────────────────────────────────────────────────
  await q(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'SUPER_ADMIN')`,
    ['Ravi Shankar', 'ravi@vtricks.com', hash],
  );
  console.log('\u2705 Super Admin: ravi@vtricks.com');

  // ── Trainers ─────────────────────────────────────────────────────────────────
  const trainerData = [
    { name: 'Rajesh Kumar',  email: 'rajesh@vtricks.com',  skills: 'React,Node.js,MongoDB',  bio: '10 years full-stack experience.' },
    { name: 'Priya Sharma',  email: 'priya@vtricks.com',   skills: 'Python,ML,TensorFlow',   bio: 'Data science & ML specialist.' },
    { name: 'Amit Verma',    email: 'amit@vtricks.com',    skills: 'Java,Spring,Microservices', bio: 'Backend architect with 8 years exp.' },
  ];

  const trainerIds: string[] = [];
  for (const t of trainerData) {
    const res = await q(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'TRAINER') RETURNING id`,
      [t.name, t.email, hash],
    );
    const tid = res.rows[0].id as string;
    trainerIds.push(tid);
    await q(
      `INSERT INTO trainer_profiles (user_id, bio, skills) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET bio=$2, skills=$3`,
      [tid, t.bio, t.skills],
    );
  }
  console.log('\u2705 3 Trainers seeded');

  // ── Courses ───────────────────────────────────────────────────────────────────
  const courseData = [
    { title: 'MERN Stack Full Development',     category: 'Web Dev',        level: 'INTERMEDIATE', months: 4, color: 'cyan',    trainerIdx: 0 },
    { title: 'Python for Data Science',          category: 'Data Science',   level: 'BEGINNER',     months: 3, color: 'purple', trainerIdx: 1 },
    { title: 'Machine Learning with TensorFlow', category: 'AI / ML',        level: 'ADVANCED',     months: 5, color: 'indigo', trainerIdx: 1 },
    { title: 'Java Spring Boot Microservices',   category: 'Backend',        level: 'ADVANCED',     months: 4, color: 'amber',  trainerIdx: 2 },
    { title: 'React & TypeScript Mastery',       category: 'Web Dev',        level: 'INTERMEDIATE', months: 2, color: 'sky',    trainerIdx: 0 },
    { title: 'UI/UX Design Fundamentals',        category: 'Design',         level: 'BEGINNER',     months: 2, color: 'rose',   trainerIdx: 0 },
  ];

  const courseIds: string[] = [];
  for (const c of courseData) {
    const res = await q(
      `INSERT INTO courses (title, category, status, level, duration_months, description, trainer_id, color_token)
       VALUES ($1,$2,'ACTIVE',$3,$4,$5,$6,$7) RETURNING id`,
      [c.title, c.category, c.level, c.months, `Learn ${c.title} from scratch.`, trainerIds[c.trainerIdx], c.color],
    );
    courseIds.push(res.rows[0].id as string);
  }
  console.log('\u2705 6 Courses seeded');

  // ── Students ──────────────────────────────────────────────────────────────────
  const studentNames = [
    'Ankit Mehta', 'Sneha Patel', 'Karan Singh', 'Divya Nair', 'Rohit Gupta',
    'Meera Iyer',  'Arjun Das',  'Pooja Reddy', 'Vikram Rao', 'Neha Joshi',
  ];

  const studentIds: string[] = [];
  for (let i = 0; i < studentNames.length; i++) {
    const emailName = studentNames[i].toLowerCase().replace(' ', '.');
    const res = await q(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'STUDENT') RETURNING id`,
      [studentNames[i], `${emailName}@vtricks.com`, hash],
    );
    studentIds.push(res.rows[0].id as string);
  }
  console.log('\u2705 10 Students seeded');

  // ── Batches ───────────────────────────────────────────────────────────────────
  const batchData = [
    { name: 'MERN Batch Jan 2026',     courseIdx: 0, status: 'COMPLETED', start: monthsAgo(5),    end: monthsAgo(1) },
    { name: 'Data Science Batch Feb',  courseIdx: 1, status: 'ONGOING',   start: monthsAgo(3),    end: monthsAgo(-2) },
    { name: 'ML Advanced Batch',       courseIdx: 2, status: 'ONGOING',   start: monthsAgo(2),    end: monthsAgo(-3) },
    { name: 'Spring Boot Batch Mar',   courseIdx: 3, status: 'ONGOING',   start: monthsAgo(2),    end: monthsAgo(-2) },
    { name: 'React TS Batch Apr',      courseIdx: 4, status: 'UPCOMING',  start: monthsAgo(-1),   end: monthsAgo(-3) },
    { name: 'UI/UX Design Batch May',  courseIdx: 5, status: 'UPCOMING',  start: monthsAgo(-1),   end: monthsAgo(-3) },
  ];

  const batchIds: string[] = [];
  for (const b of batchData) {
    const res = await q(
      `INSERT INTO batches (name, course_id, start_date, end_date, capacity, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [b.name, courseIds[b.courseIdx], b.start, b.end, 30, b.status],
    );
    batchIds.push(res.rows[0].id as string);
  }
  console.log('\u2705 6 Batches seeded');

  // ── Enrollments — spread across last 6 months ─────────────────────────────────
  //
  //  Month-5 ago: 3 students → batch 0 (MERN Jan)
  //  Month-4 ago: 5 students → batch 0 + batch 1 (Data Sci)
  //  Month-3 ago: 4 students → batch 1 + batch 2 (ML)
  //  Month-2 ago: 6 students → batch 2 + batch 3 (Spring)
  //  Month-1 ago: 5 students → batch 3 + batch 4 (React TS)
  //  Month-0 ago: 4 students → batch 4 + batch 5 (UI/UX)

  const enrollmentPlan: { batchIdx: number; studentIdx: number; monthsAgoVal: number; completion: number }[] = [
    // 5 months ago — MERN batch
    { batchIdx: 0, studentIdx: 0, monthsAgoVal: 5, completion: 100 },
    { batchIdx: 0, studentIdx: 1, monthsAgoVal: 5, completion: 95  },
    { batchIdx: 0, studentIdx: 2, monthsAgoVal: 5, completion: 88  },

    // 4 months ago — MERN + Data Sci
    { batchIdx: 0, studentIdx: 3, monthsAgoVal: 4, completion: 100 },
    { batchIdx: 0, studentIdx: 4, monthsAgoVal: 4, completion: 72  },
    { batchIdx: 1, studentIdx: 5, monthsAgoVal: 4, completion: 60  },
    { batchIdx: 1, studentIdx: 6, monthsAgoVal: 4, completion: 55  },
    { batchIdx: 1, studentIdx: 7, monthsAgoVal: 4, completion: 70  },

    // 3 months ago — Data Sci + ML
    { batchIdx: 1, studentIdx: 8, monthsAgoVal: 3, completion: 40  },
    { batchIdx: 1, studentIdx: 9, monthsAgoVal: 3, completion: 35  },
    { batchIdx: 2, studentIdx: 0, monthsAgoVal: 3, completion: 30  },
    { batchIdx: 2, studentIdx: 1, monthsAgoVal: 3, completion: 45  },

    // 2 months ago — ML + Spring Boot
    { batchIdx: 2, studentIdx: 2, monthsAgoVal: 2, completion: 20  },
    { batchIdx: 2, studentIdx: 3, monthsAgoVal: 2, completion: 15  },
    { batchIdx: 3, studentIdx: 4, monthsAgoVal: 2, completion: 25  },
    { batchIdx: 3, studentIdx: 5, monthsAgoVal: 2, completion: 30  },
    { batchIdx: 3, studentIdx: 6, monthsAgoVal: 2, completion: 10  },
    { batchIdx: 3, studentIdx: 7, monthsAgoVal: 2, completion: 18  },

    // 1 month ago — Spring Boot + React TS
    { batchIdx: 3, studentIdx: 8, monthsAgoVal: 1, completion: 5   },
    { batchIdx: 3, studentIdx: 9, monthsAgoVal: 1, completion: 8   },
    { batchIdx: 4, studentIdx: 0, monthsAgoVal: 1, completion: 0   },
    { batchIdx: 4, studentIdx: 1, monthsAgoVal: 1, completion: 0   },
    { batchIdx: 4, studentIdx: 2, monthsAgoVal: 1, completion: 0   },

    // this month — React TS + UI/UX
    { batchIdx: 4, studentIdx: 3, monthsAgoVal: 0, completion: 0   },
    { batchIdx: 5, studentIdx: 4, monthsAgoVal: 0, completion: 0   },
    { batchIdx: 5, studentIdx: 5, monthsAgoVal: 0, completion: 0   },
    { batchIdx: 5, studentIdx: 6, monthsAgoVal: 0, completion: 0   },
    { batchIdx: 5, studentIdx: 7, monthsAgoVal: 0, completion: 0   },
  ];

  for (const e of enrollmentPlan) {
    const enrolledAt = monthsAgo(e.monthsAgoVal, rand(0, 20));
    await q(
      `INSERT INTO enrollments (batch_id, student_id, completion_pct, enrolled_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (batch_id, student_id) DO NOTHING`,
      [batchIds[e.batchIdx], studentIds[e.studentIdx], e.completion, enrolledAt],
    );
  }
  console.log('\u2705 ~28 Enrollments spread across 6 months');

  // ── Course modules + quizzes (MERN course demo) ─────────────────────────────
  const mernCourseId = courseIds[0];
  const rajeshId = trainerIds[0];
  const moduleTitles = ['HTML & CSS Basics', 'JavaScript Fundamentals', 'React Components', 'Node.js & Express'];
  const moduleIds: string[] = [];

  for (let i = 0; i < moduleTitles.length; i++) {
    const status = i === 0 ? 'RELEASED' : 'LOCKED';
    const res = await q(
      `INSERT INTO course_modules (course_id, title, description, sort_order, status)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [mernCourseId, moduleTitles[i], `Module ${i + 1} content`, i, status],
    );
    moduleIds.push(res.rows[0].id as string);
  }

  // Complete module 0 so its quiz is released
  await q(
    `UPDATE course_modules SET status = 'COMPLETED', completed_at = NOW(), completed_by = $2 WHERE id = $1`,
    [moduleIds[0], rajeshId],
  );
  await q(
    `UPDATE course_modules SET status = 'RELEASED' WHERE id = $1`,
    [moduleIds[1]],
  );

  const questions = [
    { mod: 0, text: 'What does HTML stand for?', opts: ['Hyper Text Markup Language', 'High Tech Machine Language', 'Home Tool Markup Language'], ans: 'Hyper Text Markup Language' },
    { mod: 0, text: 'Which tag is used for the largest heading?', opts: ['<h1>', '<head>', '<header>'], ans: '<h1>' },
    { mod: 0, text: 'CSS stands for Cascading Style Sheets.', opts: ['True', 'False'], ans: 'True', type: 'TRUE_FALSE' },
    { mod: 1, text: 'Which keyword declares a variable in ES6?', opts: ['var', 'let', 'both'], ans: 'let' },
    { mod: 1, text: 'JavaScript is statically typed.', opts: ['True', 'False'], ans: 'False', type: 'TRUE_FALSE' },
    { mod: 1, text: 'What is the output of typeof null?', opts: ['null', 'object', 'undefined'], ans: 'object' },
    { mod: 2, text: 'React is a library for building UIs.', opts: ['True', 'False'], ans: 'True', type: 'TRUE_FALSE' },
    { mod: 2, text: 'Which hook manages state in functional components?', opts: ['useEffect', 'useState', 'useContext'], ans: 'useState' },
    { mod: 3, text: 'Express.js runs on which runtime?', opts: ['Deno', 'Node.js', 'Bun'], ans: 'Node.js' },
  ];

  for (const qu of questions) {
    await q(
      `INSERT INTO quiz_questions (course_id, module_id, question_text, question_type, options, correct_answer, points)
       VALUES ($1,$2,$3,$4,$5,$6,1)`,
      [
        mernCourseId, moduleIds[qu.mod], qu.text,
        qu.type ?? 'MCQ',
        qu.opts ? JSON.stringify(qu.opts) : null,
        qu.ans,
      ],
    );
  }

  for (let i = 0; i < moduleIds.length; i++) {
    const quizStatus = i === 0 ? 'ACTIVE' : 'DRAFT';
    await q(
      `INSERT INTO quizzes (course_id, module_id, title, questions_per_attempt, passing_score, randomize_questions, randomize_options, status, created_by)
       VALUES ($1,$2,$3,3,60,true,true,$4,$5)`,
      [mernCourseId, moduleIds[i], `Quiz: ${moduleTitles[i]}`, quizStatus, rajeshId],
    );
  }

  console.log('\u2705 4 Modules, 9 questions, 4 quizzes (Module 1 quiz released)');

  console.log(`
\u2728 Seed complete!

   \u{1F464} Admin      : ravi@vtricks.com         / password123
   \u{1F393} Trainers   : rajesh / priya / amit @vtricks.com / password123
   \u{1F4DA} Courses    : 6 across Web Dev, Data Science, AI/ML, Backend, Design
   \u{1F465} Students   : 10 (ankit.mehta, sneha.patel, ... @vtricks.com)
   \u{1F4CB} Batches    : 6 (2 completed, 2 ongoing, 2 upcoming)
   \u{1F4C8} Enrolments : ~28 spread over last 6 months (chart data ready)
`);
}

main()
  .catch((err) => { console.error('\u274C Seed failed:', err); process.exit(1); })
  .finally(() => pool.end());
