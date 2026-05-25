import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
  markBulk,
  markAll,
  getDashboard,
  getBatchAttendance,
  getLearnerAttendance,
  getTrainerSessions,
  getReports,
} from '../controllers/attendance.controller';

const router: import("express").Router = Router();

// All attendance routes require authentication
router.use(authenticate);

// ── Dashboard ─────────────────────────────────────────────────────────────────
// GET /attendance/dashboard
router.get('/dashboard', getDashboard);

// ── Sessions ──────────────────────────────────────────────────────────────────
// GET  /attendance/sessions?batchId=&trainerId=&status=&dateFrom=&dateTo=&page=&limit=
// POST /attendance/sessions
router.route('/sessions')
  .get(listSessions)
  .post(createSession);

// GET    /attendance/sessions/:sessionId
// PATCH  /attendance/sessions/:sessionId
// DELETE /attendance/sessions/:sessionId
router.route('/sessions/:sessionId')
  .get(getSession)
  .patch(updateSession)
  .delete(deleteSession);

// ── Marking ───────────────────────────────────────────────────────────────────
// POST /attendance/sessions/:sessionId/mark
// POST /attendance/sessions/:sessionId/mark-all
router.post('/sessions/:sessionId/mark',     markBulk);
router.post('/sessions/:sessionId/mark-all', markAll);

// ── Analytics ────────────────────────────────────────────────────────────────
// GET /attendance/batch/:batchId
router.get('/batch/:batchId', getBatchAttendance);

// GET /attendance/learner/:studentId
router.get('/learner/:studentId', getLearnerAttendance);

// GET /attendance/trainer/:trainerId
router.get('/trainer/:trainerId', getTrainerSessions);

// ── Reports ───────────────────────────────────────────────────────────────────
// GET /attendance/reports?batchId=&trainerId=&dateFrom=&dateTo=&format=csv
router.get('/reports', getReports);

export default router;
