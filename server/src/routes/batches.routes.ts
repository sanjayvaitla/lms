import { Router, IRouter } from 'express';
import * as ctrl from '../controllers/batches.controller';
import * as syllabusCtrl from '../controllers/syllabus.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router: IRouter = Router();

// Public
router.get('/',    ctrl.list);
router.get('/:id', ctrl.getById);

// Admin + Trainer (create/edit)
router.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.create,
);
router.put(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.update,
);
// Soft delete (archive) — trainer allowed
router.patch(
  '/:id/archive',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.archive,
);
// Restore archived batch — admin only
router.patch(
  '/:id/restore',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.restore,
);
// Hard delete — admin only
router.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.remove,
);

// Enrollment management — admin + trainer
router.get(
  '/:id/students/available',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.availableStudents,
);
router.post(
  '/:id/enroll',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.enroll,
);
router.delete(
  '/:id/enroll/:studentId',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.unenroll,
);
router.put(
  '/:id/enroll/:enrollmentId',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.updateEnrollment,
);

// Analytics
router.get(
  '/:id/analytics',
  authenticate,
  ctrl.analytics,
);

// Batch syllabus
router.get(
  '/:batchId/syllabus',
  authenticate,
  syllabusCtrl.getBatchSyllabus,
);
router.post(
  '/:batchId/syllabus',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  syllabusCtrl.assignSyllabusToBatch,
);

export default router;
