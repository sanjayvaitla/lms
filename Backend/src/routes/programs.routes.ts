import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { trackActivity } from '../middleware/activityTracker';

const router: import('express').Router = Router();
const adminAuth = [authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'TRAINER', 'LD_MANAGER', 'OPERATIONAL_MANAGER')];

// List all programs with their courses
router.get('/', authenticate, trackActivity('LIST_PROGRAMS', 'Program'), async (req, res) => {
  const { rows } = await db.query<any>(`
    SELECT p.*,
      (
        SELECT COUNT(*)::int FROM users usr
        WHERE usr.role = 'STUDENT' AND usr.assigned_program_id = p.id
      ) AS "studentCount",
      COALESCE(
        json_agg(
          json_build_object(
            'id', c.id, 'title', c.title, 'category', c.category,
            'status', c.status, 'level', c.level,
            'colorToken', c.color_token, 'color_token', c.color_token,
            'durationMonths', c.duration_months, 'duration_months', c.duration_months,
            'studentCount',
            (SELECT COUNT(DISTINCT pcs.program_enrollment_id)::int
             FROM program_course_selections pcs WHERE pcs.course_id = c.id),
            'batchCount',
            (SELECT COUNT(*)::int FROM batches b WHERE b.program_id = c.program_id)
          ) ORDER BY c.title
        ) FILTER (WHERE c.id IS NOT NULL), '[]'
      ) AS courses
    FROM programs p
    LEFT JOIN courses c ON c.program_id = p.id AND c.status != 'ARCHIVED'
    WHERE p.is_active = true
    GROUP BY p.id
    ORDER BY p.sort_order, p.name
  `);
  res.json({ success: true, data: rows });
});

// ── Student routes (must be before /:id) ──────────────────────────────────────
router.get('/student/browse', authenticate, trackActivity('BROWSE_PROGRAMS', 'Program'), async (req, res) => {
  const { rows } = await db.query<any>(`
    SELECT p.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', c.id, 'title', c.title, 'category', c.category,
            'level', c.level, 'colorToken', c.color_token, 'color_token', c.color_token,
            'durationMonths', c.duration_months, 'duration_months', c.duration_months, 'description', c.description
          ) ORDER BY c.title
        ) FILTER (WHERE c.id IS NOT NULL), '[]'
      ) AS courses
    FROM programs p
    LEFT JOIN courses c ON c.program_id = p.id AND c.status = 'ACTIVE'
    WHERE p.is_active = true
    GROUP BY p.id
    ORDER BY p.sort_order, p.name
  `);
  res.json({ success: true, data: rows });
});

router.post('/student/enroll', authenticate, requireRole('STUDENT'), async (req, res) => {
  const { program_id, course_ids } = req.body as { program_id: string; course_ids: string[] };
  const studentId = (req as any).user.userId;

  if (!program_id || !course_ids?.length) {
    throw new AppError('program_id and course_ids are required', 400, 'VALIDATION_ERROR');
  }

  const { rows: enrollRows } = await db.query<any>(
    `INSERT INTO program_enrollments (student_id, program_id)
     VALUES ($1, $2)
     ON CONFLICT (student_id, program_id) DO UPDATE SET enrolled_at = NOW()
     RETURNING id`,
    [studentId, program_id],
  );
  const enrollmentId = enrollRows[0].id;

  for (const courseId of course_ids) {
    await db.query(
      `INSERT INTO program_course_selections (program_enrollment_id, course_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [enrollmentId, courseId],
    );
  }

  res.json({ success: true, message: `Enrolled in ${course_ids.length} course(s)` });
});

router.get('/student/my-programs', authenticate, requireRole('STUDENT'), trackActivity('LIST_MY_PROGRAMS', 'Program'), async (req, res) => {
  const studentId = (req as any).user.userId;
  const { rows } = await db.query<any>(`
    SELECT pe.id AS enrollment_id, pe.enrolled_at,
           p.id AS program_id, p.name AS program_name, p.color_token,
           COALESCE(
             json_agg(
               json_build_object('id', c.id, 'title', c.title, 'category', c.category, 'colorToken', c.color_token, 'color_token', c.color_token)
               ORDER BY c.title
             ) FILTER (WHERE c.id IS NOT NULL), '[]'
           ) AS selected_courses
    FROM program_enrollments pe
    JOIN programs p ON p.id = pe.program_id
    LEFT JOIN program_course_selections pcs ON pcs.program_enrollment_id = pe.id
    LEFT JOIN courses c ON c.id = pcs.course_id
    WHERE pe.student_id = $1
    GROUP BY pe.id, p.id
    ORDER BY pe.enrolled_at DESC`,
    [studentId],
  );
  res.json({ success: true, data: rows });
});

// Get single program
router.get('/:id', authenticate, trackActivity('VIEW_PROGRAM', 'Program'), async (req, res) => {
  const { rows } = await db.query<any>(`SELECT * FROM programs WHERE id = $1`, [req.params.id]);
  if (!rows[0]) throw new AppError('Program not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: rows[0] });
});

// Create program
router.post('/', ...adminAuth, async (req, res) => {
  const { name, description, color_token, sort_order } = req.body;
  if (!name) throw new AppError('Name is required', 400, 'VALIDATION_ERROR');
  const { rows } = await db.query<any>(
    `INSERT INTO programs (name, description, color_token, sort_order, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, description ?? null, color_token ?? 'cyan', sort_order ?? 0, (req as any).user?.userId ?? null],
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// Update program
router.put('/:id', ...adminAuth, async (req, res) => {
  const { name, description, color_token, sort_order, is_active } = req.body;
  const { rows } = await db.query<any>(
    `UPDATE programs SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       color_token = COALESCE($3, color_token),
       sort_order = COALESCE($4, sort_order),
       is_active = COALESCE($5, is_active),
       updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [name, description, color_token, sort_order, is_active, req.params.id],
  );
  if (!rows[0]) throw new AppError('Program not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: rows[0] });
});

// Delete program
router.delete('/:id', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'LD_MANAGER', 'OPERATIONAL_MANAGER'), async (req, res) => {
  const pid = req.params.id;
  // Cascade: course selections → enrollments → unlink users → unlink courses → delete program
  await db.query(`
    DELETE FROM program_course_selections
    WHERE program_enrollment_id IN (
      SELECT id FROM program_enrollments WHERE program_id = $1
    )`, [pid]);
  await db.query(`DELETE FROM program_enrollments WHERE program_id = $1`, [pid]);
  await db.query(`UPDATE users SET assigned_program_id = NULL, program_assigned_at = NULL WHERE assigned_program_id = $1`, [pid]);
  await db.query(`UPDATE courses SET program_id = NULL WHERE program_id = $1`, [pid]);
  await db.query(`DELETE FROM programs WHERE id = $1`, [pid]);
  res.json({ success: true, message: 'Program deleted' });
});

// Assign course to program
router.post('/:id/courses', ...adminAuth, async (req, res) => {
  const { course_id } = req.body;
  if (!course_id) throw new AppError('course_id required', 400, 'VALIDATION_ERROR');
  await db.query(`UPDATE courses SET program_id = $1 WHERE id = $2`, [req.params.id, course_id]);
  res.json({ success: true, message: 'Course assigned to program' });
});

// Remove course from program
router.delete('/:id/courses/:courseId', ...adminAuth, async (req, res) => {
  await db.query(`UPDATE courses SET program_id = NULL WHERE id = $1 AND program_id = $2`, [req.params.courseId, req.params.id]);
  res.json({ success: true, message: 'Course removed from program' });
});

export default router;
