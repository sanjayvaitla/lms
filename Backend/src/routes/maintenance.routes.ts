import { Router, IRouter } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/maintenance.controller';

const router: IRouter = Router();
const adminRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER');

router.use(authenticate);

// System health and maintenance endpoints
router.get('/health', adminRoles, ctrl.systemHealth);
router.get('/storage-stats', adminRoles, ctrl.storageStats);
router.get('/file-integrity', adminRoles, ctrl.fileIntegrity);
router.post('/cleanup-orphaned', adminRoles, ctrl.cleanupOrphaned);

export default router;