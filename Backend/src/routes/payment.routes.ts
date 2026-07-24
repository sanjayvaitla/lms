import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/payment.controller';

const router: import('express').Router = Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ok = ['image/jpeg','image/jpg','image/png','image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only image files allowed'), ok);
  },
});

const feesAuth = [authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FEES_ADMIN')];

// UPI settings
router.get('/upi',    authenticate, ctrl.getUpiSettings);
router.put('/upi',    ...feesAuth,  ctrl.updateUpiSettings);

// Proofs — admin
router.get('/proofs/pending',        ...feesAuth, ctrl.listPendingProofs);
router.get('/proofs/fee/:feeId',     ...feesAuth, ctrl.listProofs);
router.patch('/proofs/:proofId',     ...feesAuth, ctrl.verifyProof);

// Proofs — student
router.post('/proofs/submit',
  authenticate, requireRole('STUDENT'),
  upload.single('proof'),
  ctrl.submitProof,
);
router.get('/proofs/mine', authenticate, requireRole('STUDENT'), ctrl.getMyProofs);

export default router;
