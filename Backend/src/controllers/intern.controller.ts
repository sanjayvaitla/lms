import { Request, Response } from 'express';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter } from '../lib/storage';
import { aiGradeInternTask } from '../services/ai-grader.service';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import axios from 'axios';
import JSZip from 'jszip';
import { processPushForFork, normalizeGithubRepoUrl as normalizeGithubRepoUrlFromProcessor, fetchPrCodeContext as fetchPrCodeContextFromProcessor } from '../services/intern-push-processor.service';
import { pollSingleFork } from '../services/intern-commit-poller.service';
import { sendEmail, internTaskAssignedEmail, internTaskEvaluatedEmail, internshipCompletedEmail } from '../lib/email';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const INTERN_WEBHOOK_SECRET = process.env.INTERN_WEBHOOK_SECRET ?? process.env.GITHUB_WEBHOOK_SECRET ?? '';
// Public URL where GitHub can reach our server (e.g. https://api.yourdomain.com)
const SERVER_PUBLIC_URL = process.env.SERVER_PUBLIC_URL ?? '';

// ── helpers ──────────────────────────────────────────────────────────────────────

async function getInternAllocation(studentId: string) {
  const { rows } = await db.query<any>(`
    SELECT ia.*,
           ip.title, ip.company,
           COALESCE(ib.name, ip.batch_name) AS batch_name,
           COALESCE(mu.name, ip.mentor_name) AS mentor_name,
           ip.stipend_per_month, ip.description,
           TO_CHAR(ip.start_date, 'YYYY-MM-DD') AS start_date,
           TO_CHAR(ip.end_date,   'YYYY-MM-DD') AS end_date
    FROM intern_allocations ia
    JOIN internship_programs ip ON ip.id = ia.program_id
    LEFT JOIN intern_batches ib ON ib.id = ia.batch_id
    LEFT JOIN users mu ON mu.id = ib.mentor_id
    WHERE ia.student_id = $1 AND ia.status = 'ACTIVE'
    ORDER BY ia.created_at DESC LIMIT 1
  `, [studentId]);
  return rows[0] ?? null;
}

async function assertTaskBelongsToStudentProgram(studentId: string, taskId: string) {
  const alloc = await getInternAllocation(studentId);
  if (!alloc) throw new AppError('Not enrolled in any internship', 404, 'NOT_FOUND');

  const { rows: [task] } = await db.query<any>(
    `SELECT id, title, description, artifact_type, solution_file_url, solution_file_text
     FROM intern_tasks
     WHERE id = $1 AND program_id = $2`,
    [taskId, alloc.program_id]
  );
  if (!task) throw new AppError('Task not found for your active internship', 404, 'NOT_FOUND');
  return task;
}

function parseGithubPrUrl(prUrl: string) {
  const m = prUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], pullNumber: m[3] };
}

async function extractSolutionText(file: { buffer: Buffer; originalname: string; mimetype: string }) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file.buffer);
    const parts: string[] = [];
    for (const [entryName, entry] of Object.entries(zip.files).slice(0, 50)) {
      if (entry.dir || /\.(png|jpe?g|gif|webp|pdf|pptx?|xlsx?|mp4|mov)$/i.test(entryName)) continue;
      const text = await entry.async('string').catch(() => '');
      if (text.trim()) parts.push(`FILE: ${entryName}\n${text.slice(0, 12000)}`);
    }
    return parts.join('\n\n').slice(0, 80000);
  }
  if (/^text\//.test(file.mimetype) || /\.(js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|sql|html|css|json|md|txt|yml|yaml|env)$/i.test(name)) {
    return file.buffer.toString('utf8').slice(0, 80000);
  }
  return '';
}

function makeTempPassword() {
  return `Intern@${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeGithubRepoUrl(url: string): string {
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

function githubApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

function isForkOfTemplate(repo: any, templateOwner: string, templateRepo: string): boolean {
  if (!repo?.fork) return false;
  const target = `${templateOwner}/${templateRepo}`.toLowerCase();
  const parent = String(repo.parent?.full_name ?? '').toLowerCase();
  const source = String(repo.source?.full_name ?? '').toLowerCase();
  return parent === target || source === target;
}

/** Find student's fork of a template — tries direct URL, user repos, then template forks list. */
async function findStudentForkForTemplate(
  githubUsername: string,
  templateOwner: string,
  templateRepo: string,
): Promise<{ forkUrl: string; cloneUrl?: string } | null> {
  const headers = githubApiHeaders();

  // 1. Same repo name under student account (most common after fork)
  try {
    const repoRes = await axios.get(
      `https://api.github.com/repos/${githubUsername}/${templateRepo}`,
      { headers, timeout: 10000 },
    );
    if (isForkOfTemplate(repoRes.data, templateOwner, templateRepo)) {
      return {
        forkUrl: normalizeGithubRepoUrl(repoRes.data.html_url),
        cloneUrl: repoRes.data.clone_url,
      };
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  // 2. All repos on student account (works for public forks; no template read needed)
  try {
    const reposRes = await axios.get(
      `https://api.github.com/users/${githubUsername}/repos`,
      { headers, timeout: 15000, params: { per_page: 100, type: 'all', sort: 'updated' } },
    );
    const repos: any[] = Array.isArray(reposRes.data) ? reposRes.data : [];
    const match = repos.find(r => isForkOfTemplate(r, templateOwner, templateRepo));
    if (match) {
      return {
        forkUrl: normalizeGithubRepoUrl(match.html_url),
        cloneUrl: match.clone_url,
      };
    }
  } catch (err: any) {
    if (err?.response?.status === 404) return null; // GitHub username not found
    throw err;
  }

  // 3. Forks of template repo (needs read access to template)
  try {
    const forksRes = await axios.get(
      `https://api.github.com/repos/${templateOwner}/${templateRepo}/forks`,
      { headers, timeout: 10000, params: { per_page: 100 } },
    );
    const forks: any[] = Array.isArray(forksRes.data) ? forksRes.data : [];
    const studentFork = forks.find(
      (f: any) => f.owner?.login?.toLowerCase() === githubUsername.toLowerCase(),
    );
    if (studentFork) {
      return {
        forkUrl: normalizeGithubRepoUrl(studentFork.html_url),
        cloneUrl: studentFork.clone_url,
      };
    }
  } catch (err: any) {
    if (err?.response?.status === 404) {
      console.warn(`[detect-fork] Template ${templateOwner}/${templateRepo} not accessible — check GITHUB_TOKEN or make template public`);
    } else {
      throw err;
    }
  }

  return null;
}

// ── GitHub helpers ────────────────────────────────────────────────────────────────

/**
 * Helper to log webhook push events to the database
 */
async function logWebhookEvent(
  studentId: string | null,
  pusherLogin: string,
  repoName: string,
  repoOwner: string,
  ref: string,
  headSha: string,
  commitMessage: string,
  status: 'SUCCESS' | 'STUDENT_NOT_FOUND' | 'PROGRESS_NOT_FOUND' | 'ERROR',
  errorMessage?: string
) {
  try {
    await db.query(`
      INSERT INTO intern_webhook_events (student_id, pusher_login, repo_name, repo_owner, ref, head_sha, commit_message, status, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [studentId, pusherLogin, repoName, repoOwner, ref, headSha, commitMessage, status, errorMessage ?? null]);
  } catch (err: any) {
    console.error('[intern-webhook] Failed to log webhook event to DB:', err.message);
  }
}

/**
 * Verifies an HMAC-SHA256 signature from GitHub
 */
function verifyGithubSignature(rawBody: Buffer | string, signature: string): boolean {
  // Fail-closed: never accept unsigned webhooks (even in development).
  if (!INTERN_WEBHOOK_SECRET) {
    console.error('[intern-webhook] INTERN_WEBHOOK_SECRET not set — rejecting webhook');
    return false;
  }
  if (!signature) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const expected = 'sha256=' + crypto.createHmac('sha256', INTERN_WEBHOOK_SECRET).update(body).digest('hex');
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

/**
 * Fetch code context from a commit SHA (not a PR) — used for push-based auto-evaluation.
 * Returns concatenated file content / patches from the commit, up to 60k chars.
 */
async function fetchCommitCodeContext(owner: string, repo: string, sha: string): Promise<string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  try {
    const res = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
      { headers, timeout: 15000 }
    );

    const files: any[] = Array.isArray(res.data?.files) ? res.data.files.slice(0, 25) : [];
    const parts: string[] = [];

    for (const file of files) {
      const filename = String(file.filename ?? '');
      if (/\.(png|jpe?g|gif|webp|pdf|pptx?|xlsx?|zip|7z|rar|mp4|mov|woff2?|ttf|eot|ico|svg)$/i.test(filename)) continue;
      if (file.raw_url) {
        try {
          const raw = await axios.get(file.raw_url, { headers, timeout: 10000, responseType: 'text' });
          parts.push(`FILE: ${filename}\n${String(raw.data).slice(0, 10000)}`);
          continue;
        } catch { /* fall through to patch */ }
      }
      if (file.patch) parts.push(`PATCH: ${filename}\n${String(file.patch).slice(0, 5000)}`);
    }

    return parts.join('\n\n').slice(0, 60000);
  } catch (err: any) {
    console.warn('[intern-webhook] fetchCommitCodeContext failed:', err?.message);
    return '';
  }
}

/**
 * Register our webhook on the student's fork repo via GitHub API.
 * Requires GITHUB_TOKEN (a PAT with admin:repo_hook scope on the fork, or a GitHub App token).
 * Also requires SERVER_PUBLIC_URL set in env so GitHub knows where to send events.
 */
async function registerWebhookOnFork(forkOwner: string, forkRepo: string): Promise<void> {
  if (!GITHUB_TOKEN || !SERVER_PUBLIC_URL) {
    console.warn('[intern-webhook] Skipping fork webhook registration: GITHUB_TOKEN or SERVER_PUBLIC_URL not set');
    return;
  }

  const webhookUrl = `${SERVER_PUBLIC_URL.replace(/\/$/, '')}/api/v1/intern/github/webhook`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    // Check if webhook already exists to avoid duplicates
    const existing = await axios.get(
      `https://api.github.com/repos/${forkOwner}/${forkRepo}/hooks`,
      { headers, timeout: 10000 }
    );
    const hooks: any[] = Array.isArray(existing.data) ? existing.data : [];
    const alreadyRegistered = hooks.some(h => h.config?.url === webhookUrl);
    if (alreadyRegistered) { console.log(`[intern-webhook] Webhook already registered on ${forkOwner}/${forkRepo}`); return; }

    await axios.post(
      `https://api.github.com/repos/${forkOwner}/${forkRepo}/hooks`,
      {
        name: 'web',
        active: true,
        events: ['push'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: INTERN_WEBHOOK_SECRET || undefined,
          insecure_ssl: '0',
        },
      },
      { headers, timeout: 15000 }
    );
    console.log(`[intern-webhook] Webhook registered on fork ${forkOwner}/${forkRepo}`);
  } catch (err: any) {
    // 422 = hook already exists with same URL; not a real error
    if (err?.response?.status !== 422) {
      console.error(`[intern-webhook] Failed to register webhook on ${forkOwner}/${forkRepo}:`, err?.response?.data ?? err?.message);
    }
  }
}

// ── GET /intern/profile ──────────────────────────────────────────────────────────

export async function getProfile(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const alloc = await getInternAllocation(studentId);

  if (!alloc) {
    res.json({ success: true, data: null });
    return;
  }

  const { rows: [user] } = await db.query<any>(
    `SELECT name, email, github_username FROM users WHERE id = $1`, [studentId]
  );

  if (!user) throw new AppError('User account not found', 404, 'NOT_FOUND');

  res.json({
    success: true,
    data: {
      name: user.name,
      email: user.email,
      githubUsername: user.github_username ?? null,
      internshipTitle: alloc.title,
      company: alloc.company,
      mentor: alloc.mentor_name,
      batch: alloc.batch_name,
      startDate: alloc.start_date,
      endDate: alloc.end_date,
      progress: alloc.progress,
      stipendPerMonth: alloc.stipend_per_month,
      programId: alloc.program_id,
    },
  });
}

// ── GET /intern/references ────────────────────────────────────────────────────────

export async function getReferences(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const alloc = await getInternAllocation(studentId);
  if (!alloc) { res.json({ success: true, data: [] }); return; }

  const { rows } = await db.query<any>(`
    SELECT id, ref_no AS "refNo", title, type, url, description
    FROM intern_references
    WHERE program_id = $1
    ORDER BY ref_no, created_at
  `, [alloc.program_id]);

  // Group flat rows by ref_no. Each group = one "Ref N" shown to student.
  // The group-level title comes from the first row's description (shared per group in seed).
  // Each item gets its own title (the row title) and type+url.
  const groupMap = new Map<number, any>();
  for (const row of rows) {
    if (!groupMap.has(row.refNo)) {
      groupMap.set(row.refNo, {
        id: row.id,
        refNo: row.refNo,
        title: row.description, // group title stored in description field
        description: '',
        items: [],
      });
    }
    const group = groupMap.get(row.refNo)!;
    group.items.push({ type: row.type, url: row.url, label: row.title });
  }

  res.json({ success: true, data: Array.from(groupMap.values()) });
}

// ── GET /intern/tasks ─────────────────────────────────────────────────────────────

export async function getTasks(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const alloc = await getInternAllocation(studentId);
  if (!alloc) { res.json({ success: true, data: [] }); return; }

  const { rows: raw } = await db.query<any>(`
    SELECT
      t.id,
      t.sprint_no                                   AS "sprintNo",
      t.title,
      t.description,
      t.artifact_type                               AS "artifactType",
      COALESCE(t.project_pdf_url, '')               AS "projectPdfUrl",
      COALESCE(t.project_pdf_name, '')              AS "projectPdfName",
      COALESCE(t.template_repo_url, '')             AS "templateRepoUrl",
      TO_CHAR(t.due_date, 'YYYY-MM-DD')             AS "dueDate",
      t.priority,
      COALESCE(t.linked_ref_ids, '{}')              AS "linkedRefIds",
      COALESCE(p.status, 'NOT_STARTED')             AS status,
      COALESCE(p.fork_url, '')                      AS "forkUrl",
      COALESCE(p.pr_url, '')                        AS "prUrl",
      COALESCE(p.commit_count, 0)::INT              AS "commitCount",
      TO_CHAR(p.last_push_at, 'YYYY-MM-DD HH24:MI') AS "lastPushAt",
      p.ai_score::FLOAT                             AS "aiScore",
      COALESCE(p.ai_breakdown, '[]'::jsonb)         AS "aiBreakdown",
      COALESCE(p.ai_feedback, '')                   AS "aiFeedback"
    FROM intern_tasks t
    LEFT JOIN intern_task_progress p ON p.task_id = t.id AND p.student_id = $1
    WHERE t.program_id = $2
    ORDER BY t.sprint_no
  `, [studentId, alloc.program_id]);

  // Normalise types that pg may return as strings
  const tasks = raw.map((t: any) => ({
    ...t,
    aiScore: t.aiScore != null ? parseFloat(t.aiScore) : null,
    commitCount: parseInt(t.commitCount, 10) || 0,
    linkedRefIds: Array.isArray(t.linkedRefIds) ? t.linkedRefIds : [],
    aiBreakdown: Array.isArray(t.aiBreakdown)
      ? t.aiBreakdown.map((b: any) => ({ ...b, score: Number(b.score), max: Number(b.max) }))
      : [],
  }));

  res.json({ success: true, data: tasks });
}

// ── POST /intern/tasks/:id/fork ───────────────────────────────────────────────────

export async function forkTask(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const taskId = String(req.params.id);

  await assertTaskBelongsToStudentProgram(studentId, taskId);

  const { rows: [existing] } = await db.query<any>(
    `SELECT status FROM intern_task_progress WHERE student_id = $1 AND task_id = $2`,
    [studentId, taskId]
  );

  if (existing && existing.status !== 'NOT_STARTED') {
    throw new AppError(`Task already in '${existing.status}' state — cannot re-fork`, 409, 'CONFLICT');
  }

  await db.query(`
    INSERT INTO intern_task_progress (student_id, task_id, status)
    VALUES ($1, $2, 'FORKED')
    ON CONFLICT (student_id, task_id)
    DO UPDATE SET status = 'FORKED', updated_at = NOW()
    WHERE intern_task_progress.status = 'NOT_STARTED'
  `, [studentId, taskId]);

  res.json({ success: true, data: { status: 'FORKED' } });
}

// ── GET /intern/tasks/:id/detect-fork ────────────────────────────────────────────
// Polls GitHub API to find a fork of the task's template repo owned by the student.
// Called repeatedly by the frontend after the student clicks "Fork on GitHub".

export async function detectFork(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const taskId    = String(req.params.id);

  // Get student's github_username
  const { rows: [user] } = await db.query<any>(
    `SELECT github_username FROM users WHERE id = $1`, [studentId]
  );
  if (!user?.github_username) {
    res.json({ success: true, data: { found: false, reason: 'no_github_username' } });
    return;
  }

  // Get task's template repo URL
  const { rows: [task] } = await db.query<any>(
    `SELECT template_repo_url FROM intern_tasks WHERE id = $1`, [taskId]
  );
  if (!task?.template_repo_url) {
    res.json({ success: true, data: { found: false, reason: 'no_template_url' } });
    return;
  }

  const templateUrl = normalizeGithubRepoUrl(task.template_repo_url);
  const parts = templateUrl.replace('https://github.com/', '').split('/');
  if (parts.length < 2) {
    res.json({ success: true, data: { found: false, reason: 'invalid_template_url' } });
    return;
  }
  const [templateOwner, templateRepo] = parts;
  const githubUsername: string = user.github_username;

  try {
    const found = await findStudentForkForTemplate(githubUsername, templateOwner, templateRepo);
    if (found) {
      res.json({ success: true, data: { found: true, forkUrl: found.forkUrl, cloneUrl: found.cloneUrl } });
      return;
    }
    res.json({ success: true, data: { found: false, reason: 'fork_not_found_yet' } });
  } catch (err: any) {
    const status = err?.response?.status;
    console.warn('[detect-fork] GitHub API error:', status, err?.message);
    if (status === 401 || status === 403) {
      res.json({ success: true, data: { found: false, reason: 'github_token_invalid' } });
      return;
    }
    res.json({ success: true, data: { found: false, reason: 'github_api_error' } });
  }
}

// ── POST /intern/tasks/:id/confirm-fork ──────────────────────────────────────────

export async function confirmFork(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const taskId = String(req.params.id);
  const { forkUrl } = req.body;

  if (!forkUrl?.trim()) {
    throw new AppError('Fork URL is required', 400, 'VALIDATION_ERROR');
  }

  const cleanForkUrl = normalizeGithubRepoUrl(forkUrl);
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(cleanForkUrl)) {
    throw new AppError('Fork URL must be a valid GitHub repository URL (https://github.com/user/repo)', 400, 'VALIDATION_ERROR');
  }

  // Ownership + fork-lineage verification.
  // Fetch the student's github_username and the task's template repo, then call
  // the GitHub API to confirm: (a) the fork is owned by the requesting student,
  // and (b) it is actually a fork of the task's template repo. If the GitHub API
  // is unreachable we fall back to a username-URL match check rather than blindly
  // accepting any URL.
  const forkParts = cleanForkUrl.replace('https://github.com/', '').split('/');

  const { rows: [user] } = await db.query<any>(
    `SELECT github_username FROM users WHERE id = $1`, [studentId]
  );
  const { rows: [taskRow] } = await db.query<any>(
    `SELECT template_repo_url FROM intern_tasks WHERE id = $1`, [taskId]
  );

  const claimedOwner = forkParts[0]?.toLowerCase();
  const githubUsername = user?.github_username?.toLowerCase();

  // Minimum bar: the repo owner in the URL must match the student's github_username.
  // Without this, a student could register the template itself or another student's fork.
  if (!githubUsername) {
    throw new AppError('No GitHub username linked to your account. Ask your mentor to set it before confirming a fork.', 400, 'VALIDATION_ERROR');
  }
  if (claimedOwner !== githubUsername) {
    throw new AppError(`The fork URL must point to a repository owned by your GitHub account (@${githubUsername}). Got owner "${claimedOwner}".`, 403, 'FORBIDDEN');
  }

  // Stronger check via GitHub API: verify fork lineage. Non-fatal if API fails
  // (private repo, rate limit) — we already enforced ownership above.
  if (taskRow?.template_repo_url) {
    try {
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
      if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
      const repoRes = await axios.get(
        `https://api.github.com/repos/${forkParts[0]}/${forkParts[1]}`,
        { headers, timeout: 10000 }
      );
      const repoData = repoRes.data ?? {};
      const parentFullName: string = repoData.parent?.full_name?.toLowerCase() ?? '';
      const sourceFullName: string = repoData.source?.full_name?.toLowerCase() ?? '';
      const templateUrl = normalizeGithubRepoUrl(taskRow.template_repo_url).toLowerCase();
      const templateFull = templateUrl.replace('https://github.com/', '');
      const isFork = repoData.fork === true;
      const lineageMatches =
        parentFullName === templateFull || sourceFullName === templateFull ||
        parentFullName === templateUrl || sourceFullName === templateUrl;
      if (!isFork || !lineageMatches) {
        throw new AppError(
          `This repository is not a fork of the task's template (${templateFull}). Fork the correct template repo, then confirm again.`,
          400, 'VALIDATION_ERROR'
        );
      }
    } catch (err: any) {
      // If the rejection was our own AppError, rethrow it.
      if (err instanceof AppError) throw err;
      // Otherwise the GitHub API was unreachable — log and proceed on ownership alone.
      console.warn('[confirm-fork] Lineage check skipped (GitHub API error):', err?.message);
    }
  }

  // Fetch the current latest SHA to act as the baseline, preventing the poller
  // from grading the initial template commit.
  let initialSha: string | null = null;
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const commitRes = await axios.get(
      `https://api.github.com/repos/${forkParts[0]}/${forkParts[1]}/commits`,
      { headers, timeout: 5000, params: { per_page: 1 } }
    );
    if (Array.isArray(commitRes.data) && commitRes.data.length > 0) {
      initialSha = commitRes.data[0].sha;
    }
  } catch (err: any) {
    console.warn('[confirm-fork] Could not fetch initial SHA:', err?.message);
  }

  await assertTaskBelongsToStudentProgram(studentId, taskId);

  await db.query(`
    INSERT INTO intern_task_progress (student_id, task_id, status, fork_url, last_push_sha)
    VALUES ($1, $2, 'CODING', $3, $4)
    ON CONFLICT (student_id, task_id)
    DO UPDATE SET 
      status = 'CODING', 
      fork_url = $3, 
      updated_at = NOW(),
      last_push_sha = COALESCE(intern_task_progress.last_push_sha, $4)
  `, [studentId, taskId, cleanForkUrl, initialSha]);

  // Register our webhook on the fork repo in the background (non-blocking)
  if (forkParts.length === 2) {
    registerWebhookOnFork(forkParts[0], forkParts[1]).catch(() => {});
  }

  res.json({ success: true, data: { status: 'CODING', forkUrl: cleanForkUrl } });
}

// ── background AI grader for manual PR submissions ───────────────────────────────
// Uses the processor's fetchPrCodeContext which has private-repo support.

async function gradeInBackground(
  studentId: string,
  taskId: string,
  task: { title: string; description: string; artifact_type: string; solution_file_text?: string | null },
  prUrl: string
) {
  let codeContext = '';
  try {
    codeContext = await fetchPrCodeContextFromProcessor(prUrl);
  } catch (err: any) {
    console.error('[intern-grader] failed to fetch PR code context:', err?.message);
  }

  if (!codeContext.trim()) {
    console.warn(`[intern-grader] No code context from PR ${prUrl} — grading skipped`);
    // Reset status to CODING so student knows to check their PR
    await db.query(
      `UPDATE intern_task_progress SET status = 'CODING', updated_at = NOW() WHERE student_id = $1 AND task_id = $2 AND status = 'SUBMITTED'`,
      [studentId, taskId]
    ).catch(() => {});
    return;
  }

  try {
    const result = await aiGradeInternTask({
      taskTitle: task.title,
      taskDescription: task.description,
      artifactType: task.artifact_type,
      solutionText: task.solution_file_text,
      codeContext,
      sourceLabel: `manual PR submission (${prUrl})`,
    });

    await db.query(`
      UPDATE intern_task_progress
      SET status = 'AI_GRADED', ai_score = $1, ai_breakdown = $2, ai_feedback = $3, graded_at = NOW(), updated_at = NOW()
      WHERE student_id = $4 AND task_id = $5
    `, [result.score, JSON.stringify(result.breakdown), result.feedback, studentId, taskId]);

    const flag = result.needs_review ? ' ⚠ NEEDS REVIEW' : '';
    console.log(`[intern-grader] PR graded: task=${taskId} score=${result.score}/5 model=${result.model}${flag}`);

    // Send evaluation email
    const { rows: [u] } = await db.query('SELECT name, email FROM users WHERE id = $1', [studentId]);
    if (u?.email) {
      const emailOpts = internTaskEvaluatedEmail(u.name, task.title, result.score, 5, result.feedback);
      emailOpts.to = u.email;
      await sendEmail(emailOpts).catch(e => console.error('Failed to send evaluation email:', e));
    }
  } catch (err: any) {
    console.error('[intern-grader] AI grading failed for PR:', err?.message);
    // Leave status as SUBMITTED so admin can see it needs review
  }
}

// ── POST /intern/tasks/:id/submit-pr ─────────────────────────────────────────────

export async function submitPR(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const taskId = String(req.params.id);
  const { prUrl } = req.body;

  if (!prUrl?.trim()) {
    throw new AppError('PR URL is required', 400, 'VALIDATION_ERROR');
  }

  const cleanPrUrl = prUrl.trim();
  if (!parseGithubPrUrl(cleanPrUrl)) {
    throw new AppError('PR URL must be a valid GitHub pull request URL (https://github.com/org/repo/pull/123)', 400, 'VALIDATION_ERROR');
  }

  const task = await assertTaskBelongsToStudentProgram(studentId, taskId);

  // Set SUBMITTED immediately and respond — grading runs in background
  await db.query(`
    INSERT INTO intern_task_progress (student_id, task_id, status, pr_url, submitted_at)
    VALUES ($1, $2, 'SUBMITTED', $3, NOW())
    ON CONFLICT (student_id, task_id)
    DO UPDATE SET status = 'SUBMITTED', pr_url = $3, submitted_at = NOW(), updated_at = NOW()
  `, [studentId, taskId, cleanPrUrl]);

  res.json({ success: true, data: { status: 'SUBMITTED', prUrl: cleanPrUrl } });

  // AI grading runs after response is sent — timeout cannot affect client
  gradeInBackground(studentId, taskId, task, cleanPrUrl).catch((err: unknown) =>
    console.error('[intern-grader] background grading failed:', err)
  );
}
// Receives push events from GitHub webhooks registered on each student's fork repo.
// No authentication middleware — GitHub signs the payload with INTERN_WEBHOOK_SECRET.
// Must be registered BEFORE express.json() on this route (raw body needed for HMAC).

export async function internGithubWebhook(req: Request, res: Response) {
  // Respond to GitHub immediately — processing is async
  res.status(200).send('OK');

  const event = String(req.headers['x-github-event'] ?? '');
  const signature = String(req.headers['x-hub-signature-256'] ?? '');

  // Verify signature using the raw body Express stored in req.rawBody (set up in index.ts)
  const rawBody: Buffer | string = (req as any).rawBody ?? JSON.stringify(req.body);
  if (!verifyGithubSignature(rawBody, signature)) {
    console.warn('[intern-webhook] Invalid signature — request rejected');
    return;
  }

  if (event === 'ping') { console.log('[intern-webhook] Ping received — webhook active'); return; }
  if (event !== 'push') return;

  const payload = req.body;
  const pusherLogin: string = payload.pusher?.name ?? payload.sender?.login ?? '';
  const repoHtmlUrl: string = payload.repository?.html_url ?? '';
  const repoOwner: string   = payload.repository?.owner?.login ?? '';
  const repoName: string    = payload.repository?.name ?? '';
  const headSha: string     = payload.after ?? payload.head_commit?.id ?? '';
  const ref: string         = payload.ref ?? ''; // e.g. refs/heads/main

  if (!pusherLogin || !repoHtmlUrl || !headSha) return;

  // Ignore branch deletions
  if (headSha === '0000000000000000000000000000000000000000') return;

  const commitMessage = payload.head_commit?.message ?? (payload.commits && payload.commits[0]?.message) ?? 'Push event';

  console.log(`[intern-webhook] Push from ${pusherLogin} to ${repoOwner}/${repoName} (${ref}) sha=${headSha.slice(0, 7)}`);

  // Delegate all push processing to the shared processor.
  // processPushForFork() handles: dedup-on-SHA, status transitions, commit_count,
  // attendance auto-mark, AI grading, and webhook event logging.
  // We still need to resolve which student/task owns this fork URL first.
  (async () => {
    let studentId: string | null = null;
    try {
      // Resolve the intern_task_progress row for this fork URL using DB-side normalization.
      const normalizedRepo = normalizeGithubRepoUrlFromProcessor(repoHtmlUrl).toLowerCase();
      const { rows: [progress] } = await db.query<any>(`
        SELECT p.student_id, p.task_id
        FROM intern_task_progress p
        WHERE LOWER(normalize_github_url(COALESCE(p.fork_url, ''))) = LOWER(normalize_github_url($1))
        LIMIT 1
      `, [normalizedRepo]);

      if (!progress) {
        console.log(`[intern-webhook] No task_progress found for fork ${normalizedRepo}`);
        await logWebhookEvent(null, pusherLogin, repoName, repoOwner, ref, headSha, commitMessage, 'PROGRESS_NOT_FOUND', `No task progress found for fork: "${normalizedRepo}"`);
        return;
      }

      studentId = progress.student_id;

      // Hand off to the shared processor — handles all dedup / state / grading / logging.
      await processPushForFork({
        studentId: progress.student_id,
        taskId:    progress.task_id,
        repoOwner,
        repoName,
        repoHtmlUrl,
        sha:           headSha,
        ref,
        commitMessage,
        pusherLogin,
        source: 'webhook',
      });

    } catch (err: any) {
      console.error('[intern-webhook] Async processing failed:', err);
      if (studentId) {
        await db.query(
          `UPDATE intern_task_progress SET status = 'CODING', updated_at = NOW() WHERE student_id = $1 AND status = 'SUBMITTED'`,
          [studentId]
        ).catch(() => {});
      }
      await logWebhookEvent(studentId, pusherLogin, repoName, repoOwner, ref, headSha, commitMessage, 'ERROR', err.message || String(err));
    }
  })();
}

/** AI grader triggered by webhook push (not manual PR submission) */
async function gradeFromPushInBackground(
  studentId: string,
  taskId: string,
  task: { title: string; description: string; artifact_type: string; solution_file_text?: string | null },
  source: { repoOwner: string; repoName: string; sha: string; prUrl: string | null }
) {
  let codeContext = '';

  // Prefer PR diff if available; otherwise use commit diff
  if (source.prUrl) {
    try { codeContext = await fetchPrCodeContextFromProcessor(source.prUrl); } catch { /* fall through */ }
  }
  if (!codeContext && source.repoOwner && source.repoName && source.sha) {
    codeContext = await fetchCommitCodeContext(source.repoOwner, source.repoName, source.sha);
  }

  if (!codeContext) {
    throw new Error(`Failed to retrieve code context: No code files found in push commit ${source.sha.slice(0, 7)} or PR diff.`);
  }

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
  console.log(`[intern-webhook] Auto-graded task ${taskId} for student ${studentId}: ${result.score}/5 model=${result.model}${flag}`);

  // Send evaluation email
  const { rows: [u] } = await db.query('SELECT name, email FROM users WHERE id = $1', [studentId]);
  if (u?.email) {
    const emailOpts = internTaskEvaluatedEmail(u.name, task.title, result.score, 5, result.feedback);
    emailOpts.to = u.email;
    await sendEmail(emailOpts).catch(e => console.error('Failed to send evaluation email:', e));
  }
}

/** Auto-mark attendance when student pushes code */
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

// ── GET /intern/work-logs ─────────────────────────────────────────────────────────

export async function getWorkLogs(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const alloc = await getInternAllocation(studentId);
  if (!alloc) { res.json({ success: true, data: [] }); return; }

  const { rows } = await db.query<any>(`
    SELECT id,
           TO_CHAR(log_date, 'YYYY-MM-DD') AS date,
           hours_worked AS "hoursWorked",
           description AS "workDone",
           challenges,
           mentor_comment AS "mentorComment",
           status
    FROM intern_work_logs
    WHERE student_id = $1 AND program_id = $2
    ORDER BY log_date DESC
  `, [studentId, alloc.program_id]);

  res.json({ success: true, data: rows });
}

// ── POST /intern/work-logs ────────────────────────────────────────────────────────

export async function addWorkLog(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const { date, hoursWorked, workDone, challenges } = req.body;

  if (!date || !workDone?.trim()) {
    throw new AppError('Date and work description are required', 400, 'VALIDATION_ERROR');
  }

  const alloc = await getInternAllocation(studentId);
  if (!alloc) throw new AppError('Not enrolled in any internship', 404, 'NOT_FOUND');

  const { rows: [log] } = await db.query<any>(`
    INSERT INTO intern_work_logs (student_id, program_id, log_date, hours_worked, description, challenges, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
    RETURNING id, TO_CHAR(log_date,'YYYY-MM-DD') AS date, hours_worked AS "hoursWorked",
              description AS "workDone", challenges, mentor_comment AS "mentorComment", status
  `, [studentId, alloc.program_id, date, hoursWorked ?? 4, workDone.trim(), challenges ?? '']);

  res.status(201).json({ success: true, data: log });
}

// ── GET /intern/attendance ────────────────────────────────────────────────────────

export async function getAttendance(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const alloc = await getInternAllocation(studentId);
  if (!alloc) { res.json({ success: true, data: [] }); return; }

  const { rows } = await db.query<any>(`
    SELECT id,
           TO_CHAR(session_date, 'YYYY-MM-DD') AS date,
           TO_CHAR(session_date, 'Dy') AS day,
           status
    FROM intern_attendance
    WHERE student_id = $1 AND program_id = $2
    ORDER BY session_date
  `, [studentId, alloc.program_id]);

  res.json({ success: true, data: rows });
}

// ── GET /intern/evaluation ────────────────────────────────────────────────────────

export async function getEvaluation(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const alloc = await getInternAllocation(studentId);
  if (!alloc) { res.json({ success: true, data: null }); return; }

  const { rows } = await db.query<any>(`
    SELECT category, score, max_score AS "maxScore", feedback
    FROM intern_evaluations
    WHERE student_id = $1 AND program_id = $2
    ORDER BY evaluated_at
  `, [studentId, alloc.program_id]);

  if (!rows.length) { res.json({ success: true, data: null }); return; }

  const total = rows.reduce((s: number, r: any) => s + Number(r.score), 0);
  const maxTotal = rows.reduce((s: number, r: any) => s + Number(r.maxScore), 0);
  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
  const rating =
    pct >= 90 ? 'Excellent' :
    pct >= 75 ? 'Very Good' :
    pct >= 60 ? 'Good' :
    pct >= 40 ? 'Average' : 'Needs Improvement';

  res.json({
    success: true,
    data: {
      params: rows,
      total,
      maxTotal,
      pct,
      rating,
      mentorName: alloc.mentor_name,
    },
  });
}

// ── GET /intern/stipend ───────────────────────────────────────────────────────────

export async function getStipend(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const alloc = await getInternAllocation(studentId);
  if (!alloc) { res.json({ success: true, data: [] }); return; }

  const { rows } = await db.query<any>(`
    SELECT id, month, amount, status,
           TO_CHAR(paid_at, 'YYYY-MM-DD') AS "paymentDate"
    FROM intern_stipends
    WHERE student_id = $1 AND program_id = $2
    ORDER BY created_at
  `, [studentId, alloc.program_id]);

  res.json({ success: true, data: rows });
}

// ── ADMIN: GET /admin/intern/programs ────────────────────────────────────────────

export async function adminGetPrograms(req: Request, res: Response) {
  const { rows } = await db.query<any>(`
    SELECT id, title, company, batch_name AS "batchName", mentor_name AS "mentorName",
           TO_CHAR(start_date,'YYYY-MM-DD') AS "startDate",
           TO_CHAR(end_date,'YYYY-MM-DD')   AS "endDate",
           stipend_per_month AS "stipendPerMonth", is_active AS "isActive",
           description
    FROM internship_programs ORDER BY created_at DESC
  `);
  res.json({ success: true, data: rows });
}

// ── ADMIN: POST /admin/intern/programs ───────────────────────────────────────────

export async function adminCreateProgram(req: Request, res: Response) {
  const { title, company, batchName, mentorName, startDate, endDate, stipendPerMonth, description, isActive } = req.body;
  if (!title?.trim() || !company?.trim() || !startDate || !endDate) {
    throw new AppError('title, company, startDate, endDate are required', 400, 'VALIDATION_ERROR');
  }
  const { rows: [row] } = await db.query<any>(`
    INSERT INTO internship_programs (title, company, batch_name, mentor_name, start_date, end_date, stipend_per_month, description, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id, title, company,
              batch_name AS "batchName", mentor_name AS "mentorName",
              TO_CHAR(start_date,'YYYY-MM-DD') AS "startDate",
              TO_CHAR(end_date,'YYYY-MM-DD')   AS "endDate",
              stipend_per_month AS "stipendPerMonth", is_active AS "isActive", description
  `, [
    title.trim(), company.trim(),
    batchName?.trim() || null, mentorName?.trim() || null,
    startDate, endDate,
    stipendPerMonth ?? 0, description?.trim() || null,
    isActive !== false,
  ]);
  res.status(201).json({ success: true, data: row });
}

// ── ADMIN: PUT /admin/intern/programs/:id ────────────────────────────────────────

export async function adminUpdateProgram(req: Request, res: Response) {
  const { id } = req.params;
  const { title, company, batchName, mentorName, startDate, endDate, stipendPerMonth, description, isActive } = req.body;
  const { rows: [row] } = await db.query<any>(`
    UPDATE internship_programs SET
      title = COALESCE($1, title),
      company = COALESCE($2, company),
      batch_name = COALESCE($3, batch_name),
      mentor_name = COALESCE($4, mentor_name),
      start_date = COALESCE($5, start_date),
      end_date = COALESCE($6, end_date),
      stipend_per_month = COALESCE($7, stipend_per_month),
      description = COALESCE($8, description),
      is_active = COALESCE($9, is_active),
      updated_at = NOW()
    WHERE id = $10
    RETURNING id, title, company,
              batch_name AS "batchName", mentor_name AS "mentorName",
              TO_CHAR(start_date,'YYYY-MM-DD') AS "startDate",
              TO_CHAR(end_date,'YYYY-MM-DD')   AS "endDate",
              stipend_per_month AS "stipendPerMonth", is_active AS "isActive", description
  `, [
    title?.trim() || null, company?.trim() || null,
    batchName?.trim() ?? undefined, mentorName?.trim() ?? undefined,
    startDate || null, endDate || null,
    stipendPerMonth ?? null, description?.trim() ?? undefined,
    isActive ?? null,
    id,
  ]);
  if (!row) throw new AppError('Program not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: row });
}

// ── ADMIN: DELETE /admin/intern/programs/:id ─────────────────────────────────────

export async function adminDeleteProgram(req: Request, res: Response) {
  const { id } = req.params;
  const { rowCount } = await db.query(`DELETE FROM internship_programs WHERE id = $1`, [id]);
  if (!rowCount) throw new AppError('Program not found', 404, 'NOT_FOUND');
  res.json({ success: true });
}

// ── ADMIN: Internship batches ───────────────────────────────────────────────────

export async function adminGetBatches(req: Request, res: Response) {
  // First fetch batches without the student count (avoids dependency on intern_allocations
  // which may not exist or may be missing columns on first startup).
  const { rows: batches } = await db.query<any>(`
    SELECT
      ib.id,
      ib.program_id AS "programId",
      ip.title AS "programTitle",
      ip.company,
      ib.name,
      ib.mentor_id AS "mentorId",
      COALESCE(u.name, '') AS "mentorName",
      COALESCE(u.email, '') AS "mentorEmail",
      TO_CHAR(ib.start_date, 'YYYY-MM-DD') AS "startDate",
      TO_CHAR(ib.end_date, 'YYYY-MM-DD') AS "endDate",
      ib.status
    FROM intern_batches ib
    JOIN internship_programs ip ON ip.id = ib.program_id
    LEFT JOIN users u ON u.id = ib.mentor_id
    ORDER BY ib.created_at DESC
  `);

  // Try to enrich with student counts; fall back to 0 if table not ready yet.
  let countMap: Record<string, number> = {};
  try {
    const { rows: counts } = await db.query<any>(`
      SELECT batch_id, COUNT(*)::INT AS cnt
      FROM intern_allocations
      WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
      GROUP BY batch_id
    `);
    for (const c of counts) countMap[c.batch_id] = c.cnt;
  } catch {
    // intern_allocations not ready — counts will default to 0
  }

  const data = batches.map((b: any) => ({ ...b, studentCount: countMap[b.id] ?? 0 }));
  res.json({ success: true, data });
}

export async function adminCreateBatch(req: Request, res: Response) {
  const { programId, name, mentorId, startDate, endDate, status } = req.body;
  if (!programId || !name?.trim() || !mentorId || !startDate || !endDate) {
    throw new AppError('programId, name, mentorId, startDate and endDate are required', 400, 'VALIDATION_ERROR');
  }

  const { rows: [mentor] } = await db.query<any>(
    `SELECT id FROM users WHERE id = $1 AND role IN ('TRAINER','ADMIN','SUPER_ADMIN')`,
    [mentorId]
  );
  if (!mentor) throw new AppError('Selected mentor not found', 404, 'NOT_FOUND');

  const { rows: [row] } = await db.query<any>(`
    INSERT INTO intern_batches (program_id, name, mentor_id, start_date, end_date, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, program_id AS "programId", name, mentor_id AS "mentorId",
      TO_CHAR(start_date, 'YYYY-MM-DD') AS "startDate",
      TO_CHAR(end_date, 'YYYY-MM-DD') AS "endDate",
      status
  `, [programId, name.trim(), mentorId, startDate, endDate, status || 'UPCOMING']);

  res.status(201).json({ success: true, data: row });
}

export async function adminUpdateBatch(req: Request, res: Response) {
  const { id } = req.params;
  const { programId, name, mentorId, startDate, endDate, status } = req.body;

  const { rows: [row] } = await db.query<any>(`
    UPDATE intern_batches SET
      program_id = COALESCE($1, program_id),
      name = COALESCE($2, name),
      mentor_id = COALESCE($3, mentor_id),
      start_date = COALESCE($4, start_date),
      end_date = COALESCE($5, end_date),
      status = COALESCE($6, status),
      updated_at = NOW()
    WHERE id = $7
    RETURNING id, program_id AS "programId", name, mentor_id AS "mentorId",
      TO_CHAR(start_date, 'YYYY-MM-DD') AS "startDate",
      TO_CHAR(end_date, 'YYYY-MM-DD') AS "endDate",
      status
  `, [programId || null, name?.trim() || null, mentorId || null, startDate || null, endDate || null, status || null, id]);

  if (!row) throw new AppError('Batch not found', 404, 'NOT_FOUND');

  // Trigger completion email if batch is marked as COMPLETED
  if (status === 'COMPLETED') {
    try {
      const { rows: interns } = await db.query<any>(`
        UPDATE intern_allocations
        SET status = 'COMPLETED', updated_at = NOW()
        WHERE batch_id = $1 AND status = 'ACTIVE'
        RETURNING student_id, program_id
      `, [id]);

      if (interns.length > 0) {
        const { rows: userEmails } = await db.query<any>(`
          SELECT u.name, u.email, p.title AS program_name
          FROM intern_allocations ia
          JOIN users u ON u.id = ia.student_id
          JOIN internship_programs p ON p.id = ia.program_id
          WHERE ia.batch_id = $1
        `, [id]);

        for (const user of userEmails) {
          if (user.email) {
            const emailOpts = internshipCompletedEmail(user.name, user.program_name);
            emailOpts.to = user.email;
            await sendEmail(emailOpts).catch(e => console.error('Failed to send completion email:', e));
          }
        }
      }
    } catch (err) {
      console.error('Failed to trigger intern completion emails:', err);
    }
  }

  res.json({ success: true, data: row });
}

export async function adminDeleteBatch(req: Request, res: Response) {
  const { id } = req.params;
  const { rowCount } = await db.query(`DELETE FROM intern_batches WHERE id = $1`, [id]);
  if (!rowCount) throw new AppError('Batch not found', 404, 'NOT_FOUND');
  res.json({ success: true });
}

export async function adminGetBatchStudents(req: Request, res: Response) {
  const { batchId } = req.params;
  const { rows } = await db.query<any>(`
    SELECT
      ia.id AS "allocationId",
      ia.student_id AS "studentId",
      ia.status AS "allocationStatus",
      ia.progress,
      TO_CHAR(ia.created_at, 'YYYY-MM-DD') AS "enrolledAt",
      u.name,
      u.email,
      COALESCE(u.github_username, '') AS "githubUsername",
      COALESCE(u.phone_number, '') AS phone,
      COALESCE(t_stats.tasks_assigned, 0)::INT AS "tasksAssigned",
      COALESCE(p_stats.tasks_graded, 0)::INT AS "tasksGraded",
      p_stats.avg_score AS "avgScore"
    FROM intern_allocations ia
    JOIN users u ON u.id = ia.student_id
    LEFT JOIN (
      SELECT program_id, COUNT(*)::INT AS tasks_assigned
      FROM intern_tasks
      GROUP BY program_id
    ) t_stats ON t_stats.program_id = ia.program_id
    LEFT JOIN (
      SELECT p.student_id, t.program_id,
             COUNT(*) FILTER (WHERE p.status = 'AI_GRADED')::INT AS tasks_graded,
             ROUND(AVG(p.ai_score)::NUMERIC, 1) AS avg_score
      FROM intern_task_progress p
      JOIN intern_tasks t ON t.id = p.task_id
      GROUP BY p.student_id, t.program_id
    ) p_stats ON p_stats.student_id = ia.student_id AND p_stats.program_id = ia.program_id
    WHERE ia.batch_id = $1
    ORDER BY u.name
  `, [batchId]);
  res.json({ success: true, data: rows.map((r: any) => ({ ...r, avgScore: r.avgScore != null ? Number(r.avgScore) : null })) });
}

// ── ADMIN: GET /admin/intern/references/:programId ────────────────────────────────

export async function adminGetReferences(req: Request, res: Response) {
  const { programId } = req.params;
  const { rows } = await db.query<any>(`
    SELECT id, ref_no AS "refNo", title, type, url, description
    FROM intern_references WHERE program_id = $1
    ORDER BY ref_no, created_at
  `, [programId]);

  // Group by refNo
  const groupMap = new Map<number, any>();
  for (const row of rows) {
    if (!groupMap.has(row.refNo)) {
      groupMap.set(row.refNo, {
        id: row.id, refNo: row.refNo,
        title: row.description, description: '',
        programId, items: [],
      });
    }
    groupMap.get(row.refNo)!.items.push({ id: row.id, type: row.type, url: row.url, label: row.title });
  }
  res.json({ success: true, data: Array.from(groupMap.values()) });
}

// ── ADMIN: POST /admin/intern/references/upload ───────────────────────────────────
// Uploads a single file (PDF or PPT) to S3 under intern-references/

export async function adminUploadRefFile(req: Request, res: Response) {
  const file = (req as any).file;
  if (!file) throw new AppError('No file uploaded', 400, 'VALIDATION_ERROR');

  const result = await storageAdapter.upload(
    { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    'intern-references'
  );

  res.json({
    success: true,
    data: { url: await storageAdapter.getUrl(result.key), key: result.key },
  });
}

// ── ADMIN: POST /admin/intern/references ──────────────────────────────────────────
// Create a reference group (multiple items) for a program

export async function adminCreateRefGroup(req: Request, res: Response) {
  const { programId, title, items } = req.body as {
    programId: string;
    title: string;
    items: Array<{ type: string; url: string; label: string }>;
  };

  if (!programId || !title || !Array.isArray(items) || items.length === 0) {
    throw new AppError('programId, title, and at least one item are required', 400, 'VALIDATION_ERROR');
  }

  // Get next ref_no for this program
  const { rows: [maxRow] } = await db.query<any>(
    `SELECT COALESCE(MAX(ref_no), 0) AS max FROM intern_references WHERE program_id = $1`,
    [programId]
  );
  const nextRefNo = (maxRow.max as number) + 1;

  const insertedIds: string[] = [];
  for (const item of items) {
    const { rows: [r] } = await db.query<any>(`
      INSERT INTO intern_references (program_id, ref_no, title, type, url, description)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, [programId, nextRefNo, item.label || item.type, item.type, item.url, title]);
    insertedIds.push(r.id);
  }

  res.status(201).json({ success: true, data: { refNo: nextRefNo, insertedIds } });
}

// ── ADMIN: DELETE /admin/intern/references/:refNo/:programId ─────────────────────

export async function adminDeleteRefGroup(req: Request, res: Response) {
  const programId = req.params.programId as string;
  const refNo = parseInt(req.params.refNo as string, 10);
  await db.query(
    `DELETE FROM intern_references WHERE program_id = $1 AND ref_no = $2`,
    [programId, refNo]
  );
  res.json({ success: true });
}

// ── GET /intern/certificate ───────────────────────────────────────────────────────

export async function getCertificate(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const alloc = await getInternAllocation(studentId);
  if (!alloc) { res.json({ success: true, data: null }); return; }

  // Calculate eligibility from live data
  const { rows: att } = await db.query<any>(
    `SELECT status FROM intern_attendance WHERE student_id = $1 AND program_id = $2`,
    [studentId, alloc.program_id]
  );
  const presentDays = att.filter((a: any) => a.status === 'PRESENT').length;
  const halfDays    = att.filter((a: any) => a.status === 'HALF_DAY').length;
  const attPct = att.length ? Math.round(((presentDays + halfDays * 0.5) / att.length) * 100) : 0;

  const { rows: [taskCounts] } = await db.query<any>(`
    SELECT
      (SELECT COUNT(*) FROM intern_tasks WHERE program_id = $2)::INT AS total,
      (SELECT COUNT(*) FROM intern_task_progress p
       JOIN intern_tasks t ON t.id = p.task_id
       WHERE p.student_id = $1 AND t.program_id = $2 AND p.status = 'AI_GRADED')::INT AS graded
  `, [studentId, alloc.program_id]);
  const projectSubmitted = taskCounts.total > 0 && taskCounts.graded >= taskCounts.total;

  const { rows: evals } = await db.query<any>(
    `SELECT COUNT(*) AS cnt FROM intern_evaluations WHERE student_id = $1 AND program_id = $2`,
    [studentId, alloc.program_id]
  );
  const evaluationDone = parseInt(evals[0].cnt) > 0;

  const { rows: [cert] } = await db.query<any>(
    `SELECT * FROM intern_certificates WHERE student_id = $1 AND program_id = $2`,
    [studentId, alloc.program_id]
  );

  res.json({
    success: true,
    data: {
      status: cert?.status ?? 'PENDING',
      attendancePct: attPct,
      projectSubmitted,
      evaluationDone,
      certificateId: cert?.certificate_id ?? '',
      issueDate: cert?.issued_at ? new Date(cert.issued_at).toISOString().split('T')[0] : '',
      grade: cert?.grade ?? '',
      certificateUrl: cert?.certificate_url ?? '',
    },
  });
}

// ── ADMIN: GET /admin/intern/programs/:programId/tasks ───────────────────────────

export async function adminGetTasks(req: Request, res: Response) {
  const { programId } = req.params;
  const { rows } = await db.query<any>(`
    SELECT
      id,
      sprint_no AS "sprintNo",
      title,
      description,
      artifact_type AS "artifactType",
      COALESCE(project_pdf_url, '') AS "projectPdfUrl",
      COALESCE(project_pdf_name, '') AS "projectPdfName",
      COALESCE(template_repo_url, '') AS "templateRepoUrl",
      TO_CHAR(due_date, 'YYYY-MM-DD') AS "dueDate",
      priority,
      COALESCE(linked_ref_ids, '{}') AS "linkedRefIds"
    FROM intern_tasks
    WHERE program_id = $1
    ORDER BY sprint_no
  `, [programId]);

  const tasks = rows.map((t: any) => ({
    ...t,
    linkedRefIds: Array.isArray(t.linkedRefIds) ? t.linkedRefIds : [],
    taskFiles: t.projectPdfUrl ? [{ name: t.projectPdfName, url: t.projectPdfUrl, type: 'pdf' }] : [],
    resources: [], // This could be populated by joining with intern_references, but keeping simple for now
  }));

  res.json({ success: true, data: tasks });
}

// ── ADMIN: POST /admin/intern/programs/:programId/tasks ──────────────────────────

export async function adminCreateTask(req: Request, res: Response) {
  const { programId } = req.params;
  const { sprintNo, title, description, artifactType, projectPdfUrl, projectPdfName, templateRepoUrl, dueDate, priority, linkedRefIds } = req.body;

  if (!title?.trim() || !sprintNo) {
    throw new AppError('Sprint number and title are required', 400, 'VALIDATION_ERROR');
  }

  const { rows: [task] } = await db.query<any>(`
    INSERT INTO intern_tasks (program_id, sprint_no, title, description, artifact_type, project_pdf_url, project_pdf_name, template_repo_url, due_date, priority, linked_ref_ids)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, sprint_no AS "sprintNo", title, description, artifact_type AS "artifactType",
              project_pdf_url AS "projectPdfUrl", project_pdf_name AS "projectPdfName",
              template_repo_url AS "templateRepoUrl", TO_CHAR(due_date, 'YYYY-MM-DD') AS "dueDate", priority,
              COALESCE(linked_ref_ids, '{}') AS "linkedRefIds"
  `, [
    programId, sprintNo, title.trim(), description?.trim() || null, artifactType?.trim() || 'Other',
    projectPdfUrl?.trim() || null, projectPdfName?.trim() || null, templateRepoUrl?.trim() || null,
    dueDate || null, priority?.trim() || 'MEDIUM', linkedRefIds || []
  ]);

  // Send assignment emails
  try {
    const { rows: interns } = await db.query<any>(`
      SELECT u.name, u.email, p.title AS program_name
      FROM intern_allocations ia
      JOIN users u ON u.id = ia.student_id
      JOIN internship_programs p ON p.id = ia.program_id
      WHERE ia.program_id = $1 AND ia.status = 'ACTIVE'
    `, [programId]);

    for (const intern of interns) {
      if (intern.email) {
        const emailOpts = internTaskAssignedEmail(intern.name, task.title, task.dueDate || 'N/A', intern.program_name);
        emailOpts.to = intern.email;
        await sendEmail(emailOpts).catch(err => console.error('Failed to send task email to', intern.email, err));
      }
    }
  } catch (err) {
    console.error('Error fetching interns for task assignment email:', err);
  }

  res.status(201).json({ success: true, data: task });
}

// ── ADMIN: DELETE /admin/intern/tasks/:taskId ───────────────────────────

export async function adminDeleteTask(req: Request, res: Response) {
  const { taskId } = req.params;

  if (!taskId) {
    throw new AppError('Task ID is required', 400, 'VALIDATION_ERROR');
  }

  const { rowCount } = await db.query(
    `DELETE FROM intern_tasks WHERE id = $1`,
    [taskId]
  );

  if (rowCount === 0) {
    throw new AppError('Task not found', 404, 'NOT_FOUND');
  }

  res.json({ success: true, message: 'Task deleted successfully' });
}

// ── ADMIN: GET /admin/intern/programs/:programId/pipeline ────────────────────────

export async function adminGetPipeline(req: Request, res: Response) {
  const { programId } = req.params;

  // We want to fetch all task progress records for all students in this program.
  // Join with users to get student names.
  const { rows } = await db.query<any>(`
    SELECT
      p.id,
      p.student_id AS "studentId",
      u.name AS "studentName",
      p.task_id AS "taskId",
      p.status,
      p.fork_url AS "forkUrl",
      p.pr_url AS "prUrl",
      p.commit_count AS "commitCount",
      TO_CHAR(p.last_push_at, 'YYYY-MM-DD HH24:MI') AS "lastPushAt",
      p.ai_score::FLOAT AS "aiScore",
      COALESCE(p.ai_breakdown, '[]'::jsonb) AS "aiBreakdown",
      COALESCE(p.ai_feedback, '') AS "aiFeedback",
      TO_CHAR(p.submitted_at, 'YYYY-MM-DD HH24:MI') AS "submittedAt",
      TO_CHAR(p.graded_at, 'YYYY-MM-DD HH24:MI') AS "gradedAt",
      (SELECT count(*) FROM intern_attendance a WHERE a.student_id = p.student_id AND a.program_id = $1 AND a.status = 'PRESENT') > 0 AS "attendanceAutoMarked"
    FROM intern_task_progress p
    JOIN users u ON u.id = p.student_id
    JOIN intern_tasks t ON t.id = p.task_id
    WHERE t.program_id = $1
    ORDER BY p.updated_at DESC
  `, [programId]);

  const pipeline = rows.map((p: any) => ({
    ...p,
    aiScore: p.aiScore != null ? parseFloat(p.aiScore) : null,
    commitCount: parseInt(p.commitCount, 10) || 0,
    aiBreakdown: Array.isArray(p.aiBreakdown)
      ? p.aiBreakdown.map((b: any) => ({ ...b, score: Number(b.score), max: Number(b.max) }))
      : [],
  }));

  res.json({ success: true, data: pipeline });
}

// ── ADMIN: GET /admin/webhooks ───────────────────────────────────────────────────
export async function adminGetWebhookEvents(req: Request, res: Response) {
  const { rows } = await db.query<any>(`
    SELECT
      we.id,
      we.student_id AS "studentId",
      u.name AS "studentName",
      we.pusher_login AS "pusherLogin",
      we.repo_name AS "repoName",
      we.repo_owner AS "repoOwner",
      we.ref,
      we.head_sha AS "headSha",
      we.commit_message AS "commitMessage",
      we.status,
      we.error_message AS "errorMessage",
      COALESCE(we.source, 'webhook') AS source,
      TO_CHAR(we.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "timestamp",
      (we.student_id IS NOT NULL) AS "attendanceMarked"
    FROM intern_webhook_events we
    LEFT JOIN users u ON u.id = we.student_id
    ORDER BY we.created_at DESC
    LIMIT 100
  `);
  res.json({ success: true, data: rows });
}

// ── ADMIN: POST /admin/programs/:programId/tasks/:taskId/scan ─────────────────
// Manual re-scan: forces the poller logic to run immediately for one task.
// Useful for unblocking students stuck at CODING with commits that the auto-poller
// hasn't caught yet, or for testing the pipeline end-to-end.

export async function adminScanTask(req: Request, res: Response) {
  const { programId, taskId } = req.params;
  // Pass ?force=true to force re-grade even if last_push_sha matches (useful when grading failed silently)
  const forceRegrade = req.query.force === 'true';

  const { rows: [task] } = await db.query<any>(
    `SELECT id, title FROM intern_tasks WHERE id = $1 AND program_id = $2`,
    [taskId, programId]
  );
  if (!task) throw new AppError('Task not found in this program', 404, 'NOT_FOUND');

  const { rows: progressRows } = await db.query<any>(`
    SELECT p.student_id AS "studentId", u.name AS "studentName"
    FROM intern_task_progress p
    JOIN users u ON u.id = p.student_id
    WHERE p.task_id = $1
      AND p.fork_url IS NOT NULL
      AND p.fork_url <> ''
  `, [taskId]);

  if (progressRows.length === 0) {
    res.json({ success: true, data: { scanned: 0, detected: 0, message: 'No students have forked this task yet.' } });
    return;
  }

  const results: { studentName: string; detected: boolean; sha?: string; message?: string }[] = [];

  for (const row of progressRows) {
    try {
      const result = await pollSingleFork(row.studentId, String(taskId), forceRegrade);
      results.push({ studentName: row.studentName, ...result });
    } catch (err: any) {
      results.push({ studentName: row.studentName, detected: false, message: err?.message });
      console.error(`[admin-scan] pollSingleFork failed for ${row.studentId}:`, err?.message);
    }
  }

  const detected = results.filter(r => r.detected).length;
  res.json({
    success: true,
    data: {
      taskTitle: task.title,
      scanned: progressRows.length,
      detected,
      forceRegrade,
      results,
      message: detected > 0
        ? `Detected ${detected} student commit(s) — AI grading triggered in background.`
        : forceRegrade
          ? 'Force-regrade triggered for all students with forks.'
          : 'No new commits found. Use ?force=true to re-trigger grading on existing commits.',
    },
  });
}


// ── ADMIN LOOKUP: GET /admin/intern/lookup/batches ────────────────────────────────

export async function adminGetLookupBatches(req: Request, res: Response) {
  const { rows } = await db.query<any>(`
    SELECT
      ib.id,
      ib.name,
      ib.program_id AS "programId",
      ip.title AS "programTitle",
      u.name AS "mentorName",
      TO_CHAR(ib.start_date, 'YYYY-MM-DD') AS "startDate",
      TO_CHAR(ib.end_date, 'YYYY-MM-DD') AS "endDate"
    FROM intern_batches ib
    JOIN internship_programs ip ON ip.id = ib.program_id
    LEFT JOIN users u ON u.id = ib.mentor_id
    WHERE ib.status <> 'COMPLETED'
    ORDER BY ib.name
  `);
  res.json({ success: true, data: rows });
}

// ── ADMIN LOOKUP: GET /admin/intern/lookup/trainers ───────────────────────────────

export async function adminGetLookupTrainers(req: Request, res: Response) {
  const { rows } = await db.query<any>(`
    SELECT id, name, email, role
    FROM users
    WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN')
      AND COALESCE(is_active, true) = true
      AND COALESCE(account_status, 'ACTIVE') <> 'BLOCKED'
    ORDER BY role DESC, name
  `);
  res.json({ success: true, data: rows });
}

// ── ADMIN LOOKUP: GET /admin/intern/lookup/intern-students ────────────────────────

export async function adminGetLookupInternStudents(req: Request, res: Response) {
  const { rows } = await db.query<any>(`
    SELECT u.id, u.name, u.email,
           COALESCE(u.phone_number, '') AS phone,
           u.role,
           COALESCE(u.github_username, '') AS "githubUsername"
    FROM users u
    WHERE u.role = 'INTERN' AND COALESCE(u.is_active, true) = true
    ORDER BY u.name
  `);
  res.json({ success: true, data: rows });
}

export async function adminCreateTrainer(req: Request, res: Response) {
  const { name, email, phone, githubUsername, password } = req.body;
  const nameStr = name ? String(name).trim() : '';
  const emailStr = email ? String(email).trim() : '';
  
  if (!nameStr || !emailStr) {
    throw new AppError('name and email are required', 400, 'VALIDATION_ERROR');
  }

  const plainPassword = password ? String(password).trim() : makeTempPassword();
  const hash = await bcrypt.hash(plainPassword, 10);
  const phoneStr = phone ? String(phone).trim() : null;
  const githubStr = githubUsername ? String(githubUsername).trim() : null;

  try {
    const { rows: [user] } = await db.query<any>(`
      INSERT INTO users (name, email, password_hash, role, account_status, phone_number, github_username)
      VALUES ($1, $2, $3, 'TRAINER', 'ACTIVE', $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = 'TRAINER',
        account_status = 'ACTIVE',
        phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number),
        github_username = COALESCE(EXCLUDED.github_username, users.github_username),
        updated_at = NOW()
      RETURNING id, name, email, COALESCE(phone_number, '') AS phone,
        COALESCE(github_username, '') AS "githubUsername", role
    `, [nameStr, emailStr.toLowerCase(), hash, phoneStr, githubStr]);

    res.status(201).json({
      success: true,
      data: {
        ...user,
        password: plainPassword,
        loginNote: 'Trainer can log in with this email and password, then be mapped as a batch mentor.',
      },
    });
  } catch (error: any) {
    if (error.code === '23514') {
      throw new AppError('Database schema constraint issue: Run pnpm db:schema to update allowed roles.', 500, 'DB_SCHEMA_ERROR');
    }
    throw error;
  }
}

export async function adminCreateInternStudent(req: Request, res: Response) {
  const { name, email, phone, githubUsername, password } = req.body;
  const nameStr = name ? String(name).trim() : '';
  const emailStr = email ? String(email).trim().toLowerCase() : '';
  
  if (!nameStr || !emailStr) {
    throw new AppError('name and email are required', 400, 'VALIDATION_ERROR');
  }

  const { rows: emailClash } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [emailStr],
  );
  if (emailClash.length) {
    throw new AppError('Email already registered — do not recreate; reset password or edit the existing intern.', 409, 'DUPLICATE_EMAIL');
  }

  const githubStr = githubUsername ? String(githubUsername).trim().replace(/^@/, '') : '';
  if (githubStr) {
    const GITHUB_USERNAME_REGEX = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
    if (!GITHUB_USERNAME_REGEX.test(githubStr)) {
      throw new AppError('Invalid GitHub username format. It must contain only alphanumeric characters or single hyphens, and cannot exceed 39 characters.', 400, 'VALIDATION_ERROR');
    }
    const { rows: ghClash } = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(github_username) = LOWER($1) LIMIT 1`,
      [githubStr],
    );
    if (ghClash.length) {
      throw new AppError('This GitHub username is already linked to another learner.', 409, 'GITHUB_TAKEN');
    }
  }

  const plainPassword = password ? String(password).trim() : makeTempPassword();
  const hash = await bcrypt.hash(plainPassword, 10);
  const phoneStr = phone ? String(phone).trim() : null;

  try {
    const { rows: [user] } = await db.query<any>(`
      INSERT INTO users (name, email, password_hash, role, account_status, phone_number, github_username)
      VALUES ($1, $2, $3, 'INTERN', 'ACTIVE', $4, $5)
      RETURNING id, name, email, COALESCE(phone_number, '') AS phone,
        COALESCE(github_username, '') AS "githubUsername", role
    `, [nameStr, emailStr, hash, phoneStr, githubStr || null]);

    res.status(201).json({
      success: true,
      data: {
        ...user,
        password: plainPassword,
        portalUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/intern/portal`,
      },
    });
  } catch (error: any) {
    if (error.code === '23505') {
      throw new AppError('Email or GitHub username already in use', 409, 'DUPLICATE');
    }
    if (error.code === '23514') {
      throw new AppError('Database schema constraint issue: Run pnpm db:schema to update allowed roles.', 500, 'DB_SCHEMA_ERROR');
    }
    throw error;
  }
}

// ── ADMIN: GET /admin/intern/programs/:id/students ────────────────────────────────

export async function adminGetProgramStudents(req: Request, res: Response) {
  const { id: programId } = req.params;
  const { rows } = await db.query<any>(`
    SELECT
      ia.id AS "allocationId",
      ia.student_id AS "studentId",
      ia.batch_id AS "batchId",
      ib.name AS "batchName",
      mu.name AS "mentorName",
      ia.status AS "allocationStatus",
      TO_CHAR(ia.created_at, 'YYYY-MM-DD') AS "enrolledAt",
      u.name,
      u.email,
      COALESCE(u.github_username, '') AS "githubUsername",
      COALESCE(u.phone_number, '') AS phone,
      (SELECT COUNT(*) FROM intern_tasks t WHERE t.program_id = $1)::INT AS "tasksTotal",
      (SELECT COUNT(*) FROM intern_task_progress p
       JOIN intern_tasks t ON t.id = p.task_id
       WHERE p.student_id = ia.student_id AND t.program_id = $1 AND p.status = 'AI_GRADED') AS "tasksGraded",
      (SELECT ROUND(AVG(p.ai_score)::NUMERIC, 1) FROM intern_task_progress p
       JOIN intern_tasks t ON t.id = p.task_id
       WHERE p.student_id = ia.student_id AND t.program_id = $1 AND p.ai_score IS NOT NULL) AS "avgScore"
    FROM intern_allocations ia
    JOIN users u ON u.id = ia.student_id
    LEFT JOIN intern_batches ib ON ib.id = ia.batch_id
    LEFT JOIN users mu ON mu.id = ib.mentor_id
    WHERE ia.program_id = $1
    ORDER BY u.name
  `, [programId]);

  const data = rows.map((r: any) => ({
    ...r,
    tasksTotal: parseInt(r.tasksTotal, 10) || 0,
    tasksGraded: parseInt(r.tasksGraded, 10) || 0,
    avgScore: r.avgScore != null ? parseFloat(r.avgScore) : null,
  }));
  res.json({ success: true, data });
}

// ── ADMIN: POST /admin/intern/programs/:id/students ───────────────────────────────

export async function adminAddProgramStudent(req: Request, res: Response) {
  const { id: programId } = req.params;
  const { studentId, batchId } = req.body;

  if (!studentId?.trim() || !batchId?.trim()) {
    throw new AppError('studentId and batchId are required', 400, 'VALIDATION_ERROR');
  }

  // Verify user exists and is an INTERN
  const { rows: [user] } = await db.query<any>(
    `SELECT id, name, email, role FROM users WHERE id = $1`, [studentId]
  );
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  if (user.role !== 'INTERN') throw new AppError('User is not an INTERN', 400, 'VALIDATION_ERROR');

  const { rows: [batch] } = await db.query<any>(
    `SELECT id FROM intern_batches WHERE id = $1 AND program_id = $2`,
    [batchId, programId]
  );
  if (!batch) throw new AppError('Selected batch does not belong to this program', 400, 'VALIDATION_ERROR');

  // Check if already allocated
  const { rows: [existing] } = await db.query<any>(
    `SELECT id FROM intern_allocations WHERE student_id = $1 AND program_id = $2`,
    [studentId, programId]
  );
  if (existing) throw new AppError('Student is already enrolled in this program', 409, 'CONFLICT');

  await db.query(`
    INSERT INTO intern_allocations (student_id, program_id, batch_id, status)
    VALUES ($1, $2, $3, 'ACTIVE')
  `, [studentId, programId, batchId]);

  res.status(201).json({ success: true, data: { studentId, name: user.name, email: user.email } });
}

// ── ADMIN: DELETE /admin/intern/programs/:id/students/:studentId ──────────────────

export async function adminRemoveProgramStudent(req: Request, res: Response) {
  const { id: programId, studentId } = req.params;
  const { rowCount } = await db.query(
    `DELETE FROM intern_allocations WHERE program_id = $1 AND student_id = $2`,
    [programId, studentId]
  );
  if (!rowCount) throw new AppError('Allocation not found', 404, 'NOT_FOUND');
  res.json({ success: true });
}

// ── ADMIN: POST /admin/intern/tasks/:taskId/solution ─────────────────────────────

export async function adminUploadTaskSolution(req: Request, res: Response) {
  const { taskId } = req.params;
  const file = (req as any).file;
  if (!file) throw new AppError('No file uploaded', 400, 'VALIDATION_ERROR');

  // Verify task exists
  const { rows: [task] } = await db.query<any>(
    `SELECT id, title FROM intern_tasks WHERE id = $1`, [taskId]
  );
  if (!task) throw new AppError('Task not found', 404, 'NOT_FOUND');

  // Upload to private path in storage
  const result = await storageAdapter.upload(
    { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    'intern-solutions'
  );
  const solutionText = await extractSolutionText(file);

  // Update task record
  await db.query(`
    UPDATE intern_tasks
    SET solution_file_url = $1, solution_file_key = $2, solution_file_name = $3, solution_file_text = $4, updated_at = NOW()
    WHERE id = $5
  `, [result.key, result.key, file.originalname, solutionText, taskId]);

  res.json({ success: true, data: { key: result.key, name: file.originalname, extractedText: !!solutionText } });
}

// ── ADMIN: GET /admin/intern/programs/:id/students/:studentId/credentials ─────────

export async function adminGetStudentCredentials(req: Request, res: Response) {
  const { studentId } = req.params;
  const { rows: [user] } = await db.query<any>(
    `SELECT id, name, email, COALESCE(github_username, '') AS "githubUsername", COALESCE(phone_number, '') AS phone, role FROM users WHERE id = $1`,
    [studentId]
  );
  if (!user) throw new AppError('Student not found', 404, 'NOT_FOUND');
  // Never return password. Only safe profile info for the admin to share.
  res.json({
    success: true,
    data: {
      studentId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      githubUsername: user.githubUsername,
      role: user.role,
      portalUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/intern/portal`,
      loginNote: 'Password is only shown when the account was just created or after you click Generate New Password below.',
    }
  });
}

// ── ADMIN: Dashboard stats ───────────────────────────────────────────────────────

export async function adminGetDashboard(req: Request, res: Response) {
  // Build each stat independently so a missing table doesn't kill the whole dashboard
  async function safeCount(sql: string): Promise<number> {
    try {
      const { rows: [r] } = await db.query<any>(sql);
      return parseInt(r?.cnt ?? r?.count ?? '0', 10) || 0;
    } catch { return 0; }
  }
  async function safeSum(sql: string): Promise<number> {
    try {
      const { rows: [r] } = await db.query<any>(sql);
      return parseInt(r?.total ?? '0', 10) || 0;
    } catch { return 0; }
  }

  const [
    activePrograms, totalPrograms, activeInterns, totalAllocations,
    partnerCompanies, pendingWorklogs, pendingCertificates,
    paidStipends, pendingStipends, completedAllocations, ppoOffered, ppoTotal,
  ] = await Promise.all([
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM internship_programs WHERE COALESCE(is_active, true) = true`),
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM internship_programs`),
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM intern_allocations WHERE COALESCE(status,'ACTIVE') = 'ACTIVE'`),
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM intern_allocations`),
    safeCount(`SELECT COUNT(DISTINCT company)::INT AS cnt FROM internship_programs`),
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM intern_work_logs WHERE COALESCE(status,'PENDING') = 'PENDING'`),
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM intern_certificates WHERE COALESCE(status,'PENDING') = 'PENDING'`),
    safeSum(`SELECT COALESCE(SUM(amount),0)::INT AS total FROM intern_stipends WHERE status = 'PAID'`),
    safeSum(`SELECT COALESCE(SUM(amount),0)::INT AS total FROM intern_stipends WHERE COALESCE(status,'PENDING') = 'PENDING'`),
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM intern_allocations WHERE status = 'COMPLETED'`),
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM intern_ppo WHERE ppo_offered = true`),
    safeCount(`SELECT COUNT(*)::INT AS cnt FROM intern_ppo`),
  ]);

  const stats = {
    activePrograms, totalPrograms, activeInterns, totalAllocations,
    partnerCompanies, pendingWorklogs, pendingCertificates,
    paidStipends, pendingStipends, completedAllocations, ppoOffered, ppoTotal,
  };

  let progressRows: any[] = [];
  try {
    const res2 = await db.query<any>(`
      SELECT
        ia.id,
        u.name AS "studentName",
        ip.title AS "internshipTitle",
        ip.company,
        COALESCE(mu.name, COALESCE(ip.mentor_name, '')) AS mentor,
        COALESCE(ia.status, 'ACTIVE') AS status,
        COALESCE(ia.progress, 0) AS progress,
        0::INT AS "tasksTotal",
        0::INT AS "tasksGraded"
      FROM intern_allocations ia
      JOIN users u ON u.id = ia.student_id
      JOIN internship_programs ip ON ip.id = ia.program_id
      LEFT JOIN intern_batches ib ON ib.id = ia.batch_id
      LEFT JOIN users mu ON mu.id = ib.mentor_id
      WHERE COALESCE(ia.status, 'ACTIVE') IN ('ACTIVE', 'COMPLETED')
      ORDER BY ia.created_at DESC
      LIMIT 20
    `);
    progressRows = res2.rows;
  } catch { /* intern_allocations not ready */ }

  const allocations = progressRows.map((r: any) => ({
    ...r,
    progress: parseInt(r.progress, 10) || 0,
  }));

  let recentLogs: any[] = [];
  try {
    const res3 = await db.query<any>(`
      SELECT
        wl.id,
        u.name AS "studentName",
        TO_CHAR(wl.log_date, 'YYYY-MM-DD') AS date,
        wl.description AS "workDone",
        wl.hours_worked AS "hoursWorked",
        COALESCE(wl.challenges, '') AS challenges,
        COALESCE(wl.mentor_comment, '') AS "mentorComments",
        COALESCE(wl.status, 'PENDING') AS status
      FROM intern_work_logs wl
      JOIN users u ON u.id = wl.student_id
      ORDER BY wl.created_at DESC
      LIMIT 8
    `);
    recentLogs = res3.rows;
  } catch { /* intern_work_logs not ready */ }

  const avgProgress = allocations.length
    ? Math.round(allocations.reduce((s: number, a: any) => s + (a.progress ?? 0), 0) / allocations.length)
    : 0;

  res.json({
    success: true,
    data: {
      ...stats,
      completionRate: stats.totalAllocations ? Math.round((stats.completedAllocations / stats.totalAllocations) * 100) : 0,
      ppoConversionRate: stats.ppoTotal ? Math.round((stats.ppoOffered / stats.ppoTotal) * 100) : 0,
      avgProgress,
      allocations,
      recentWorkLogs: recentLogs,
    },
  });
}

// ── ADMIN: Work logs ─────────────────────────────────────────────────────────────

export async function adminGetWorkLogs(req: Request, res: Response) {
  const programId = req.query.programId as string | undefined;
  const batchId = req.query.batchId as string | undefined;

  const params: string[] = [];
  const filters: string[] = [];
  if (programId) { params.push(programId); filters.push(`wl.program_id = $${params.length}`); }
  if (batchId) { params.push(batchId); filters.push(`ia.batch_id = $${params.length}`); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const { rows } = await db.query<any>(`
    SELECT
      wl.id,
      wl.student_id AS "studentId",
      u.name AS "studentName",
      wl.program_id AS "programId",
      ip.title AS "programTitle",
      TO_CHAR(wl.log_date, 'YYYY-MM-DD') AS date,
      wl.hours_worked AS "hoursWorked",
      wl.description AS "workDone",
      wl.challenges,
      wl.mentor_comment AS "mentorComments",
      wl.status
    FROM intern_work_logs wl
    JOIN users u ON u.id = wl.student_id
    JOIN internship_programs ip ON ip.id = wl.program_id
    LEFT JOIN intern_allocations ia ON ia.student_id = wl.student_id AND ia.program_id = wl.program_id
    ${where}
    ORDER BY wl.log_date DESC, wl.created_at DESC
  `, params);

  res.json({ success: true, data: rows });
}

export async function adminUpdateWorkLog(req: Request, res: Response) {
  const { id } = req.params;
  const { status, mentorComment } = req.body;
  if (!status || !['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
    throw new AppError('status must be APPROVED, REJECTED, or PENDING', 400, 'VALIDATION_ERROR');
  }

  const { rows: [row] } = await db.query<any>(`
    UPDATE intern_work_logs
    SET status = $1, mentor_comment = COALESCE($2, mentor_comment)
    WHERE id = $3
    RETURNING id, status, mentor_comment AS "mentorComments"
  `, [status, mentorComment?.trim() || null, id]);

  if (!row) throw new AppError('Work log not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: row });
}

// ── ADMIN: Attendance ────────────────────────────────────────────────────────────

export async function adminGetAttendance(req: Request, res: Response) {
  const programId = req.query.programId as string | undefined;
  const batchId = req.query.batchId as string | undefined;
  if (!programId) throw new AppError('programId query param is required', 400, 'VALIDATION_ERROR');

  const params: any[] = [programId];
  let batchFilter = '';
  if (batchId) {
    params.push(batchId);
    batchFilter = `AND ia.batch_id = $${params.length}`;
  }

  const { rows } = await db.query<any>(`
    SELECT
      ia.id,
      ia.student_id AS "studentId",
      u.name AS "studentName",
      TO_CHAR(a.session_date, 'YYYY-MM-DD') AS date,
      COALESCE(a.status, 'ABSENT') AS status,
      COALESCE(a.notes, '') AS remarks,
      a.id AS "attendanceId"
    FROM intern_allocations ia
    JOIN users u ON u.id = ia.student_id
    LEFT JOIN intern_attendance a ON a.student_id = ia.student_id AND a.program_id = ia.program_id
    WHERE ia.program_id = $1 ${batchFilter}
    ORDER BY u.name, a.session_date DESC NULLS LAST
  `, params);

  res.json({ success: true, data: rows });
}

export async function adminMarkAttendance(req: Request, res: Response) {
  const { studentId, programId, batchId, date, status, notes } = req.body;
  if (!studentId || !programId || !date || !status) {
    throw new AppError('studentId, programId, date and status are required', 400, 'VALIDATION_ERROR');
  }

  const { rows: [row] } = await db.query<any>(`
    INSERT INTO intern_attendance (student_id, program_id, batch_id, session_date, status, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (student_id, program_id, session_date)
    DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, batch_id = COALESCE(EXCLUDED.batch_id, intern_attendance.batch_id)
    RETURNING id, TO_CHAR(session_date, 'YYYY-MM-DD') AS date, status, notes AS remarks
  `, [studentId, programId, batchId || null, date, status, notes?.trim() || '']);

  res.json({ success: true, data: row });
}

// ── ADMIN: Evaluations ───────────────────────────────────────────────────────────

export async function adminGetEvaluations(req: Request, res: Response) {
  const programId = req.query.programId as string | undefined;
  if (!programId) throw new AppError('programId query param is required', 400, 'VALIDATION_ERROR');

  const { rows: students } = await db.query<any>(`
    SELECT ia.student_id AS "studentId", u.name AS "studentName", ip.company
    FROM intern_allocations ia
    JOIN users u ON u.id = ia.student_id
    JOIN internship_programs ip ON ip.id = ia.program_id
    WHERE ia.program_id = $1
    ORDER BY u.name
  `, [programId]);

  const results = [];
  for (const s of students) {
    const { rows: evals } = await db.query<any>(`
      SELECT category, score, max_score AS "maxScore", feedback
      FROM intern_evaluations
      WHERE student_id = $1 AND program_id = $2
      ORDER BY evaluated_at
    `, [s.studentId, programId]);

    const total = evals.reduce((sum: number, e: any) => sum + Number(e.score), 0);
    const maxTotal = evals.reduce((sum: number, e: any) => sum + Number(e.maxScore), 0);
    const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

    results.push({
      studentId: s.studentId,
      studentName: s.studentName,
      company: s.company,
      categories: evals,
      total,
      maxTotal,
      pct,
      rating: pct >= 90 ? 'Excellent' : pct >= 75 ? 'Very Good' : pct >= 60 ? 'Good' : pct >= 40 ? 'Average' : 'Needs Improvement',
    });
  }

  res.json({ success: true, data: results });
}

export async function adminSaveEvaluation(req: Request, res: Response) {
  const { studentId, programId, categories } = req.body as {
    studentId: string;
    programId: string;
    categories: Array<{ category: string; score: number; maxScore?: number; feedback?: string }>;
  };

  if (!studentId || !programId || !Array.isArray(categories) || categories.length === 0) {
    throw new AppError('studentId, programId and categories are required', 400, 'VALIDATION_ERROR');
  }

  await db.query(`DELETE FROM intern_evaluations WHERE student_id = $1 AND program_id = $2`, [studentId, programId]);

  for (const cat of categories) {
    await db.query(`
      INSERT INTO intern_evaluations (student_id, program_id, category, score, max_score, feedback)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [studentId, programId, cat.category, cat.score ?? 0, cat.maxScore ?? 10, cat.feedback?.trim() || '']);
  }

  res.json({ success: true });
}

// ── ADMIN: Stipends ──────────────────────────────────────────────────────────────

export async function adminGetStipends(req: Request, res: Response) {
  const programId = req.query.programId as string | undefined;

  const params: string[] = [];
  const filter = programId ? `WHERE s.program_id = $1` : '';
  if (programId) params.push(programId);

  const { rows } = await db.query<any>(`
    SELECT
      s.id,
      s.student_id AS "studentId",
      u.name AS "studentName",
      ip.company,
      s.month,
      s.amount,
      s.status,
      TO_CHAR(s.paid_at, 'YYYY-MM-DD') AS "paymentDate"
    FROM intern_stipends s
    JOIN users u ON u.id = s.student_id
    JOIN internship_programs ip ON ip.id = s.program_id
    ${filter}
    ORDER BY s.created_at DESC
  `, params);

  res.json({ success: true, data: rows });
}

export async function adminCreateStipend(req: Request, res: Response) {
  const { studentId, programId, month, amount } = req.body;
  if (!studentId || !programId || !month?.trim() || amount == null) {
    throw new AppError('studentId, programId, month and amount are required', 400, 'VALIDATION_ERROR');
  }

  const { rows: [row] } = await db.query<any>(`
    INSERT INTO intern_stipends (student_id, program_id, month, amount, status)
    VALUES ($1, $2, $3, $4, 'PENDING')
    RETURNING id, month, amount, status
  `, [studentId, programId, month.trim(), amount]);

  res.status(201).json({ success: true, data: row });
}

export async function adminUpdateStipend(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = req.body;
  if (!['PENDING', 'PAID', 'CANCELLED'].includes(status)) {
    throw new AppError('Invalid stipend status', 400, 'VALIDATION_ERROR');
  }

  const { rows: [row] } = await db.query<any>(`
    UPDATE intern_stipends
    SET status = $1, paid_at = CASE WHEN $1 = 'PAID' THEN NOW() ELSE paid_at END
    WHERE id = $2
    RETURNING id, status, TO_CHAR(paid_at, 'YYYY-MM-DD') AS "paymentDate"
  `, [status, id]);

  if (!row) throw new AppError('Stipend not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: row });
}

// ── ADMIN: Certificates ──────────────────────────────────────────────────────────

async function computeCertificateEligibility(studentId: string, programId: string) {
  const { rows: att } = await db.query<any>(
    `SELECT status FROM intern_attendance WHERE student_id = $1 AND program_id = $2`,
    [studentId, programId]
  );
  const presentDays = att.filter((a: any) => a.status === 'PRESENT').length;
  const halfDays = att.filter((a: any) => a.status === 'HALF_DAY').length;
  const attendancePct = att.length ? Math.round(((presentDays + halfDays * 0.5) / att.length) * 100) : 0;

  const { rows: [taskCounts] } = await db.query<any>(`
    SELECT
      (SELECT COUNT(*) FROM intern_tasks WHERE program_id = $2)::INT AS total,
      (SELECT COUNT(*) FROM intern_task_progress p
       JOIN intern_tasks t ON t.id = p.task_id
       WHERE p.student_id = $1 AND t.program_id = $2 AND p.status = 'AI_GRADED')::INT AS graded
  `, [studentId, programId]);
  const projectSubmitted = taskCounts.total > 0 && taskCounts.graded >= taskCounts.total;

  const { rows: evals } = await db.query<any>(
    `SELECT COUNT(*) AS cnt FROM intern_evaluations WHERE student_id = $1 AND program_id = $2`,
    [studentId, programId]
  );
  const evaluationDone = parseInt(evals[0].cnt, 10) > 0;

  return { attendancePct, projectSubmitted, evaluationDone, eligible: attendancePct >= 80 && projectSubmitted && evaluationDone };
}

export async function adminGetCertificates(req: Request, res: Response) {
  const programId = req.query.programId as string | undefined;
  if (!programId) throw new AppError('programId query param is required', 400, 'VALIDATION_ERROR');

  const { rows: students } = await db.query<any>(`
    SELECT ia.student_id AS "studentId", u.name AS "studentName", ip.title AS "internshipTitle"
    FROM intern_allocations ia
    JOIN users u ON u.id = ia.student_id
    JOIN internship_programs ip ON ip.id = ia.program_id
    WHERE ia.program_id = $1
    ORDER BY u.name
  `, [programId]);

  const data = [];
  for (const s of students) {
    const elig = await computeCertificateEligibility(s.studentId, programId);
    const { rows: [cert] } = await db.query<any>(
      `SELECT * FROM intern_certificates WHERE student_id = $1 AND program_id = $2`,
      [s.studentId, programId]
    );
    data.push({
      id: cert?.id ?? s.studentId,
      studentId: s.studentId,
      studentName: s.studentName,
      internshipTitle: s.internshipTitle,
      attendancePct: elig.attendancePct,
      projectSubmitted: elig.projectSubmitted,
      evaluationDone: elig.evaluationDone,
      eligible: elig.eligible,
      status: cert?.status ?? 'PENDING',
      certificateId: cert?.certificate_id ?? '',
      issueDate: cert?.issued_at ? new Date(cert.issued_at).toISOString().split('T')[0] : '',
      grade: cert?.grade ?? '',
      certificateUrl: cert?.certificate_url ?? '',
    });
  }

  res.json({ success: true, data });
}

export async function adminIssueCertificate(req: Request, res: Response) {
  const { studentId, programId, grade, action } = req.body;
  if (!studentId || !programId || !action) {
    throw new AppError('studentId, programId and action are required', 400, 'VALIDATION_ERROR');
  }

  const elig = await computeCertificateEligibility(studentId, programId);
  if (!elig.eligible && action === 'ISSUE') {
    throw new AppError('Student is not eligible for certificate yet', 400, 'VALIDATION_ERROR');
  }

  const certId = 'VTRICK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const status = action === 'ISSUE' ? 'ISSUED' : 'GENERATED';

  const { rows: [row] } = await db.query<any>(`
    INSERT INTO intern_certificates (student_id, program_id, is_eligible, status, certificate_id, grade, issued_at)
    VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 = 'ISSUED' THEN NOW() ELSE NULL END)
    ON CONFLICT (student_id, program_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      certificate_id = COALESCE(intern_certificates.certificate_id, EXCLUDED.certificate_id),
      grade = COALESCE(EXCLUDED.grade, intern_certificates.grade),
      issued_at = CASE WHEN EXCLUDED.status = 'ISSUED' THEN NOW() ELSE intern_certificates.issued_at END,
      is_eligible = EXCLUDED.is_eligible
    RETURNING certificate_id AS "certificateId", status, grade,
      TO_CHAR(issued_at, 'YYYY-MM-DD') AS "issueDate"
  `, [studentId, programId, elig.eligible, status, certId, grade?.trim() || '']);

  res.json({ success: true, data: row });
}

// ── ADMIN: Companies (derived from programs) ─────────────────────────────────────

export async function adminGetCompanies(req: Request, res: Response) {
  const { rows } = await db.query<any>(`
    SELECT
      company AS name,
      COUNT(*)::INT AS "programCount",
      BOOL_OR(is_active) AS "isActive",
      MIN(TO_CHAR(start_date, 'YYYY-MM-DD')) AS "firstProgramStart",
      MAX(TO_CHAR(end_date, 'YYYY-MM-DD')) AS "lastProgramEnd"
    FROM internship_programs
    GROUP BY company
    ORDER BY company
  `);

  res.json({
    success: true,
    data: rows.map((r: any, i: number) => ({
      id: `co-${i + 1}`,
      name: r.name,
      programCount: r.programCount,
      isActive: r.isActive,
      status: r.isActive ? 'APPROVED' : 'INACTIVE',
      firstProgramStart: r.firstProgramStart,
      lastProgramEnd: r.lastProgramEnd,
    })),
  });
}

// ── ADMIN: PPO ───────────────────────────────────────────────────────────────────

export async function adminGetPPOs(req: Request, res: Response) {
  const programId = req.query.programId as string | undefined;
  const params: string[] = [];
  const filter = programId ? `WHERE p.program_id = $1` : '';
  if (programId) params.push(programId);

  const { rows } = await db.query<any>(`
    SELECT
      p.id,
      p.student_id AS "studentId",
      u.name AS "studentName",
      COALESCE(p.company, ip.company) AS company,
      p.internship_rating AS "internshipRating",
      p.ppo_offered AS "ppoOffered",
      TO_CHAR(p.ppo_date, 'YYYY-MM-DD') AS "ppoDate",
      p.package_offered AS "packageOffered",
      p.status
    FROM intern_ppo p
    JOIN users u ON u.id = p.student_id
    JOIN internship_programs ip ON ip.id = p.program_id
    ${filter}
    ORDER BY p.created_at DESC
  `, params);

  res.json({ success: true, data: rows });
}

export async function adminUpsertPPO(req: Request, res: Response) {
  const { studentId, programId, company, internshipRating, ppoOffered, ppoDate, packageOffered, status } = req.body;
  if (!studentId || !programId) {
    throw new AppError('studentId and programId are required', 400, 'VALIDATION_ERROR');
  }

  const { rows: [row] } = await db.query<any>(`
    INSERT INTO intern_ppo (student_id, program_id, company, internship_rating, ppo_offered, ppo_date, package_offered, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (student_id, program_id)
    DO UPDATE SET
      company = COALESCE(EXCLUDED.company, intern_ppo.company),
      internship_rating = COALESCE(EXCLUDED.internship_rating, intern_ppo.internship_rating),
      ppo_offered = COALESCE(EXCLUDED.ppo_offered, intern_ppo.ppo_offered),
      ppo_date = COALESCE(EXCLUDED.ppo_date, intern_ppo.ppo_date),
      package_offered = COALESCE(EXCLUDED.package_offered, intern_ppo.package_offered),
      status = COALESCE(EXCLUDED.status, intern_ppo.status),
      updated_at = NOW()
    RETURNING id, status, ppo_offered AS "ppoOffered"
  `, [
    studentId, programId, company?.trim() || null,
    internshipRating ?? null, ppoOffered ?? false,
    ppoDate || null, packageOffered?.trim() || null,
    status || 'PENDING',
  ]);

  res.json({ success: true, data: row });
}

// ── PATCH /admin/intern-students/:id ─────────────────────────────────────────────
export async function adminUpdateInternStudent(req: Request, res: Response) {
  const { id } = req.params;
  const { name, phone, githubUsername } = req.body;

  const { rows: [user] } = await db.query<any>(`SELECT id FROM users WHERE id = $1 AND role = 'INTERN'`, [id]);
  if (!user) throw new AppError('Intern student not found', 404, 'NOT_FOUND');

  const role = req.user?.role;
  const canEditLoginIdentity = role === 'SUPER_ADMIN' || role === 'LD_MANAGER';
  const phoneStr = phone !== undefined && phone !== null ? String(phone).trim() : '';
  if (phoneStr && !canEditLoginIdentity) {
    throw new AppError(
      'Only L&D Manager or Super Admin can change an intern’s phone number.',
      403,
      'IDENTITY_LOCKED',
    );
  }

  let cleanGithub: string | null = null;
  if (githubUsername !== undefined && githubUsername !== null) {
    cleanGithub = String(githubUsername).trim().replace(/^@/, '') || null;
    if (cleanGithub) {
      const GITHUB_USERNAME_REGEX = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
      if (!GITHUB_USERNAME_REGEX.test(cleanGithub)) {
        throw new AppError('Invalid GitHub username format. It must contain only alphanumeric characters or single hyphens, and cannot exceed 39 characters.', 400, 'VALIDATION_ERROR');
      }
      const { rows: clash } = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE LOWER(github_username) = LOWER($1) AND id <> $2`,
        [cleanGithub, id],
      );
      if (clash.length) {
        throw new AppError('This GitHub username is already linked to another learner.', 409, 'GITHUB_TAKEN');
      }
    }
  }

  try {
    await db.query(`
      UPDATE users SET
        name           = COALESCE($1, name),
        phone_number   = CASE WHEN $2::text IS NOT NULL AND $2 <> '' THEN $2 ELSE phone_number END,
        github_username = CASE WHEN $5::boolean THEN $3 ELSE github_username END,
        updated_at     = NOW()
      WHERE id = $4
    `, [
      name?.trim() || null,
      canEditLoginIdentity && phoneStr ? phoneStr : null,
      cleanGithub,
      id,
      githubUsername !== undefined,
    ]);
  } catch (error: any) {
    if (error.code === '23505') {
      throw new AppError('GitHub username already in use', 409, 'GITHUB_TAKEN');
    }
    throw error;
  }

  res.json({ success: true });
}

export async function adminResetInternPassword(req: Request, res: Response) {
  const { id } = req.params;
  const plainPassword = makeTempPassword();
  const hash = await bcrypt.hash(plainPassword, 10);

  const { rows: [user] } = await db.query<any>(`
    UPDATE users SET password_hash = $1, updated_at = NOW()
    WHERE id = $2 AND role = 'INTERN'
    RETURNING id, name, email
  `, [hash, id]);

  if (!user) throw new AppError('Intern not found', 404, 'NOT_FOUND');

  res.json({
    success: true,
    data: {
      ...user,
      password: plainPassword,
      portalUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/intern/portal`,
    },
  });
}
