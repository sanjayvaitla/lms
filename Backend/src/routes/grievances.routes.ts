import { Router } from 'express';
import * as grievancesController from '../controllers/grievances.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router: import('express').Router = Router();

router.use(authenticate);

// Student routes
router.post('/', requireRole('STUDENT'), grievancesController.createGrievance);
router.get('/my', requireRole('STUDENT'), grievancesController.getMyGrievances);

// Admin / L&D Manager routes
router.get('/', requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'), grievancesController.getAllGrievances);
router.patch('/:id/status', requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'), grievancesController.updateGrievanceStatus);
router.delete('/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'), grievancesController.deleteGrievance);

export default router;
