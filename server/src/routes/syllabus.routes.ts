import { Router, IRouter, Request } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/syllabus.controller';

const router: IRouter = Router({ mergeParams: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (
    _req: Request,
    file: { mimetype: string; originalname: string },
    cb: (err: Error | null, accept?: boolean) => void,
  ) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
      'application/octet-stream',
    ];
    const nameOk =
      file.originalname.endsWith('.pdf') ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls') ||
      file.originalname.endsWith('.csv');
    if (allowed.includes(file.mimetype) || nameOk) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Excel, and CSV files are allowed'));
    }
  },
});

router.use(authenticate);

// Course syllabus routes (mounted at /courses/:courseId/syllabus)
router.get('/',                        ctrl.listSyllabi);
router.get('/active',                  ctrl.getSyllabus);
router.post('/', upload.single('syllabus'), ctrl.uploadSyllabus);
router.delete('/:syllabusId',
  requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER'),
  ctrl.deleteSyllabus,
);

export default router;
