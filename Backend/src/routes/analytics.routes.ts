import { Router } from 'express';
import { getDashboardStats, getUserTimeline, logActivity } from '../controllers/analytics.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.post('/log', authenticate, requireRole('STUDENT', 'TRAINER', 'INTERN', 'SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER', 'OPS_MANAGER', 'FEES_ADMIN'), logActivity);

// Protect all other routes with SUPER_ADMIN authorization
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN'));

router.get('/dashboard', getDashboardStats);
router.get('/timeline/:userId', getUserTimeline);

export default router;
