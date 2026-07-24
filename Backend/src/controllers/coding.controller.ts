import { Request, Response } from 'express';
import * as codingService from '../services/coding.service';
import { AppError } from '../middleware/error.middleware';

// Express 5 types mark req.params values as string | string[] â€” cast helper
const p = (req: Request) => req.params as Record<string, string>;
const qs = (req: Request) => req.query as Record<string, string>;

export async function createProblem(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const result = await codingService.createProblem({ ...req.body, created_by: req.user.userId });
  res.status(201).json({ success: true, data: result });
}

export async function listProblems(req: Request, res: Response) {
  const q = qs(req);
  const result = await codingService.listProblems({
    courseId: q.courseId || undefined, status: q.status || undefined,
    difficulty: q.difficulty || undefined, search: q.search || undefined,
  });
  res.json({ success: true, data: result });
}

export async function getProblem(req: Request, res: Response) {
  const role = req.user?.role;
  const staff = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TRAINER' || role === 'LD_MANAGER';
  const result = await codingService.getProblemById(p(req).id, { studentView: !staff });
  res.json({ success: true, data: result });
}

export async function updateProblem(req: Request, res: Response) {
  const result = await codingService.updateProblem(p(req).id, req.body);
  res.json({ success: true, data: result });
}

export async function deleteProblem(req: Request, res: Response) {
  await codingService.deleteProblem(p(req).id);
  res.json({ success: true, message: 'Problem deleted' });
}

export async function assignProblem(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const result = await codingService.assignProblem({ ...req.body, assigned_by: req.user.userId });
  res.status(201).json({ success: true, data: result });
}

export async function listAssignments(req: Request, res: Response) {
  const q = qs(req);
  const result = await codingService.listAssignments({
    batchId: q.batchId || undefined, problemId: q.problemId || undefined, status: q.status || undefined,
  });
  res.json({ success: true, data: result });
}

export async function closeAssignment(req: Request, res: Response) {
  await codingService.closeAssignment(p(req).id);
  res.json({ success: true, message: 'Assignment closed' });
}

export async function getSubmissionsByAssignment(req: Request, res: Response) {
  const result = await codingService.getSubmissionsByAssignment(p(req).id);
  res.json({ success: true, data: result });
}

export async function getStudentAssignments(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const result = await codingService.getStudentAssignments(req.user.userId);
  res.json({ success: true, data: result });
}

export async function submitCode(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const result = await codingService.submitCode({
    assignment_id: req.body.assignment_id,
    student_id:    req.user.userId,
    code:          req.body.code,
    language:      req.body.language,
  });
  res.status(201).json({ success: true, data: result });
}

export async function getMySubmissions(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const result = await codingService.getMySubmissions(req.user.userId, p(req).assignmentId);
  res.json({ success: true, data: result });
}

export async function getSubmission(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const result = await codingService.getSubmissionById(p(req).id);

  const staffRoles = ['SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'];
  if (req.user.role === 'STUDENT' && result.student_id !== req.user.userId) {
    throw new AppError('Submission not found', 404, 'NOT_FOUND');
  }
  if (req.user.role !== 'STUDENT' && !staffRoles.includes(req.user.role)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  res.json({ success: true, data: result });
}


export async function runCode(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { code, language, stdin } = req.body;
  if (!code || !language) throw new AppError('code and language are required', 400, 'VALIDATION_ERROR');
  const result = await codingService.runCode({ code, language, stdin: stdin ?? '' });
  res.json({ success: true, data: result });
}
