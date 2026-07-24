import { Router, IRouter, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/assignments.controller';
import { trackActivity } from '../middleware/activityTracker';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

const adminUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: Request, file: { mimetype: string; originalname: string }, cb: (err: Error | null, accept?: boolean) => void) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    cb(ok ? null : new Error('Only PDF files are allowed.'), ok);
  },
});

const studentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req: Request, file: { mimetype: string; originalname: string }, cb: (err: Error | null, accept?: boolean) => void) => {
    const name = file.originalname.toLowerCase();
    const mime = file.mimetype;
    const ok =
      mime === 'application/pdf' || name.endsWith('.pdf') ||
      mime === 'application/zip' || mime === 'application/x-zip-compressed' ||
      mime === 'application/octet-stream' || name.endsWith('.zip');
    cb(ok ? null : new Error('Only PDF and ZIP files are allowed.'), ok);
  },
});

function handleAdminUpload(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    adminUpload.single(fieldName)(req, res, (err: unknown) => {
      if (err) return next(err);
      next();
    });
  };
}

function handleStudentUpload() {
  return (req: Request, res: Response, next: NextFunction) => {
    studentUpload.fields([
      { name: 'pdf', maxCount: 1 },
      { name: 'zip', maxCount: 1 },
    ])(req, res, (err: unknown) => {
      if (err) return next(err);
      next();
    });
  };
}

const router: IRouter = Router();
const adminRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER');
const viewRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER');

router.use(authenticate);

// Student endpoints (students + interns may have GitHub assignments)
router.get('/student/list', requireRole('STUDENT', 'INTERN'), ctrl.studentList);
router.post('/:id/start-github-task', requireRole('STUDENT', 'INTERN'), ctrl.startGithubTask);
router.post('/:id/confirm-github-fork', requireRole('STUDENT', 'INTERN'), ctrl.confirmGithubFork);
router.post('/:id/submit',  requireRole('STUDENT', 'INTERN'), handleStudentUpload(), ctrl.submit);

// Dashboard
router.get('/dashboard', viewRoles, ctrl.dashboard);

// Assignments CRUD — static routes MUST come before /:id (staff only — peer submissions leak if open)
router.get('/git-tasks',           viewRoles, ctrl.listGitTasks);
router.post('/git-tasks',          adminRoles, ctrl.createGitTask);
router.get('/git-tasks/:id/pipeline', adminRoles, ctrl.getGitTaskPipeline);
router.delete('/git-tasks/:id',    adminRoles, ctrl.deleteGitTask);

router.get('/',          viewRoles, trackActivity('LIST_ASSIGNMENTS', 'Assignment'), ctrl.list);
router.get('/:id',       viewRoles, trackActivity('VIEW_ASSIGNMENT', 'Assignment'), ctrl.getById);
router.post('/',         adminRoles, handleAdminUpload('file'), ctrl.create);
router.put('/:id',       adminRoles, ctrl.update);
router.delete('/:id',    adminRoles, ctrl.remove);
router.post('/:id/notify', adminRoles, ctrl.notifyStudents);

// Submissions grading
router.put('/submissions/:submissionId/grade',    adminRoles, ctrl.grade);
router.post('/submissions/:submissionId/ai-grade', adminRoles, ctrl.aiGrade);

export default router;
