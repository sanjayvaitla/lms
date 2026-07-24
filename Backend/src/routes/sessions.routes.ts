import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/sessions.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router: import('express').Router = Router();

// multer — memory storage, max 20 MB, used for content file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── Student routes ────────────────────────────────────────────────────────────

// Student: list sessions for an enrollment
router.get(
  '/enrollments/:enrollmentId/sessions',
  authenticate,
  requireRole('STUDENT', 'SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.enrollmentSessions,
);

// Student: list all assignments for a course (via enrollment)
router.get('/enrollments/:enrollmentId/assignments', authenticate, ctrl.courseAssignments);

// Student: list all quizzes for a course (via enrollment)
router.get('/enrollments/:enrollmentId/quizzes', authenticate, ctrl.courseQuizzes);

// Student: list all SLMs / References / Artifacts for a course
router.get('/enrollments/:enrollmentId/materials', authenticate, ctrl.courseMaterials);

// Student: session detail (assignments, quizzes, refs, artifacts)
router.get('/sessions/:moduleId', authenticate, ctrl.sessionDetail);

// ── Content Master (Admin/Trainer) ────────────────────────────────────────────

// GET all sessions + content for a batch (Content Master page)
router.get(
  '/content-master/batches/:batchId/sessions',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.contentMasterSessions,
);

// GET all sessions + content for a course — upload before batch mapping
router.get(
  '/content-master/courses/:courseId/sessions',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.contentMasterCourseSessions,
);

// ── References ────────────────────────────────────────────────────────────────

// POST reference (URL or file upload)
router.post(
  '/sessions/:moduleId/references',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  upload.single('file'),
  ctrl.addReference,
);

// DELETE reference (also removes file from S3)
router.delete(
  '/sessions/references/:refId',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.deleteReference,
);

// ── SLM (Student Learning Materials) ─────────────────────────────────────────

router.post(
  '/sessions/:moduleId/slm',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  upload.single('file'),
  ctrl.addSlm,
);

// DELETE SLM uses the same delete-reference endpoint (SLM is stored in session_references)
router.delete(
  '/sessions/slm/:refId',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.deleteReference,
);

// ── PPT (Presentations) ─────────────────────────────────────────────────────────

router.post(
  '/sessions/:moduleId/ppt',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  upload.single('file'),
  ctrl.addPpt,
);

router.delete(
  '/sessions/ppt/:refId',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.deleteReference,
);

// ── Artifacts ─────────────────────────────────────────────────────────────────

// POST artifact (URL or file upload)
router.post(
  '/sessions/:moduleId/artifacts',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  upload.single('file'),
  ctrl.addArtifact,
);

// DELETE artifact (also removes file from S3)
router.delete(
  '/sessions/artifacts/:artId',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.deleteArtifact,
);

// ── Live class (GMeet) link — set per session per batch ──────────────────────
router.put(
  '/batches/:batchId/sessions/:moduleId/meet-link',
  authenticate,
  requireRole('TRAINER', 'ADMIN', 'SUPER_ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.setMeetLink,
);

router.get(
  '/batches/:batchId/meet-links',
  authenticate,
  ctrl.getBatchMeetLinks,
);

export default router;
