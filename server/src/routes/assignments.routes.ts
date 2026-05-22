import { Router, IRouter, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/assignments.controller';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: Request, file: { mimetype: string; originalname: string }, cb: (err: Error | null, accept?: boolean) => void) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    cb(ok ? null : new Error('Only PDF files are allowed.'), ok);
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

// Assignments CRUD
router.get('/',          ctrl.list);
router.get('/:id',       ctrl.getById);
router.post('/',         adminRoles, handleUpload('file'), ctrl.create);
router.put('/:id',       adminRoles, ctrl.update);
router.delete('/:id',    adminRoles, ctrl.remove);

// Submissions grading
router.put('/submissions/:submissionId/grade', adminRoles, ctrl.grade);

export default router;
