import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/fees-v2.controller';
import { trackActivity } from '../middleware/activityTracker';

const router: import('express').Router = Router();

const feesAuth = [authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'FEES_ADMIN')];

// Admin routes
router.get('/months',                    ...feesAuth, ctrl.getMonths);
router.get('/students',                  ...feesAuth, ctrl.listStudents);
router.get('/tree',                      ...feesAuth, ctrl.getTree);
router.get('/month-tree',                ...feesAuth, ctrl.getMonthTree);
router.get('/students/:studentId',               ...feesAuth, ctrl.getStudentFee);
router.get('/students/:studentId/courses',       ...feesAuth, ctrl.getStudentCourses);
router.put('/students/:studentId/courses',       ...feesAuth, ctrl.updateStudentCourses);
router.delete('/students/:studentId/courses/:courseId', ...feesAuth, ctrl.removeStudentFromCourse);
router.delete('/students/:studentId/courses',           ...feesAuth, ctrl.removeAllCourses);
router.post('/students/:studentId/block',        ...feesAuth, ctrl.toggleBlockStudent);
router.post('/students/:studentId',              ...feesAuth, ctrl.upsertFee);
router.post('/reminders/:feeId',         ...feesAuth, ctrl.sendReminder);

// Student signup management
router.get('/signups/unassigned',                   ...feesAuth, ctrl.getUnassignedStudents);
router.post('/signups/:studentId/enroll-program',   ...feesAuth, ctrl.enrollStudentInProgram);
router.get('/signups/pending',                      ...feesAuth, ctrl.getPendingSignups);
router.get('/signups/all',               ...feesAuth, ctrl.getAllSignups);
router.post('/signups/:studentId/accept',...feesAuth, ctrl.acceptStudent);
router.post('/signups/:studentId/accept-intern',...feesAuth, ctrl.acceptIntern);
router.post('/signups/:studentId/resend-welcome',...feesAuth, ctrl.resendWelcome);
router.patch('/signups/:studentId/portal',       ...feesAuth, ctrl.updateSignupPortal);
router.post('/signups/:studentId/reject',...feesAuth, ctrl.rejectStudent);
router.delete('/signups/:studentId',      ...feesAuth, ctrl.deleteRejectedStudent);

// Student route
router.get('/my-fees', authenticate, requireRole('STUDENT'), trackActivity('VIEW_FEES', 'Fee'), ctrl.getMyFees);
router.get('/my-program', authenticate, requireRole('STUDENT'), ctrl.getMyAssignedProgram);

// Delete fee record
router.delete('/records/:feeId', ...feesAuth, ctrl.deleteFeeRecord);

export default router;
