import { Router, IRouter } from 'express';
import * as ctrl from '../controllers/learners.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router: IRouter = Router();

// Stats
router.get('/stats', authenticate, ctrl.dashboardStats);

// CRUD
router.get('/',    ctrl.list);
router.get('/:id', ctrl.getById);

router.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.create,
);
router.put(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.update,
);
router.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.remove,
);

// Batch mapping
router.get(
  '/:id/batches/available',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.availableBatches,
);
router.post(
  '/:id/batches',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.assignBatch,
);
router.delete(
  '/:id/batches/:batchId',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.removeBatch,
);

export default router;
