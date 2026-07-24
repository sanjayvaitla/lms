import { Request, Response } from 'express';
import * as svc from '../services/fees-v2.service';
import { AppError } from '../middleware/error.middleware';

const p = (req: Request) => req.params as Record<string, string>;
const q = (req: Request) => req.query  as Record<string, string>;

export async function listStudents(req: Request, res: Response) {
  const data = await svc.listStudentsWithFees({
    month:  q(req).month,
    search: q(req).search,
    page:   q(req).page ? parseInt(q(req).page, 10) : 1,
    limit:  q(req).limit ? parseInt(q(req).limit, 10) : 50,
  });
  res.json({ success: true, data });
}

export async function getMonths(req: Request, res: Response) {
  const data = await svc.getEnrolledMonths();
  res.json({ success: true, data });
}

export async function getStudentFee(req: Request, res: Response) {
  const data = await svc.getStudentFee(p(req).studentId, q(req).month);
  res.json({ success: true, data });
}

export async function upsertFee(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await svc.upsertStudentFee({
    ...req.body,
    student_id: p(req).studentId,
    created_by: req.user.userId,
  });
  res.json({ success: true, data });
}

export async function sendReminder(req: Request, res: Response) {
  const data = await svc.sendReminder(p(req).feeId, req.body.field);
  res.json({ success: true, data });
}

export async function getMyFees(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await svc.getMyFees(req.user.userId);
  res.json({ success: true, data });
}

export async function deleteFeeRecord(req: Request, res: Response) {
  await svc.deleteFeeRecord(p(req).feeId);
  res.json({ success: true, message: 'Fee record deleted' });
}

export async function getTree(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  const data = await svc.getCourseBatchStudentTree({
    month: q.month,
    phone: q.phone,
  });
  res.json({ success: true, data });
}

export async function getPendingSignups(req: Request, res: Response) {
  const data = await svc.getPendingSignups();
  res.json({ success: true, data });
}

export async function getUnassignedStudents(req: Request, res: Response) {
  const data = await svc.getUnassignedStudents();
  res.json({ success: true, data });
}

export async function enrollStudentInProgram(req: Request, res: Response) {
  const { programId, courseIds } = req.body as { programId: string; courseIds: string[] };
  if (!programId) throw new AppError('programId is required', 400, 'VALIDATION_ERROR');
  const data = await svc.enrollStudentInProgram(
    String((req as any).params.studentId),
    programId,
    courseIds ?? [],
  );
  res.json({ success: true, data });
}

export async function getAllSignups(req: Request, res: Response) {
  const data = await svc.getAllStudentSignups();
  res.json({ success: true, data });
}

export async function acceptStudent(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { program_id, lead_source, course_ids, fee_details } = req.body;
  if (!program_id) throw new AppError('program_id is required', 400, 'VALIDATION_ERROR');
  const data = await svc.acceptStudent(
    p(req).studentId,
    program_id,
    req.user.userId,
    lead_source,
    course_ids || [],
    fee_details
  );
  res.json({
    success: true,
    data,
    message: data.welcomeEmailSent
      ? 'Student approved — welcome email sent'
      : 'Student approved — welcome email could not be sent (check SMTP)',
  });
}

export async function acceptIntern(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { program_id, batch_id } = req.body;
  if (!program_id) throw new AppError('program_id is required', 400, 'VALIDATION_ERROR');
  const data = await svc.acceptIntern(p(req).studentId, program_id, batch_id);
  res.json({
    success: true,
    data,
    message: data.welcomeEmailSent
      ? 'Intern approved — welcome email sent'
      : 'Intern approved — welcome email could not be sent (check SMTP)',
  });
}

export async function resendWelcome(req: Request, res: Response) {
  const data = await svc.resendWelcomeEmail(p(req).studentId);
  res.json({ success: true, data, message: `Welcome email sent to ${data.email}` });
}

export async function updateSignupPortal(req: Request, res: Response) {
  const { portal } = req.body as { portal: 'STUDENT' | 'INTERN' };
  if (!portal || !['STUDENT', 'INTERN'].includes(portal)) {
    throw new AppError('portal must be STUDENT or INTERN', 400, 'VALIDATION_ERROR');
  }
  const data = await svc.updateSignupPortal(p(req).studentId, portal);
  res.json({ success: true, data });
}

export async function rejectStudent(req: Request, res: Response) {
  const data = await svc.rejectStudent(p(req).studentId);
  res.json({ success: true, data });
}

export async function getMyAssignedProgram(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await svc.getStudentAssignedProgram(req.user.userId);
  res.json({ success: true, data });
}

export async function deleteRejectedStudent(req: Request, res: Response) {
  await svc.deleteRejectedStudent(p(req).studentId);
  res.json({ success: true, message: 'Student account deleted' });
}

export async function getStudentCourses(req: Request, res: Response) {
  const data = await svc.getStudentCourseEnrollment(p(req).studentId);
  res.json({ success: true, data });
}

export async function updateStudentCourses(req: Request, res: Response) {
  const { programId, courseIds } = req.body as { programId: string; courseIds: string[] };
  if (!programId) throw new AppError('programId is required', 400, 'VALIDATION_ERROR');
  const data = await svc.updateStudentCourseSelections(
    p(req).studentId,
    programId,
    courseIds ?? [],
  );
  res.json({ success: true, data });
}

export async function removeStudentFromCourse(req: Request, res: Response) {
  const { studentId, courseId } = p(req);
  await svc.removeStudentFromCourse(studentId, courseId);
  res.json({ success: true, message: 'Removed from course' });
}

export async function removeAllCourses(req: Request, res: Response) {
  const { studentId } = p(req);
  await svc.removeAllCourses(studentId);
  res.json({ success: true, message: 'Removed from all courses' });
}

export async function getMonthTree(req: Request, res: Response) {
  const month = q(req).month;
  const data = await svc.getMonthCourseBatchTree(month);
  res.json({ success: true, data });
}

export async function toggleBlockStudent(req: Request, res: Response) {
  const data = await svc.toggleBlockStudent(p(req).studentId);
  res.json({ success: true, data });
}
