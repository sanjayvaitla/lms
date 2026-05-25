import { Request, Response, NextFunction } from 'express';
import * as svc from '../services/attendance.service';
import {
  createSessionSchema,
  updateSessionSchema,
  markBulkSchema,
  markAllSchema,
  listSessionsQuerySchema,
} from '../validators/attendance.validator';
import { AppError } from '../middleware/error.middleware';

// ── helpers ───────────────────────────────────────────────────────────────────
const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

/** Normalise Express query/param values that might be string | string[] */
const p = (v: unknown): string => (Array.isArray(v) ? String(v[0]) : String(v ?? ''));
const q = (v: unknown): string | undefined =>
  v === undefined || v === null ? undefined : (Array.isArray(v) ? String(v[0]) : String(v));

const userId = (req: Request): string => {
  const id = (req as any).user?.id;
  if (!id) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  return id as string;
};

// ── Session CRUD ──────────────────────────────────────────────────────────────

export async function createSession(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const body = createSessionSchema.parse(req.body);
    const session = await svc.createSession(body, userId(req));
    ok(res, session, 201);
  } catch (e) { next(e); }
}

export async function listSessions(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const query = listSessionsQuerySchema.parse(req.query as Record<string, unknown>);
    const result = await svc.listSessions(query);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getSession(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const session = await svc.getSession(p(req.params['sessionId']));
    ok(res, session);
  } catch (e) { next(e); }
}

export async function updateSession(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const body = updateSessionSchema.parse(req.body);
    const session = await svc.updateSession(p(req.params['sessionId']), body);
    ok(res, session);
  } catch (e) { next(e); }
}

export async function deleteSession(
  req: Request, res: Response, next: NextFunction
) {
  try {
    await svc.deleteSession(p(req.params['sessionId']));
    res.status(204).end();
  } catch (e) { next(e); }
}

// ── Attendance Marking ────────────────────────────────────────────────────────

export async function markBulk(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const input = markBulkSchema.parse(req.body);
    const result = await svc.markBulk(p(req.params['sessionId']), input, userId(req));
    ok(res, result);
  } catch (e) { next(e); }
}

export async function markAll(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const { status } = markAllSchema.parse(req.body);
    const result = await svc.markAll(p(req.params['sessionId']), status, userId(req));
    ok(res, result);
  } catch (e) { next(e); }
}

// ── Analytics & Reports ───────────────────────────────────────────────────────

export async function getDashboard(
  _req: Request, res: Response, next: NextFunction
) {
  try {
    const result = await svc.getDashboardStats();
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getBatchAttendance(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const result = await svc.getBatchAttendance(p(req.params['batchId']));
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getLearnerAttendance(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const result = await svc.getLearnerAttendance(p(req.params['studentId']));
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getTrainerSessions(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const result = await svc.getTrainerSessions(p(req.params['trainerId']));
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getReports(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const rq = req.query as Record<string, unknown>;
    const batchId   = q(rq['batchId']);
    const trainerId = q(rq['trainerId']);
    const dateFrom  = q(rq['dateFrom']);
    const dateTo    = q(rq['dateTo']);

    const result = await svc.getReportsData({ batchId, trainerId, dateFrom, dateTo });

    if (q(rq['format']) === 'csv') {
      const header = 'sessionId,sessionTitle,sessionDate,batchId,studentId,studentName,status,markedAt,remarks\n';
      const rows = (result as any[]).map((r) =>
        [
          r.session_id,
          '"' + String(r.session_title ?? '').replace(/"/g, '""') + '"',
          r.session_date,
          r.batch_id,
          r.student_id,
          '"' + String(r.student_name ?? '').replace(/"/g, '""') + '"',
          r.status,
          r.marked_at ?? '',
          '"' + String(r.remarks ?? '').replace(/"/g, '""') + '"',
        ].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.csv');
      return res.send(header + rows);
    }

    ok(res, result);
  } catch (e) { next(e); }
}
