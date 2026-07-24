import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { trackActivity } from '../middleware/activityTracker';

const router: import('express').Router = Router();

// Admin/trainer dashboard
router.get('/stats', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER', 'FEES_ADMIN'), dashboardController.stats);

// Student-specific dashboard
router.get('/student', authenticate, requireRole('STUDENT', 'SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'), trackActivity('VIEW_DASHBOARD', 'Dashboard'), dashboardController.studentStats);

export default router;
