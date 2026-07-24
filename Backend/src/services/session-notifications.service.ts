import db from '../lib/db';
import { sendEmail, assignmentReleaseEmail, sessionCompleteEmail } from '../lib/email';
import {
  notifyAssessmentPublished,
  notifySessionCompletedWhatsApp,
  notifyQuizReleasedWhatsApp,
} from './whatsapp-notifications.service';

/** Notify enrolled students that a session was marked complete (optional batch scope). */
export async function notifySessionCompleted(moduleId: string, batchId?: string) {
  const { rows: modRows } = await db.query<{
    title: string;
    session_number: string | null;
    section: string | null;
    course_title: string;
  }>(
    `SELECT m.title, m.session_number, m.section, c.title AS course_title
     FROM course_modules m
     JOIN courses c ON c.id = m.course_id
     WHERE m.id = $1`,
    [moduleId],
  );
  const mod = modRows[0];
  if (!mod) return;

  const sessionLabel = mod.session_number
    ? `Session ${mod.session_number}${mod.section ? ` (${mod.section})` : ''}`
    : mod.title;

  const batchFilter = batchId ? 'AND e.batch_id = $2' : '';
  const params: unknown[] = batchId ? [moduleId, batchId] : [moduleId];

  const { rows: students } = await db.query<{
    name: string;
    email: string | null;
    phone_number: string | null;
    program_name: string | null;
  }>(
    `SELECT DISTINCT u.name, u.email, u.phone_number, p.name AS program_name
     FROM course_modules cm
     JOIN batch_courses bc ON bc.course_id = cm.course_id
     JOIN enrollments e ON e.batch_id = bc.batch_id
     JOIN users u ON u.id = e.student_id
     LEFT JOIN programs p ON p.id = u.assigned_program_id
     WHERE cm.id = $1 AND u.role = 'STUDENT'
       AND COALESCE(u.account_status, 'ACTIVE') = 'ACTIVE' ${batchFilter}`,
    params,
  );

  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

  for (const s of students) {
    if (s.email) {
      const opts = sessionCompleteEmail(
        s.name,
        s.program_name ?? 'your program',
        mod.course_title,
        sessionLabel,
        mod.title,
        today,
      );
      opts.to = s.email;
      sendEmail(opts).catch((err) =>
        console.error('[email] session complete notify failed:', s.email, err),
      );
    }

    if (s.phone_number) {
      notifySessionCompletedWhatsApp({
        phone: s.phone_number,
        name: s.name,
        sessionLabel,
        sessionTitle: mod.title,
        courseTitle: mod.course_title,
        date: today,
      }).catch((err) =>
        console.error('[whatsapp] session complete notify failed:', s.phone_number, err),
      );
    }
  }
}

/** Email + WhatsApp for already-published assignment IDs (no status change). */
export async function notifyAssignmentsReleased(assignmentIds: string[]): Promise<void> {
  if (!assignmentIds.length) return;

  for (const id of assignmentIds) {
    notifyAssessmentPublished(id).catch(console.error);

    const { rows: assignmentRows } = await db.query<{
      title: string;
      course_title: string;
      due_date: Date | null;
      max_score: number;
    }>(
      `SELECT a.title, c.title AS course_title, a.due_date, a.max_score
       FROM assignments a JOIN courses c ON c.id = a.course_id WHERE a.id = $1`,
      [id],
    );
    const assignment = assignmentRows[0];
    if (!assignment) continue;

    const { rows: batchRows } = await db.query<{ batch_id: string }>(
      `SELECT batch_id FROM assignment_batches WHERE assignment_id = $1`,
      [id],
    );

    const releaseDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const submissionDeadline = assignment.due_date
      ? new Date(assignment.due_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
      : 'Not Set';

    for (const { batch_id } of batchRows) {
      const { rows: students } = await db.query<{
        email: string;
        name: string;
        program_name: string | null;
      }>(
        `SELECT u.email, u.name, p.name AS program_name
         FROM enrollments e
         JOIN users u ON e.student_id = u.id
         LEFT JOIN programs p ON p.id = u.assigned_program_id
         WHERE e.batch_id = $1 AND u.email IS NOT NULL`,
        [batch_id],
      );

      for (const student of students) {
        const emailOpts = assignmentReleaseEmail(
          student.name,
          student.program_name ?? 'your program',
          assignment.title,
          assignment.course_title,
          releaseDate,
          submissionDeadline,
          assignment.max_score,
        );
        emailOpts.to = student.email;
        sendEmail(emailOpts).catch((err) =>
          console.error('[email] assignment auto-release failed:', student.email, err),
        );
      }
    }
  }
}

/** Email + WhatsApp for already-activated quiz IDs (no status change). */
export async function notifyQuizzesReleased(
  moduleId: string,
  quizIds: string[],
  batchId?: string,
): Promise<void> {
  if (!quizIds.length) return;

  const { rows: quizzes } = await db.query<{
    id: string;
    title: string;
    course_title: string;
  }>(
    `SELECT q.id, q.title, c.title AS course_title
     FROM quizzes q
     JOIN courses c ON c.id = q.course_id
     WHERE q.id = ANY($1::uuid[])`,
    [quizIds],
  );
  if (!quizzes.length) return;

  const { rows: modRows } = await db.query<{
    title: string;
    session_number: string | null;
  }>(
    `SELECT title, session_number FROM course_modules WHERE id = $1`,
    [moduleId],
  );
  const mod = modRows[0];
  const sessionLabel = mod?.session_number
    ? `Session ${mod.session_number}`
    : mod?.title ?? 'Session';

  const batchFilter = batchId ? 'AND e.batch_id = $2' : '';
  const params: unknown[] = batchId ? [moduleId, batchId] : [moduleId];

  const { rows: students } = await db.query<{
    name: string;
    email: string | null;
    phone_number: string | null;
  }>(
    `SELECT DISTINCT u.name, u.email, u.phone_number
     FROM course_modules cm
     JOIN batch_courses bc ON bc.course_id = cm.course_id
     JOIN enrollments e ON e.batch_id = bc.batch_id
     JOIN users u ON u.id = e.student_id
     WHERE cm.id = $1 AND u.role = 'STUDENT'
       AND COALESCE(u.account_status, 'ACTIVE') = 'ACTIVE' ${batchFilter}`,
    params,
  );

  for (const quiz of quizzes) {
    for (const s of students) {
      if (s.email) {
        sendEmail({
          to: s.email,
          subject: `Quiz Released - ${quiz.title} | ${quiz.course_title}`,
          html: `
<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f4f6f9;padding:40px;">
  <table width="560" style="margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:linear-gradient(135deg,#5b21b6,#7c3aed);padding:28px 40px;color:#fff;">
      <p style="margin:0;font-size:18px;font-weight:600;">Quiz Released</p>
      <p style="margin:4px 0 0;opacity:.8;font-size:13px;">${quiz.course_title}</p>
    </td></tr>
    <tr><td style="padding:32px 40px;color:#64748b;font-size:15px;line-height:1.6;">
      <p>Dear <strong>${s.name}</strong>,</p>
      <p>A new quiz <strong>"${quiz.title}"</strong> is now available after ${sessionLabel} was completed.</p>
      <p>Log in to the LMS portal to attempt it.</p>
    </td></tr>
  </table>
</body></html>`,
        }).catch((err) => console.error('[email] quiz auto-release failed:', s.email, err));
      }

      if (s.phone_number) {
        notifyQuizReleasedWhatsApp({
          phone: s.phone_number,
          name: s.name,
          quizTitle: quiz.title,
          sessionLabel,
          courseTitle: quiz.course_title,
        }).catch((err) => console.error('[whatsapp] quiz auto-release failed:', s.phone_number, err));
      }
    }
  }
}

/** Publish DRAFT assignments linked to a module and notify students. */
export async function releaseDraftAssignmentsForModule(moduleId: string): Promise<string[]> {
  const { rows: drafts } = await db.query<{ id: string }>(
    `SELECT id FROM assignments
     WHERE module_id = $1 AND status = 'DRAFT' AND pdf_path IS DISTINCT FROM 'git-task'`,
    [moduleId],
  );
  if (!drafts.length) return [];

  const releasedIds = drafts.map((d) => d.id);
  await db.query(
    `UPDATE assignments SET status = 'PUBLISHED', updated_at = NOW()
     WHERE id = ANY($1::uuid[]) AND status = 'DRAFT'`,
    [releasedIds],
  );
  await notifyAssignmentsReleased(releasedIds);
  return releasedIds;
}

/** Activate DRAFT quizzes linked to a module and notify students (email + WhatsApp). */
export async function activateDraftQuizzesForModule(
  moduleId: string,
  batchId?: string,
): Promise<string[]> {
  const { rows: drafts } = await db.query<{ id: string }>(
    `SELECT id FROM quizzes WHERE module_id = $1 AND status = 'DRAFT'`,
    [moduleId],
  );
  if (!drafts.length) return [];

  const releasedIds = drafts.map((d) => d.id);
  await db.query(
    `UPDATE quizzes SET status = 'ACTIVE', updated_at = NOW()
     WHERE id = ANY($1::uuid[]) AND status = 'DRAFT'`,
    [releasedIds],
  );
  await notifyQuizzesReleased(moduleId, releasedIds, batchId);
  return releasedIds;
}
