/**
 * Vtricks LMS — Seed Script
 * Structure: Program "Data Science" → Course "Python" (Data Analytics)
 * Run: pnpm db:seed  (from /server)
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

function mo(n: number): string {
  const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString();
}

// ─── Students ─────────────────────────────────────────────────────────────────
const STUDENTS = [
  { name: 'Mohammed Zameer',        email: 'zameer01955@gmail.com',        phone: '6363073009', dob: '2005-10-19', address: 'Tannery road Anand nagara Bangalore 560045',                            qual: 'Final year, MD',       gradYear: '2026', occ: 'Student',              pref: 'Weekday', src: 'Instagram'        },
  { name: 'Shreyas S Gowda',        email: 'shreyas15gowda@gmail.com',     phone: '9108598709', dob: '2003-07-15', address: '#113 Govt press layout, Ullal main road, Bangalore 560056',            qual: 'Graduate',             gradYear: '2024', occ: 'Student',              pref: 'Weekday', src: 'Google'           },
  { name: 'Rakesh Kumar M',         email: 'rakeshkumarm7@gmail.com',      phone: '8105021799', dob: '1989-09-09', address: 'Vijayanagara',                                                         qual: 'Graduate',             gradYear: '2021', occ: 'Working Professional', pref: 'Weekday', src: 'Google'           },
  { name: 'Vishwanjal Mallappa Patter', email: 'vishwanjalm@gmail.com',    phone: '9590554035', dob: '1984-09-13', address: '#377, sector 15, Navanagar, Bagalkot 587103',                          qual: 'BE(CS)',               gradYear: '2007', occ: 'Career Break',         pref: 'Weekday', src: 'Friend or Family' },
  { name: 'Deeksha N',              email: 'deeksha.n947@gmail.com',       phone: '6364003099', dob: '2002-09-12', address: 'Ramnagar, near shivakumarswamy temple, Bangalore 91',                  qual: 'Graduate',             gradYear: '2023', occ: 'Working Professional', pref: 'Weekday', src: 'Google'           },
  { name: 'Nikhitha G L',           email: 'nikhithagl947@gmail.com',      phone: '8105777142', dob: '2002-09-12', address: 'Baneshwarinagar 1st stage, Shivapuran nagar',                         qual: 'Graduate',             gradYear: '2023', occ: 'Student',              pref: 'Weekday', src: 'Google'           },
  { name: 'N Manoj',                email: 'n.manojam7@gmail.com',         phone: '9019623523', dob: '1999-11-10', address: 'N 2nd cross, near arch, Laggere, Kempegowda layout, Bangalore',       qual: 'BCom',                 gradYear: '2024', occ: 'Student',              pref: 'Weekday', src: 'Walkin'           },
  { name: 'Mangala Gowri',          email: 'sajnasheema@gmail.com',        phone: '6362840904', dob: '2004-11-13', address: 'Rajaji nagar, Bangalore',                                             qual: 'Graduate',             gradYear: '2024', occ: 'Fresh Graduate',       pref: 'Weekday', src: 'Google'           },
  { name: 'Tanveer Pasha',          email: 'tanveerpasha.tp90@gmail.com',  phone: '9743551290', dob: '2001-12-01', address: 'Canal road, J.C.Nagar, R.T.Nagar Bangalore 560006',                   qual: 'B.Tech Mechanical',    gradYear: '2026', occ: 'Student',              pref: 'Weekday', src: 'Google'           },
  { name: 'Abhil Shetty',           email: 'abhilshetty523@gmail.com',     phone: '7019894735', dob: '2003-12-05', address: 'Pernal house, Mundkur post, Udupi',                                   qual: 'Graduate',             gradYear: '2024', occ: 'Fresh Graduate',       pref: 'Weekday', src: 'Google'           },
  { name: 'T Harishitha',           email: 'harishithat14@gmail.com',      phone: '7019614451', dob: '2001-11-14', address: 'Thala House, Pillangatta post, Chikballapur 562101',                  qual: 'Graduate',             gradYear: '2023', occ: 'Fresh Graduate',       pref: 'Weekday', src: 'Friend or Family' },
  { name: 'Avinash Bhajya Narayan', email: 'avi.bhardwaj44@gmail.com',     phone: '7204897472', dob: '1989-05-07', address: '17/A, 1st cross Shivanandnagar, Moodalapalya, Bangalore 72',          qual: 'Graduate',             gradYear: '2011', occ: 'Working Professional', pref: 'Weekday', src: 'Friend or Family' },
  { name: 'Siddaiah Amaranavar',    email: 'sidduadvi007@gmail.com',       phone: '8088010367', dob: '1995-12-11', address: 'Ramkrishna ashrama, Niveditha nagar, Vijayanagara Mysore',            qual: 'Graduate',             gradYear: '2017', occ: 'Working Professional', pref: 'Both',    src: 'Google'           },
  { name: 'Devraja A',              email: 'devraja.t.gowda@gmail.com',    phone: '8147493643', dob: '1998-07-20', address: 'Bharathi Nagar, Talakere, Tumkur 572115',                             qual: 'Graduate',             gradYear: '2021', occ: 'Working Professional', pref: 'Weekday', src: 'Google'           },
  { name: 'Akshay B S',             email: 'akshaybs7777@gmail.com',       phone: '9035105262', dob: '2004-05-15', address: 'Kumaraswamy Layout, Bangalore',                                      qual: 'Student',              gradYear: '2025', occ: 'Student',              pref: 'Both',    src: 'Friend or Family' },
  { name: 'Devaki Basamma',         email: 'basamma.devu15@gmail.com',     phone: '7022068072', dob: '1997-08-20', address: '2, 8th block, Karnataka layout, SBM layout, Nagarabhavi 560072',     qual: 'B.Tech(ECE)',          gradYear: '2019', occ: 'Working Professional', pref: 'Weekday', src: 'Google'           },
  { name: 'Harsh Sawant',           email: 'sawantharsh27@gmail.com',      phone: '9482828072', dob: '2000-07-28', address: 'Rudrakshi road, 8th block, SMV layout, Nagarabhavi, Bangalore',      qual: 'Graduate',             gradYear: '2022', occ: 'Career Break',         pref: 'Weekday', src: 'Google'           },
  { name: 'N Harshitha',            email: 'harshithan208@gmail.com',      phone: '8553018255', dob: '1999-03-29', address: 'Srinivas balage circle, Mahalaxmi puram, Bangalore',                  qual: 'MCA',                  gradYear: '2023', occ: 'Career Break',         pref: 'Weekday', src: 'Instagram'        },
  { name: 'Rajathshekar M C',       email: 'rajathshekarmcmods@gmail.com', phone: '8951685364', dob: '1998-01-21', address: 'JP Nagar 5th phase',                                                 qual: 'MBA',                  gradYear: '2023', occ: 'Career Break',         pref: 'Weekday', src: 'Google'           },
  { name: 'Vani D J',               email: 'vanidj04@gmail.com',           phone: '9590703201', dob: '1985-04-27', address: '239 8th cross, Saraswati Nagar, Vijay Nagar, Bangalore',             qual: 'MBA',                  gradYear: '2009', occ: 'Working Professional', pref: 'Weekend', src: 'Walkin'           },
];

// ─── Fee amounts per student ──────────────────────────────────────────────────
const FEES: Record<string, { reg: number; i1: number; i2: number }> = {
  'zameer01955@gmail.com':        { reg: 5000, i1: 0,     i2: 0     },
  'shreyas15gowda@gmail.com':     { reg: 5000, i1: 10000, i2: 0     },
  'rakeshkumarm7@gmail.com':      { reg: 5000, i1: 10000, i2: 0     },
  'vishwanjalm@gmail.com':        { reg: 5000, i1: 0,     i2: 0     },
  'deeksha.n947@gmail.com':       { reg: 5000, i1: 10000, i2: 0     },
  'nikhithagl947@gmail.com':      { reg: 5000, i1: 0,     i2: 0     },
  'n.manojam7@gmail.com':         { reg: 5000, i1: 0,     i2: 0     },
  'sajnasheema@gmail.com':        { reg: 5000, i1: 10000, i2: 9000  },
  'tanveerpasha.tp90@gmail.com':  { reg: 5000, i1: 0,     i2: 0     },
  'abhilshetty523@gmail.com':     { reg: 5000, i1: 10000, i2: 0     },
  'harishithat14@gmail.com':      { reg: 5000, i1: 0,     i2: 0     },
  'avi.bhardwaj44@gmail.com':     { reg: 5000, i1: 10000, i2: 9000  },
  'sidduadvi007@gmail.com':       { reg: 5000, i1: 0,     i2: 0     },
  'devraja.t.gowda@gmail.com':    { reg: 5000, i1: 10000, i2: 0     },
  'akshaybs7777@gmail.com':       { reg: 5000, i1: 0,     i2: 0     },
  'basamma.devu15@gmail.com':     { reg: 5000, i1: 10000, i2: 0     },
  'sawantharsh27@gmail.com':      { reg: 5000, i1: 0,     i2: 0     },
  'harshithan208@gmail.com':      { reg: 5000, i1: 10000, i2: 0     },
  'rajathshekarmcmods@gmail.com': { reg: 5000, i1: 10000, i2: 9000  },
  'vanidj04@gmail.com':           { reg: 5000, i1: 10000, i2: 9000  },
};

async function main() {
  console.log('\n🌱 Seeding Vtricks LMS...\n');

  // ── Full clean (cascade handles FKs) ─────────────────────────────────────────
  console.log('🧹 Cleaning database...');
  for (const t of [
    'coding_submissions','coding_assignments','coding_problems','coding_test_cases',
    'payment_proofs','invoices','student_fees',
    'quiz_attempt_answers','quiz_attempts','quiz_batches',
    'assignment_submissions','assignment_batches','assignments',
    'session_recordings',
    // course_modules, course_syllabi, session_references, session_artifacts
    // are cascade-deleted when 'courses' is deleted below (ON DELETE CASCADE).
    // Admin must re-upload syllabus Excel via CourseMaster after reseed.
    'batch_courses','enrollments','program_course_selections','program_enrollments',
    'attendance_records','attendance_sessions',
    'refresh_tokens','otp_verifications',
    'batches','courses','programs',
    'trainer_profiles',
    "users WHERE role='STUDENT'",
    "users WHERE role='TRAINER'",
    "users WHERE role='FEES_ADMIN'",
    "users WHERE role='LD_MANAGER'",
  ]) {
    await q(`DELETE FROM ${t}`).catch(() => {});
  }
  console.log('  ✓ Cleaned\n');

  const hash = await bcrypt.hash(PWD, SALT_ROUNDS);

  // ── Super Admin ───────────────────────────────────────────────────────────────
  await q(`INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'SUPER_ADMIN') ON CONFLICT (email) DO UPDATE SET password_hash=$3`,
    ['Ravi Shankar', 'ravi@vtricks.com', hash]);

  // ── Fees Admin ────────────────────────────────────────────────────────────────
  await q(`INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'FEES_ADMIN') ON CONFLICT (email) DO UPDATE SET password_hash=$3`,
    ['Fees Admin', 'fees@vtricks.com', hash]);

  // ── L&D Manager ───────────────────────────────────────────────────────────────
  await q(`INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'LD_MANAGER') ON CONFLICT (email) DO UPDATE SET password_hash=$3`,
    ['L&D Manager', 'ldmanager@vtricks.com', hash]);

  // ── Operational Manager ───────────────────────────────────────────────────────
  await q(`INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'OPERATIONAL_MANAGER') ON CONFLICT (email) DO UPDATE SET password_hash=$3`,
    ['Operational Manager', 'opmanager@vtricks.com', hash]);

  // ── Trainer ───────────────────────────────────────────────────────────────────
  const trRes = await q(`INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'TRAINER')
    ON CONFLICT (email) DO UPDATE SET name=$1,password_hash=$3 RETURNING id`,
    ['Priya Sharma', 'priya@vtricks.com', hash]);
  const trainerId = trRes.rows[0].id as string;
  await q(`INSERT INTO trainer_profiles (user_id,bio,skills) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET bio=$2,skills=$3`,
    [trainerId, 'Data analytics specialist.', 'Python,Power BI,Advance Excel']);
  console.log('✅ 2 Admins + 1 Trainer');

  // ── Program ───────────────────────────────────────────────────────────────────
  const progRes = await q(`INSERT INTO programs (name,description,color_token,sort_order,is_active,status)
    VALUES ($1,$2,'purple',0,true,'ACTIVE') RETURNING id`,
    ['Data Science', 'Data Analytics track']);
  const programId = progRes.rows[0].id as string;
  console.log('✅ 1 Program: Data Science');

  // ── Course: Python ────────────────────────────────────────────────────────────
  const courseRes = await q(`INSERT INTO courses (program_id,title,category,status,level,duration_months,description,trainer_id,color_token)
    VALUES ($1,'Python','Data Analytics','ACTIVE','BEGINNER',3,'Learn Python with hands-on projects.',$2,'purple') RETURNING id`,
    [programId, trainerId]);
  const courseId = courseRes.rows[0].id as string;
  await q(`INSERT INTO program_courses (program_id,course_id,sort_order) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`,
    [programId, courseId]);
  console.log('✅ 1 Course: Python');

  // ── Batch ─────────────────────────────────────────────────────────────────────
  const batchRes = await q(`INSERT INTO batches (name,program_id,course_id,start_date,end_date,capacity,status,trainer_id)
    VALUES ('Data Science — May 2026',$1,$2,$3,$4,30,'ONGOING',$5) RETURNING id`,
    [programId, courseId, mo(2), mo(-4), trainerId]);
  const batchId = batchRes.rows[0].id as string;
  await q(`INSERT INTO batch_courses (batch_id,course_id,sort_order) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`,
    [batchId, courseId]);
  console.log('✅ 1 Batch: Data Science — May 2026');

  // Sessions come from uploaded syllabus Excel in CourseMaster — not seeded here.
  console.log('✅ Sessions: loaded from uploaded syllabus (not seeded)');

  // ── Assignment ────────────────────────────────────────────────────────────────
  const asg = await q(`INSERT INTO assignments (course_id,title,description,pdf_filename,pdf_path,pdf_size_bytes,due_date,max_score,status,created_by)
    VALUES ($1,'Python — Practice Assignment','Complete Python exercises and submit.','assignment.pdf','assignments/python.pdf',1024,NOW()+INTERVAL '14 days',100,'PUBLISHED',$2) RETURNING id`,
    [courseId, trainerId]);
  await q(`INSERT INTO assignment_batches (assignment_id,batch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [asg.rows[0].id, batchId]);
  console.log('✅ 1 Assignment');

  // ── Students ──────────────────────────────────────────────────────────────────
  console.log(`\n👤 Seeding ${STUDENTS.length} students...`);
  for (const s of STUDENTS) {
    const res = await q(`INSERT INTO users (name,email,password_hash,phone_number,date_of_birth,address,qualification,graduation_year,occupation,class_preference,lead_source,role,assigned_program_id,account_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'STUDENT',$12,'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET phone_number=EXCLUDED.phone_number,password_hash=EXCLUDED.password_hash,assigned_program_id=EXCLUDED.assigned_program_id,account_status='ACTIVE'
      RETURNING id`,
      [s.name,s.email,hash,s.phone,s.dob||null,s.address,s.qual,s.gradYear,s.occ,s.pref,s.src,programId]);
    const uid = res.rows[0].id as string;

    const pe = await q(`INSERT INTO program_enrollments (student_id,program_id) VALUES ($1,$2) ON CONFLICT (student_id,program_id) DO UPDATE SET enrolled_at=NOW() RETURNING id`,
      [uid, programId]);
    await q(`INSERT INTO program_course_selections (program_enrollment_id,course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [pe.rows[0].id, courseId]);

    await q(`INSERT INTO enrollments (batch_id,student_id,completion_pct,enrolled_at)
      VALUES ($1,$2,$3,NOW()-INTERVAL '30 days') ON CONFLICT (batch_id,student_id) DO UPDATE SET completion_pct=$3`,
      [batchId, uid, 0]);

    const fee = FEES[s.email] ?? { reg: 5000, i1: 0, i2: 0 };
    await q(`INSERT INTO student_fees (student_id,enrolled_month,fees_offered,registration_expected,registration_amount,registration_date,installment1_expected,installment1_amount,installment1_date,installment2_expected,installment2_amount,installment2_date,remarks)
      VALUES ($1,'2026-05-01',24000,5000,$2,'2026-05-01',10000,$3,'2026-05-15',9000,$4,'2026-06-01','May 2026 batch – Data Science')
      ON CONFLICT (student_id,enrolled_month) DO UPDATE SET registration_amount=$2,installment1_amount=$3,installment2_amount=$4,updated_at=NOW()`,
      [uid, fee.reg, fee.i1, fee.i2]);
  }
  console.log(`✅ ${STUDENTS.length} Students enrolled`);

  console.log(`
  ✨ Seeding complete!
     👤 Super Admin : ravi@vtricks.com  / password123
     💰 Fees Admin  : fees@vtricks.com  / password123
     📈 L&D Manager : ldmanager@vtricks.com / password123
     🎓 Trainer     : priya@vtricks.com / password123
     🔑 Students    : (20 real emails)  / password123

     Structure:
     Program: Data Science → 1 Course (Python, Data Analytics)
     All 20 students → "Data Science — May 2026" batch
  `);
  await pool.end();
}

main().catch(e => { console.error('❌ Seed failed:', e.message || e); process.exit(1); });
