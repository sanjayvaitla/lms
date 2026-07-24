import { Request, Response } from 'express';
import * as sessionsService from '../services/sessions.service';
import { AppError } from '../middleware/error.middleware';
import db from '../lib/db';
import {
  invalidateContentMasterByModuleId,
  invalidateContentMasterByReferenceId,
  invalidateContentMasterByArtifactId,
} from '../lib/contentMasterCache';

export async function enrollmentSessions(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const enrollmentId = req.params.enrollmentId as string;
  const courseId     = req.query.courseId as string | undefined;
  const data = await sessionsService.getEnrollmentSessions(enrollmentId, req.user.userId, courseId);
  res.json({ success: true, data });
}

export async function courseAssignments(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const enrollmentId = req.params.enrollmentId as string;
  const courseId     = req.query.courseId as string | undefined;
  const data = await sessionsService.getCourseAssignments(enrollmentId, req.user.userId, courseId);
  res.json({ success: true, data });
}

export async function courseQuizzes(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const enrollmentId = req.params.enrollmentId as string;
  const courseId     = req.query.courseId as string | undefined;
  const data = await sessionsService.getCourseQuizzes(enrollmentId, req.user.userId, courseId);
  res.json({ success: true, data });
}

export async function courseMaterials(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const enrollmentId = req.params.enrollmentId as string;
  const courseId     = req.query.courseId as string | undefined;
  const data = await sessionsService.getCourseMaterials(enrollmentId, req.user.userId, courseId);
  res.json({ success: true, data });
}

export async function sessionDetail(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const moduleId     = req.params.moduleId as string;
  const enrollmentId = req.query.enrollmentId as string | undefined;
  const data = await sessionsService.getSessionDetail(moduleId, req.user.userId, enrollmentId);
  res.json({ success: true, data });
}

// ── Content Master: get all sessions for a batch ─────────────────────────────
export async function contentMasterSessions(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const batchId = req.params.batchId as string;
  res.set('Cache-Control', 'no-store');
  const data = await sessionsService.getBatchSessionsForContentMaster(batchId);
  res.json({ success: true, data });
}

// ── Content Master: get all sessions for a course (no batch required) ──────────
export async function contentMasterCourseSessions(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const courseId = req.params.courseId as string;
  res.set('Cache-Control', 'no-store');
  const data = await sessionsService.getCourseSessionsForContentMaster(courseId);
  res.json({ success: true, data });
}

// ── Add reference (supports optional file upload) ────────────────────────────
export async function addReference(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const moduleId = req.params.moduleId as string;
  const file = req.file
    ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype }
    : undefined;
  const data = await sessionsService.addReference(moduleId, req.body, req.user.userId, file);
  await invalidateContentMasterByModuleId(moduleId);
  res.status(201).json({ success: true, data });
}

// ── Add SLM (Student Learning Material — supports optional file upload) ───────
export async function addSlm(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const moduleId = req.params.moduleId as string;
  const file = req.file
    ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype }
    : undefined;
  const data = await sessionsService.addSlm(moduleId, req.body, req.user.userId, file);
  await invalidateContentMasterByModuleId(moduleId);
  res.status(201).json({ success: true, data });
}

// ── Add PPT (Presentations — supports optional file upload) ───────────────────
export async function addPpt(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const moduleId = req.params.moduleId as string;
  const file = req.file
    ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype }
    : undefined;
  const data = await sessionsService.addPpt(moduleId, req.body, req.user.userId, file);
  await invalidateContentMasterByModuleId(moduleId);
  res.status(201).json({ success: true, data });
}

export async function deleteReference(req: Request, res: Response) {
  const refId = req.params.refId as string;
  await invalidateContentMasterByReferenceId(refId);
  await sessionsService.deleteReference(refId);
  res.json({ success: true });
}

// ── Add artifact (supports optional file upload) ──────────────────────────────
export async function addArtifact(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const moduleId = req.params.moduleId as string;
  const file = req.file
    ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype }
    : undefined;
  const data = await sessionsService.addArtifact(moduleId, req.body, req.user.userId, file);
  await invalidateContentMasterByModuleId(moduleId);
  res.status(201).json({ success: true, data });
}

export async function deleteArtifact(req: Request, res: Response) {
  const artId = req.params.artId as string;
  await invalidateContentMasterByArtifactId(artId);
  await sessionsService.deleteArtifact(artId);
  res.json({ success: true });
}

export async function setMeetLink(req: Request, res: Response) {
  const { batchId, moduleId } = req.params;
  const { meetLink } = req.body as { meetLink: string | null };
  if (meetLink) {
    await db.query(
      `INSERT INTO live_class_links (batch_id, module_id, meet_link)
       VALUES ($1, $2, $3)
       ON CONFLICT (batch_id, module_id) DO UPDATE SET meet_link = $3, updated_at = NOW()`,
      [batchId, moduleId, meetLink],
    );
  } else {
    await db.query(`DELETE FROM live_class_links WHERE batch_id=$1 AND module_id=$2`, [batchId, moduleId]);
  }
  res.json({ success: true });
}

export async function getBatchMeetLinks(req: Request, res: Response) {
  const { batchId } = req.params;
  const { rows } = await db.query<any>(
    `SELECT module_id AS "moduleId", meet_link AS "meetLink" FROM live_class_links WHERE batch_id=$1`,
    [batchId],
  );
  const map: Record<string, string> = {};
  rows.forEach((r: any) => { if (r.meetLink) map[r.moduleId] = r.meetLink; });
  res.json({ success: true, data: map });
}
