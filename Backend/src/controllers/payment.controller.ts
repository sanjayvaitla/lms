import { Request, Response } from 'express';
import * as svc from '../services/payment.service';
import { AppError } from '../middleware/error.middleware';

const p = (req: Request) => req.params as Record<string, string>;

export async function getUpiSettings(req: Request, res: Response) {
  const data = await svc.getUpiSettings();
  res.json({ success: true, data });
}

export async function updateUpiSettings(req: Request, res: Response) {
  const { upi_id, upi_name } = req.body;
  if (!upi_id) throw new AppError('upi_id is required', 400, 'VALIDATION_ERROR');
  const data = await svc.updateUpiSettings(upi_id, upi_name ?? 'Vtricks LMS');
  res.json({ success: true, data });
}

export async function submitProof(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const file = (req as any).file;
  if (!file) throw new AppError('No file uploaded', 400, 'NO_FILE');
  const { fee_id, installment_key, amount, student_upi, payment_date } = req.body;
  if (!fee_id || !installment_key || !amount) throw new AppError('fee_id, installment_key and amount are required', 400, 'VALIDATION_ERROR');
  const data = await svc.submitProof({
    fee_id, student_id: req.user.userId,
    installment_key, amount: parseFloat(amount), file,
    student_upi: student_upi ?? null,
    payment_date: payment_date ?? null,
  });
  res.status(201).json({ success: true, data });
}

export async function listProofs(req: Request, res: Response) {
  const data = await svc.listProofs(p(req).feeId);
  res.json({ success: true, data });
}

export async function listPendingProofs(req: Request, res: Response) {
  const data = await svc.listPendingProofs();
  res.json({ success: true, data });
}

export async function verifyProof(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { action, note } = req.body;
  if (!['VERIFIED','REJECTED'].includes(action)) throw new AppError('action must be VERIFIED or REJECTED', 400, 'VALIDATION_ERROR');
  const data = await svc.verifyProof(p(req).proofId, action, req.user.userId, note);
  res.json({ success: true, data });
}

export async function getMyProofs(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await svc.getMyProofs(req.user.userId);
  res.json({ success: true, data });
}
