import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { revokeUserSessions } from '../lib/tokens';
import { sendEmail, feeUpdateEmail, registrationPaymentEmail, firstInstallmentEmail, secondInstallmentEmail, finalInstallmentEmail, accountApprovedWelcomeEmail } from '../lib/email';
import { notifyInstallmentPayment } from './whatsapp-notifications.service';
import { createPasswordResetLink } from './auth.service';

function clientBaseUrl(): string {
  return (process.env.CLIENT_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');
}

function clientLoginUrl(): string {
  return `${clientBaseUrl()}/login`;
}

const WELCOME_RESET_HOURS = 48;

/** Fire-and-forget safe send — never fails the approval transaction */
export async function sendAccountApprovedWelcome(opts: {
  name: string;
  email: string;
  userId: string;
  role?: string;
  programName?: string | null;
}): Promise<boolean> {
  if (!opts.email || !opts.userId) return false;
  try {
    const resetPasswordUrl = await createPasswordResetLink(opts.userId, WELCOME_RESET_HOURS * 60);
    const template = accountApprovedWelcomeEmail({
      name: opts.name,
      programName: opts.programName,
      portal: opts.role === 'INTERN' ? 'intern' : 'student',
      loginUrl: clientLoginUrl(),
      resetPasswordUrl,
      resetExpiresHours: WELCOME_RESET_HOURS,
      forgotPasswordUrl: `${clientBaseUrl()}/forgot-password`,
    });
    await sendEmail({ ...template, to: opts.email });
    return true;
  } catch (err) {
    console.error('[email] Welcome mail failed for', opts.email, err);
    return false;
  }
}

// ── List students with optional month filter + search ─────────────────────────
export async function listStudentsWithFees(filters: {
  month?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  let sql = `
    SELECT DISTINCT ON (u.id)
      u.id, u.name, u.email, u.phone_number,
      sf.id            AS fee_id,
      sf.enrolled_month,
      sf.fees_offered,
      sf.registration_amount, sf.registration_date,
      sf.registration_reminder_status, sf.registration_reminder_date,
      sf.installment1_amount, sf.installment1_date,
      sf.installment1_reminder_status, sf.installment1_reminder_date,
      sf.installment2_amount, sf.installment2_date,
      sf.installment2_reminder_status, sf.installment2_reminder_date,
      sf.installment3_amount, sf.installment3_date,
      sf.installment3_reminder_status, sf.installment3_reminder_date,
      sf.due_amount, sf.remarks, sf.updated_at
    FROM users u
    LEFT JOIN student_fees sf ON sf.student_id = u.id
    WHERE u.role IN ('STUDENT', 'INTERN')
    AND u.account_status NOT IN ('PENDING', 'REJECTED')`;

  const params: any[] = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    sql += ` AND (u.name ILIKE $${params.length} OR u.phone_number ILIKE $${params.length})`;
  }

  sql += ' ORDER BY u.id, sf.created_at DESC NULLS LAST';

  const countSql = `SELECT COUNT(*) as total FROM (${sql}) sub`;
  const { rows: countRows } = await db.query(countSql, params);
  const total = parseInt(countRows[0].total, 10);

  const finalSql = `SELECT * FROM (${sql}) sub ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const { rows } = await db.query<any>(finalSql, params);
  return { items: rows, total, page, limit };
}

// ── Get available months (months that have enrollments) ───────────────────────
export async function getEnrolledMonths() {
  const { rows } = await db.query<any>(`
    SELECT DISTINCT month, label
    FROM (
      SELECT
        TO_CHAR(DATE_TRUNC('month', enrolled_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
        TO_CHAR(DATE_TRUNC('month', enrolled_at AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY') AS label
      FROM enrollments
      
      UNION
      
      SELECT
        TO_CHAR(DATE_TRUNC('month', enrolled_month AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
        TO_CHAR(DATE_TRUNC('month', enrolled_month AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY') AS label
      FROM student_fees
    ) sub
    WHERE month IS NOT NULL
    ORDER BY month DESC
    LIMIT 24
  `);
  return rows;
}

// ── Get single student fee record ─────────────────────────────────────────────
export async function getStudentFee(studentId: string, month?: string) {
  let sql = `
    SELECT sf.*, u.name, u.email, u.phone_number
    FROM student_fees sf
    JOIN users u ON u.id = sf.student_id
    WHERE sf.student_id = $1`;
  const params: any[] = [studentId];

  if (month) {
    params.push(month + '-01');
    sql += ` AND DATE_TRUNC('month', sf.enrolled_month AT TIME ZONE 'Asia/Kolkata') = DATE_TRUNC('month', $2::date)`;
  }
  sql += ' ORDER BY sf.enrolled_month DESC LIMIT 1';

  const { rows } = await db.query<any>(sql, params);
  return rows[0] ?? null;
}

// ── Upsert student fee record ─────────────────────────────────────────────────
export async function upsertStudentFee(data: {
  fee_id?: string;  // if provided, UPDATE that record directly
  student_id: string;
  enrolled_month: string;
  fees_offered?: number;
  registration_expected?: number;
  registration_amount?: number;
  registration_date?: string;
  registration_reminder_status?: string;
  registration_reminder_date?: string;
  installment1_expected?: number;
  installment1_amount?: number;
  installment1_date?: string;
  installment1_reminder_status?: string;
  installment1_reminder_date?: string;
  installment2_expected?: number;
  installment2_amount?: number;
  installment2_date?: string;
  installment2_reminder_status?: string;
  installment2_reminder_date?: string;
  installment3_expected?: number;
  installment3_amount?: number;
  installment3_date?: string;
  installment3_reminder_status?: string;
  installment3_reminder_date?: string;
  remarks?: string;
  created_by?: string;
}) {
  const vals = [
    data.fees_offered ?? 0,
    data.registration_expected ?? null, data.registration_amount ?? null, data.registration_date ?? null,
    data.registration_reminder_status ?? null, data.registration_reminder_date ?? null,
    data.installment1_expected ?? null, data.installment1_amount ?? null, data.installment1_date ?? null,
    data.installment1_reminder_status ?? null, data.installment1_reminder_date ?? null,
    data.installment2_expected ?? null, data.installment2_amount ?? null, data.installment2_date ?? null,
    data.installment2_reminder_status ?? null, data.installment2_reminder_date ?? null,
    data.installment3_expected ?? null, data.installment3_amount ?? null, data.installment3_date ?? null,
    data.installment3_reminder_status ?? null, data.installment3_reminder_date ?? null,
    data.remarks ?? null,
  ];

  const dueAmount = (data.fees_offered ?? 0) - (
    (data.registration_amount ?? 0) + 
    (data.installment1_amount ?? 0) + 
    (data.installment2_amount ?? 0) + 
    (data.installment3_amount ?? 0)
  );

  // Fetch previous state to calculate payment difference
  let previousTotalPaid = 0;
  let previousReg = 0, previousInst1 = 0, previousInst2 = 0, previousInst3 = 0;
  let studentName = '';
  let studentEmail = '';
  let studentPhone = '';
  let studentProgramName = '';

  if (data.fee_id) {
    const { rows: oldFee } = await db.query<any>(
      `SELECT sf.registration_amount, sf.installment1_amount, sf.installment2_amount, sf.installment3_amount,
              u.name, u.email, u.phone_number, p.name as program_name
       FROM student_fees sf
       JOIN users u ON u.id = sf.student_id
       LEFT JOIN programs p ON p.id = u.assigned_program_id
       WHERE sf.id = $1`,
      [data.fee_id]
    );
    if (oldFee[0]) {
      previousReg = parseFloat(oldFee[0].registration_amount ?? 0);
      previousInst1 = parseFloat(oldFee[0].installment1_amount ?? 0);
      previousInst2 = parseFloat(oldFee[0].installment2_amount ?? 0);
      previousInst3 = parseFloat(oldFee[0].installment3_amount ?? 0);
      previousTotalPaid = previousReg + previousInst1 + previousInst2 + previousInst3;
      studentName = oldFee[0].name;
      studentEmail = oldFee[0].email;
      studentPhone = oldFee[0].phone_number ?? '';
      studentProgramName = oldFee[0].program_name || 'your program';
    }
  } else {
    // Check if record already exists for this month to do an upsert comparison
    const { rows: oldFee } = await db.query<any>(
      `SELECT sf.registration_amount, sf.installment1_amount, sf.installment2_amount, sf.installment3_amount,
              u.name, u.email, u.phone_number, p.name as program_name
       FROM student_fees sf
       JOIN users u ON u.id = sf.student_id
       LEFT JOIN programs p ON p.id = u.assigned_program_id
       WHERE sf.student_id = $1 AND sf.enrolled_month = $2`,
      [data.student_id, data.enrolled_month + '-01']
    );
    if (oldFee[0]) {
      previousReg = parseFloat(oldFee[0].registration_amount ?? 0);
      previousInst1 = parseFloat(oldFee[0].installment1_amount ?? 0);
      previousInst2 = parseFloat(oldFee[0].installment2_amount ?? 0);
      previousInst3 = parseFloat(oldFee[0].installment3_amount ?? 0);
      previousTotalPaid = previousReg + previousInst1 + previousInst2 + previousInst3;
      studentName = oldFee[0].name;
      studentEmail = oldFee[0].email;
      studentPhone = oldFee[0].phone_number ?? '';
      studentProgramName = oldFee[0].program_name || 'your program';
    } else {
      // Just fetch user details if it's a completely new record
      const { rows: userRow } = await db.query<any>(
        `SELECT u.name, u.email, u.phone_number, p.name as program_name
         FROM users u
         LEFT JOIN programs p ON p.id = u.assigned_program_id
         WHERE u.id = $1`,
        [data.student_id]
      );
      if (userRow[0]) {
        studentName = userRow[0].name;
        studentEmail = userRow[0].email;
        studentPhone = userRow[0].phone_number ?? '';
        studentProgramName = userRow[0].program_name || 'your program';
      }
    }
  }

  const newTotalPaid = 
    (data.registration_amount ?? 0) + 
    (data.installment1_amount ?? 0) + 
    (data.installment2_amount ?? 0) + 
    (data.installment3_amount ?? 0);
    
  let resultRow;

  // If fee_id exists → UPDATE that specific record (avoids duplicate month issue)
  if (data.fee_id) {
    const { rows } = await db.query<any>(`
      UPDATE student_fees SET
        fees_offered = $1,
        registration_expected = $2, registration_amount = $3, registration_date = $4,
        registration_reminder_status = $5, registration_reminder_date = $6,
        installment1_expected = $7, installment1_amount = $8, installment1_date = $9,
        installment1_reminder_status = $10, installment1_reminder_date = $11,
        installment2_expected = $12, installment2_amount = $13, installment2_date = $14,
        installment2_reminder_status = $15, installment2_reminder_date = $16,
        installment3_expected = $17, installment3_amount = $18, installment3_date = $19,
        installment3_reminder_status = $20, installment3_reminder_date = $21,
        remarks = $22, due_amount = $23, updated_at = NOW()
      WHERE id = $24
      RETURNING *`,
      [...vals, dueAmount, data.fee_id],
    );
    resultRow = rows[0];
  } else {
    // No fee_id → find existing row by student + month (and course when set), then UPDATE or INSERT.
    // Avoid ON CONFLICT on a constraint that may not exist / was flipped at runtime.
    const courseId = (data as { course_id?: string }).course_id ?? null;
    let existingId: string | null = null;
    if (courseId) {
      const found = await db.query<{ id: string }>(
        `SELECT id FROM student_fees WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
        [data.student_id, courseId],
      );
      existingId = found.rows[0]?.id ?? null;
    }
    if (!existingId) {
      const found = await db.query<{ id: string }>(
        `SELECT id FROM student_fees
         WHERE student_id = $1
           AND enrolled_month = $2::date
           AND (course_id IS NOT DISTINCT FROM $3::uuid)
         LIMIT 1`,
        [data.student_id, data.enrolled_month + '-01', courseId],
      );
      existingId = found.rows[0]?.id ?? null;
    }

    if (existingId) {
      const { rows } = await db.query<any>(`
        UPDATE student_fees SET
          fees_offered = $1,
          registration_expected = $2, registration_amount = $3, registration_date = $4,
          registration_reminder_status = $5, registration_reminder_date = $6,
          installment1_expected = $7, installment1_amount = $8, installment1_date = $9,
          installment1_reminder_status = $10, installment1_reminder_date = $11,
          installment2_expected = $12, installment2_amount = $13, installment2_date = $14,
          installment2_reminder_status = $15, installment2_reminder_date = $16,
          installment3_expected = $17, installment3_amount = $18, installment3_date = $19,
          installment3_reminder_status = $20, installment3_reminder_date = $21,
          remarks = $22, due_amount = $23, updated_at = NOW()
        WHERE id = $24
        RETURNING *`,
        [...vals, dueAmount, existingId],
      );
      resultRow = rows[0];
    } else {
      const { rows } = await db.query<any>(`
        INSERT INTO student_fees (
          student_id, course_id, enrolled_month, fees_offered,
          registration_expected, registration_amount, registration_date,
          registration_reminder_status, registration_reminder_date,
          installment1_expected, installment1_amount, installment1_date,
          installment1_reminder_status, installment1_reminder_date,
          installment2_expected, installment2_amount, installment2_date,
          installment2_reminder_status, installment2_reminder_date,
          installment3_expected, installment3_amount, installment3_date,
          installment3_reminder_status, installment3_reminder_date,
          remarks, created_by, due_amount
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
        )
        RETURNING *`,
        [
          data.student_id, courseId, data.enrolled_month + '-01', ...vals, data.created_by ?? null, dueAmount,
        ],
      );
      resultRow = rows[0];
    }
  }

  // Send email if payment increased
  if (newTotalPaid > previousTotalPaid && studentEmail) {
    const paymentAmount = newTotalPaid - previousTotalPaid;
    const isCleared = dueAmount <= 0;
    const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const newReg = data.registration_amount ?? 0;
    const newInst1 = data.installment1_amount ?? 0;
    const newInst2 = data.installment2_amount ?? 0;
    const newInst3 = data.installment3_amount ?? 0;

    let emailOpts;
    if (isCleared || newInst3 > previousInst3) {
      emailOpts = finalInstallmentEmail(studentName, studentProgramName, paymentAmount, dateStr, newTotalPaid);
    } else if (newInst2 > previousInst2) {
      emailOpts = secondInstallmentEmail(studentName, studentProgramName, paymentAmount, dateStr, dueAmount);
    } else if (newInst1 > previousInst1) {
      emailOpts = firstInstallmentEmail(studentName, studentProgramName, paymentAmount, dateStr, dueAmount);
    } else if (newReg > previousReg) {
      emailOpts = registrationPaymentEmail(studentName, studentProgramName, paymentAmount, dateStr, dueAmount);
    } else {
      emailOpts = feeUpdateEmail(studentName, paymentAmount, dueAmount, isCleared);
    }

    if (emailOpts) {
      emailOpts.to = studentEmail;
      sendEmail(emailOpts).catch((err) => console.error('[fees-v2] Failed to send payment email:', err));
    }

    // WhatsApp notification for installment payments (skip registration)
    if (studentPhone) {
      const paymentAmount = newTotalPaid - previousTotalPaid;
      const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

      let installmentType: 'first' | 'second' | 'final' | null = null;
      if (isCleared || newInst3 > previousInst3) {
        installmentType = 'final';
      } else if (newInst2 > previousInst2) {
        installmentType = 'second';
      } else if (newInst1 > previousInst1) {
        installmentType = 'first';
      }

      if (installmentType) {
        notifyInstallmentPayment({
          installmentType,
          phone: studentPhone,
          name: studentName,
          programName: studentProgramName,
          amount: paymentAmount,
          date: dateStr,
          balance: Math.max(0, dueAmount),
          totalPaid: newTotalPaid,
        }).catch((err) => console.error('[fees-v2] Failed to send WhatsApp payment notification:', err));
      }
    }
  }

  // Auto-generate invoices for manual admin entries
  if (newTotalPaid > previousTotalPaid && resultRow) {
    const processManualInvoice = async (key: string, diff: number, label: string) => {
      if (diff > 0) {
        try {
          const { rows: proofRows } = await db.query<any>(
            `INSERT INTO payment_proofs (student_id, fee_id, installment_key, amount, status, verified_by, verified_at, note)
             VALUES ($1, $2, $3, $4, 'VERIFIED', $5, NOW(), 'Manual Admin Entry')
             RETURNING id`,
            [data.student_id, resultRow.id, key, diff, data.created_by ?? null]
          );
          
          if (proofRows.length > 0) {
            const proofId = proofRows[0].id;
            const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randPart = Math.random().toString(36).substring(2, 7).toUpperCase();
            const invoiceNumber = `INV-${datePart}-${randPart}`;

            const { rows: userRows } = await db.query<any>(`SELECT assigned_program_id FROM users WHERE id = $1`, [data.student_id]);
            const programId = userRows[0]?.assigned_program_id ?? null;

            await db.query(
              `INSERT INTO invoices (invoice_number, student_id, program_id, amount, payment_proof_id, installment_key, installment_label)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [invoiceNumber, data.student_id, programId, diff, proofId, key, label]
            );
          }
        } catch (err) {
          console.error('[fees-v2] Failed to auto-generate manual invoice:', err);
        }
      }
    };

    const newReg = Number(data.registration_amount ?? 0);
    const newInst1 = Number(data.installment1_amount ?? 0);
    const newInst2 = Number(data.installment2_amount ?? 0);
    const newInst3 = Number(data.installment3_amount ?? 0);

    await processManualInvoice('registration', newReg - previousReg, 'Registration Fee');
    await processManualInvoice('installment1', newInst1 - previousInst1, '1st Installment');
    await processManualInvoice('installment2', newInst2 - previousInst2, '2nd Installment');
    await processManualInvoice('installment3', newInst3 - previousInst3, '3rd Installment');
  }

  return resultRow;
}

// ── Send reminder (update reminder status) ────────────────────────────────────
export async function sendReminder(feeId: string, field: string) {
  const allowed = [
    'registration_reminder', 'installment1_reminder',
    'installment2_reminder', 'installment3_reminder',
  ];
  if (!allowed.includes(field)) throw new AppError('Invalid reminder field', 400, 'VALIDATION_ERROR');

  const { rows } = await db.query<any>(
    `UPDATE student_fees SET
       ${field}_status = 'SENT',
       ${field}_date   = CURRENT_DATE,
       updated_at      = NOW()
     WHERE id = $1 RETURNING *`,
    [feeId],
  );
  if (!rows[0]) throw new AppError('Fee record not found', 404, 'NOT_FOUND');
  return rows[0];
}

// ── Student: get own fee record ───────────────────────────────────────────────
export async function getMyFees(studentId: string) {
  const { rows } = await db.query<any>(`
    SELECT sf.*,
      TO_CHAR(sf.enrolled_month AT TIME ZONE 'Asia/Kolkata', 'Month YYYY') AS month_label
    FROM student_fees sf
    WHERE sf.student_id = $1
    ORDER BY sf.created_at DESC`,
    [studentId],
  );
  return rows;
}

// ── Delete a fee record ───────────────────────────────────────────────────────
export async function deleteFeeRecord(feeId: string) {
  const { rowCount } = await db.query(`DELETE FROM student_fees WHERE id = $1`, [feeId]);
  if (!rowCount) throw new AppError('Fee record not found', 404, 'NOT_FOUND');
}

// ── Program-wise Students tree for fees ───────────────────────────────────
export async function getCourseBatchStudentTree(filters: {
  month?: string;
  phone?: string;
}) {
  const params: any[] = [];
  let lateralMonthClause = '';

  if (filters.month) {
    params.push(filters.month + '-01');
    lateralMonthClause = `AND DATE_TRUNC('month', sf2.enrolled_month AT TIME ZONE 'Asia/Kolkata') = DATE_TRUNC('month', $${params.length}::date)`;
  }

  // Now we group by COURSE instead of Program!
  let sql = `
    SELECT
      c.id AS course_id, c.title AS course_title, c.color_token AS course_color,
      u.id AS student_id, u.name AS student_name,
      u.email, u.phone_number, u.account_status,
      sf.id AS fee_id, sf.fees_offered, sf.due_amount,
      sf.enrolled_month,
      sf.registration_amount, sf.installment1_amount,
      sf.installment2_amount, sf.installment3_amount,
      (
        SELECT string_agg(b.name, ', ')
        FROM enrollments e
        JOIN batches b ON b.id = e.batch_id
        JOIN batch_courses bc ON bc.batch_id = b.id AND bc.course_id = c.id
        WHERE e.student_id = u.id
      ) AS enrolled_batches
    FROM users u
    JOIN program_enrollments pe ON pe.student_id = u.id
    JOIN program_course_selections pcs ON pcs.program_enrollment_id = pe.id
    JOIN courses c ON c.id = pcs.course_id
    LEFT JOIN LATERAL (
      SELECT * FROM student_fees sf2
      WHERE sf2.student_id = u.id 
        AND (sf2.course_id = c.id OR sf2.course_id IS NULL)
      ${lateralMonthClause}
      ORDER BY sf2.created_at DESC LIMIT 1
    ) sf ON true
    WHERE u.role = 'STUDENT'
    AND u.account_status NOT IN ('PENDING', 'REJECTED')`;

  if (filters.month) {
    sql += ` AND sf.id IS NOT NULL`;
  }

  if (filters.phone) {
    params.push(`%${filters.phone}%`);
    sql += ` AND u.phone_number ILIKE $${params.length}`;
  }

  sql += ' ORDER BY c.title NULLS LAST, u.name';

  const { rows } = await db.query<any>(sql, params);

  const courseMap = new Map<string, {
    course_id: string; course_title: string; color_token: string;
    batches: {
      batch_id: string; batch_name: string; batch_status: string;
      students: any[];
    }[];
  }>();

  for (const row of rows) {
    const courseId = row.course_id;
    const courseTitle = row.course_title;
    const courseColor = row.course_color ?? 'gray';
    const batchName = row.enrolled_batches || 'Unassigned Batch';

    if (!courseMap.has(courseId)) {
      courseMap.set(courseId, {
        course_id: courseId,
        course_title: courseTitle,
        color_token: courseColor,
        batches: []
      });
    }

    const courseData = courseMap.get(courseId)!;
    let batchData = courseData.batches.find(b => b.batch_name === batchName);
    
    if (!batchData) {
      batchData = {
        batch_id: `${courseId}-${batchName}`,
        batch_name: batchName,
        batch_status: 'ONGOING',
        students: []
      };
      courseData.batches.push(batchData);
    }

    batchData.students.push({
      student_id: row.student_id,
      name: row.student_name,
      email: row.email,
      phone_number: row.phone_number,
      account_status: row.account_status,
      fee_id: row.fee_id,
      fees_offered: row.fees_offered ? parseFloat(row.fees_offered) : null,
      due_amount: row.due_amount ? parseFloat(row.due_amount) : null,
      enrolled_month: row.enrolled_month,
      total_paid: (parseFloat(row.registration_amount ?? 0) +
        parseFloat(row.installment1_amount ?? 0) +
        parseFloat(row.installment2_amount ?? 0) +
        parseFloat(row.installment3_amount ?? 0)),
    });
  }

  return Array.from(courseMap.values());
}

// ── Admin: enroll a student in a program (creates program_enrollments + selections) ─
export async function enrollStudentInProgram(studentId: string, programId: string, courseIds: string[]) {
  // Always sync assigned_program_id so portal reads correctly from users table
  await db.query(
    `UPDATE users
     SET assigned_program_id = $1,
         program_assigned_at = NOW(),
         updated_at          = NOW()
     WHERE id = $2 AND role = 'STUDENT'`,
    [programId, studentId],
  );

  const { rows } = await db.query<any>(
    `INSERT INTO program_enrollments (student_id, program_id)
     VALUES ($1, $2)
     ON CONFLICT (student_id, program_id) DO UPDATE SET enrolled_at = NOW()
     RETURNING id`,
    [studentId, programId],
  );
  const enrollmentId = rows[0].id;

  if (courseIds.length > 0) {
    const vals: unknown[] = [];
    let pi = 1;
    const clauses = courseIds.map((cid) => { vals.push(enrollmentId, cid); return `($${pi++},$${pi++})`; });
    await db.query(
      `INSERT INTO program_course_selections (program_enrollment_id, course_id)
       VALUES ${clauses.join(',')} ON CONFLICT DO NOTHING`,
      vals,
    );
  }

  return { enrollmentId, courseCount: courseIds.length };
}

// ── Get student's program + all courses + which ones they're enrolled in ─────
export async function getStudentCourseEnrollment(studentId: string) {
  const { rows } = await db.query<any>(
    `SELECT
       u.assigned_program_id AS "programId",
       p.name                AS "programName",
       p.color_token         AS "programColor",
       pe.id                 AS "enrollmentId",
       c.id                  AS "courseId",
       c.title               AS "courseTitle",
       c.color_token         AS "courseColor",
       CASE WHEN pcs.course_id IS NOT NULL THEN true ELSE false END AS "isEnrolled"
     FROM users u
     LEFT JOIN programs p
           ON p.id = u.assigned_program_id
     LEFT JOIN courses c
           ON c.program_id = u.assigned_program_id AND c.status != 'ARCHIVED'
     LEFT JOIN program_enrollments pe
           ON pe.student_id = u.id AND pe.program_id = u.assigned_program_id
     LEFT JOIN program_course_selections pcs
           ON pcs.program_enrollment_id = pe.id AND pcs.course_id = c.id
     WHERE u.id = $1 AND u.role = 'STUDENT'
     ORDER BY c.title`,
    [studentId],
  );

  if (!rows.length) throw new AppError('Student not found', 404, 'NOT_FOUND');

  return {
    programId:    rows[0].programId,
    programName:  rows[0].programName,
    programColor: rows[0].programColor,
    enrollmentId: rows[0].enrollmentId,
    courses: rows
      .filter((r: any) => r.courseId)
      .map((r: any) => ({
        id:         r.courseId,
        title:      r.courseTitle,
        colorToken: r.courseColor,
        isEnrolled: r.isEnrolled,
      })),
  };
}

// ── Replace a student's course selections (full overwrite) ───────────────────
export async function updateStudentCourseSelections(
  studentId: string,
  programId: string,
  courseIds: string[],
) {
  // Ensure program is assigned on user (set program_assigned_at for consistency)
  await db.query(
    `UPDATE users
     SET assigned_program_id = $1,
         program_assigned_at = NOW(),
         updated_at          = NOW()
     WHERE id = $2 AND role = 'STUDENT'`,
    [programId, studentId],
  );

  // Upsert enrollment record
  const { rows } = await db.query<any>(
    `INSERT INTO program_enrollments (student_id, program_id)
     VALUES ($1, $2)
     ON CONFLICT (student_id, program_id) DO UPDATE SET enrolled_at = NOW()
     RETURNING id`,
    [studentId, programId],
  );
  const enrollmentId = rows[0].id;

  // Full replace: delete old selections, insert new ones
  await db.query(
    `DELETE FROM program_course_selections WHERE program_enrollment_id = $1`,
    [enrollmentId],
  );
  if (courseIds.length > 0) {
    const vals: unknown[] = [];
    let pi = 1;
    const clauses = courseIds.map((cid) => { vals.push(enrollmentId, cid); return `($${pi++},$${pi++})`; });
    await db.query(
      `INSERT INTO program_course_selections (program_enrollment_id, course_id)
       VALUES ${clauses.join(',')} ON CONFLICT DO NOTHING`,
      vals,
    );
  }

  return { enrollmentId, courseCount: courseIds.length };
}

export async function removeStudentFromCourse(studentId: string, courseId: string) {
  // Delete modern program-based course selections
  await db.query(
    `DELETE FROM program_course_selections pcs
     USING program_enrollments pe
     WHERE pcs.program_enrollment_id = pe.id
       AND pe.student_id = $1
       AND pcs.course_id = $2`,
    [studentId, courseId]
  );
  // Also delete legacy batch enrollments that belong to this course
  await db.query(
    `DELETE FROM enrollments e
     USING batches b
     JOIN batch_courses bc ON bc.batch_id = b.id
     WHERE e.batch_id = b.id
       AND e.student_id = $1
       AND bc.course_id = $2`,
    [studentId, courseId]
  );
}

export async function removeAllCourses(studentId: string) {
  await db.query(
    `DELETE FROM program_course_selections pcs
     USING program_enrollments pe
     WHERE pcs.program_enrollment_id = pe.id
       AND pe.student_id = $1`,
    [studentId]
  );
  await db.query(
    `DELETE FROM enrollments WHERE student_id = $1`,
    [studentId]
  );
}

// ── ACTIVE users needing portal setup ─────────────────────────────────────────
export async function getUnassignedStudents() {
  const { rows } = await db.query<any>(`
    SELECT u.id, u.name, u.email, u.phone_number,
           u.date_of_birth, u.occupation, u.qualification,
           u.graduation_year, u.class_preference, u.lead_source,
           u.address, u.account_status, u.created_at, u.role,
           CASE WHEN u.role = 'INTERN' THEN 'intern' ELSE 'student' END AS portal_type
    FROM users u
    WHERE u.account_status = 'ACTIVE'
      AND (
        (u.role = 'STUDENT' AND u.assigned_program_id IS NULL)
        OR (
          u.role = 'INTERN'
          AND NOT EXISTS (
            SELECT 1 FROM intern_allocations ia WHERE ia.student_id = u.id
          )
        )
      )
    ORDER BY u.created_at DESC
  `);
  return rows;
}

export async function updateSignupPortal(userId: string, portal: 'STUDENT' | 'INTERN') {
  const role = portal === 'INTERN' ? 'INTERN' : 'STUDENT';
  const { rows } = await db.query<any>(
    `UPDATE users SET role = $2, updated_at = NOW()
     WHERE id = $1 AND role IN ('STUDENT', 'INTERN') AND account_status = 'PENDING'
     RETURNING id, name, email, role, account_status`,
    [userId, role],
  );
  if (!rows[0]) {
    throw new AppError('Pending signup not found or portal cannot be changed', 404, 'NOT_FOUND');
  }
  return rows[0];
}

// ── Pending student signups ───────────────────────────────────────────────────
export async function getPendingSignups() {
  const { rows } = await db.query<any>(`
    SELECT u.id, u.name, u.email, u.phone_number, u.date_of_birth,
           u.occupation, u.qualification, u.graduation_year,
           u.class_preference, u.lead_source, u.address,
           u.account_status, u.created_at, u.role,
           p.name AS assigned_program_name, p.id AS assigned_program_id
    FROM users u
    LEFT JOIN programs p ON p.id = u.assigned_program_id
    WHERE u.role IN ('STUDENT', 'INTERN') AND u.account_status = 'PENDING'
    ORDER BY u.created_at DESC
  `);
  return rows;
}

export async function getAllStudentSignups() {
  const { rows } = await db.query<any>(`
    SELECT u.id, u.name, u.email, u.phone_number, u.date_of_birth,
           u.occupation, u.qualification, u.graduation_year,
           u.class_preference, u.lead_source, u.address,
           u.account_status, u.created_at, u.role,
           p.name AS assigned_program_name, p.id AS assigned_program_id
    FROM users u
    LEFT JOIN programs p ON p.id = u.assigned_program_id
    WHERE u.role IN ('STUDENT', 'INTERN')
    ORDER BY u.created_at DESC
  `);
  return rows;
}

export async function acceptStudent(
  studentId: string,
  programId: string,
  adminId: string,
  leadSource?: string,
  courseIds: string[] = [],
  feeDetails?: { fees_offered?: number; enrolled_month?: string; remarks?: string }
) {
  let student: any = null;
  let programName: string | null = null;

  await db.transaction(async (client) => {
    // 1. Update user details — only pending signups
    const { rows } = await db.query<any>(`
      UPDATE users SET
        account_status      = 'ACTIVE',
        assigned_program_id = $2,
        program_assigned_at = NOW(),
        program_assigned_by = $3,
        lead_source         = COALESCE($4, lead_source),
        updated_at          = NOW()
      WHERE id = $1
        AND role IN ('STUDENT', 'INTERN')
        AND account_status = 'PENDING'
      RETURNING id, name, email, role, account_status`,
      [studentId, programId, adminId, leadSource ?? null],
      client
    );
    if (!rows[0]) {
      throw new AppError(
        'Pending student not found (already approved, rejected, or missing).',
        404,
        'NOT_FOUND',
      );
    }
    student = rows[0];

    const { rows: progRows } = await db.query<{ name: string }>(
      `SELECT name FROM programs WHERE id = $1`,
      [programId],
      client,
    );
    programName = progRows[0]?.name ?? null;

    // 2. Create program enrollment
    const enrollRes = await db.query<any>(`
      INSERT INTO program_enrollments (student_id, program_id)
      VALUES ($1, $2)
      ON CONFLICT (student_id, program_id) DO UPDATE SET enrolled_at = NOW()
      RETURNING id`,
      [studentId, programId],
      client
    );
    const enrollmentId = enrollRes.rows[0].id;

    // 3. Clear existing selections
    await db.query(`
      DELETE FROM program_course_selections
      WHERE program_enrollment_id = $1`,
      [enrollmentId],
      client
    );

    // 4. Enroll in active program batch
    const batchRes = await db.query(`
      SELECT id FROM batches
      WHERE program_id = $1 AND status IN ('UPCOMING', 'ONGOING')
      ORDER BY start_date DESC LIMIT 1`,
      [programId],
      client
    );
    if (batchRes.rows[0]) {
      await db.query(`
        INSERT INTO enrollments (student_id, batch_id)
        VALUES ($1, $2)
        ON CONFLICT (student_id, batch_id) DO NOTHING`,
        [studentId, batchRes.rows[0].id],
        client
      );
    }

    // 6. Insert selected courses (batch)
    if (courseIds && courseIds.length > 0) {
      const vals: unknown[] = [];
      let pi = 1;
      const clauses = courseIds.map((cid) => { vals.push(enrollmentId, cid); return `($${pi++},$${pi++})`; });
      await db.query(
        `INSERT INTO program_course_selections (program_enrollment_id, course_id)
         VALUES ${clauses.join(',')} ON CONFLICT DO NOTHING`,
        vals,
        client,
      );
    }

    // 7. Seed fee docket if offered fees is entered
    if (feeDetails && feeDetails.fees_offered != null && feeDetails.enrolled_month) {
      const monthDate = feeDetails.enrolled_month + '-01';
      const existingFee = await db.query<{ id: string }>(
        `SELECT id FROM student_fees WHERE student_id = $1 AND enrolled_month = $2::date LIMIT 1`,
        [studentId, monthDate],
        client,
      );
      if (existingFee.rows[0]) {
        await db.query(
          `UPDATE student_fees SET
             fees_offered = $2,
             due_amount = $2 - (COALESCE(registration_amount, 0) + COALESCE(installment1_amount, 0)
               + COALESCE(installment2_amount, 0) + COALESCE(installment3_amount, 0)),
             remarks = COALESCE($3, remarks),
             updated_at = NOW()
           WHERE id = $1`,
          [existingFee.rows[0].id, feeDetails.fees_offered, feeDetails.remarks ?? null],
          client,
        );
      } else {
        await db.query(`
          INSERT INTO student_fees (
            student_id, enrolled_month, fees_offered, due_amount, remarks, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            studentId,
            monthDate,
            feeDetails.fees_offered,
            feeDetails.fees_offered,
            feeDetails.remarks ?? null,
            adminId,
          ],
          client,
        );
      }
    }
  });

  const welcomeSent = await sendAccountApprovedWelcome({
    name: student.name,
    email: student.email,
    userId: student.id,
    role: student.role,
    programName,
  });

  const { invalidateAuthGateCache } = await import('../lib/tokens');
  invalidateAuthGateCache(student.id);

  return { ...student, welcomeEmailSent: welcomeSent, programName };
}

export async function acceptIntern(internId: string, programId: string, batchId?: string) {
  let intern: any = null;
  let programName: string | null = null;

  await db.transaction(async (client) => {
    // 1. Mark intern as active
    const { rows } = await db.query<any>(
      `UPDATE users SET account_status = 'ACTIVE', updated_at = NOW()
       WHERE id = $1 AND role = 'INTERN' AND account_status = 'PENDING'
       RETURNING id, name, email, role, account_status`,
      [internId],
      client
    );
    if (!rows[0]) throw new AppError('Pending intern not found (already approved or missing)', 404, 'NOT_FOUND');
    intern = rows[0];

    // 2. Validate program and batch
    const { rows: pRows } = await db.query<any>(
      `SELECT id, title AS name FROM internship_programs WHERE id = $1`, [programId], client
    );
    if (!pRows[0]) throw new AppError('Internship program not found', 404, 'NOT_FOUND');
    programName = pRows[0].name ?? null;

    if (batchId) {
      const { rows: bRows } = await db.query<any>(
        `SELECT id FROM intern_batches WHERE id = $1 AND program_id = $2`, [batchId, programId], client
      );
      if (!bRows[0]) throw new AppError('Batch not found in the selected program', 404, 'NOT_FOUND');
    }

    // 3. Insert allocation
    await db.query(`
      INSERT INTO intern_allocations (student_id, program_id, batch_id, join_date, status, progress)
      VALUES ($1, $2, $3, CURRENT_DATE, 'ACTIVE', 0)
      ON CONFLICT (student_id, program_id) DO UPDATE SET
        status = 'ACTIVE',
        batch_id = EXCLUDED.batch_id,
        updated_at = NOW()
    `, [internId, programId, batchId || null], client);
  });

  const welcomeSent = await sendAccountApprovedWelcome({
    name: intern.name,
    email: intern.email,
    userId: intern.id,
    role: 'INTERN',
    programName,
  });

  const { invalidateAuthGateCache } = await import('../lib/tokens');
  invalidateAuthGateCache(intern.id);

  return { ...intern, welcomeEmailSent: welcomeSent, programName };
}

/** Resend welcome mail for already-ACTIVE student/intern (e.g. past approvals that missed email) */
export async function resendWelcomeEmail(studentId: string) {
  const { rows } = await db.query<any>(`
    SELECT u.id, u.name, u.email, u.role, u.account_status,
           COALESCE(p.name, ip.title) AS program_name
    FROM users u
    LEFT JOIN programs p ON p.id = u.assigned_program_id
    LEFT JOIN LATERAL (
      SELECT ip.title
      FROM intern_allocations ia
      JOIN internship_programs ip ON ip.id = ia.program_id
      WHERE ia.student_id = u.id
      ORDER BY ia.created_at DESC NULLS LAST
      LIMIT 1
    ) ip ON true
    WHERE u.id = $1 AND u.role IN ('STUDENT', 'INTERN')
  `, [studentId]);

  const user = rows[0];
  if (!user) throw new AppError('Student not found', 404, 'NOT_FOUND');
  if (user.account_status !== 'ACTIVE') {
    throw new AppError('Welcome email can only be sent to ACTIVE accounts', 400, 'INVALID_STATUS');
  }
  if (!user.email) throw new AppError('Student has no email address', 400, 'NO_EMAIL');

  const sent = await sendAccountApprovedWelcome({
    name: user.name,
    email: user.email,
    userId: user.id,
    role: user.role,
    programName: user.program_name,
  });
  if (!sent) throw new AppError('Failed to send welcome email — check SMTP configuration', 502, 'EMAIL_FAILED');
  return { id: user.id, email: user.email, welcomeEmailSent: true };
}

export async function rejectStudent(studentId: string) {
  const { rows } = await db.query<any>(`
    UPDATE users SET account_status = 'REJECTED'
    WHERE id = $1 
    RETURNING id, name, email`,
    [studentId],
  );
  if (!rows[0]) throw new AppError('Student not found', 404, 'NOT_FOUND');
  await revokeUserSessions(studentId);
  const { invalidateAuthGateCache } = await import('../lib/tokens');
  invalidateAuthGateCache(studentId);
  return rows[0];
}

export async function getStudentAssignedProgram(studentId: string) {
  // ── Step 1: single-row user + program lookup (no GROUP BY, never returns 0 rows for valid student) ──
  const { rows: userRows } = await db.query<any>(
    `SELECT u.account_status,
            u.assigned_program_id,
            p.id          AS program_id,
            p.name        AS program_name,
            p.color_token AS color_token
     FROM users u
     LEFT JOIN programs p ON p.id = u.assigned_program_id
     WHERE u.id = $1`,
    [studentId],
  );

  if (!userRows.length) return null;          // user doesn't exist (invalid token)
  const user = userRows[0];

  // No program yet — return stub so portal can show the right message per account status
  if (!user.program_id) {
    return { program_id: null, account_status: user.account_status };
  }

  // ── Step 2: all non-archived courses in the program ──────────────────────────
  const { rows: courseRows } = await db.query<any>(
    `SELECT id, title, category, level, color_token, duration_months, description
     FROM courses
     WHERE program_id = $1 AND status != 'ARCHIVED'
     ORDER BY title`,
    [user.program_id],
  );

  // ── Step 3: course IDs this student has already selected ─────────────────────
  const { rows: selRows } = await db.query<any>(
    `SELECT pcs.course_id
     FROM program_enrollments pe
     JOIN program_course_selections pcs ON pcs.program_enrollment_id = pe.id
     WHERE pe.student_id = $1 AND pe.program_id = $2`,
    [studentId, user.program_id],
  );

  return {
    program_id:          user.program_id,
    program_name:        user.program_name,
    color_token:         user.color_token,
    account_status:      user.account_status,
    courses:             courseRows,
    selected_course_ids: selRows.map((r: any) => r.course_id),
  };
}

export async function deleteRejectedStudent(studentId: string) {
  // Only allow deleting REJECTED students
  const { rows } = await db.query<any>(
    `SELECT id, account_status FROM users WHERE id = $1 `,
    [studentId],
  );
  if (!rows[0]) throw new AppError('Student not found', 404, 'NOT_FOUND');
  if (rows[0].account_status !== 'REJECTED') {
    throw new AppError('Only rejected students can be deleted from here', 400, 'INVALID_STATUS');
  }
  // Full cascade cleanup
  await db.query(`
    DELETE FROM program_course_selections
    WHERE program_enrollment_id IN (
      SELECT id FROM program_enrollments WHERE student_id = $1
    )`, [studentId]);
  await db.query(`DELETE FROM program_enrollments WHERE student_id = $1`, [studentId]);
  await db.query(`DELETE FROM payment_proofs  WHERE student_id = $1`, [studentId]);
  await db.query(`DELETE FROM student_fees    WHERE student_id = $1`, [studentId]);
  await db.query(`DELETE FROM refresh_tokens  WHERE user_id    = $1`, [studentId]);
  await db.query(`DELETE FROM users WHERE id = $1`, [studentId]);
}

// ── Month → Course → Batch → Students tree ───────────────────────────────────
export async function getMonthCourseBatchTree(month?: string) {
  let sql = `
    SELECT
      TO_CHAR(DATE_TRUNC('month', e.enrolled_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM')   AS month_key,
      TO_CHAR(DATE_TRUNC('month', e.enrolled_at AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY')  AS month_label,
      c.id   AS course_id,   c.title AS course_title, c.color_token,
      b.id   AS batch_id,    b.name  AS batch_name,   b.status AS batch_status,
      u.id   AS student_id,  u.name  AS student_name,
      u.email, u.phone_number, u.date_of_birth, u.occupation,
      u.qualification, u.graduation_year, u.class_preference, u.address,
      u.account_status,
      sf.id                    AS fee_id,
      sf.fees_offered,
      sf.registration_expected, sf.registration_amount, sf.registration_date,
      sf.installment1_expected, sf.installment1_amount, sf.installment1_date,
      sf.installment2_expected, sf.installment2_amount, sf.installment2_date,
      sf.installment3_expected, sf.installment3_amount, sf.installment3_date,
      sf.due_amount, sf.remarks
    FROM enrollments e
    JOIN batches b   ON b.id  = e.batch_id
    JOIN batch_courses bc_f ON bc_f.batch_id = b.id
    JOIN courses c   ON c.id  = bc_f.course_id
    JOIN users u     ON u.id  = e.student_id
    LEFT JOIN LATERAL (
      SELECT * FROM student_fees sf2
      WHERE sf2.student_id = u.id
      ORDER BY sf2.created_at DESC LIMIT 1
    ) sf ON true
    WHERE u.role IN ('STUDENT', 'INTERN')`;

  const params: any[] = [];
  if (month) {
    params.push(month + '-01');
    sql += ` AND DATE_TRUNC('month', e.enrolled_at AT TIME ZONE 'Asia/Kolkata') = DATE_TRUNC('month', $1::date)`;
  }
  sql += ` ORDER BY e.enrolled_at DESC, c.title, u.name`;

  const { rows } = await db.query<any>(sql, params);

  // Group: month → course → batch → students
  const monthMap = new Map<string, {
    month_key: string; month_label: string;
    courses: Map<string, {
      course_id: string; course_title: string; color_token: string;
      batches: Map<string, {
        batch_id: string; batch_name: string; batch_status: string;
        students: any[];
      }>;
    }>;
  }>();

  for (const row of rows) {
    if (!monthMap.has(row.month_key)) {
      monthMap.set(row.month_key, { month_key: row.month_key, month_label: row.month_label, courses: new Map() });
    }
    const monthEntry = monthMap.get(row.month_key)!;

    if (!monthEntry.courses.has(row.course_id)) {
      monthEntry.courses.set(row.course_id, { course_id: row.course_id, course_title: row.course_title, color_token: row.color_token, batches: new Map() });
    }
    const courseEntry = monthEntry.courses.get(row.course_id)!;

    if (!courseEntry.batches.has(row.batch_id)) {
      courseEntry.batches.set(row.batch_id, { batch_id: row.batch_id, batch_name: row.batch_name, batch_status: row.batch_status, students: [] });
    }
    courseEntry.batches.get(row.batch_id)!.students.push({
      student_id: row.student_id,
      name: row.student_name,
      email: row.email,
      phone_number: row.phone_number,
      date_of_birth: row.date_of_birth,
      occupation: row.occupation,
      qualification: row.qualification,
      graduation_year: row.graduation_year,
      class_preference: row.class_preference,
      address: row.address,
      account_status: row.account_status,
      fee_id: row.fee_id,
      fees_offered: row.fees_offered ? parseFloat(row.fees_offered) : null,
      due_amount: row.due_amount ? parseFloat(row.due_amount) : null,
      registration_expected: row.registration_expected ? parseFloat(row.registration_expected) : null,
      registration_amount: row.registration_amount ? parseFloat(row.registration_amount) : null,
      registration_date: row.registration_date,
      installment1_expected: row.installment1_expected ? parseFloat(row.installment1_expected) : null,
      installment1_amount: row.installment1_amount ? parseFloat(row.installment1_amount) : null,
      installment1_date: row.installment1_date,
      installment2_expected: row.installment2_expected ? parseFloat(row.installment2_expected) : null,
      installment2_amount: row.installment2_amount ? parseFloat(row.installment2_amount) : null,
      installment2_date: row.installment2_date,
      installment3_expected: row.installment3_expected ? parseFloat(row.installment3_expected) : null,
      installment3_amount: row.installment3_amount ? parseFloat(row.installment3_amount) : null,
      installment3_date: row.installment3_date,
      remarks: row.remarks,
    });
  }

  return Array.from(monthMap.values()).map(m => ({
    ...m,
    courses: Array.from(m.courses.values()).map(c => ({
      ...c,
      batches: Array.from(c.batches.values()),
    })),
  }));
}

export async function toggleBlockStudent(studentId: string) {
  const { rows: userRows } = await db.query<any>(
    `SELECT account_status FROM users WHERE id = $1 `,
    [studentId],
  );
  if (!userRows[0]) throw new AppError('Student not found', 404, 'NOT_FOUND');
  const currentStatus = userRows[0].account_status;
  const newStatus = currentStatus === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';

  await db.query(
    `UPDATE users SET account_status = $1, updated_at = NOW() WHERE id = $2`,
    [newStatus, studentId],
  );
  const { invalidateAuthGateCache } = await import('../lib/tokens');
  invalidateAuthGateCache(studentId);
  if (newStatus === 'BLOCKED') {
    await revokeUserSessions(studentId);
  }
  return { success: true, status: newStatus };
}
