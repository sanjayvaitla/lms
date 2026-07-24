import db from '../lib/db';
import { sendWhatsAppTemplate, normalizePhone, sanitizeWaParam } from '../lib/whatsapp';

/** Process WA sends with limited concurrency to avoid Meta rate spikes */
async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

export async function notifyAssessmentPublished(assignmentId: string): Promise<void> {
  const { rows } = await db.query<{
    name: string;
    phone_number: string;
    assignment_title: string;
    course_title: string;
    due_date: Date | null;
    max_score: number | null;
  }>(
    `SELECT DISTINCT
       u.name, u.phone_number,
       a.title     AS assignment_title,
       c.title     AS course_title,
       a.due_date  AS due_date,
       a.max_score AS max_score
     FROM assignment_batches ab
     JOIN batches     b ON b.id = ab.batch_id
     JOIN enrollments e ON e.batch_id = b.id
     JOIN users       u ON u.id = e.student_id
     JOIN assignments a ON a.id = ab.assignment_id
     JOIN courses     c ON c.id = a.course_id
     WHERE ab.assignment_id = $1
       AND u.role = 'STUDENT'
       AND u.phone_number IS NOT NULL
       AND COALESCE(u.account_status, 'ACTIVE') = 'ACTIVE'`,
    [assignmentId],
  );

  await mapPool(rows, 5, async (row) => {
    const phone = normalizePhone(row.phone_number);
    if (!phone) return;
    const dueDate = row.due_date
      ? new Date(row.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'No deadline';
    const maxScore = row.max_score?.toString() ?? 'N/A';
    await sendWhatsAppTemplate({
      to: phone,
      templateName: 'vtricks_assign_release',
      languageCode: 'en',
      fallbackText: `Hi ${row.name}, new assignment "${row.assignment_title}" released in ${row.course_title}. Due: ${dueDate}. Max Marks: ${maxScore}. Login to LMS portal to submit! - Vtricks Technologies`,
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: sanitizeWaParam(row.name) },
          { type: 'text', text: sanitizeWaParam(row.assignment_title) },
          { type: 'text', text: sanitizeWaParam(row.course_title) },
          { type: 'text', text: sanitizeWaParam(dueDate) },
          { type: 'text', text: sanitizeWaParam(maxScore) },
        ],
      }],
    });
  });
}

/** Session marked Done — proactive Meta message (needs approved template). */
export async function notifySessionCompletedWhatsApp(opts: {
  phone: string;
  name: string;
  sessionLabel: string;
  sessionTitle: string;
  courseTitle: string;
  date: string;
}): Promise<void> {
  const phone = normalizePhone(opts.phone);
  if (!phone) return;

  await sendWhatsAppTemplate({
    to: phone,
    templateName: 'vtricks_session_done',
    languageCode: 'en',
    fallbackText: `Hi ${opts.name}, "${opts.sessionLabel}: ${opts.sessionTitle}" in ${opts.courseTitle} is now marked complete. Linked quizzes and assignments (if any) are now available. Check the LMS portal. - Vtricks Technologies`,
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: sanitizeWaParam(opts.name) },
        { type: 'text', text: sanitizeWaParam(opts.sessionLabel) },
        { type: 'text', text: sanitizeWaParam(opts.sessionTitle) },
        { type: 'text', text: sanitizeWaParam(opts.courseTitle) },
        { type: 'text', text: sanitizeWaParam(opts.date) },
      ],
    }],
  });
}

/** Quiz auto-released after session Done. */
export async function notifyQuizReleasedWhatsApp(opts: {
  phone: string;
  name: string;
  quizTitle: string;
  sessionLabel: string;
  courseTitle: string;
}): Promise<void> {
  const phone = normalizePhone(opts.phone);
  if (!phone) return;

  await sendWhatsAppTemplate({
    to: phone,
    templateName: 'vtricks_quiz_release',
    languageCode: 'en',
    fallbackText: `Hi ${opts.name}, quiz "${opts.quizTitle}" for ${opts.sessionLabel} in ${opts.courseTitle} is now live. Attempt it in the LMS portal. - Vtricks Technologies`,
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: sanitizeWaParam(opts.name) },
        { type: 'text', text: sanitizeWaParam(opts.quizTitle) },
        { type: 'text', text: sanitizeWaParam(opts.sessionLabel) },
        { type: 'text', text: sanitizeWaParam(opts.courseTitle) },
      ],
    }],
  });
}

// ── Installment payment confirmations ─────────────────────────────────────────

export async function notifyInstallmentPayment(opts: {
  installmentType: 'first' | 'second' | 'final';
  phone: string;
  name: string;
  programName: string;
  amount: number;
  date: string;
  balance: number;
  totalPaid?: number;
}): Promise<void> {
  const phone = normalizePhone(opts.phone);
  if (!phone) return;

  const fmt = (n: number) => Number(n).toLocaleString('en-IN');

  const templateMap = {
    first:  'vtricks_inst1_confirm',
    second: 'vtricks_inst2_confirm',
    final:  'vtricks_inst_final',
  };

  const fallbackMap = {
    first:  `Hi ${opts.name}, your 1st Installment of ₹${fmt(opts.amount)} for ${opts.programName} received on ${opts.date}. Remaining Balance: ₹${fmt(opts.balance)}. Thank you! - Vtricks Technologies`,
    second: `Hi ${opts.name}, your 2nd Installment of ₹${fmt(opts.amount)} for ${opts.programName} received on ${opts.date}. Remaining Balance: ₹${fmt(opts.balance)}. Keep Learning! - Vtricks Technologies`,
    final:  `Hi ${opts.name}, your Final Installment of ₹${fmt(opts.amount)} for ${opts.programName} received on ${opts.date}. Total Paid: ₹${fmt(opts.totalPaid ?? opts.amount)}. Fee fully cleared! - Vtricks Technologies`,
  };

  const lastParam = opts.installmentType === 'final'
    ? { type: 'text', text: sanitizeWaParam(fmt(opts.totalPaid ?? opts.amount)) }
    : { type: 'text', text: sanitizeWaParam(fmt(opts.balance)) };

  await sendWhatsAppTemplate({
    to: phone,
    templateName: templateMap[opts.installmentType],
    languageCode: 'en',
    fallbackText: fallbackMap[opts.installmentType],
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: sanitizeWaParam(opts.name) },
        { type: 'text', text: sanitizeWaParam(fmt(opts.amount)) },
        { type: 'text', text: sanitizeWaParam(opts.programName) },
        { type: 'text', text: sanitizeWaParam(opts.date) },
        lastParam,
      ],
    }],
  });
}

// ── Assignment evaluation result ───────────────────────────────────────────────

export async function notifyAssignmentEvaluation(opts: {
  phone: string;
  name: string;
  assignmentTitle: string;
  courseName: string;
  score: string;
  maxScore: string;
  date: string;
  feedback: string;
}): Promise<void> {
  const phone = normalizePhone(opts.phone);
  if (!phone) return;

  await sendWhatsAppTemplate({
    to: phone,
    templateName: 'vtricks_assign_result',
    languageCode: 'en',
    fallbackText: `Hi ${opts.name}, your assignment "${opts.assignmentTitle}" (${opts.courseName}) evaluated. Score: ${opts.score}/${opts.maxScore}. Feedback: ${opts.feedback.substring(0, 150)}. - Vtricks Technologies`,
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: sanitizeWaParam(opts.name) },
        { type: 'text', text: sanitizeWaParam(opts.assignmentTitle) },
        { type: 'text', text: sanitizeWaParam(opts.courseName) },
        { type: 'text', text: sanitizeWaParam(opts.score) },
        { type: 'text', text: sanitizeWaParam(opts.maxScore) },
        { type: 'text', text: sanitizeWaParam(opts.date) },
        { type: 'text', text: sanitizeWaParam(opts.feedback.substring(0, 200)) },
      ],
    }],
  });
}

// ── Assignment deadline reminder (used by cron) ───────────────────────────────

export async function notifyAssignmentReminder(opts: {
  phone: string;
  name: string;
  assignmentTitle: string;
  courseName: string;
  deadline: string;
  daysRemaining: string;
}): Promise<void> {
  const phone = normalizePhone(opts.phone);
  if (!phone) return;

  await sendWhatsAppTemplate({
    to: phone,
    templateName: 'vtricks_assign_reminder',
    languageCode: 'en',
    fallbackText: `Hi ${opts.name}, reminder: assignment "${opts.assignmentTitle}" for ${opts.courseName} due on ${opts.deadline} (${opts.daysRemaining} days remaining). Submit on time! - Vtricks Technologies`,
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: sanitizeWaParam(opts.name) },
        { type: 'text', text: sanitizeWaParam(opts.assignmentTitle) },
        { type: 'text', text: sanitizeWaParam(opts.courseName) },
        { type: 'text', text: sanitizeWaParam(opts.deadline) },
        { type: 'text', text: sanitizeWaParam(opts.daysRemaining) },
      ],
    }],
  });
}

// ── Monthly / weekly reminders ───────────────────────────────────────────────

export async function notifyPendingInstallments(): Promise<void> {
  const { rows } = await db.query<{
    name: string;
    phone_number: string;
    course_title: string;
    pending_count: number;
    pending_amount: number;
  }>(
    `SELECT
       u.name, u.phone_number,
       c.title AS course_title,
       COUNT(fp.id)::int                                         AS pending_count,
       COALESCE(SUM(fp.amount_due - fp.amount_paid), 0)::float  AS pending_amount
     FROM fee_payments fp
     JOIN users          u  ON u.id  = fp.student_id
     JOIN fee_structures fs ON fs.id = fp.fee_structure_id
     JOIN courses        c  ON c.id  = fs.course_id
     WHERE fp.status IN ('PENDING', 'PARTIAL', 'OVERDUE')
       AND u.phone_number IS NOT NULL
       AND u.role = 'STUDENT'
       AND COALESCE(u.account_status, 'ACTIVE') = 'ACTIVE'
     GROUP BY u.id, u.name, u.phone_number, c.title
     HAVING COUNT(fp.id) > 0`,
  );

  await mapPool(rows, 5, async (row) => {
    const phone = normalizePhone(row.phone_number);
    if (!phone) return;
    const amount = `₹${Number(row.pending_amount).toLocaleString('en-IN')}`;
    await sendWhatsAppTemplate({
      to: phone,
      templateName: 'vtricks_fee_reminder',
      languageCode: 'en',
      fallbackText: `Hi ${row.name}, you have ${row.pending_count} pending installment(s) totalling ${amount} for ${row.course_title}. Please clear your dues to avoid interruption. - Vtricks Technologies`,
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: sanitizeWaParam(row.name) },
          { type: 'text', text: sanitizeWaParam(String(row.pending_count)) },
          { type: 'text', text: sanitizeWaParam(amount) },
          { type: 'text', text: sanitizeWaParam(row.course_title) },
        ],
      }],
    });
  });

  console.log(`[whatsapp] Monthly installment reminder sent to ${rows.length} student(s)`);
}

export async function notifyWeeklyAssignments(): Promise<void> {
  const { rows } = await db.query<{
    name: string;
    phone_number: string;
    assignment_count: number;
  }>(
    `SELECT
       u.name, u.phone_number,
       COUNT(DISTINCT a.id)::int AS assignment_count
     FROM enrollments      e
     JOIN users            u  ON u.id  = e.student_id
     JOIN batches          b  ON b.id  = e.batch_id
     JOIN assignment_batches ab ON ab.batch_id = b.id
     JOIN assignments      a  ON a.id  = ab.assignment_id AND a.status = 'PUBLISHED'
     LEFT JOIN assignment_submissions s
       ON s.assignment_id = a.id AND s.student_id = u.id
     WHERE s.id IS NULL
       AND u.phone_number IS NOT NULL
       AND u.role = 'STUDENT'
       AND COALESCE(u.account_status, 'ACTIVE') = 'ACTIVE'
     GROUP BY u.id, u.name, u.phone_number
     HAVING COUNT(DISTINCT a.id) > 0`,
  );

  await mapPool(rows, 5, async (row) => {
    const phone = normalizePhone(row.phone_number);
    if (!phone) return;
    await sendWhatsAppTemplate({
      to: phone,
      templateName: 'vtricks_weekly_assign',
      languageCode: 'en',
      fallbackText: `Hi ${row.name}, you have ${row.assignment_count} pending assignment(s) this week. Login to LMS portal and submit before the deadline! - Vtricks Technologies`,
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: sanitizeWaParam(row.name) },
          { type: 'text', text: sanitizeWaParam(String(row.assignment_count)) },
        ],
      }],
    });
  });

  console.log(`[whatsapp] Weekly assignment reminder sent to ${rows.length} student(s)`);
}
