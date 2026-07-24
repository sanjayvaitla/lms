import { Router, IRouter } from 'express';
import * as ctrl from '../controllers/courses.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { trackActivity } from '../middleware/activityTracker';
import syllabusRoutes from './syllabus.routes';

const router: IRouter = Router({ mergeParams: true });

const viewRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER', 'FEES_ADMIN');

router.get('/',    authenticate, viewRoles, trackActivity('LIST_COURSES', 'Course'), ctrl.list);
router.get('/:id', authenticate, viewRoles, trackActivity('VIEW_COURSE', 'Course'), ctrl.getById);

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
// Delete (soft archive first, hard delete second press for admins)
router.patch(
  '/:id/unarchive',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.unarchive,
);
router.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),
  ctrl.remove,
);

// Syllabus sub-routes mounted at /courses/:courseId/syllabus
router.use('/:courseId/syllabus', syllabusRoutes);

export default router;
