import axios from 'axios';
import db from '../lib/db';
import { aiGradeInternTask } from './ai-grader.service';
import { AppError } from '../middleware/error.middleware';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';

// ── URL helpers ─────────────────────────────────────────────────────────────────

export function normalizeGithubRepoUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== 'github.com') return url.trim().replace(/\.git$/, '').replace(/\/$/, '');
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (parts.length >= 2) return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    // fall through
  }
  return url.trim().replace(/\.git$/, '').replace(/\/$/, '');
}

export function parseGithubRepoFromUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

// ── GitHub API headers ─────────────────────────────────────────────────────────

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

/** Headers for fetching raw file content from the GitHub API (works for PRIVATE repos). */
function githubRawHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.raw+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

const BINARY_RE = /\.(png|jpe?g|gif|webp|pdf|pptx?|xlsx?|zip|7z|rar|mp4|mov|woff2?|ttf|eot|ico|svg)$/i;
const CODE_RE = /\.(js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|sql|html|css|json|md|txt|yml|yaml|env|sh|rb|php)$/i;

/**
 * Fetch raw file content from GitHub using the API (works for both public AND private repos).
 * Tries raw_url first (fast for public repos), falls back to contents API (works for private).
 */
async function fetchFileContent(rawUrl: string, contentsUrl: string | undefined, sha: string): Promise<string> {
  // Strategy 1: raw_url — fast, works for public repos
  if (rawUrl) {
    try {
      const res = await axios.get(rawUrl, {
        headers: githubHeaders(),
        timeout: 10000,
        responseType: 'text',
      });
      return String(res.data);
    } catch {
      // For private repos this returns 404 even with a valid PAT — fall through to API
    }
  }

  // Strategy 2: contents API with Accept: raw — works for private repos with PAT
  if (contentsUrl) {
    // contentsUrl is already formatted as: /repos/{owner}/{repo}/contents/{path}?ref={sha}
    const url = contentsUrl.includes('?') ? contentsUrl : `${contentsUrl}?ref=${sha}`;
    const res = await axios.get(url, {
      headers: githubRawHeaders(),
      timeout: 10000,
      responseType: 'text',
    });
    return String(res.data);
  }

  throw new Error('No URL available to fetch file content');
}

/**
 * Fetch a single commit's changed files (full content preferred, patch as fallback).
 * Works for both public and private repos — uses contents API for private repos.
 */
async function fetchCommitDiff(owner: string, repo: string, sha: string): Promise<string> {
  const res = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
    { headers: githubHeaders(), timeout: 15000 }
  );

  const files: any[] = Array.isArray(res.data?.files) ? res.data.files.slice(0, 25) : [];
  const parts: string[] = [];

  for (const file of files) {
    const filename = String(file.filename ?? '');
    if (BINARY_RE.test(filename)) continue;
    // Skip removed files — no content to grade
    if (file.status === 'removed') continue;

    try {
      // fetchFileContent: tries raw_url (fast/public), then contents_url (private)
      const content = await fetchFileContent(file.raw_url, file.contents_url, sha);
      if (content.trim()) {
        parts.push(`FILE: ${filename}\n${content.slice(0, 10000)}`);
        continue;
      }
    } catch { /* fall through to patch */ }

    // Fallback: use the inline patch (diff format) — always present in API response
    if (file.patch) parts.push(`PATCH: ${filename}\n${String(file.patch).slice(0, 5000)}`);
  }

  return parts.join('\n\n').slice(0, 60000);
}

/**
 * Fallback: fetch the repo's entire source tree when a commit diff has no code
 * (e.g. initial commit with only an empty placeholder file, or rename-only commits).
 * Uses the git blobs API — works for private repos with the staff PAT.
 */
export async function fetchRepoTreeCode(owner: string, repo: string): Promise<string> {
  try {
    const repoRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: githubHeaders(),
      timeout: 10000,
    });
    const branch = repoRes.data?.default_branch || 'main';

    const treeRes = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: githubHeaders(), timeout: 15000 }
    );

    const blobs: any[] = Array.isArray(treeRes.data?.tree)
      ? treeRes.data.tree.filter((t: any) => t.type === 'blob' && CODE_RE.test(t.path) && !BINARY_RE.test(t.path))
      : [];

    if (blobs.length === 0) return '';

    const chosen = blobs.slice(0, 15);
    const parts: string[] = [];
    let total = 0;
    for (const blob of chosen) {
      try {
        // Use the git blobs API with Accept: raw — works for private repos with PAT
        const blobRes = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs/${blob.sha}`,
          {
            headers: githubRawHeaders(),
            timeout: 10000,
            responseType: 'text',
          }
        );
        const content = String(blobRes.data).slice(0, 8000);
        if (!content.trim()) continue;
        parts.push(`FILE: ${blob.path}\n${content}`);
        total += content.length;
        if (total > 60000) break;
      } catch { /* skip unreadable file */ }
    }
    return parts.join('\n\n').slice(0, 60000);
  } catch (err: any) {
    console.warn('[intern-push-processor] fetchRepoTreeCode failed:', err?.message);
    return '';
  }
}

/**
 * Fetch code context for a push — commit diff first, repo tree as a fallback.
 * Works for both public and private repositories.
 */
export async function fetchCommitCodeContext(owner: string, repo: string, sha: string): Promise<string> {
  let code = '';
  try {
    code = await fetchCommitDiff(owner, repo, sha);
  } catch (err: any) {
    console.warn('[intern-push-processor] fetchCommitDiff failed:', err?.message);
  }
  if (code.trim()) return code;

  // Diff empty/unusable — fall back to the full repo tree.
  console.log(`[intern-push-processor] Commit ${sha.slice(0, 7)} diff had no source — falling back to repo tree`);
  return fetchRepoTreeCode(owner, repo);
}

// ── PR code context (for SUBMITTED PRs) ─────────────────────────────────────────

export function parseGithubPrUrl(prUrl: string) {
  const m = prUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], pullNumber: m[3] };
}

/**
 * Fetch code context from a pull request's changed files.
 * Works for both public and private repos — uses contents API for private repos.
 */
export async function fetchPrCodeContext(prUrl: string): Promise<string> {
  const parsed = parseGithubPrUrl(prUrl);
  if (!parsed) throw new AppError('PR URL must be a valid GitHub pull request URL', 400, 'VALIDATION_ERROR');

  const filesRes = await axios.get(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.pullNumber}/files`,
    { headers: githubHeaders(), timeout: 15000 }
  );

  const files = Array.isArray(filesRes.data) ? filesRes.data.slice(0, 20) : [];
  const parts: string[] = [];
  for (const file of files) {
    const filename = String(file.filename ?? '');
    if (BINARY_RE.test(filename)) continue;
    if (file.status === 'removed') continue;

    try {
      const content = await fetchFileContent(file.raw_url, file.contents_url, parsed.pullNumber);
      if (content.trim()) {
        parts.push(`FILE: ${filename}\n${content.slice(0, 12000)}`);
        continue;
      }
    } catch { /* fall through */ }

    if (file.patch) parts.push(`PATCH: ${filename}\n${String(file.patch).slice(0, 6000)}`);
  }
  return parts.join('\n\n').slice(0, 60000);
}

// ── Webhook event logging ────────────────────────────────────────────────────────

async function logWebhookEvent(
  studentId: string | null,
  pusherLogin: string,
  repoName: string,
  repoOwner: string,
  ref: string,
  headSha: string,
  commitMessage: string,
  status: 'SUCCESS' | 'STUDENT_NOT_FOUND' | 'PROGRESS_NOT_FOUND' | 'TASK_NOT_FOUND' | 'ERROR',
  errorMessage?: string,
  source: 'webhook' | 'poller' | 'admin-scan' = 'webhook'
) {
  try {
    await db.query(`
      INSERT INTO intern_webhook_events (student_id, pusher_login, repo_name, repo_owner, ref, head_sha, commit_message, status, error_message, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [studentId, pusherLogin, repoName, repoOwner, ref, headSha, commitMessage, status, errorMessage ?? null, source]);
  } catch (err: any) {
    console.error('[intern-push-processor] Failed to log webhook event to DB:', err.message);
  }
}

// ── Attendance ───────────────────────────────────────────────────────────────────

async function autoMarkAttendance(studentId: string) {
  const { rows: [alloc] } = await db.query<any>(
    `SELECT program_id, batch_id FROM intern_allocations WHERE student_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
    [studentId]
  );
  if (!alloc) return;

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD in IST
  await db.query(`
    INSERT INTO intern_attendance (student_id, program_id, batch_id, session_date, status, notes)
    VALUES ($1, $2, $3, $4, 'PRESENT', 'Auto-marked via GitHub push')
    ON CONFLICT (student_id, program_id, session_date)
    DO UPDATE SET status = CASE WHEN intern_attendance.status = 'ABSENT' THEN 'PRESENT' ELSE intern_attendance.status END,
                  notes = CASE WHEN intern_attendance.status = 'ABSENT' THEN 'Auto-marked via GitHub push' ELSE intern_attendance.notes END
  `, [studentId, alloc.program_id, alloc.batch_id, today]);
}

// ── AI grading (push/commit-based) ───────────────────────────────────────────────

async function gradeFromPush(
  studentId: string,
  taskId: string,
  task: { title: string; description: string; artifact_type: string; solution_file_text?: string | null },
  source: { repoOwner: string; repoName: string; sha: string; prUrl: string | null }
): Promise<'graded' | 'no_code' | 'error'> {
  let codeContext = '';

  // Prefer PR diff if available; otherwise use commit diff (+ repo-tree fallback)
  if (source.prUrl) {
    try { codeContext = await fetchPrCodeContext(source.prUrl); } catch { /* fall through */ }
  }
  if (!codeContext && source.repoOwner && source.repoName && source.sha) {
    codeContext = await fetchCommitCodeContext(source.repoOwner, source.repoName, source.sha);
  }

  if (!codeContext.trim()) {
    // No code yet (empty repo, placeholder file, etc.) — not an error, just skip grading.
    // The commit_count and last_push_sha are already updated so the student's progress
    // moves to CODING. AI grading will run on the next push that has real code.
    console.warn(
      `[intern-push-processor] No code context for ${source.sha.slice(0, 7)} — ` +
      `commit_count updated but grading deferred until student pushes real code.`
    );
    return 'no_code';
  }

  try {
    const result = await aiGradeInternTask({
      taskTitle: task.title,
      taskDescription: task.description,
      artifactType: task.artifact_type,
      solutionText: task.solution_file_text,
      codeContext,
      sourceLabel: `push event (${source.sha.slice(0, 7)})`,
    });

    await db.query(`
      UPDATE intern_task_progress
      SET status = 'AI_GRADED',
          ai_score = $1,
          ai_breakdown = $2,
          ai_feedback = $3,
          graded_at = NOW(),
          updated_at = NOW()
      WHERE student_id = $4 AND task_id = $5
    `, [result.score, JSON.stringify(result.breakdown), result.feedback, studentId, taskId]);

    const flag = result.needs_review ? ' ⚠ NEEDS REVIEW' : '';
    console.log(`[intern-push-processor] Graded task ${taskId} for student ${studentId}: ${result.score}/5 model=${result.model}${flag}`);
    return 'graded';
  } catch (err: any) {
    console.error(`[intern-push-processor] AI grading failed for task ${taskId}:`, err?.message);
    return 'error';
  }
}

// ── Core: process one push for a known fork ──────────────────────────────────────

export interface PushEvent {
  studentId: string;
  taskId: string;
  repoOwner: string;
  repoName: string;
  repoHtmlUrl: string;
  sha: string;
  ref: string;
  commitMessage: string;
  pusherLogin: string;
  source: 'webhook' | 'poller' | 'admin-scan';
  /**
   * Actual number of NEW commits in this push (compared to last_push_sha).
   * Poller calculates this via the GitHub compare API.
   * Webhook / admin-scan default to 1 (single event).
   */
  commitDelta?: number;
}

/**
 * Single source of truth for handling a detected push on a student fork.
 * Called by both the GitHub webhook handler and the commit poller.
 *
 * Key guarantees:
 * - Idempotent: dedupes on `last_push_sha`.
 * - Never downgrades SUBMITTED/AI_GRADED status (those belong to PR grading).
 * - Does NOT throw: grading failures are logged but don't propagate, so the
 *   caller's error handler never resets the student's progress incorrectly.
 * - If AI grading fails, last_push_sha is reset to null so the next poll
 *   automatically retries grading on the same SHA without requiring a new push.
 */
export async function processPushForFork(ev: PushEvent): Promise<void> {
  const { studentId, taskId, repoOwner, repoName, ref, sha, commitMessage, pusherLogin, source } = ev;
  const commitDelta = ev.commitDelta ?? 1;

  // 1. Idempotent — dedupe on head SHA.
  const { rows: [progress] } = await db.query<any>(
    `SELECT status, commit_count, last_push_sha FROM intern_task_progress WHERE student_id = $1 AND task_id = $2`,
    [studentId, taskId]
  );
  if (!progress) {
    await logWebhookEvent(studentId, pusherLogin, repoName, repoOwner, ref, sha, commitMessage, 'TASK_NOT_FOUND', `No task progress for student ${studentId} task ${taskId}`, source);
    return;
  }

  if (progress.last_push_sha === sha) {
    console.log(`[intern-push-processor] Duplicate push (sha ${sha.slice(0, 7)}) — skipping`);
    await logWebhookEvent(studentId, pusherLogin, repoName, repoOwner, ref, sha, commitMessage, 'SUCCESS', `duplicate push skipped (${source})`, source);
    return;
  }

  // 2. Update commit count (using real delta) + SHA + status.
  // FORKED/NOT_STARTED → CODING; never touch SUBMITTED/AI_GRADED.
  await db.query(`
    UPDATE intern_task_progress
    SET commit_count  = COALESCE(commit_count, 0) + $1,
        last_push_at  = NOW(),
        last_push_sha = $2,
        status        = CASE WHEN status IN ('FORKED','NOT_STARTED') THEN 'CODING' ELSE status END,
        updated_at    = NOW()
    WHERE student_id = $3 AND task_id = $4
  `, [commitDelta, sha, studentId, taskId]);

  // 3. Auto-mark attendance for today (fire-and-forget)
  autoMarkAttendance(studentId).catch(() => {});

  // 4. Fetch task details for AI grading
  const { rows: [task] } = await db.query<any>(`
    SELECT id, title, description, artifact_type,
           solution_file_url, solution_file_text
    FROM intern_tasks WHERE id = $1
  `, [taskId]);
  if (!task) {
    await logWebhookEvent(studentId, pusherLogin, repoName, repoOwner, ref, sha, commitMessage, 'ERROR', `Task ID "${taskId}" not found in database.`, source);
    return;
  }

  // 5. Prefer a linked PR diff for grading (more complete than a single commit)
  const { rows: [currentProgress] } = await db.query<any>(
    `SELECT pr_url FROM intern_task_progress WHERE student_id = $1 AND task_id = $2`,
    [studentId, taskId]
  );
  const gradeTarget = currentProgress?.pr_url?.trim() ? currentProgress.pr_url : null;

  console.log(`[intern-push-processor] Grading task "${task.title}" for student ${studentId} (source=${source}, sha=${sha.slice(0, 7)})`);

  const gradeResult = await gradeFromPush(studentId, taskId, task, {
    repoOwner, repoName, sha, prUrl: gradeTarget,
  });

  // If grading failed (AI error or empty code), reset last_push_sha so the next
  // poll automatically retries without requiring the student to push again.
  if (gradeResult === 'error') {
    await db.query(
      `UPDATE intern_task_progress SET last_push_sha = NULL WHERE student_id = $1 AND task_id = $2`,
      [studentId, taskId]
    ).catch(() => {});
    await logWebhookEvent(studentId, pusherLogin, repoName, repoOwner, ref, sha, commitMessage, 'ERROR', 'AI grading failed — will retry on next poll', source);
    return;
  }

  const logMsg = gradeResult === 'no_code' ? 'no code context yet — grading deferred' : undefined;
  await logWebhookEvent(studentId, pusherLogin, repoName, repoOwner, ref, sha, commitMessage, 'SUCCESS', logMsg, source);
}
