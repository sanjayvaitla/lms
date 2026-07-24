import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/coding.controller';
import { trackActivity } from '../middleware/activityTracker';

const router: import('express').Router = Router();

// ── Admin / Trainer routes ────────────────────────────────────────────────────

// Problems CRUD — lists are staff-only; single GET sanitizes by role
router.get('/problems',
  authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER'),
  ctrl.listProblems,
);
router.get('/problems/:id', authenticate, ctrl.getProblem);

router.post('/problems',
  authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER'),
  ctrl.createProblem,
);
router.put('/problems/:id',
  authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER'),
  ctrl.updateProblem,
);
router.delete('/problems/:id',
  authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER'),
  ctrl.deleteProblem,
);

// Assignments
router.get('/assignments',
  authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER'),
  ctrl.listAssignments,
);
router.post('/assignments',
  authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER'),
  ctrl.assignProblem,
);
router.patch('/assignments/:id/close',
  authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER'),
  ctrl.closeAssignment,
);
router.get('/assignments/:id/submissions',
  authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER'),
  ctrl.getSubmissionsByAssignment,
);

// ── Student routes ────────────────────────────────────────────────────────────

router.get('/student/assignments',
  authenticate, requireRole('STUDENT'), trackActivity('LIST_CODING_TESTS', 'CodingTest'),
  ctrl.getStudentAssignments,
);
router.post('/student/submit',
  authenticate, requireRole('STUDENT'),
  ctrl.submitCode,
);
router.get('/student/submissions/:assignmentId',
  authenticate, requireRole('STUDENT'),
  ctrl.getMySubmissions,
);

// Shared
router.get('/submissions/:id', authenticate, ctrl.getSubmission);

// Run code with custom input (no submission)
router.post('/run', authenticate, ctrl.runCode);

export default router;
