import { Router, IRouter } from 'express';
import * as ctrl from '../controllers/courses.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import syllabusRoutes from './syllabus.routes';

const router: IRouter = Router({ mergeParams: true });

router.get('/',    ctrl.list);
router.get('/:id', ctrl.getById);

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
// Delete (soft archive first, hard delete second press for admins)
router.patch(
  '/:id/unarchive',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.unarchive,
);
router.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.remove,
);

// Syllabus sub-routes mounted at /courses/:courseId/syllabus
router.use('/:courseId/syllabus', syllabusRoutes);

export default router;
