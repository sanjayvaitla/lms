import { Request, Response } from 'express';
import { GithubService } from '../services/github.service';
import { normalizeGithubRepoUrl } from '../services/intern-push-processor.service';
import { User } from '../models/User';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { AttendanceSession } from '../models/AttendanceSession';
import { Enrollment } from '../models/Enrollment';
import { Op } from 'sequelize';
import moment from 'moment-timezone';
import crypto from 'crypto';
import db from '../lib/db';

export class GithubWebhookController {
  static async handleWebhook(req: Request, res: Response) {
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const payload = rawBody ? rawBody.toString('utf8') : JSON.stringify(req.body);

    if (!GithubService.verifyWebhookSignature(payload, signature)) {
      return res.status(401).send('Invalid signature');
    }

    const event = req.headers['x-github-event'];

    if (event === 'push') {
      const pusherName = req.body.pusher?.name;
      const headCommitSha = req.body.head_commit?.id as string | undefined;
      const repoUrl = normalizeGithubRepoUrl(req.body.repository?.html_url ?? '');

      if (!pusherName || !repoUrl) return res.status(200).send('OK');

      const user = await User.findOne({ where: { githubUsername: pusherName } });
      if (!user) return res.status(200).send('OK');

      const { rows: submissions } = await db.query<{ id: string }>(`
        SELECT id FROM assignment_submissions
        WHERE student_id = $1
          AND (
            github_fork_url = $2
            OR github_fork_url = $2 || '.git'
            OR REPLACE(REPLACE(github_fork_url, '.git', ''), '/', '') = REPLACE(REPLACE($2, '.git', ''), '/', '')
          )
        LIMIT 1
      `, [user.id, repoUrl]);

      if (submissions.length && headCommitSha) {
        await db.query(
          `UPDATE assignment_submissions SET github_latest_commit_sha = $1 WHERE id = $2`,
          [headCommitSha, submissions[0].id],
        );
      }

      try {
        await db.query(`
          UPDATE intern_task_progress
          SET commit_count = commit_count + 1, last_push_at = NOW(), status = CASE WHEN status = 'FORKED' THEN 'CODING' ELSE status END
          WHERE student_id = $1 AND (
            fork_url = $2
            OR fork_url = $2 || '.git'
            OR REPLACE(REPLACE(fork_url, '.git', ''), '/', '') = REPLACE(REPLACE($2, '.git', ''), '/', '')
          )
        `, [user.id, repoUrl]);
      } catch (err) {
        console.error('Error updating intern_task_progress from webhook:', err);
      }

      // Automatically mark attendance for today
      try {
        await GithubWebhookController.markAttendance(user.id);
      } catch (e) {
        console.error('Error marking attendance via webhook:', e);
      }
    }

    res.status(200).send('OK');
  }

  static async markAttendance(studentId: string) {
    const { rows: [alloc] } = await db.query<any>(
      `SELECT program_id, batch_id FROM intern_allocations WHERE student_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
      [studentId]
    );
    if (alloc) {
      const todayStr = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
      await db.query(`
        INSERT INTO intern_attendance (student_id, program_id, batch_id, session_date, status, notes)
        VALUES ($1, $2, $3, $4, 'PRESENT', 'Automated via GitHub Activity')
        ON CONFLICT (student_id, program_id, session_date)
        DO UPDATE SET status = 'PRESENT', notes = 'Automated via GitHub Activity'
      `, [studentId, alloc.program_id, alloc.batch_id, todayStr]);
    }

    const today = moment().tz('Asia/Kolkata').startOf('day').toDate();
    const tomorrow = moment().tz('Asia/Kolkata').endOf('day').toDate();

    const enrollments = await Enrollment.findAll({ where: { studentId } });
    const batchIds = enrollments.map(e => e.batchId).filter(Boolean);

    if (batchIds.length === 0) return;

    const session = await AttendanceSession.findOne({
      where: {
        batchId: { [Op.in]: batchIds },
        sessionDate: moment(today).format('YYYY-MM-DD')
      }
    });

    if (session) {
      const [record, created] = await AttendanceRecord.findOrCreate({
        where: { sessionId: session.id, studentId },
        defaults: {
          id: crypto.randomUUID(),
          sessionId: session.id,
          studentId: studentId,
          status: 'PRESENT',
          remarks: 'Automated via GitHub Activity'
        }
      });

      if (!created && record.status !== 'PRESENT') {
        record.status = 'PRESENT';
        record.remarks = 'Automated via GitHub Activity';
        await record.save();
      }
    }
  }
}
