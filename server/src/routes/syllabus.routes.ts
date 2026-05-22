import { Router, IRouter, Request } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/syllabus.controller';

const router: IRouter = Router({ mergeParams: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

// Store in memory (buffer) -- no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (
    _req: Request,
    file: { mimetype: string; originalname: string },
    cb: (err: Error | null, accept?: boolean) => void,
  ) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    const nameOk =
      file.originalname.endsWith('.pdf') ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls');
    if (allowed.includes(file.mimetype) || nameOk) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Excel files are allowed'));
    }
  },
});

router.use(authenticate);

router.post('/', upload.single('syllabus'), ctrl.uploadSyllabus);
router.get('/',  ctrl.getSyllabus);

export default router;
