import { Request, Response } from 'express';
import * as svc from '../services/quizzes.service';
import {
  createDatasetSchema, createQuestionSchema, createQuizSchema, updateQuizSchema,
  startAttemptSchema, submitAttemptSchema,
} from '../validators/quiz.validator';
import { AppError } from '../middleware/error.middleware';
import db from '../lib/db';
import { invalidateCached, studentDashboardCacheKey } from '../lib/redis';

const isTrainer = (req: Request) => req.user?.role === 'TRAINER';

async function getTrainerPerms(userId: string) {
  const { rows } = await db.query(
    'SELECT * FROM trainer_permissions WHERE trainer_id = $1',
    [userId],
  );
  if (!rows.length) {
    return { canEditQuizzes: false, canDeleteQuizzes: false, canSoftDeleteOnly: false };
  }
  return {
    canEditQuizzes:   rows[0].can_edit_quizzes   as boolean,
    canDeleteQuizzes: rows[0].can_delete_quizzes as boolean,
    canSoftDeleteOnly: rows[0].can_soft_delete_only as boolean,
  };
}

export async function dashboard(_req: Request, res: Response) {
  res.json({ success: true, data: await svc.getQuizDashboard() });
}

export async function listDatasets(req: Request, res: Response) {
  res.json({ success: true, data: await svc.listDatasets(req.query.courseId as string | undefined) });
}

export async function uploadDataset(req: Request, res: Response) {
  const parsed = createDatasetSchema.safeParse({ ...req.body, courseId: req.body.courseId });
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  if (!req.file) throw new AppError('Dataset file required', 400, 'FILE_REQUIRED');

  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditQuizzes) {
      throw new AppError('You do not have permission to upload datasets', 403, 'FORBIDDEN');
    }
  }

  const data = await svc.uploadDataset(parsed.data.courseId, parsed.data.title, req.user!.userId, req.file);
  res.status(201).json({ success: true, data });
}

export async function getDataset(req: Request, res: Response) {
  res.json({ success: true, data: await svc.getDataset(String(req.params.id)) });
}

export async function deleteDataset(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canDeleteQuizzes) {
      throw new AppError('You do not have permission to delete datasets', 403, 'FORBIDDEN');
    }
    if (perms.canSoftDeleteOnly) {
      // Datasets don't have a status column — block with helpful message
      throw new AppError(
        'Soft-delete is not available for datasets. Contact Super Admin for permanent deletion.',
        403,
        'SOFT_DELETE_ONLY',
      );
    }
  }
  await svc.deleteDataset(String(req.params.id));
  res.json({ success: true, message: 'Dataset deleted' });
}

export async function listQuestions(req: Request, res: Response) {
  res.json({
    success: true,
    data: await svc.listQuestions({
      courseId: req.query.courseId as string | undefined,
      moduleId: req.query.moduleId as string | undefined,
    }),
  });
}

export async function createQuestion(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditQuizzes) {
      throw new AppError('You do not have permission to create questions', 403, 'FORBIDDEN');
    }
  }
  const parsed = createQuestionSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.status(201).json({ success: true, data: await svc.createQuestion(parsed.data) });
}

export async function deleteQuestion(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canDeleteQuizzes) {
      throw new AppError('You do not have permission to delete questions', 403, 'FORBIDDEN');
    }
    if (perms.canSoftDeleteOnly) {
      // Questions don't have a status column — block with helpful message
      throw new AppError(
        'Soft-delete is not available for questions. Contact Super Admin for permanent deletion.',
        403,
        'SOFT_DELETE_ONLY',
      );
    }
  }
  await svc.deleteQuestion(String(req.params.id));
  res.json({ success: true, message: 'Question deleted' });
}

export async function listQuizzes(req: Request, res: Response) {
  res.json({
    success: true,
    data: await svc.listQuizzes({
      courseId: req.query.courseId as string | undefined,
      moduleId: req.query.moduleId as string | undefined,
      releasedOnly: req.query.releasedOnly === 'true',
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
    }),
  });
}

export async function createQuiz(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditQuizzes) {
      throw new AppError('You do not have permission to create quizzes', 403, 'FORBIDDEN');
    }
  }
  const parsed = createQuizSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.status(201).json({ success: true, data: await svc.createQuiz(parsed.data, req.user!.userId) });
}

export async function updateQuiz(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditQuizzes) {
      throw new AppError('You do not have permission to edit quizzes', 403, 'FORBIDDEN');
    }
  }
  const parsed = updateQuizSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({ success: true, data: await svc.updateQuiz(String(req.params.id), parsed.data) });
}

export async function deleteQuiz(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canDeleteQuizzes) {
      throw new AppError('You do not have permission to delete quizzes', 403, 'FORBIDDEN');
    }
    // Soft-delete-only: archive the quiz instead of hard delete
    if (perms.canSoftDeleteOnly) {
      await db.query(
        `UPDATE quizzes SET status = 'ARCHIVED' WHERE id = $1`,
        [req.params.id],
      );
      return res.json({
        success: true,
        action: 'archived',
        message: 'Quiz archived (soft delete). Contact Super Admin for permanent deletion.',
      });
    }
  }
  await svc.deleteQuiz(String(req.params.id));
  res.json({ success: true, message: 'Quiz deleted' });
}

export async function releaseQuiz(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditQuizzes) {
      throw new AppError('You do not have permission to release quizzes', 403, 'FORBIDDEN');
    }
  }
  const quiz = await svc.toggleQuizRelease(String(req.params.id), 'release');
  res.json({ success: true, data: quiz, message: 'Quiz released — students can now attempt it' });
}

export async function lockQuiz(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditQuizzes) {
      throw new AppError('You do not have permission to lock quizzes', 403, 'FORBIDDEN');
    }
  }
  const quiz = await svc.toggleQuizRelease(String(req.params.id), 'lock');
  res.json({ success: true, data: quiz, message: 'Quiz locked — hidden from students' });
}

export async function previewRandom(req: Request, res: Response) {
  res.json({ success: true, data: await svc.previewRandomDraw(String(req.params.id)) });
}

export async function startAttempt(req: Request, res: Response) {
  const parsed = startAttemptSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const staffRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER']);
  const studentId = staffRoles.has(req.user!.role) && parsed.data.studentId
    ? parsed.data.studentId
    : req.user!.userId;
  res.json({ success: true, data: await svc.startAttempt(String(req.params.id), studentId) });
}

export async function submitAttempt(req: Request, res: Response) {
  const parsed = submitAttemptSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const data = await svc.submitAttempt(
    String(req.params.attemptId),
    req.user!.userId,
    parsed.data.answers,
  );
  await invalidateCached(studentDashboardCacheKey(req.user!.userId));
  res.json({ success: true, data });
}

export async function listAttempts(req: Request, res: Response) {
  res.json({ success: true, data: await svc.listAttempts(req.query.quizId as string | undefined) });
}

export async function reviewAttempt(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await svc.reviewAttempt(String(req.params.attemptId), req.user.userId);
  res.json({ success: true, data });
}

export async function importCsv(req: Request, res: Response) {
  if (!req.file) throw new AppError('CSV or Excel file required', 400, 'FILE_REQUIRED');
  const { courseId, moduleId, title, questionsPerAttempt, timeLimitMinutes,
          passingScore, maxAttempts, status, availableFrom, availableUntil } = req.body;
  if (!courseId)  throw new AppError('courseId is required', 400, 'VALIDATION_ERROR');
  if (!moduleId)  throw new AppError('moduleId is required', 400, 'VALIDATION_ERROR');
  if (!title)     throw new AppError('Quiz title is required', 400, 'VALIDATION_ERROR');

  const data = await svc.importQuizFromCsv(
    courseId,
    moduleId,
    req.user!.userId,
    req.file,
    {
      title,
      questionsPerAttempt: parseInt(questionsPerAttempt ?? '10', 10),
      timeLimitMinutes:    timeLimitMinutes ? parseInt(timeLimitMinutes, 10) : null,
      passingScore:        parseInt(passingScore ?? '60', 10),
      maxAttempts:         parseInt(maxAttempts ?? '1', 10),
      status:              (status as 'DRAFT' | 'ACTIVE') ?? 'DRAFT',
      availableFrom:       availableFrom || null,
      availableUntil:      availableUntil || null,
    }
  );
  res.status(201).json({ success: true, data });
}
