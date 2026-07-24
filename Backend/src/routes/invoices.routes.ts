import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/invoices.controller';

const router: import('express').Router = Router();

// Admin: generate invoice for a specific verified payment proof
router.post('/generate/:studentId', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FEES_ADMIN'), ctrl.generateInvoice);

// Student or Intern: list their own invoices (auto-generated on payment verification)
router.get('/student/mine', authenticate, requireRole('STUDENT', 'INTERN'), ctrl.getStudentInvoices);

// Anyone authenticated: view single invoice details (access-controlled inside controller)
router.get('/:id', authenticate, ctrl.getInvoiceDetails);

export default router;
