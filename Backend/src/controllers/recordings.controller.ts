import { Request, Response } from 'express';
import * as svc from '../services/recordings.service';
import { AppError } from '../middleware/error.middleware';

// ── Section Schedules ─────────────────────────────────────────────────────────

export async function getBatchSections(req: Request, res: Response) {
  const sections = await svc.getBatchSections(String(req.params.batchId));
  res.json({ success: true, data: sections });
}

export async function getSectionSchedules(req: Request, res: Response) {
  const schedules = await svc.getSectionSchedules(String(req.params.batchId));
  res.json({ success: true, data: schedules });
}

export async function upsertSectionSchedule(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { section, startTime, endTime, classDays, notes } = req.body as {
    section: string; startTime: string; endTime: string;
    classDays?: string; notes?: string;
  };
  if (!section)   throw new AppError('section is required', 400, 'VALIDATION_ERROR');
  if (!startTime) throw new AppError('startTime is required', 400, 'VALIDATION_ERROR');
  if (!endTime)   throw new AppError('endTime is required', 400, 'VALIDATION_ERROR');

  const result = await svc.upsertSectionSchedule(
    String(req.params.batchId),
    section, startTime, endTime,
    classDays ?? null, notes ?? null,
    req.user.userId,
  );
  res.json({ success: true, data: result });
}

export async function deleteSectionSchedule(req: Request, res: Response) {
  await svc.deleteSectionSchedule(
    String(req.params.batchId),
    String(req.params.section),
  );
  res.json({ success: true, message: 'Schedule deleted' });
}

// ── Recordings (YouTube links) ────────────────────────────────────────────────

/** Admin: list all recordings for a batch */
export async function getBatchRecordings(req: Request, res: Response) {
  const recordings = await svc.getBatchRecordings(String(req.params.batchId));
  res.json({ success: true, data: recordings });
}

/** Admin: list all recordings for a course (across linked batches) */
export async function getCourseRecordings(req: Request, res: Response) {
  const recordings = await svc.getCourseRecordings(String(req.params.courseId));
  res.json({ success: true, data: recordings });
}

/** Admin: add or replace a YouTube link for a session */
export async function upsertRecording(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

  const { moduleId, batchId, title, youtubeUrl, recordedDate, endTime } = req.body as {
    moduleId: string; batchId?: string; title: string;
    youtubeUrl: string; recordedDate: string; endTime: string;
  };

  if (!moduleId || !title || !youtubeUrl || !recordedDate || !endTime) {
    throw new AppError(
      'moduleId, title, youtubeUrl, recordedDate, endTime are required',
      400, 'VALIDATION_ERROR',
    );
  }

  const recording = await svc.upsertRecording({
    moduleId, batchId, title, youtubeUrl, recordedDate, endTime,
    uploadedBy: req.user.userId,
  });

  res.status(201).json({ success: true, data: recording });
}

/** Admin: delete a recording */
export async function deleteRecording(req: Request, res: Response) {
  await svc.deleteRecording(String(req.params.recordingId));
  res.json({ success: true, message: 'Recording deleted' });
}

/** Student + Admin: get recording for a specific module (checks availability) */
export async function getModuleRecording(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { moduleId, batchId } = req.params;
  const recording = await svc.getModuleRecording(String(moduleId), String(batchId));
  res.json({ success: true, data: recording });
}
