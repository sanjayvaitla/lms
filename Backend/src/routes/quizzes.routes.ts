import { Router, IRouter, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/quizzes.controller';
import { trackActivity } from '../middleware/activityTracker';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req: Request, file: { mimetype: string; originalname: string }, cb: (err: Error | null, accept?: boolean) => void) => {
    const ok =
      ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel', 'text/csv', 'application/json'].includes(file.mimetype) ||
      /\.(pdf|xlsx|xls|csv|json)$/i.test(file.originalname);
    cb(ok ? null : new Error('Invalid file type. Allowed: PDF, Excel, CSV, JSON.'), ok);
  },
});

function handleUpload(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(fieldName)(req, res, (err: unknown) => {
      if (err) return next(err);
      next();
    });
  };
}

const router: IRouter = Router();
const adminRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER');
const viewRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER');

router.use(authenticate);

// CSV Import
router.post('/csv-import', adminRoles, handleUpload('file'), ctrl.importCsv);

// Dashboard
router.get('/dashboard', viewRoles, ctrl.dashboard);

// Datasets
router.get('/datasets',          viewRoles, ctrl.listDatasets);
router.post('/datasets',         adminRoles, handleUpload('file'), ctrl.uploadDataset);
router.get('/datasets/:id',      viewRoles, ctrl.getDataset);
router.delete('/datasets/:id',   adminRoles, ctrl.deleteDataset);

// Questions
router.get('/questions',         viewRoles, ctrl.listQuestions);
router.post('/questions',        adminRoles, ctrl.createQuestion);
router.delete('/questions/:id',  adminRoles, ctrl.deleteQuestion);

// Quizzes (list is staff-only — drafts would otherwise leak org-wide)
router.get('/',              viewRoles, trackActivity('LIST_QUIZZES', 'Quiz'), ctrl.listQuizzes);
router.post('/',             adminRoles, ctrl.createQuiz);
router.put('/:id',           adminRoles, ctrl.updateQuiz);
router.patch('/:id/release', adminRoles, ctrl.releaseQuiz);
router.patch('/:id/lock',    adminRoles, ctrl.lockQuiz);
router.delete('/:id',        adminRoles, ctrl.deleteQuiz);
router.get('/:id/preview',   viewRoles, trackActivity('VIEW_QUIZ', 'Quiz'), ctrl.previewRandom);

// Attempts — /attempts/list MUST come before /:id/attempt to avoid shadowing
router.get('/attempts/list',               viewRoles,  ctrl.listAttempts);
router.post('/:id/attempt',               requireRole('STUDENT', 'INTERN'), ctrl.startAttempt);
router.post('/attempts/:attemptId/submit', requireRole('STUDENT', 'INTERN'), ctrl.submitAttempt);
router.get('/attempts/:attemptId/review',  requireRole('STUDENT', 'INTERN', 'SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER'), ctrl.reviewAttempt);

export default router;
