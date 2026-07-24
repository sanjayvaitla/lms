import { Router, IRouter } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/user-permissions.controller';

const router: IRouter = Router();

// Get my permissions (ADMIN/TRAINER)
router.get('/me', authenticate, ctrl.getMyPermissions);

// Get all user permissions (SUPER_ADMIN only)
router.get('/users', authenticate, requireRole('SUPER_ADMIN'), ctrl.getAllPermissions);

// Get specific user permissions (SUPER_ADMIN only)
router.get('/users/:userId', authenticate, requireRole('SUPER_ADMIN'), ctrl.getUserPermissions);

// Update user permissions (SUPER_ADMIN only)
router.put('/users/:userId', authenticate, requireRole('SUPER_ADMIN'), ctrl.updatePermissions);

export default router;
