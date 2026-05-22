import { Request, Response } from 'express';
import * as trainersService from '../services/trainers.service';
import { createTrainerSchema, updateTrainerSchema } from '../validators/trainer.validator';
import { AppError } from '../middleware/error.middleware';

export async function listTrainers(_req: Request, res: Response) {
  const trainers = await trainersService.listTrainers();
  res.json({ success: true, data: trainers });
}

export async function getTrainer(req: Request, res: Response) {
  const trainer = await trainersService.getTrainer(String(req.params.id));
  res.json({ success: true, data: trainer });
}

export async function createTrainer(req: Request, res: Response) {
  const parsed = createTrainerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const trainer = await trainersService.createTrainer(parsed.data);
  res.status(201).json({ success: true, data: trainer });
}

export async function updateTrainer(req: Request, res: Response) {
  const parsed = updateTrainerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const trainer = await trainersService.updateTrainer(String(req.params.id), parsed.data);
  res.json({ success: true, data: trainer });
}

export async function deleteTrainer(req: Request, res: Response) {
  await trainersService.deleteTrainer(String(req.params.id));
  res.json({ success: true, message: 'Trainer deleted successfully' });
}
