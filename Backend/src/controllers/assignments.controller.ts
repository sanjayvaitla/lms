import { Request, Response } from 'express';
import * as svc from '../services/assignments.service';
import * as aiSvc from '../services/ai-grader.service';
import { createAssignmentSchema, updateAssignmentSchema, gradeSubmissionSchema } from '../validators/assignment.validator';
import { AppError } from '../middleware/error.middleware';
import db from '../lib/db';
import { notifyAssessmentPublished } from '../services/whatsapp-notifications.service';
import { GithubService } from '../services/github.service';
import { parseGithubRepoFromUrl } from '../services/intern-push-processor.service';
import { fetchLatestCommit } from '../services/github-poll.util';
import { invalidateCached, studentDashboardCacheKey } from '../lib/redis';
import { User } from '../models/User';
import { Assignment } from '../models/Assignment';
import { AssignmentSubmission } from '../models/AssignmentSubmission';

const isTrainer = (req: Request) => req.user?.role === 'TRAINER';

async function getTrainerPerms(userId: string) {
  const { rows } = await db.query(
    'SELECT * FROM trainer_permissions WHERE trainer_id = $1',
    [userId],
  );
  if (!rows.length) {
    return { canEditAssignments: false, canDeleteAssignments: false, canSoftDeleteOnly: false };
  }
  return {
    canEditAssignments:   rows[0].can_edit_assignments   as boolean,
    canDeleteAssignments: rows[0].can_delete_assignments as boolean,
    canSoftDeleteOnly:    rows[0].can_soft_delete_only   as boolean,
  };
}

export async function dashboard(_req: Request, res: Response) {
  res.json({ success: true, data: await svc.getAssignmentDashboard() });
}

export async function list(req: Request, res: Response) {
  res.json({
    success: true,
    data: await svc.listAssignments({
      courseId: req.query.courseId as string | undefined,
      moduleId: req.query.moduleId as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
    }),
  });
}

export async function getById(req: Request, res: Response) {
  res.json({ success: true, data: await svc.getAssignment(String(req.params.id)) });
}

export async function create(req: Request, res: Response) {
  if (!req.file) throw new AppError('PDF file required', 400, 'FILE_REQUIRED');

  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditAssignments) {
      throw new AppError('You do not have permission to create assignments', 403, 'FORBIDDEN');
    }
  }

  const parsed = createAssignmentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const data = await svc.createAssignment(
    parsed.data,
    req.user!.userId,
    { originalname: req.file.originalname, buffer: req.file.buffer, size: req.file.size },
  );
  res.status(201).json({ success: true, data });
}

export async function update(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditAssignments) {
      throw new AppError('You do not have permission to edit assignments', 403, 'FORBIDDEN');
    }
  }

  const parsed = updateAssignmentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({ success: true, data: await svc.updateAssignment(String(req.params.id), parsed.data) });
}

export async function remove(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);

    if (!perms.canDeleteAssignments) {
      throw new AppError('You do not have permission to delete assignments', 403, 'FORBIDDEN');
    }

    // Soft-delete-only: close the assignment instead of hard delete
    if (perms.canSoftDeleteOnly) {
      await db.query(
        `UPDATE assignments SET status = 'CLOSED' WHERE id = $1`,
        [req.params.id],
      );
      return res.json({
        success: true,
        action: 'archived',
        message: 'Assignment closed (soft delete). Contact Super Admin for permanent deletion.',
      });
    }
  }

  await svc.deleteAssignment(String(req.params.id));
  res.json({ success: true, message: 'Assignment deleted' });
}

export async function grade(req: Request, res: Response) {
  const parsed = gradeSubmissionSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({ success: true, data: await svc.gradeSubmission(String(req.params.submissionId), parsed.data.score, parsed.data.feedback) });
}

export async function aiGrade(req: Request, res: Response) {
  const submissionId = String(req.params.submissionId);
  const result = await aiSvc.aiGradeSubmission(submissionId);

  // Persist to DB so student portal reflects the latest AI grade immediately.
  // (auto-grade from submitAssignment also saves here; this keeps them in sync)
  await db.query(
    `UPDATE assignment_submissions
     SET ai_score = $1, ai_feedback = $2, ai_breakdown = $3,
         ai_graded_at = NOW(), ai_model = $4
     WHERE id = $5`,
    [result.score, result.feedback, JSON.stringify(result.breakdown), result.model, submissionId],
  );

  res.json({ success: true, data: result });
}

export async function studentList(req: Request, res: Response) {
  const studentId = req.user!.userId;
  res.json({ success: true, data: await svc.getStudentAssignments(studentId) });
}

export async function notifyStudents(req: Request, res: Response) {
  await notifyAssessmentPublished(String(req.params.id));
  res.json({ success: true, message: 'WhatsApp notifications sent' });
}

// ── Git Task (GitHub-based assignments) ──────────────────────────────────────

export async function listGitTasks(req: Request, res: Response) {
  res.json({
    success: true,
    data: await svc.listGitTasks({
      courseId: req.query.courseId as string | undefined,
      status: req.query.status as string | undefined,
    }),
  });
}

export async function createGitTask(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditAssignments) {
      throw new AppError('You do not have permission to create git tasks', 403, 'FORBIDDEN');
    }
  }
  const { courseId, title, description, templateRepoUrl, dueDate, maxScore, status, batchIds, artifactType, moduleId } = req.body;
  if (!courseId || !title || !templateRepoUrl) {
    throw new AppError('courseId, title and templateRepoUrl are required', 400, 'VALIDATION_ERROR');
  }
  const data = await svc.createGitTask(
    {
      courseId,
      moduleId: moduleId || undefined,
      title,
      description,
      templateRepoUrl,
      dueDate,
      maxScore: maxScore ? +maxScore : undefined,
      status,
      batchIds,
      artifactType,
    },
    req.user!.userId,
  );
  res.status(201).json({ success: true, data });
}

export async function getGitTaskPipeline(req: Request, res: Response) {
  const taskId = String(req.params.id);
  res.json({ success: true, data: await svc.getGitTaskPipeline(taskId) });
}

export async function deleteGitTask(req: Request, res: Response) {
  const taskId = String(req.params.id);
  await db.query(`DELETE FROM assignment_submissions WHERE assignment_id = $1`, [taskId]);
  await db.query(`DELETE FROM assignment_batches WHERE assignment_id = $1`, [taskId]);
  await db.query(`DELETE FROM assignments WHERE id = $1 AND pdf_path = 'git-task'`, [taskId]);
  res.json({ success: true, message: 'Git task deleted' });
}



export async function startGithubTask(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const assignmentId = String(req.params.id);

  const { rows: userRows } = await db.query<{
    github_access_token: string | null;
    github_username: string | null;
  }>('SELECT github_access_token, github_username FROM users WHERE id = $1', [studentId]);
  if (!userRows.length) throw new AppError('User not found', 404, 'NOT_FOUND');

  const githubUsername = userRows[0].github_username?.trim() || null;
  if (!githubUsername) {
    throw new AppError(
      'Set your GitHub username on My Profile before starting GitHub assignments. It does not need to match your real name — but it must be unique and exactly match your GitHub account login.',
      400,
      'GITHUB_USERNAME_REQUIRED',
    );
  }

  const { rows: asgRows } = await db.query<{ github_template_url: string | null; status: string }>(
    'SELECT github_template_url, status FROM assignments WHERE id = $1',
    [assignmentId],
  );
  if (!asgRows.length || !asgRows[0].github_template_url) {
    throw new AppError('This assignment does not have a GitHub template.', 400, 'NO_TEMPLATE');
  }
  if (asgRows[0].status !== 'PUBLISHED') {
    throw new AppError('This Git task is not released yet.', 403, 'NOT_PUBLISHED');
  }

  const { rows: enrolled } = await db.query(
    `SELECT 1 FROM assignment_batches ab
     JOIN enrollments e ON e.batch_id = ab.batch_id AND e.student_id = $2
     WHERE ab.assignment_id = $1
     LIMIT 1`,
    [assignmentId, studentId],
  );
  if (!enrolled.length) {
    throw new AppError('You are not enrolled in a batch for this task', 403, 'NOT_ENROLLED');
  }

  const templateUrl = asgRows[0].github_template_url as string;
  const accessToken = userRows[0].github_access_token;

  const manualForkPayload = {
    needsManualFork: true as const,
    templateUrl,
    githubUsername,
    message: `Open the template, fork it under your GitHub account (@${githubUsername}), then confirm your fork URL.`,
  };

  // Auto-fork only when GitHub OAuth is linked; otherwise student forks manually
  if (!accessToken) {
    return res.json({ success: true, data: manualForkPayload });
  }

  const parts = templateUrl.replace(/\/$/, '').split('/');
  const templateOwner = parts[parts.length - 2];
  const templateRepo = parts[parts.length - 1].replace(/\.git$/i, '');

  try {
    const forkData = await GithubService.forkRepository(templateOwner, templateRepo, accessToken);

    // Fork owner must match registered username; otherwise fall back to manual fork
    const forkOwner = String(forkData.owner?.login ?? '').toLowerCase();
    if (forkOwner && forkOwner !== githubUsername.toLowerCase()) {
      await db.query(
        `UPDATE users SET github_access_token = NULL WHERE id = $1`,
        [studentId],
      ).catch(() => undefined);
      return res.json({
        success: true,
        data: {
          ...manualForkPayload,
          message: `Linked GitHub (@${forkOwner}) does not match your profile (@${githubUsername}). Fork manually under @${githubUsername}, then paste the URL.`,
        },
      });
    }

    const { rows: subRows } = await db.query(
      'SELECT id FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2',
      [assignmentId, studentId],
    );

    let submissionId: string;
    if (!subRows.length) {
      const { rows: newSub } = await db.query(
        `INSERT INTO assignment_submissions (assignment_id, student_id, github_fork_url, status)
         VALUES ($1, $2, $3, 'IN_PROGRESS') RETURNING id`,
        [assignmentId, studentId, forkData.html_url],
      );
      submissionId = newSub[0].id;
    } else {
      submissionId = subRows[0].id;
      await db.query(
        `UPDATE assignment_submissions SET github_fork_url = $1, status = 'IN_PROGRESS' WHERE id = $2`,
        [forkData.html_url, submissionId],
      );
    }

    res.status(201).json({ success: true, data: { forkUrl: forkData.html_url, submissionId, needsManualFork: false } });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    // Stale token / API failure → do not hard-fail; student can finish via manual fork
    return res.json({
      success: true,
      data: {
        ...manualForkPayload,
        message: `Auto-fork unavailable (${error?.message || 'GitHub error'}). Fork manually under @${githubUsername}, then paste the URL.`,
      },
    });
  }
}

/** Student confirms a manually forked repo URL — owner must equal their github_username */
export async function confirmGithubFork(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const assignmentId = String(req.params.id);
  const forkUrl = String(req.body?.forkUrl ?? '').trim();
  if (!forkUrl) throw new AppError('Fork URL is required', 400, 'VALIDATION_ERROR');

  const { rows: userRows } = await db.query<{ github_username: string | null }>(
    'SELECT github_username FROM users WHERE id = $1',
    [studentId],
  );
  const githubUsername = userRows[0]?.github_username?.trim();
  if (!githubUsername) {
    throw new AppError('Set your GitHub username on My Profile first.', 400, 'GITHUB_USERNAME_REQUIRED');
  }

  const m = forkUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
  if (!m) throw new AppError('Invalid GitHub repository URL', 400, 'INVALID_URL');
  const owner = m[1];
  if (owner.toLowerCase() !== githubUsername.toLowerCase()) {
    throw new AppError(
      `Fork URL must be under your GitHub account @${githubUsername} (got @${owner}). Name/email do not need to match — only the GitHub login must.`,
      400,
      'GITHUB_MISMATCH',
    );
  }

  const cleanUrl = `https://github.com/${owner}/${m[2].replace(/\.git$/i, '')}`;

  const { rows: asgRows } = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM assignments
     WHERE id = $1 AND github_template_url IS NOT NULL AND pdf_path = 'git-task'`,
    [assignmentId],
  );
  if (!asgRows.length) throw new AppError('GitHub assignment not found', 404, 'NOT_FOUND');
  if (asgRows[0].status !== 'PUBLISHED') {
    throw new AppError('This Git task is not released yet.', 403, 'NOT_PUBLISHED');
  }

  // Must be mapped to a batch the student is enrolled in
  const { rows: enrolled } = await db.query(
    `SELECT 1 FROM assignment_batches ab
     JOIN enrollments e ON e.batch_id = ab.batch_id AND e.student_id = $2
     WHERE ab.assignment_id = $1
     LIMIT 1`,
    [assignmentId, studentId],
  );
  if (!enrolled.length) {
    throw new AppError('You are not enrolled in a batch for this task', 403, 'NOT_ENROLLED');
  }

  const { rows: subRows } = await db.query(
    'SELECT id FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2',
    [assignmentId, studentId],
  );

  let submissionId: string;
  if (!subRows.length) {
    const { rows: newSub } = await db.query(
      `INSERT INTO assignment_submissions (assignment_id, student_id, github_fork_url, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS') RETURNING id`,
      [assignmentId, studentId, cleanUrl],
    );
    submissionId = newSub[0].id;
  } else {
    submissionId = subRows[0].id;
    await db.query(
      `UPDATE assignment_submissions SET github_fork_url = $1, status = 'IN_PROGRESS' WHERE id = $2`,
      [cleanUrl, submissionId],
    );
  }

  res.json({ success: true, data: { forkUrl: cleanUrl, submissionId } });
}

export async function submit(req: Request, res: Response) {
  const studentId = req.user!.userId;
  const assignmentId = String(req.params.id);

  if (req.body.github_submission === 'true' || req.body.github_submission === true) {
     const { rows: asgCheck } = await db.query<{ due_date: Date | null; status: string }>(
       `SELECT due_date, status FROM assignments WHERE id = $1`,
       [assignmentId],
     );
     if (!asgCheck.length) throw new AppError('Assignment not found', 404, 'NOT_FOUND');
     if (asgCheck[0].status === 'CLOSED') {
       throw new AppError('This assignment is closed', 403, 'CLOSED');
     }
     if (asgCheck[0].due_date && new Date() > new Date(asgCheck[0].due_date)) {
       throw new AppError('The due date for this assignment has passed', 403, 'PAST_DUE');
     }

     const { rows: subRows } = await db.query('SELECT id, github_fork_url FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2', [assignmentId, studentId]);
     if (!subRows.length || !subRows[0].github_fork_url) {
        throw new AppError('No GitHub fork found for this assignment. Please start the task first.', 400, 'NO_FORK');
     }

     const { rows: urows } = await db.query<{ github_username: string | null }>(
       'SELECT github_username FROM users WHERE id = $1',
       [studentId],
     );
     const ghUser = urows[0]?.github_username?.trim();
     const forkUrlCheck = String(subRows[0].github_fork_url);
     const ownerMatch = forkUrlCheck.match(/github\.com\/([^/]+)\//i);
     if (!ghUser || !ownerMatch || ownerMatch[1].toLowerCase() !== ghUser.toLowerCase()) {
       throw new AppError(
         `Fork is not under your registered GitHub username (@${ghUser || 'unset'}). Update My Profile or re-link your fork.`,
         400,
         'GITHUB_MISMATCH',
       );
     }
     
     const submissionId = subRows[0].id;
     const forkUrl = subRows[0].github_fork_url as string;

     let latestSha: string | null = null;
     const parsed = parseGithubRepoFromUrl(forkUrl);
     if (parsed) {
       const latest = await fetchLatestCommit(parsed.owner, parsed.repo, '[assignment-submit]');
       latestSha = latest?.sha ?? null;
     }

     await db.query(
       `UPDATE assignment_submissions
        SET status = 'SUBMITTED', submitted_at = NOW(),
            github_latest_commit_sha = COALESCE($2, github_latest_commit_sha)
        WHERE id = $1`,
       [submissionId, latestSha]
     );

     // Optional: Trigger AI Grade here asynchronously
     aiSvc.aiGradeSubmission(submissionId).catch(err => console.error('Auto-grade failed:', err));

     await invalidateCached(studentDashboardCacheKey(studentId));
     return res.status(201).json({ success: true, data: { id: submissionId, status: 'SUBMITTED' } });
  }

  const files     = req.files as { [field: string]: Express.Multer.File[] } | undefined;

  const pdfFile = files?.pdf?.[0];
  const zipFile = files?.zip?.[0];

  if (!pdfFile && !zipFile) {
    throw new AppError('At least one file (PDF or ZIP) required, or specify github_submission', 400, 'FILE_REQUIRED');
  }

  const data = await svc.submitAssignment(
    String(req.params.id),
    studentId,
    {
      pdf: pdfFile ? { originalname: pdfFile.originalname, buffer: pdfFile.buffer, mimetype: pdfFile.mimetype } : undefined,
      zip: zipFile ? { originalname: zipFile.originalname, buffer: zipFile.buffer, mimetype: zipFile.mimetype } : undefined,
    },
  );
  await invalidateCached(studentDashboardCacheKey(studentId));
  res.status(201).json({ success: true, data });
}
