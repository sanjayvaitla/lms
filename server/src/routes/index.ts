import { Router } from 'express';
import authRoutes        from './auth.routes';
import coursesRoutes     from './courses.routes';
import batchesRoutes     from './batches.routes';
import dashboardRoutes   from './dashboard.routes';
import trainersRoutes    from './trainers.routes';
import learnersRoutes    from './learners.routes';
import modulesRoutes     from './modules.routes';
import quizzesRoutes     from './quizzes.routes';
import assignmentsRoutes from './assignments.routes';
import attendanceRoutes  from './attendance.routes';

const router: import('express').Router = Router();

router.use('/auth',        authRoutes);
router.use('/courses',     coursesRoutes);
router.use('/courses/:courseId/modules', modulesRoutes);
router.use('/batches',     batchesRoutes);
router.use('/dashboard',   dashboardRoutes);
router.use('/trainers',    trainersRoutes);
router.use('/learners',    learnersRoutes);
router.use('/quizzes',     quizzesRoutes);
router.use('/assignments', assignmentsRoutes);
router.use('/attendance',  attendanceRoutes);

export default router;
