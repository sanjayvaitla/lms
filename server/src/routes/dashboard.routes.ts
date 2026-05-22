import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';

const router: import('express').Router = Router();

router.get('/stats', authenticate, dashboardController.stats);

export default router;
