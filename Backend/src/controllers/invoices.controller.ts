import { Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware';
import db from '../lib/db';

const INSTALLMENT_LABELS: Record<string, string> = {
  registration: 'Registration Fee',
  installment1: '1st Installment',
  installment2: '2nd Installment',
  installment3: '3rd Installment',
};

const FEE_AMOUNT_COLS: Record<string, string> = {
  registration: 'registration_amount',
  installment1: 'installment1_amount',
  installment2: 'installment2_amount',
  installment3: 'installment3_amount',
};

function newInvoiceNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `INV-${datePart}-${randPart}`;
}

/** Prefer existing verified proofs that lack invoices — never invent VERIFIED proofs on read. */
async function backfillMissingInvoices(studentId: string, existing: any[]): Promise<any[]> {
  const rows = [...existing];
  const keysWithInvoice = new Set(
    rows.map((r) => r.installment_key).filter(Boolean),
  );
  const proofIdsWithInvoice = new Set(
    rows.map((r) => r.payment_proof_id).filter(Boolean),
  );

  const { rows: orphanProofs } = await db.query<any>(
    `SELECT pp.id, pp.amount, pp.installment_key, pp.fee_id,
            u.assigned_program_id AS program_id, p.name AS program_name
     FROM payment_proofs pp
     JOIN users u ON u.id = pp.student_id
     LEFT JOIN programs p ON p.id = u.assigned_program_id
     WHERE pp.student_id = $1
       AND pp.status = 'VERIFIED'
       AND pp.amount > 0
     ORDER BY pp.verified_at DESC NULLS LAST, pp.created_at DESC`,
    [studentId],
  );

  for (const proof of orphanProofs) {
    if (proofIdsWithInvoice.has(proof.id)) continue;
    if (proof.installment_key && keysWithInvoice.has(proof.installment_key)) continue;

    const amount = parseFloat(proof.amount || '0');
    if (amount <= 0) continue;

    const label = INSTALLMENT_LABELS[proof.installment_key] ?? proof.installment_key ?? 'Fee Payment';
    const invoiceNumber = newInvoiceNumber();

    try {
      const { rows: newInv } = await db.query<any>(
        `INSERT INTO invoices (invoice_number, student_id, program_id, amount, payment_proof_id, installment_key, installment_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [invoiceNumber, studentId, proof.program_id, amount, proof.id, proof.installment_key, label],
      );

      if (newInv[0]) {
        rows.push({ ...newInv[0], program_name: proof.program_name });
        proofIdsWithInvoice.add(proof.id);
        if (proof.installment_key) keysWithInvoice.add(proof.installment_key);
      }
    } catch (err) {
      console.error(`[invoices] Backfill failed for proof ${proof.id}:`, err);
    }
  }

  return rows;
}

// ── Admin: generate invoice for a specific verified payment proof ──────────────
// Requires payment_proof_id to prevent cumulative/duplicate invoice creation.
// Auto-generation happens automatically via payment.service.verifyProof(),
// but this endpoint allows admins to manually trigger it if needed.
export async function generateInvoice(req: Request, res: Response) {
  const studentId = req.params.studentId;
  const { payment_proof_id, installment_key } = req.body as {
    payment_proof_id?: string;
    installment_key?: string;
  };

  if (!payment_proof_id && !installment_key) {
    throw new AppError(
      'payment_proof_id or installment_key is required (cumulative invoices are disabled)',
      400,
      'VALIDATION_ERROR',
    );
  }

  if (!payment_proof_id && installment_key) {
    // Admin manual: create one installment invoice from fee amounts without fabricating a proof
    const { rows: feeRows } = await db.query<any>(
      `SELECT sf.*, u.assigned_program_id AS program_id
       FROM student_fees sf
       JOIN users u ON u.id = sf.student_id
       WHERE sf.student_id = $1
       ORDER BY sf.created_at DESC
       LIMIT 1`,
      [studentId],
    );
    if (!feeRows[0]) throw new AppError('Fee record not found', 404, 'NOT_FOUND');
    const fee = feeRows[0];
    const col = FEE_AMOUNT_COLS[installment_key];
    if (!col) throw new AppError('Invalid installment_key', 400, 'VALIDATION_ERROR');
    const amount = parseFloat(fee[col] || '0');
    if (amount <= 0) throw new AppError('Installment amount must be > 0', 400, 'VALIDATION_ERROR');

    const { rows: dup } = await db.query(
      `SELECT id FROM invoices WHERE student_id = $1 AND installment_key = $2 LIMIT 1`,
      [studentId, installment_key],
    );
    if (dup[0]) return res.json({ success: true, data: dup[0] });

    const invoiceNumber = newInvoiceNumber();
    const { rows } = await db.query<any>(
      `INSERT INTO invoices (invoice_number, student_id, program_id, amount, payment_proof_id, installment_key, installment_label)
       VALUES ($1,$2,$3,$4,NULL,$5,$6) RETURNING *`,
      [
        invoiceNumber, studentId, fee.program_id, amount, installment_key,
        INSTALLMENT_LABELS[installment_key] ?? installment_key,
      ],
    );
    return res.status(201).json({ success: true, data: rows[0] });
  }

  // NEW BEHAVIOR: Per-installment invoice when verified by admin
  const { rows: existing } = await db.query<any>(
    `SELECT i.*, p.name AS program_name FROM invoices i
     LEFT JOIN programs p ON p.id = i.program_id
     WHERE i.payment_proof_id = $1 LIMIT 1`,
    [payment_proof_id],
  );
  if (existing[0]) return res.json({ success: true, data: existing[0] });

  const { rows: proofRows } = await db.query<any>(
    `SELECT pp.amount, pp.installment_key, pp.fee_id, u.assigned_program_id AS program_id
     FROM payment_proofs pp
     JOIN users u ON u.id = pp.student_id
     WHERE pp.id = $1 AND pp.student_id = $2 AND pp.status = 'VERIFIED'`,
    [payment_proof_id, studentId],
  );
  if (!proofRows[0]) throw new AppError('Verified proof not found for this student', 404, 'NOT_FOUND');

  const proof = proofRows[0];
  const amount = parseFloat(proof.amount);
  if (amount <= 0) throw new AppError('Proof amount must be > 0', 400, 'VALIDATION_ERROR');

  const installmentLabel = INSTALLMENT_LABELS[proof.installment_key] ?? proof.installment_key;
  const invoiceNumber = newInvoiceNumber();

  const { rows } = await db.query<any>(
    `INSERT INTO invoices (invoice_number, student_id, program_id, amount, payment_proof_id, installment_key, installment_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING *`,
    [invoiceNumber, studentId, proof.program_id, amount, payment_proof_id, proof.installment_key, installmentLabel],
  );
  res.status(201).json({ success: true, data: rows[0] });
}

// ── Student/Intern: list all their invoices ───────────────────────────────────
export async function getStudentInvoices(req: Request, res: Response) {
  const studentId = req.user!.userId;

  const { rows } = await db.query<any>(
    `SELECT i.*, p.name AS program_name
     FROM invoices i
     LEFT JOIN programs p ON p.id = i.program_id
     WHERE i.student_id = $1
     ORDER BY i.created_at DESC`,
    [studentId],
  );

  let data = await backfillMissingInvoices(studentId, rows);
  data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Deduplicate: Keep one invoice per installment_key.
  // If the student has at least one valid installment invoice (due to backfill), we 
  // COMPLETELY discard all legacy invoices (null key, 'Course Fee Payment') to avoid confusion.
  // If they ONLY have legacy invoices, we keep them but deduplicate by amount.
  const uniqueInvoices: any[] = [];
  const seenKeys = new Set<string>();
  const seenAmounts = new Set<string>();
  const hasAnyInstallmentInvoice = data.some((inv: any) => !!inv.installment_key);

  for (const inv of data) {
    if (inv.installment_key) {
      if (!seenKeys.has(inv.installment_key)) {
        seenKeys.add(inv.installment_key);
        uniqueInvoices.push(inv);
      }
    } else {
      if (!hasAnyInstallmentInvoice) {
        const amountStr = parseFloat(inv.amount).toString();
        if (!seenAmounts.has(amountStr)) {
          seenAmounts.add(amountStr);
          uniqueInvoices.push(inv);
        }
      }
    }
  }

  res.json({ success: true, data: uniqueInvoices });
}

// ── Get single invoice details (student, intern, or staff) ────────────────────
export async function getInvoiceDetails(req: Request, res: Response) {
  const { id } = req.params;
  const user = req.user!;

  const { rows } = await db.query<any>(`
    SELECT i.*, p.name AS program_name, u.name AS student_name, u.email AS student_email, u.phone_number
    FROM invoices i
    LEFT JOIN programs p ON p.id = i.program_id
    JOIN users u ON u.id = i.student_id
    WHERE i.id = $1
  `, [id]);

  if (!rows[0]) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const invoice = rows[0];

  const staffRoles = ['SUPER_ADMIN', 'ADMIN', 'FEES_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'];
  const studentRoles = ['STUDENT', 'INTERN'];

  // Students/Interns can only view their own invoices
  if (studentRoles.includes(user.role) && invoice.student_id !== user.userId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  // Other roles must be staff
  if (!studentRoles.includes(user.role) && !staffRoles.includes(user.role)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  // Attach per-payment breakdown using the invoice's own installment_key & amount.
  // This ensures the invoice always matches exactly what was paid at the time.
  invoice.breakdown = {
    installment_key:   invoice.installment_key   ?? null,
    installment_label: invoice.installment_label ?? null,
    paid_amount:       parseFloat(invoice.amount) || 0,
  };

  res.json({ success: true, data: invoice });
}
