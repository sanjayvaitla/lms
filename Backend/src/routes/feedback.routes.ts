import { Router } from 'express';
import * as ctrl from '../controllers/feedback.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Admin / L&D Manager routes
const requireAdmin = requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER');

router.get('/config/:batchId', authenticate, requireAdmin, ctrl.getConfig);
router.put('/config/:batchId', authenticate, requireAdmin, ctrl.updateConfig);
router.get('/responses/:batchId', authenticate, requireAdmin, ctrl.getBatchFeedback);
router.get('/course-responses/:batchId', authenticate, requireAdmin, ctrl.getBatchCourseFeedback);

// Student routes
const requireStudent = requireRole('STUDENT');

router.get('/pending', authenticate, requireStudent, ctrl.getPendingFeedback);
router.get('/status/:enrollmentId/:moduleId', authenticate, requireStudent, ctrl.getStudentStatus);
router.post('/', authenticate, requireStudent, ctrl.submitFeedback);
router.post('/course', authenticate, requireStudent, ctrl.submitCourseFeedback);

router.get('/course-status/:enrollmentId/:courseId', authenticate, requireStudent, ctrl.getCourseStatus);

// Program feedback routes
router.get('/program-responses/:programId', authenticate, requireAdmin, ctrl.getProgramFeedback);
router.get('/program-status/:programId', authenticate, requireStudent, ctrl.getProgramStatus);
router.post('/program', authenticate, requireStudent, ctrl.submitProgramFeedback);

export default router;
