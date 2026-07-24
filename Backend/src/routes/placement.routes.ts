import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/placement.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware for Admin/L&D Manager
const requireAdmin = requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER');

// ── Admin/L&D Routes ────────────────────────────────────────────────────────

router.post('/jobs', authenticate, requireAdmin, upload.single('file'), ctrl.addJob);
router.delete('/jobs/:jobId', authenticate, requireAdmin, ctrl.deleteJob);
router.post('/materials', authenticate, requireAdmin, upload.single('file'), ctrl.addMaterial);
router.delete('/materials/:materialId', authenticate, requireAdmin, ctrl.deleteMaterial);
router.get('/jobs/:jobId/applications', authenticate, requireAdmin, ctrl.getJobApplications);
router.get('/jobs/:jobId/course/:courseId/applications', authenticate, requireAdmin, ctrl.courseJobApplications);

// ── Shared Routes ───────────────────────────────────────────────────────────

router.get('/jobs', authenticate, ctrl.getJobs);
router.get('/materials', authenticate, ctrl.getMaterials);

// ── Student Routes ──────────────────────────────────────────────────────────

const requireStudent = requireRole('STUDENT');

router.get('/eligibility', authenticate, requireStudent, ctrl.checkEligibility);
router.post('/resume', authenticate, requireStudent, upload.single('file'), ctrl.uploadResume);
router.get('/resume', authenticate, requireStudent, ctrl.getResume);
router.post('/jobs/:jobId/apply', authenticate, requireStudent, ctrl.applyJob);
router.get('/applications', authenticate, requireStudent, ctrl.getMyApplications);

// Webhook endpoint for Logic App — protected by shared secret
router.post('/webhook/match-results', ctrl.saveMatchResults);

export default router;
