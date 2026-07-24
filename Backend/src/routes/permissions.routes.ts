import { Router, IRouter } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/permissions.controller';

const router: IRouter = Router();

router.use(authenticate);

// Any logged-in user can fetch their own permissions
router.get('/me', ctrl.getMyPermissions);

// Super admin only — manage trainer permissions
router.get('/trainers',          requireRole('SUPER_ADMIN'), ctrl.getAllTrainerPermissions);
router.get('/trainers/:trainerId', requireRole('SUPER_ADMIN'), ctrl.getTrainerPermissions);
router.put('/trainers/:trainerId', requireRole('SUPER_ADMIN'), ctrl.updateTrainerPermissions);

export default router;
