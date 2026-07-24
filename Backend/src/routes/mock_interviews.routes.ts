import { Router, IRouter } from 'express';
import * as ctrl from '../controllers/mock_interviews.controller';
import * as aiCtrl from '../controllers/ai_mock_interview.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { trackActivity } from '../middleware/activityTracker';

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const router: IRouter = Router();

// Ensure user is authenticated for all interview routes
router.use(authenticate);

// List interviews (role-based logic in controller)
router.get('/', trackActivity('LIST_MOCK_INTERVIEWS', 'MockInterview'), ctrl.list);

// AI Mock Interview Routes — before /:id
router.post('/ai/start', requireRole('STUDENT'), aiCtrl.handleAiInterviewStart);
router.post('/ai/chat', requireRole('STUDENT'), aiCtrl.handleAiInterviewChat);
router.post('/ai/grade', requireRole('STUDENT'), aiCtrl.handleAiInterviewGrade);
router.post(
  '/ai/upload-context',
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'TRAINER'),
  upload.single('file'),
  aiCtrl.uploadAiContext,
);

// Get single interview details
router.get('/:id', ctrl.getById);

// Create an interview (Allowed for Admins, L&D Managers, and Trainers)
router.post(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'TRAINER'),
  ctrl.create,
);

// Grade an interview (Trainers mostly, but Admins/Managers can too)
router.put(
  '/:id/grade',
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'TRAINER'),
  ctrl.grade,
);

// Cancel/Delete an interview
router.delete(
  '/:id',
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'TRAINER'),
  ctrl.remove,
);

// Publish AI score
router.put(
  '/:id/publish',
  requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'TRAINER'),
  ctrl.publish,
);

export default router;
