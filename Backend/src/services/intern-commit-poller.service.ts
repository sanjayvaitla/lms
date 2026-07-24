import cron from 'node-cron';
import db from '../lib/db';
import {
  processPushForFork,
  parseGithubRepoFromUrl,
} from './intern-push-processor.service';
import {
  fetchLatestCommit,
  fetchCommitDelta,
  hasGithubToken,
  semaphore,
} from './github-poll.util';

const LOG = '[intern-poller]';
const MAX_CONCURRENT = 5;

async function pollAllForks(): Promise<void> {
  if (!hasGithubToken()) {
    console.warn(`${LOG} GITHUB_TOKEN not set — commit polling disabled`);
    return;
  }

  const { rows } = await db.query<any>(`
    SELECT
      p.id,
      p.student_id    AS "studentId",
      p.task_id       AS "taskId",
      p.fork_url      AS "forkUrl",
      p.status,
      p.last_push_sha AS "lastPushSha",
      p.commit_count  AS "commitCount",
      u.name          AS "studentName",
      u.github_username AS "githubUsername"
    FROM intern_task_progress p
    JOIN users u ON u.id = p.student_id
    WHERE p.fork_url IS NOT NULL
      AND p.fork_url <> ''
      AND p.status IN ('FORKED', 'CODING', 'SUBMITTED', 'AI_GRADED')
    ORDER BY p.updated_at ASC
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

      if (latest.sha === row.lastPushSha) return;

      const commitDelta = await fetchCommitDelta(
        parsed.owner,
        parsed.repo,
        row.lastPushSha ?? null,
        latest.sha,
        latest.defaultBranch,
      );

      console.log(
        `${LOG} New commit(s) for ${row.studentName} ` +
        `(${parsed.owner}/${parsed.repo}): sha=${latest.sha.slice(0, 7)} delta=+${commitDelta}`,
      );

      await processPushForFork({
        studentId:     row.studentId,
        taskId:        row.taskId,
        repoOwner:     parsed.owner,
        repoName:      parsed.repo,
        repoHtmlUrl:   row.forkUrl,
        sha:           latest.sha,
        ref:           latest.ref,
        commitMessage: latest.message,
        pusherLogin:   row.githubUsername ?? parsed.owner,
        source:        'poller',
        commitDelta,
      });
    } catch (err: any) {
      console.error(`${LOG} Failed for student ${row.studentId} fork ${row.forkUrl}:`, err?.message);
    } finally {
      sem.release();
    }
  });

  await Promise.allSettled(tasks);
  console.log(`${LOG} Poll cycle complete.`);
}

let pollerStarted = false;

export function startInternCommitPoller(): void {
  if (pollerStarted) return;
  pollerStarted = true;

  if (!hasGithubToken()) {
    console.warn(`${LOG} GITHUB_TOKEN not set — commit poller will not start.`);
    console.warn(`${LOG} Set GITHUB_TOKEN in .env to enable automatic push detection.`);
    return;
  }

  pollAllForks().catch(err => console.error(`${LOG} Initial poll failed:`, err));

  cron.schedule('*/5 * * * *', () => {
    pollAllForks().catch(err => console.error(`${LOG} Poll cycle failed:`, err));
  });

  console.log(`${LOG} Started — polling GitHub commit SHAs every 5 minutes.`);
}

export async function pollSingleFork(
  studentId: string,
  taskId: string,
  forceRegrade = false,
): Promise<{ detected: boolean; sha?: string; message?: string }> {
  const { rows: [row] } = await db.query<any>(`
    SELECT
      p.fork_url      AS "forkUrl",
      p.last_push_sha AS "lastPushSha",
      p.status,
      u.github_username AS "githubUsername"
    FROM intern_task_progress p
    JOIN users u ON u.id = p.student_id
    WHERE p.student_id = $1 AND p.task_id = $2
  `, [studentId, taskId]);

  if (!row?.forkUrl) return { detected: false, message: 'No fork URL set for this student/task' };

  const parsed = parseGithubRepoFromUrl(row.forkUrl);
  if (!parsed) return { detected: false, message: 'Could not parse fork URL' };

  const latest = await fetchLatestCommit(parsed.owner, parsed.repo, LOG);
  if (!latest) return { detected: false, message: 'Could not reach GitHub API — check PAT access' };

  if (latest.sha === row.lastPushSha && !forceRegrade) {
    return { detected: false, sha: latest.sha, message: 'Already processed this commit — no new pushes detected' };
  }

  if (forceRegrade && latest.sha === row.lastPushSha) {
    await db.query(
      `UPDATE intern_task_progress SET last_push_sha = NULL WHERE student_id = $1 AND task_id = $2`,
      [studentId, taskId],
    ).catch(() => {});
  }

  const commitDelta = await fetchCommitDelta(
    parsed.owner, parsed.repo, row.lastPushSha ?? null, latest.sha, latest.defaultBranch,
  );

  await processPushForFork({
    studentId,
    taskId,
    repoOwner:     parsed.owner,
    repoName:      parsed.repo,
    repoHtmlUrl:   row.forkUrl,
    sha:           latest.sha,
    ref:           latest.ref,
    commitMessage: latest.message,
    pusherLogin:   row.githubUsername ?? parsed.owner,
    source:        'admin-scan',
    commitDelta,
  });

  return { detected: true, sha: latest.sha };
}
