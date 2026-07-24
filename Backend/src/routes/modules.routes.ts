import { Router, IRouter } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/modules.controller';
import { trackActivity } from '../middleware/activityTracker';

const router: IRouter = Router({ mergeParams: true });

router.use(authenticate);
router.get('/',                                                                              trackActivity('LIST_MODULES', 'Module'), ctrl.list);
router.post('/',                requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),              ctrl.create);
router.post('/sub-session',     requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),              ctrl.createSubSession);
router.put('/:id',              requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),              ctrl.update);
router.post('/:id/complete',    requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),              ctrl.complete);
router.post('/:id/uncomplete', requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),              ctrl.uncomplete);
router.patch('/:id/release',    requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),              ctrl.release);
router.patch('/:id/lock',       requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),              ctrl.lock);
router.delete('/:id',           requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'),              ctrl.remove);

export default router;
