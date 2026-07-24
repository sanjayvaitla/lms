import { Router, IRouter } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/recordings.controller';

const router: IRouter = Router();

const adminRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER');

router.use(authenticate);

// ── Section Schedules ─────────────────────────────────────────────────────────
router.get('/batches/:batchId/sections',                         ctrl.getBatchSections);
router.get('/batches/:batchId/schedules',                        ctrl.getSectionSchedules);
router.put('/batches/:batchId/schedules',         adminRoles,    ctrl.upsertSectionSchedule);
router.delete('/batches/:batchId/schedules/:section', adminRoles, ctrl.deleteSectionSchedule);

// ── Recordings (YouTube links) ────────────────────────────────────────────────
router.get('/courses/:courseId/recordings',  adminRoles,    ctrl.getCourseRecordings);
router.get('/batches/:batchId/recordings',   adminRoles,    ctrl.getBatchRecordings);
router.post('/recordings',                   adminRoles,    ctrl.upsertRecording);
router.delete('/recordings/:recordingId',    adminRoles,    ctrl.deleteRecording);
router.get('/recordings/:moduleId/:batchId',                ctrl.getModuleRecording);

export default router;
