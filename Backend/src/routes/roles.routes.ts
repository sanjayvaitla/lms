import { Router, IRouter } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/roles.controller';

const router: IRouter = Router();

router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'LD_MANAGER'));

router.get('/users',      ctrl.listUsers);
router.get('/users/:id',  ctrl.getUser);
router.put('/users/:id',  ctrl.assignRole);
router.post('/users',     ctrl.createUser);
router.put('/users/:id/password', ctrl.changePassword);
router.put('/users/:id/status', ctrl.toggleUserStatus);
router.delete('/users/:id', ctrl.deleteUser);
router.get('/stats',      ctrl.stats);

export default router;
