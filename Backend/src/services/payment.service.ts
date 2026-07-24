import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter } from '../lib/storage';

// ── Get UPI settings ──────────────────────────────────────────────────────────
export async function getUpiSettings() {
  const { rows } = await db.query<any>(
    `SELECT key, value FROM lms_settings WHERE key IN ('upi_id','upi_name')`,
  );
  const settings: Record<string, string> = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  return {
    upi_id:   settings['upi_id']   ?? '',
    upi_name: settings['upi_name'] ?? 'Vtricks LMS',
  };
}

// ── Update UPI settings ───────────────────────────────────────────────────────
export async function updateUpiSettings(upi_id: string, upi_name: string) {
  await db.query(
    `INSERT INTO lms_settings (key, value) VALUES ('upi_id', $1), ('upi_name', $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [upi_id, upi_name],
  );
  return { upi_id, upi_name };
}

// ── Submit payment proof ──────────────────────────────────────────────────────
export async function submitProof(data: {
  fee_id: string;
  student_id: string;
  installment_key: string;
  amount: number;
  file: { buffer: Buffer; originalname: string; mimetype: string };
  student_upi?: string | null;
  payment_date?: string | null;
}) {
  // Verify fee belongs to student
  const { rows: feeRows } = await db.query<any>(
    `SELECT id FROM student_fees WHERE id = $1 AND student_id = $2`,
    [data.fee_id, data.student_id],
  );
  if (!feeRows[0]) throw new AppError('Fee record not found', 404, 'NOT_FOUND');

  // Upload proof image
  const stored = await storageAdapter.upload(data.file, 'student-submissions/payment-proofs');

  // Delete any existing pending proof for same installment
  await db.query(
    `DELETE FROM payment_proofs WHERE fee_id = $1 AND installment_key = $2 AND status = 'PENDING'`,
    [data.fee_id, data.installment_key],
  );

  const { rows } = await db.query<any>(
    `INSERT INTO payment_proofs (fee_id, student_id, installment_key, amount, proof_path, status, student_upi, payment_date)
     VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7) RETURNING *`,
    [data.fee_id, data.student_id, data.installment_key, data.amount, stored.key, data.student_upi ?? null, data.payment_date ?? null],
  );
  return rows[0];
}

// ── List proofs for a fee record ──────────────────────────────────────────────
export async function listProofs(feeId: string) {
  const { rows } = await db.query<any>(
    `SELECT pp.*, u.name AS student_name, v.name AS verified_by_name
     FROM payment_proofs pp
     JOIN users u ON u.id = pp.student_id
     LEFT JOIN users v ON v.id = pp.verified_by
     WHERE pp.fee_id = $1
     ORDER BY pp.created_at DESC`,
    [feeId],
  );
  // Attach URLs
  return Promise.all(rows.map(async r => ({
    ...r,
    proof_url: r.proof_path ? await storageAdapter.getUrl(r.proof_path) : null,
  })));
}

// ── Get all pending proofs (for fee admin) ────────────────────────────────────
export async function listPendingProofs() {
  const { rows } = await db.query<any>(
    `SELECT pp.*, u.name AS student_name, u.email AS student_email,
            sf.fees_offered
     FROM payment_proofs pp
     JOIN users u ON u.id = pp.student_id
     JOIN student_fees sf ON sf.id = pp.fee_id
     WHERE pp.status = 'PENDING'
     ORDER BY pp.created_at ASC`,
  );
  return Promise.all(rows.map(async r => ({
    ...r,
    proof_url: r.proof_path ? await storageAdapter.getUrl(r.proof_path) : null,
  })));
}

// ── Verify or reject a proof ──────────────────────────────────────────────────
export async function verifyProof(proofId: string, action: 'VERIFIED' | 'REJECTED', verifiedBy: string, note?: string) {
  const { rows: proofRows } = await db.query<any>(
    `SELECT id, student_id, fee_id, installment_key, amount FROM payment_proofs WHERE id = $1`,
    [proofId],
  );
  if (!proofRows[0]) throw new AppError('Proof not found', 404, 'NOT_FOUND');
  const proof = proofRows[0];

  await db.query(
    `UPDATE payment_proofs SET status = $1, verified_by = $2, verified_at = NOW(), note = $3 WHERE id = $4`,
    [action, verifiedBy, note ?? null, proofId],
  );

  // If verified → update the paid amount on the fee record AND auto-generate invoice
  if (action === 'VERIFIED') {
    const colMap: Record<string, string> = {
      registration:  'registration_amount',
      installment1:  'installment1_amount',
      installment2:  'installment2_amount',
      installment3:  'installment3_amount',
    };
    const col = colMap[proof.installment_key];
    if (col) {
      await db.query(
        `UPDATE student_fees SET ${col} = $1, 
         due_amount = COALESCE(fees_offered, 0) - (
           CASE WHEN '${col}' = 'registration_amount' THEN $1::numeric ELSE COALESCE(registration_amount, 0) END +
           CASE WHEN '${col}' = 'installment1_amount' THEN $1::numeric ELSE COALESCE(installment1_amount, 0) END +
           CASE WHEN '${col}' = 'installment2_amount' THEN $1::numeric ELSE COALESCE(installment2_amount, 0) END +
           CASE WHEN '${col}' = 'installment3_amount' THEN $1::numeric ELSE COALESCE(installment3_amount, 0) END
         ),
         updated_at = NOW() WHERE id = $2`,
        [proof.amount, proof.fee_id],
      );

      // ── Auto-generate invoice for this specific verified payment ────────────
      // Dedup guard: skip if an invoice already exists for this proof
      const { rows: existingInv } = await db.query<any>(
        `SELECT id FROM invoices WHERE payment_proof_id = $1 LIMIT 1`,
        [proofId],
      );

      if (!existingInv[0]) {
        // Fetch student program for invoice
        const { rows: studentRows } = await db.query<any>(
          `SELECT u.assigned_program_id FROM users u WHERE u.id = $1`,
          [proof.student_id],
        );
        const programId = studentRows[0]?.assigned_program_id ?? null;

        // Human-readable label for the installment
        const labelMap: Record<string, string> = {
          registration: 'Registration Fee',
          installment1: '1st Installment',
          installment2: '2nd Installment',
          installment3: '3rd Installment',
        };
        const installmentLabel = labelMap[proof.installment_key] ?? proof.installment_key;

        // Generate unique invoice number: INV-YYYYMMDD-XXXXX
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randPart = Math.random().toString(36).substring(2, 7).toUpperCase();
        const invoiceNumber = `INV-${datePart}-${randPart}`;

        await db.query(
          `INSERT INTO invoices
             (invoice_number, student_id, program_id, amount, payment_proof_id, installment_key, installment_label)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [invoiceNumber, proof.student_id, programId, proof.amount, proofId, proof.installment_key, installmentLabel],
        );
      }
    } else {
      console.warn(`[verifyProof] Unknown installment_key "${proof.installment_key}" for proof ${proofId} — skipping fee update and invoice`);
    }
  }


  return { success: true, action };
}

// ── Student: get own proofs ───────────────────────────────────────────────────
export async function getMyProofs(studentId: string) {
  const { rows } = await db.query<any>(
    `SELECT pp.*, sf.fees_offered
     FROM payment_proofs pp
     JOIN student_fees sf ON sf.id = pp.fee_id
     WHERE pp.student_id = $1
     ORDER BY pp.created_at DESC`,
    [studentId],
  );
  return Promise.all(rows.map(async r => ({
    ...r,
    proof_url: r.proof_path ? await storageAdapter.getUrl(r.proof_path) : null,
  })));
}
