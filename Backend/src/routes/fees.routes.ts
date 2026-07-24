import { Router } from 'express';
import * as C from '../controllers/fees.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router: import("express").Router = Router();

// All fees routes require login + fees-capable role
const feesAuth = [authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FEES_ADMIN')];

// Analytics
router.get('/analytics', ...feesAuth, C.getFeeAnalytics);

// Scholarships
router.get('/scholarships',                   ...feesAuth, C.listScholarships);
router.post('/scholarships',                  ...feesAuth, C.createScholarship);
router.put('/scholarships/:scholarshipId',    ...feesAuth, C.updateScholarship);
router.delete('/scholarships/:scholarshipId', ...feesAuth, C.deleteScholarship);

// Discounts
router.get('/discounts',                ...feesAuth, C.listDiscounts);
router.post('/discounts',               ...feesAuth, C.createDiscount);
router.put('/discounts/:discountId',    ...feesAuth, C.updateDiscount);
router.delete('/discounts/:discountId', ...feesAuth, C.deleteDiscount);

// Payments
router.get('/payments',             ...feesAuth, C.listPayments);
router.post('/payments',            ...feesAuth, C.createPayment);
router.put('/payments/:paymentId',  ...feesAuth, C.updatePayment);

// Instalments
router.put('/instalments/:instalmentId',    ...feesAuth, C.updateInstalment);
router.delete('/instalments/:instalmentId', ...feesAuth, C.deleteInstalment);

// Fee Structures
router.get('/',       ...feesAuth, C.listFeeStructures);
router.post('/',      ...feesAuth, C.createFeeStructure);
router.get('/:id',    ...feesAuth, C.getFeeStructure);
router.put('/:id',    ...feesAuth, C.updateFeeStructure);
router.delete('/:id', ...feesAuth, C.deleteFeeStructure);

// Instalments nested under structure
router.post('/:id/instalments', ...feesAuth, C.createInstalment);

export default router;
