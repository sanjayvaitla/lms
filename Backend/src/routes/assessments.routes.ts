import { Router, IRouter, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/assessments.controller';
import { trackActivity } from '../middleware/activityTracker';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

// For create: accept PDF + optional CSV
const createUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: Request, file: { mimetype: string; originalname: string }, cb: (err: Error | null, accept?: boolean) => void) => {
    const name = file.originalname.toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' || name.endsWith('.pdf') ||
      file.mimetype === 'text/csv' || file.mimetype === 'text/plain' || name.endsWith('.csv');
    cb(ok ? null : new Error('Only PDF and CSV files are allowed.'), ok);
  },
});

// For submit (Part B): PDF only
const pdfOnly = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: Request, file: { mimetype: string; originalname: string }, cb: (err: Error | null, accept?: boolean) => void) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    cb(ok ? null : new Error('Only PDF files are allowed.'), ok);
  },
});

function handleCreateUpload() {
  return (req: Request, res: Response, next: NextFunction) => {
    createUpload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'csv',  maxCount: 1 },
      { name: 'rubricPdf', maxCount: 1 },
    ])(req, res, (err: unknown) => {
      if (err) return next(err);
      next();
    });
  };
}

function handlePdfUpload(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    pdfOnly.single(fieldName)(req, res, (err: unknown) => {
      if (err) return next(err);
      next();
    });
  };
}

const router: IRouter = Router();
const adminRoles = requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER');

router.use(authenticate);

// Student endpoints
router.get('/student/list',         requireRole('STUDENT'), trackActivity('LIST_ASSESSMENTS', 'Assessment'), ctrl.studentList);
router.post('/:id/submit',          requireRole('STUDENT'), handlePdfUpload('file'), ctrl.submit);
router.post('/:id/submit-part-a',   requireRole('STUDENT'), ctrl.submitPartA);

// Dashboard
router.get('/dashboard', adminRoles, ctrl.dashboard);

// Assessment CRUD (staff only — detail includes peer submissions)
router.get('/',       adminRoles, ctrl.list);
router.get('/:id',    adminRoles, ctrl.getById);
router.post('/',      adminRoles, handleCreateUpload(), ctrl.create);
router.put('/:id',    adminRoles, ctrl.update);
router.delete('/:id', adminRoles, ctrl.remove);

// Submission grading
router.put('/submissions/:submissionId/grade', adminRoles, ctrl.grade);

export default router;
