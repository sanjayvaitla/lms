import { Request, Response, NextFunction } from 'express';
import * as FeesService from '../services/fees.service';

// ── Fee Structures ────────────────────────────────────────────────────────────

export async function listFeeStructures(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseId } = req.query as Record<string, string | undefined>;
    const data = await FeesService.listFeeStructures(courseId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getFeeStructure(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.getFeeStructure(req.params.id as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createFeeStructure(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.createFeeStructure(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateFeeStructure(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.updateFeeStructure(req.params.id as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteFeeStructure(req: Request, res: Response, next: NextFunction) {
  try {
    await FeesService.deleteFeeStructure(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
}

// ── Instalments ───────────────────────────────────────────────────────────────

export async function createInstalment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.createInstalment(req.params.id as string, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateInstalment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.updateInstalment(req.params.instalmentId as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteInstalment(req: Request, res: Response, next: NextFunction) {
  try {
    await FeesService.deleteInstalment(req.params.instalmentId as string);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
}

// ── Scholarships ──────────────────────────────────────────────────────────────

export async function listScholarships(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseId } = req.query as Record<string, string | undefined>;
    const data = await FeesService.listScholarships(courseId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createScholarship(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.createScholarship(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateScholarship(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.updateScholarship(req.params.scholarshipId as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteScholarship(req: Request, res: Response, next: NextFunction) {
  try {
    await FeesService.deleteScholarship(req.params.scholarshipId as string);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
}

// ── Discounts ─────────────────────────────────────────────────────────────────

export async function listDiscounts(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.listDiscounts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createDiscount(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.createDiscount(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateDiscount(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.updateDiscount(req.params.discountId as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteDiscount(req: Request, res: Response, next: NextFunction) {
  try {
    await FeesService.deleteDiscount(req.params.discountId as string);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId, feeStructureId, status } = req.query as Record<string, string | undefined>;
    const data = await FeesService.listPayments(studentId, feeStructureId, status);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.createPayment(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updatePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.updatePayment(req.params.paymentId as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getFeeAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await FeesService.getFeeAnalytics();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
