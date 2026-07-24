import cron from 'node-cron';
import db from '../lib/db';
import { parseGithubRepoFromUrl } from './intern-push-processor.service';
import { fetchLatestCommit, hasGithubToken, semaphore } from './github-poll.util';
import { aiGradeSubmission } from './ai-grader.service';

const LOG = '[assignment-poller]';
const MAX_CONCURRENT = 5;

async function processAssignmentPush(submissionId: string, sha: string): Promise<void> {
  await db.query(`
    UPDATE assignment_submissions
    SET github_latest_commit_sha = $1,
        status = CASE WHEN status = 'IN_PROGRESS' THEN 'SUBMITTED' ELSE status END,
        submitted_at = CASE WHEN status = 'IN_PROGRESS' THEN NOW() ELSE submitted_at END
    WHERE id = $2
  `, [sha, submissionId]);

  console.log(`${LOG} New commit detected — auto-grading submission ${submissionId} sha=${sha.slice(0, 7)}`);

  aiGradeSubmission(submissionId).catch(err =>
    console.error(`${LOG} Auto-grade failed for ${submissionId}:`, err?.message),
  );
}

async function pollAllAssignmentForks(): Promise<void> {
  if (!hasGithubToken()) {
    console.warn(`${LOG} GITHUB_TOKEN not set — assignment polling disabled`);
    return;
  }

  const { rows } = await db.query<any>(`
    SELECT
      s.id              AS "submissionId",
      s.github_fork_url AS "forkUrl",
      s.github_latest_commit_sha AS "lastCommitSha",
      s.status,
      u.name            AS "studentName"
    FROM assignment_submissions s
    JOIN assignments a ON a.id = s.assignment_id AND a.pdf_path = 'git-task'
    JOIN users u ON u.id = s.student_id
    WHERE s.github_fork_url IS NOT NULL
      AND s.github_fork_url <> ''
      AND s.status IN ('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'LATE')
    ORDER BY s.submitted_at ASC
    LIMIT 200
  `);

  if (rows.length === 0) return;
  console.log(`${LOG} Polling ${rows.length} fork(s)…`);

  const sem = semaphore(MAX_CONCURRENT);
  const tasks = rows.map(async (row: any) => {
    await sem.acquire();
    try {
      const parsed = parseGithubRepoFromUrl(row.forkUrl);
      if (!parsed) {
        console.warn(`${LOG} Cannot parse fork URL: ${row.forkUrl}`);
        return;
      }

      const latest = await fetchLatestCommit(parsed.owner, parsed.repo, LOG);
      if (!latest) return;

      if (latest.sha === row.lastCommitSha) return;

      console.log(
        `${LOG} New commit for ${row.studentName} ` +
        `(${parsed.owner}/${parsed.repo}): sha=${latest.sha.slice(0, 7)}`,
      );

      await processAssignmentPush(row.submissionId, latest.sha);
    } catch (err: any) {
      console.error(`${LOG} Failed for submission ${row.submissionId}:`, err?.message);
    } finally {
      sem.release();
    }
  });

  await Promise.allSettled(tasks);
  console.log(`${LOG} Poll cycle complete.`);
}

let pollerStarted = false;

export function startAssignmentCommitPoller(): void {
  if (pollerStarted) return;
  pollerStarted = true;

  if (!hasGithubToken()) {
    console.warn(`${LOG} GITHUB_TOKEN not set — assignment commit poller will not start.`);
    return;
  }

  pollAllAssignmentForks().catch(err => console.error(`${LOG} Initial poll failed:`, err));

  cron.schedule('*/2 * * * *', () => {
    pollAllAssignmentForks().catch(err => console.error(`${LOG} Poll cycle failed:`, err));
  });

  console.log(`${LOG} Started — polling GitHub assignment forks every 2 minutes.`);
}
