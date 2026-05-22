import { Router, IRouter, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/quizzes.controller';

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
const adminRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER');

router.use(authenticate);

// Dashboard
router.get('/dashboard', adminRoles, ctrl.dashboard);

// Datasets
router.get('/datasets',          adminRoles, ctrl.listDatasets);
router.post('/datasets',         adminRoles, handleUpload('file'), ctrl.uploadDataset);
router.get('/datasets/:id',      adminRoles, ctrl.getDataset);
router.delete('/datasets/:id',   adminRoles, ctrl.deleteDataset);

// Questions
router.get('/questions',         adminRoles, ctrl.listQuestions);
router.post('/questions',        adminRoles, ctrl.createQuestion);
router.delete('/questions/:id',  adminRoles, ctrl.deleteQuestion);

// Quizzes
router.get('/',              ctrl.listQuizzes);
router.post('/',             adminRoles, ctrl.createQuiz);
router.put('/:id',           adminRoles, ctrl.updateQuiz);
router.delete('/:id',        adminRoles, ctrl.deleteQuiz);
router.get('/:id/preview',   adminRoles, ctrl.previewRandom);

// Attempts
router.post('/:id/attempt',               authenticate, ctrl.startAttempt);
router.post('/attempts/:attemptId/submit', authenticate, ctrl.submitAttempt);
router.get('/attempts/list',               adminRoles,  ctrl.listAttempts);

export default router;
