import { Router, IRouter } from 'express';
import * as ctrl from '../controllers/learners.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router: IRouter = Router();

const viewRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER');

// Stats
router.get('/stats', authenticate, viewRoles, ctrl.dashboardStats);

router.get('/',    authenticate, viewRoles, ctrl.list);
router.get('/:id', authenticate, viewRoles, ctrl.getById);

router.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.create,
);
router.put(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.update,
);
router.post(
  '/batch-delete',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.batchRemove,
);
router.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.remove,
);

// Program assignment
router.patch(
  '/:id/program',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.assignProgram,
);

// Batch mapping
router.get(
  '/:id/batches/available',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.availableBatches,
);
router.post(
  '/:id/batches',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.assignBatch,
);
router.delete(
  '/:id/batches/:batchId',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.removeBatch,
);

export default router;
