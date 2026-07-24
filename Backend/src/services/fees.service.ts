import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';

// ────────────────────────────────────────────────────────────────────────────
// Fee Structures
// ────────────────────────────────────────────────────────────────────────────

export async function listFeeStructures(courseId?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (courseId) { conditions.push(`fs.course_id = $${idx++}`); params.push(courseId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT
       fs.id, fs.course_id AS "courseId", fs.name, fs.total_amount AS "totalAmount",
       fs.currency, fs.description, fs.is_active AS "isActive",
       fs.created_at AS "createdAt", fs.updated_at AS "updatedAt",
       c.title AS "courseTitle",
       COUNT(fi.id)::int AS "instalmentCount"
     FROM fee_structures fs
     JOIN courses c ON c.id = fs.course_id
     LEFT JOIN fee_instalments fi ON fi.fee_structure_id = fs.id
     ${where}
     GROUP BY fs.id, c.title
     ORDER BY fs.created_at DESC`,
    params,
  );
  return rows;
}

export async function getFeeStructure(id: string) {
  const { rows } = await db.query(
    `SELECT
       fs.id, fs.course_id AS "courseId", fs.name, fs.total_amount AS "totalAmount",
       fs.currency, fs.description, fs.is_active AS "isActive",
       fs.created_at AS "createdAt", fs.updated_at AS "updatedAt",
       c.title AS "courseTitle"
     FROM fee_structures fs
     JOIN courses c ON c.id = fs.course_id
     WHERE fs.id = $1`,
    [id],
  );
  if (!rows.length) throw new AppError('Fee structure not found', 404, 'NOT_FOUND');

  const { rows: instalments } = await db.query(
    `SELECT id, fee_structure_id AS "feeStructureId", instalment_number AS "instalmentNumber",
            label, amount, due_date AS "dueDate", created_at AS "createdAt"
     FROM fee_instalments WHERE fee_structure_id = $1 ORDER BY instalment_number`,
    [id],
  );

  return { ...rows[0], instalments };
}

export async function createFeeStructure(input: {
  courseId: string; name: string; totalAmount: number;
  currency?: string; description?: string; isActive?: boolean;
}) {
  const courseRes = await db.query('SELECT id FROM courses WHERE id = $1', [input.courseId]);
  if (!courseRes.rowCount) throw new AppError('Course not found', 404, 'NOT_FOUND');

  const { rows } = await db.query(
    `INSERT INTO fee_structures (course_id, name, total_amount, currency, description, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      input.courseId,
      input.name,
      input.totalAmount,
      input.currency ?? 'INR',
      input.description ?? null,
      input.isActive ?? true,
    ],
  );
  return getFeeStructure(rows[0].id);
}

export async function updateFeeStructure(id: string, input: {
  name?: string; totalAmount?: number; currency?: string;
  description?: string; isActive?: boolean;
}) {
  const existing = await db.query('SELECT id FROM fee_structures WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Fee structure not found', 404, 'NOT_FOUND');

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.name        !== undefined) { fields.push(`name = $${idx++}`);         params.push(input.name); }
  if (input.totalAmount !== undefined) { fields.push(`total_amount = $${idx++}`); params.push(input.totalAmount); }
  if (input.currency    !== undefined) { fields.push(`currency = $${idx++}`);     params.push(input.currency); }
  if (input.description !== undefined) { fields.push(`description = $${idx++}`);  params.push(input.description || null); }
  if (input.isActive    !== undefined) { fields.push(`is_active = $${idx++}`);    params.push(input.isActive); }

  if (fields.length === 0) return getFeeStructure(id);
  params.push(id);
  await db.query(`UPDATE fee_structures SET ${fields.join(', ')} WHERE id = $${idx}`, params);
  return getFeeStructure(id);
}

export async function deleteFeeStructure(id: string) {
  const existing = await db.query('SELECT id FROM fee_structures WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Fee structure not found', 404, 'NOT_FOUND');
  await db.query('DELETE FROM fee_structures WHERE id = $1', [id]);
}

// ────────────────────────────────────────────────────────────────────────────
// Instalments
// ────────────────────────────────────────────────────────────────────────────

export async function createInstalment(feeStructureId: string, input: {
  instalmentNumber: number; label: string; amount: number; dueDate?: string;
}) {
  const fsRes = await db.query('SELECT id FROM fee_structures WHERE id = $1', [feeStructureId]);
  if (!fsRes.rowCount) throw new AppError('Fee structure not found', 404, 'NOT_FOUND');

  const { rows } = await db.query(
    `INSERT INTO fee_instalments (fee_structure_id, instalment_number, label, amount, due_date)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [feeStructureId, input.instalmentNumber, input.label, input.amount, input.dueDate ?? null],
  );

  const { rows: r } = await db.query(
    `SELECT id, fee_structure_id AS "feeStructureId", instalment_number AS "instalmentNumber",
            label, amount, due_date AS "dueDate", created_at AS "createdAt"
     FROM fee_instalments WHERE id = $1`,
    [rows[0].id],
  );
  return r[0];
}

export async function updateInstalment(id: string, input: {
  instalmentNumber?: number; label?: string; amount?: number; dueDate?: string;
}) {
  const existing = await db.query('SELECT id FROM fee_instalments WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Instalment not found', 404, 'NOT_FOUND');

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.instalmentNumber !== undefined) { fields.push(`instalment_number = $${idx++}`); params.push(input.instalmentNumber); }
  if (input.label            !== undefined) { fields.push(`label = $${idx++}`);             params.push(input.label); }
  if (input.amount           !== undefined) { fields.push(`amount = $${idx++}`);            params.push(input.amount); }
  if (input.dueDate          !== undefined) { fields.push(`due_date = $${idx++}`);          params.push(input.dueDate || null); }

  if (fields.length === 0) return;
  params.push(id);
  await db.query(`UPDATE fee_instalments SET ${fields.join(', ')} WHERE id = $${idx}`, params);

  const { rows } = await db.query(
    `SELECT id, fee_structure_id AS "feeStructureId", instalment_number AS "instalmentNumber",
            label, amount, due_date AS "dueDate", created_at AS "createdAt"
     FROM fee_instalments WHERE id = $1`,
    [id],
  );
  return rows[0];
}

export async function deleteInstalment(id: string) {
  const existing = await db.query('SELECT id FROM fee_instalments WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Instalment not found', 404, 'NOT_FOUND');
  await db.query('DELETE FROM fee_instalments WHERE id = $1', [id]);
}

// ────────────────────────────────────────────────────────────────────────────
// Scholarships
// ────────────────────────────────────────────────────────────────────────────

export async function listScholarships(courseId?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (courseId) { conditions.push(`(s.course_id = $${idx++} OR s.course_id IS NULL)`); params.push(courseId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT s.id, s.name, s.type, s.value, s.criteria,
            s.course_id AS "courseId", s.is_active AS "isActive",
            s.created_at AS "createdAt", s.updated_at AS "updatedAt",
            c.title AS "courseTitle"
     FROM fee_scholarships s
     LEFT JOIN courses c ON c.id = s.course_id
     ${where}
     ORDER BY s.created_at DESC`,
    params,
  );
  return rows;
}

export async function createScholarship(input: {
  name: string; type: 'PERCENTAGE' | 'FIXED'; value: number;
  criteria?: string; courseId?: string; isActive?: boolean;
}) {
  const { rows } = await db.query(
    `INSERT INTO fee_scholarships (name, type, value, criteria, course_id, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.name, input.type, input.value, input.criteria ?? null, input.courseId ?? null, input.isActive ?? true],
  );

  const { rows: r } = await db.query(
    `SELECT s.id, s.name, s.type, s.value, s.criteria,
            s.course_id AS "courseId", s.is_active AS "isActive",
            s.created_at AS "createdAt", s.updated_at AS "updatedAt",
            c.title AS "courseTitle"
     FROM fee_scholarships s LEFT JOIN courses c ON c.id = s.course_id WHERE s.id = $1`,
    [rows[0].id],
  );
  return r[0];
}

export async function updateScholarship(id: string, input: {
  name?: string; type?: 'PERCENTAGE' | 'FIXED'; value?: number;
  criteria?: string; courseId?: string | null; isActive?: boolean;
}) {
  const existing = await db.query('SELECT id FROM fee_scholarships WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Scholarship not found', 404, 'NOT_FOUND');

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.name     !== undefined) { fields.push(`name = $${idx++}`);      params.push(input.name); }
  if (input.type     !== undefined) { fields.push(`type = $${idx++}`);      params.push(input.type); }
  if (input.value    !== undefined) { fields.push(`value = $${idx++}`);     params.push(input.value); }
  if (input.criteria !== undefined) { fields.push(`criteria = $${idx++}`);  params.push(input.criteria || null); }
  if (input.courseId !== undefined) { fields.push(`course_id = $${idx++}`); params.push(input.courseId || null); }
  if (input.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(input.isActive); }

  if (fields.length === 0) return;
  params.push(id);
  await db.query(`UPDATE fee_scholarships SET ${fields.join(', ')} WHERE id = $${idx}`, params);

  const { rows } = await db.query(
    `SELECT s.id, s.name, s.type, s.value, s.criteria,
            s.course_id AS "courseId", s.is_active AS "isActive",
            s.created_at AS "createdAt", s.updated_at AS "updatedAt",
            c.title AS "courseTitle"
     FROM fee_scholarships s LEFT JOIN courses c ON c.id = s.course_id WHERE s.id = $1`,
    [id],
  );
  return rows[0];
}

export async function deleteScholarship(id: string) {
  const existing = await db.query('SELECT id FROM fee_scholarships WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Scholarship not found', 404, 'NOT_FOUND');
  await db.query('DELETE FROM fee_scholarships WHERE id = $1', [id]);
}

// ────────────────────────────────────────────────────────────────────────────
// Discounts
// ────────────────────────────────────────────────────────────────────────────

export async function listDiscounts() {
  const { rows } = await db.query(
    `SELECT id, name, type, value, code, max_uses AS "maxUses", used_count AS "usedCount",
            valid_from AS "validFrom", valid_to AS "validTo",
            is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM fee_discounts
     ORDER BY created_at DESC`,
  );
  return rows;
}

export async function createDiscount(input: {
  name: string; type: 'PERCENTAGE' | 'FIXED'; value: number;
  code?: string; maxUses?: number; validFrom?: string; validTo?: string; isActive?: boolean;
}) {
  const { rows } = await db.query(
    `INSERT INTO fee_discounts (name, type, value, code, max_uses, valid_from, valid_to, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      input.name, input.type, input.value,
      input.code ?? null, input.maxUses ?? null,
      input.validFrom ?? null, input.validTo ?? null,
      input.isActive ?? true,
    ],
  );

  const { rows: r } = await db.query(
    `SELECT id, name, type, value, code, max_uses AS "maxUses", used_count AS "usedCount",
            valid_from AS "validFrom", valid_to AS "validTo",
            is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM fee_discounts WHERE id = $1`,
    [rows[0].id],
  );
  return r[0];
}

export async function updateDiscount(id: string, input: {
  name?: string; type?: 'PERCENTAGE' | 'FIXED'; value?: number;
  code?: string | null; maxUses?: number | null; validFrom?: string | null;
  validTo?: string | null; isActive?: boolean;
}) {
  const existing = await db.query('SELECT id FROM fee_discounts WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Discount not found', 404, 'NOT_FOUND');

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.name      !== undefined) { fields.push(`name = $${idx++}`);       params.push(input.name); }
  if (input.type      !== undefined) { fields.push(`type = $${idx++}`);       params.push(input.type); }
  if (input.value     !== undefined) { fields.push(`value = $${idx++}`);      params.push(input.value); }
  if (input.code      !== undefined) { fields.push(`code = $${idx++}`);       params.push(input.code || null); }
  if (input.maxUses   !== undefined) { fields.push(`max_uses = $${idx++}`);   params.push(input.maxUses ?? null); }
  if (input.validFrom !== undefined) { fields.push(`valid_from = $${idx++}`); params.push(input.validFrom || null); }
  if (input.validTo   !== undefined) { fields.push(`valid_to = $${idx++}`);   params.push(input.validTo || null); }
  if (input.isActive  !== undefined) { fields.push(`is_active = $${idx++}`);  params.push(input.isActive); }

  if (fields.length === 0) return;
  params.push(id);
  await db.query(`UPDATE fee_discounts SET ${fields.join(', ')} WHERE id = $${idx}`, params);

  const { rows } = await db.query(
    `SELECT id, name, type, value, code, max_uses AS "maxUses", used_count AS "usedCount",
            valid_from AS "validFrom", valid_to AS "validTo",
            is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM fee_discounts WHERE id = $1`,
    [id],
  );
  return rows[0];
}

export async function deleteDiscount(id: string) {
  const existing = await db.query('SELECT id FROM fee_discounts WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Discount not found', 404, 'NOT_FOUND');
  await db.query('DELETE FROM fee_discounts WHERE id = $1', [id]);
}

// ────────────────────────────────────────────────────────────────────────────
// Payments
// ────────────────────────────────────────────────────────────────────────────

export async function listPayments(studentId?: string, feeStructureId?: string, status?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (studentId)      { conditions.push(`fp.student_id = $${idx++}`);        params.push(studentId); }
  if (feeStructureId) { conditions.push(`fp.fee_structure_id = $${idx++}`);  params.push(feeStructureId); }
  if (status)         { conditions.push(`fp.status = $${idx++}`);            params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT
       fp.id, fp.student_id AS "studentId", fp.fee_structure_id AS "feeStructureId",
       fp.instalment_id AS "instalmentId",
       fp.amount_due AS "amountDue", fp.amount_paid AS "amountPaid",
       fp.discount_amount AS "discountAmount", fp.scholarship_amount AS "scholarshipAmount",
       fp.payment_date AS "paymentDate", fp.payment_mode AS "paymentMode",
       fp.status, fp.notes,
       fp.created_at AS "createdAt", fp.updated_at AS "updatedAt",
       u.name AS "studentName", u.email AS "studentEmail",
       fs.name AS "structureName",
       c.title AS "courseTitle",
       fi.label AS "instalmentLabel"
     FROM fee_payments fp
     JOIN users u ON u.id = fp.student_id
     JOIN fee_structures fs ON fs.id = fp.fee_structure_id
     JOIN courses c ON c.id = fs.course_id
     LEFT JOIN fee_instalments fi ON fi.id = fp.instalment_id
     ${where}
     ORDER BY fp.created_at DESC`,
    params,
  );
  return rows;
}

export async function createPayment(input: {
  studentId: string; feeStructureId: string; instalmentId?: string;
  amountDue: number; amountPaid?: number; discountAmount?: number;
  scholarshipAmount?: number; paymentDate?: string; paymentMode?: string;
  status?: string; notes?: string;
}) {
  const { rows } = await db.query(
    `INSERT INTO fee_payments
       (student_id, fee_structure_id, instalment_id, amount_due, amount_paid,
        discount_amount, scholarship_amount, payment_date, payment_mode, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      input.studentId,
      input.feeStructureId,
      input.instalmentId ?? null,
      input.amountDue,
      input.amountPaid ?? 0,
      input.discountAmount ?? 0,
      input.scholarshipAmount ?? 0,
      input.paymentDate ?? null,
      input.paymentMode ?? null,
      input.status ?? 'PENDING',
      input.notes ?? null,
    ],
  );

  const { rows: r } = await db.query(
    `SELECT
       fp.id, fp.student_id AS "studentId", fp.fee_structure_id AS "feeStructureId",
       fp.instalment_id AS "instalmentId",
       fp.amount_due AS "amountDue", fp.amount_paid AS "amountPaid",
       fp.discount_amount AS "discountAmount", fp.scholarship_amount AS "scholarshipAmount",
       fp.payment_date AS "paymentDate", fp.payment_mode AS "paymentMode",
       fp.status, fp.notes,
       fp.created_at AS "createdAt", fp.updated_at AS "updatedAt",
       u.name AS "studentName", u.email AS "studentEmail",
       fs.name AS "structureName",
       c.title AS "courseTitle",
       fi.label AS "instalmentLabel"
     FROM fee_payments fp
     JOIN users u ON u.id = fp.student_id
     JOIN fee_structures fs ON fs.id = fp.fee_structure_id
     JOIN courses c ON c.id = fs.course_id
     LEFT JOIN fee_instalments fi ON fi.id = fp.instalment_id
     WHERE fp.id = $1`,
    [rows[0].id],
  );
  return r[0];
}

export async function updatePayment(id: string, input: {
  amountPaid?: number; discountAmount?: number; scholarshipAmount?: number;
  paymentDate?: string; paymentMode?: string; status?: string; notes?: string;
}) {
  const existing = await db.query('SELECT id FROM fee_payments WHERE id = $1', [id]);
  if (!existing.rowCount) throw new AppError('Payment not found', 404, 'NOT_FOUND');

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.amountPaid        !== undefined) { fields.push(`amount_paid = $${idx++}`);        params.push(input.amountPaid); }
  if (input.discountAmount    !== undefined) { fields.push(`discount_amount = $${idx++}`);    params.push(input.discountAmount); }
  if (input.scholarshipAmount !== undefined) { fields.push(`scholarship_amount = $${idx++}`); params.push(input.scholarshipAmount); }
  if (input.paymentDate       !== undefined) { fields.push(`payment_date = $${idx++}`);       params.push(input.paymentDate || null); }
  if (input.paymentMode       !== undefined) { fields.push(`payment_mode = $${idx++}`);       params.push(input.paymentMode || null); }
  if (input.status            !== undefined) { fields.push(`status = $${idx++}`);             params.push(input.status); }
  if (input.notes             !== undefined) { fields.push(`notes = $${idx++}`);              params.push(input.notes || null); }

  if (fields.length === 0) return;
  params.push(id);
  await db.query(`UPDATE fee_payments SET ${fields.join(', ')} WHERE id = $${idx}`, params);

  const { rows } = await db.query(
    `SELECT
       fp.id, fp.student_id AS "studentId", fp.fee_structure_id AS "feeStructureId",
       fp.instalment_id AS "instalmentId",
       fp.amount_due AS "amountDue", fp.amount_paid AS "amountPaid",
       fp.discount_amount AS "discountAmount", fp.scholarship_amount AS "scholarshipAmount",
       fp.payment_date AS "paymentDate", fp.payment_mode AS "paymentMode",
       fp.status, fp.notes,
       fp.created_at AS "createdAt", fp.updated_at AS "updatedAt",
       u.name AS "studentName", u.email AS "studentEmail",
       fs.name AS "structureName",
       c.title AS "courseTitle",
       fi.label AS "instalmentLabel"
     FROM fee_payments fp
     JOIN users u ON u.id = fp.student_id
     JOIN fee_structures fs ON fs.id = fp.fee_structure_id
     JOIN courses c ON c.id = fs.course_id
     LEFT JOIN fee_instalments fi ON fi.id = fp.instalment_id
     WHERE fp.id = $1`,
    [id],
  );
  return rows[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Analytics
// ────────────────────────────────────────────────────────────────────────────

export async function getFeeAnalytics() {
  // Totals
  const totalsRes = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_paid ELSE 0 END), 0)::float     AS "totalCollected",
       COALESCE(SUM(CASE WHEN status IN ('PENDING','PARTIAL') THEN (amount_due - amount_paid) ELSE 0 END), 0)::float AS "totalPending",
       COALESCE(SUM(CASE WHEN status = 'OVERDUE' THEN (amount_due - amount_paid) ELSE 0 END), 0)::float AS "totalOverdue"
     FROM fee_payments`,
  );

  // Fees by status
  const statusRes = await db.query(
    `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_due), 0)::float AS total
     FROM fee_payments GROUP BY status`,
  );
  const feesByStatus: Record<string, { count: number; total: number }> = {};
  for (const r of statusRes.rows) {
    feesByStatus[r.status] = { count: r.count, total: Number(r.total) };
  }

  // Collection by month (last 12 months)
  const monthRes = await db.query(
    `SELECT
       TO_CHAR(payment_date, 'YYYY-MM') AS month,
       COALESCE(SUM(amount_paid), 0)::float AS collected
     FROM fee_payments
     WHERE payment_date >= NOW() - INTERVAL '12 months'
       AND status IN ('PAID','PARTIAL')
     GROUP BY month
     ORDER BY month`,
  );

  // Top debtors (students with most pending amount)
  const debtorsRes = await db.query(
    `SELECT
       u.id AS "studentId", u.name, u.email,
       COALESCE(SUM(fp.amount_due - fp.amount_paid), 0)::float AS "pendingAmount",
       COUNT(fp.id)::int AS "paymentCount"
     FROM fee_payments fp
     JOIN users u ON u.id = fp.student_id
     WHERE fp.status IN ('PENDING','PARTIAL','OVERDUE')
     GROUP BY u.id, u.name, u.email
     ORDER BY "pendingAmount" DESC
     LIMIT 10`,
  );

  const totals = totalsRes.rows[0];

  return {
    totalCollected:   Number(totals.totalCollected),
    totalPending:     Number(totals.totalPending),
    totalOverdue:     Number(totals.totalOverdue),
    collectionByMonth: monthRes.rows.map((r) => ({ month: r.month, collected: r.collected })),
    feesByStatus,
    topDebtors: debtorsRes.rows,
  };
}
