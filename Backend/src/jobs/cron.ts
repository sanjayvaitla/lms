import cron from 'node-cron';
import db from '../lib/db';
import { sendEmail, assignmentReminderEmail } from '../lib/email';
import { notifyAssignmentReminder } from '../services/whatsapp-notifications.service';
import { initLogCleanupJob } from './logCleanup';
import { startAnalyticsJob } from './analytics.job';

export function startCronJobs() {
  // Run every hour to check for assignments due in exactly 24 hours
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[cron] Checking for assignments due in 24 hours...');

      // Find assignments exactly 24 hours away from due_date
      const { rows } = await db.query(
        `SELECT a.id, a.title, a.due_date, c.title AS "courseTitle"
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         WHERE a.status = 'PUBLISHED'
           AND a.due_date IS NOT NULL
           AND a.due_date > NOW() + INTERVAL '23 hours'
           AND a.due_date <= NOW() + INTERVAL '24 hours'`
      );

      for (const assignment of rows) {
        // Get all batches for this assignment
        const batches = await db.query(
          `SELECT batch_id FROM assignment_batches WHERE assignment_id = $1`,
          [assignment.id]
        );

        for (const b of batches.rows) {
          // Get students in this batch who haven't submitted yet
          const students = await db.query(
            `SELECT u.email, u.name, u.phone_number
             FROM enrollments e
             JOIN users u ON e.student_id = u.id
             WHERE e.batch_id = $1
               AND u.id NOT IN (
                 SELECT student_id FROM assignment_submissions
                 WHERE assignment_id = $2
               )`,
            [b.batch_id, assignment.id]
          );

          for (const student of students.rows) {
            const deadlineStr = new Date(assignment.due_date).toLocaleString('en-IN');
            if (student.email) {
              const emailOpts = assignmentReminderEmail(
                student.name,
                assignment.title,
                assignment.courseTitle,
                deadlineStr,
                '1 Day'
              );
              emailOpts.to = student.email;
              await sendEmail(emailOpts);
            }
            if (student.phone_number) {
              notifyAssignmentReminder({
                phone: student.phone_number,
                name: student.name,
                assignmentTitle: assignment.title,
                courseName: assignment.courseTitle,
                deadline: deadlineStr,
                daysRemaining: '1',
              }).catch(err => console.error('[cron] WhatsApp reminder failed:', err));
            }
          }
        }
      }

      // Check coding assignments due in 24 hours
      const codingRes = await db.query(
        `SELECT c.id, c.problem_id, c.batch_id, c.due_date, p.title 
         FROM coding_assignments c
         JOIN coding_problems p ON p.id = c.problem_id
         WHERE c.due_date IS NOT NULL
           AND c.due_date > NOW() + INTERVAL '23 hours'
           AND c.due_date <= NOW() + INTERVAL '24 hours'`
      );

      for (const coding of codingRes.rows) {
        // Get students in this batch who haven't submitted (we check coding_submissions)
        const students = await db.query(
          `SELECT u.email, u.name 
           FROM enrollments e
           JOIN users u ON e.student_id = u.id
           WHERE e.batch_id = $1
             AND u.id NOT IN (
               SELECT user_id FROM coding_submissions 
               WHERE problem_id = $2
             )`,
          [coding.batch_id, coding.problem_id]
        );

        for (const student of students.rows) {
          if (student.email) {
            const deadlineStr = new Date(coding.due_date).toLocaleString('en-IN');
            const emailOpts = assignmentReminderEmail(
              student.name,
              coding.title,
              'Coding Assessment',
              deadlineStr,
              '1 Day'
            );
            emailOpts.to = student.email;
            await sendEmail(emailOpts);
          }
        }
      }

    } catch (err) {
      console.error('[cron] Error running assignment reminder job', err);
    }
  });

  // Run every minute to close expired assessments
  cron.schedule('* * * * *', async () => {
    try {
      const { rowCount } = await db.query(
        `UPDATE assessments 
         SET status = 'CLOSED' 
         WHERE status = 'PUBLISHED' 
           AND due_date IS NOT NULL 
           AND due_date <= NOW()`
      );
      if (rowCount && rowCount > 0) {
        console.log(`[cron] Closed ${rowCount} expired assessments.`);
      }
    } catch (err) {
      console.error('[cron] Error closing expired assessments', err);
    }
  });

  // Initialize activity log cleanup job
  initLogCleanupJob();
  
  // Initialize Daily Analytics Rollup job
  startAnalyticsJob();

  console.log('[cron] Jobs scheduled.');
}
