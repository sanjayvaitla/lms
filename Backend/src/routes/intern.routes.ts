import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/intern.controller';

const refUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' || name.endsWith('.pdf') ||
      file.mimetype === 'application/vnd.ms-powerpoint' || name.endsWith('.ppt') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || name.endsWith('.pptx');
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and PPT/PPTX files allowed.'));
    }
  },
});

const solutionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max for code zips
});

const router = Router();

const studentAuth = [authenticate, requireRole('INTERN')];
const adminAuth   = [authenticate, requireRole('ADMIN', 'SUPER_ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER')];

// ── GitHub Webhook (no auth — signed by GitHub HMAC) ────────────────────────────
// The raw body for HMAC verification is captured in index.ts via express.json's
// verify hook (route-level raw() arrives too late). We then parse JSON normally.
router.post(
  '/github/webhook',
  (req, _res, next) => {
    // express.json has parsed req.body for us; rawBody is stashed by the verify hook.
    if (!(req as any).rawBody && Buffer.isBuffer(req.body)) {
      (req as any).rawBody = req.body;
      try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
    }
    next();
  },
  ctrl.internGithubWebhook
);

// ── Student routes ──────────────────────────────────────────────────────────────
router.get('/profile',                    ...studentAuth, ctrl.getProfile);
router.get('/references',                 ...studentAuth, ctrl.getReferences);
router.get('/tasks',                      ...studentAuth, ctrl.getTasks);
router.post('/tasks/:id/fork',            ...studentAuth, ctrl.forkTask);
router.get( '/tasks/:id/detect-fork',     ...studentAuth, ctrl.detectFork);
router.post('/tasks/:id/confirm-fork',    ...studentAuth, ctrl.confirmFork);
router.post('/tasks/:id/submit-pr',       ...studentAuth, ctrl.submitPR);
router.get('/work-logs',                  ...studentAuth, ctrl.getWorkLogs);
router.post('/work-logs',                 ...studentAuth, ctrl.addWorkLog);
router.get('/attendance',                 ...studentAuth, ctrl.getAttendance);
router.get('/evaluation',                 ...studentAuth, ctrl.getEvaluation);
router.get('/stipend',                    ...studentAuth, ctrl.getStipend);
router.get('/certificate',                ...studentAuth, ctrl.getCertificate);

// ── Admin: Lookup endpoints ─────────────────────────────────────────────────────
router.get('/admin/lookup/batches',                        ...adminAuth, ctrl.adminGetLookupBatches);
router.get('/admin/lookup/trainers',                       ...adminAuth, ctrl.adminGetLookupTrainers);
router.get('/admin/lookup/intern-students',                ...adminAuth, ctrl.adminGetLookupInternStudents);
router.post('/admin/trainers',                             ...adminAuth, ctrl.adminCreateTrainer);
router.post('/admin/intern-students',                      ...adminAuth, ctrl.adminCreateInternStudent);

// ── Admin: Programs CRUD ────────────────────────────────────────────────────────
router.get('/admin/programs',                              ...adminAuth, ctrl.adminGetPrograms);
router.post('/admin/programs',                             ...adminAuth, ctrl.adminCreateProgram);
router.put('/admin/programs/:id',                          ...adminAuth, ctrl.adminUpdateProgram);
router.delete('/admin/programs/:id',                       ...adminAuth, ctrl.adminDeleteProgram);

// ── Admin: Internship Batches ─────────────────────────────────────────────────
router.get('/admin/batches',                               ...adminAuth, ctrl.adminGetBatches);
router.post('/admin/batches',                              ...adminAuth, ctrl.adminCreateBatch);
router.put('/admin/batches/:id',                           ...adminAuth, ctrl.adminUpdateBatch);
router.delete('/admin/batches/:id',                        ...adminAuth, ctrl.adminDeleteBatch);
router.get('/admin/batches/:batchId/students',             ...adminAuth, ctrl.adminGetBatchStudents);

// ── Admin: Program Students ─────────────────────────────────────────────────────
router.get('/admin/programs/:id/students',                 ...adminAuth, ctrl.adminGetProgramStudents);
router.post('/admin/programs/:id/students',                ...adminAuth, ctrl.adminAddProgramStudent);
router.delete('/admin/programs/:id/students/:studentId',   ...adminAuth, ctrl.adminRemoveProgramStudent);
router.get('/admin/programs/:id/students/:studentId/credentials', ...adminAuth, ctrl.adminGetStudentCredentials);

// ── Admin: References ───────────────────────────────────────────────────────────
router.get('/admin/references/:programId',                 ...adminAuth, ctrl.adminGetReferences);
router.post('/admin/references/upload',   ...adminAuth, refUpload.single('file'), ctrl.adminUploadRefFile);
router.post('/admin/references',                           ...adminAuth, ctrl.adminCreateRefGroup);
router.delete('/admin/references/:programId/:refNo',       ...adminAuth, ctrl.adminDeleteRefGroup);

// ── Admin: Tasks ────────────────────────────────────────────────────────────────
router.get('/admin/programs/:programId/tasks',             ...adminAuth, ctrl.adminGetTasks);
router.post('/admin/programs/:programId/tasks',            ...adminAuth, ctrl.adminCreateTask);
router.delete('/admin/tasks/:taskId',                      ...adminAuth, ctrl.adminDeleteTask);
router.get('/admin/programs/:programId/pipeline',          ...adminAuth, ctrl.adminGetPipeline);
router.post('/admin/programs/:programId/tasks/:taskId/scan',...adminAuth, ctrl.adminScanTask);
router.post('/admin/tasks/:taskId/solution',  ...adminAuth, solutionUpload.single('file'), ctrl.adminUploadTaskSolution);

// ── Admin: Dashboard & operations ───────────────────────────────────────────────
router.get('/admin/dashboard',                              ...adminAuth, ctrl.adminGetDashboard);
router.get('/admin/webhooks',                               ...adminAuth, ctrl.adminGetWebhookEvents);
router.get('/admin/work-logs',                              ...adminAuth, ctrl.adminGetWorkLogs);
router.put('/admin/work-logs/:id',                          ...adminAuth, ctrl.adminUpdateWorkLog);
router.get('/admin/attendance',                             ...adminAuth, ctrl.adminGetAttendance);
router.post('/admin/attendance',                           ...adminAuth, ctrl.adminMarkAttendance);
router.get('/admin/evaluations',                            ...adminAuth, ctrl.adminGetEvaluations);
router.post('/admin/evaluations',                           ...adminAuth, ctrl.adminSaveEvaluation);
router.get('/admin/stipends',                               ...adminAuth, ctrl.adminGetStipends);
router.post('/admin/stipends',                              ...adminAuth, ctrl.adminCreateStipend);
router.put('/admin/stipends/:id',                           ...adminAuth, ctrl.adminUpdateStipend);
router.get('/admin/certificates',                           ...adminAuth, ctrl.adminGetCertificates);
router.post('/admin/certificates/issue',                    ...adminAuth, ctrl.adminIssueCertificate);
router.get('/admin/companies',                              ...adminAuth, ctrl.adminGetCompanies);
router.get('/admin/ppo',                                    ...adminAuth, ctrl.adminGetPPOs);
router.post('/admin/ppo',                                    ...adminAuth, ctrl.adminUpsertPPO);
router.patch('/admin/intern-students/:id',                   ...adminAuth, ctrl.adminUpdateInternStudent);
router.post('/admin/intern-students/:id/reset-password',    ...adminAuth, ctrl.adminResetInternPassword);

export default router;
