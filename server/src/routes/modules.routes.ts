import { Router, IRouter } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/modules.controller';

const router: IRouter = Router({ mergeParams: true });

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.create);
router.put('/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.update);
router.post('/:id/complete', requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.complete);
router.delete('/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.remove);

export default router;
