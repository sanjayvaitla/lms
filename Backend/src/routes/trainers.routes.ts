import { Router, IRouter } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/trainers.controller';

const router: IRouter = Router();

router.use(authenticate);

const adminRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER');
const viewRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER');

router.get('/',       viewRoles, ctrl.listTrainers);
router.get('/:id',    viewRoles, ctrl.getTrainer);
router.post('/',      adminRoles, ctrl.createTrainer);
router.put('/:id',    adminRoles, ctrl.updateTrainer);
router.delete('/:id', adminRoles, ctrl.deleteTrainer);

export default router;
