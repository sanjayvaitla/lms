import { Router, IRouter } from 'express';
import * as ctrl from '../controllers/batches.controller';
import * as syllabusCtrl from '../controllers/syllabus.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router: IRouter = Router();
const viewRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER', 'FEES_ADMIN');

router.use(authenticate);

router.get('/',    viewRoles, ctrl.list);
router.get('/:id', viewRoles, ctrl.getById);

// Batch courses (multi-select)
router.get('/:id/courses', viewRoles, ctrl.getCourses);
router.put('/:id/courses', requireRole('SUPER_ADMIN','ADMIN','TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'), ctrl.setCourses);

// Admin + Trainer (create/edit)
router.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.create,
);
router.put(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.update,
);
// Soft delete (archive) — trainer allowed
router.patch(
  '/:id/archive',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.archive,
);
// Restore archived batch — admin only
router.patch(
  '/:id/restore',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.restore,
);
// Hard delete — admin only
router.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.remove,
);

// Enrollment management — admin + trainer
router.get(
  '/:id/students/available',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.availableStudents,
);
router.post(
  '/:id/enroll',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.enroll,
);
router.delete(
  '/:id/enroll/:studentId',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.unenroll,
);
router.put(
  '/:id/enroll/:enrollmentId',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.updateEnrollment,
);

// Analytics
router.get(
  '/:id/analytics',
  viewRoles,
  ctrl.analytics,
);

// Batch syllabus
router.get(
  '/:batchId/syllabus',
  viewRoles,
  syllabusCtrl.getBatchSyllabus,
);
router.post(
  '/:batchId/syllabus',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  syllabusCtrl.assignSyllabusToBatch,
);

export default router;
