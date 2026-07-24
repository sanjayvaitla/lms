import db from '../lib/db';
import type { DbTransaction } from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { generateCertificatePDF } from '../lib/certificate';
import { sendEmail } from '../lib/email';
import { trainerBatchAccessSql, trainerBatchCheckSql, assertTrainerBatchAccess } from '../lib/batch-access';
import { ensureBatchModuleProgress } from './batch-progress.service';
import { syncCourseRecordingsToBatch } from './recordings.service';

// ── List batches ──────────────────────────────────────────────────────────────
export async function listBatches(
  programId?: string,
  trainerId?: string,
  page?: number,
  limit?: number,
  courseId?: string,
) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (programId) { conditions.push(`b.program_id = $${idx++}`); params.push(programId); }
  if (courseId) {
    conditions.push(`EXISTS (SELECT 1 FROM batch_courses bc WHERE bc.batch_id = b.id AND bc.course_id = $${idx++})`);
    params.push(courseId);
  }
  if (trainerId) {
    conditions.push(trainerBatchAccessSql('b', `$${idx++}`));
    params.push(trainerId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total if pagination is requested
  let total = 0;
  if (page && limit) {
    const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM batches b ${where}`, params);
    total = countRes.rows[0]?.total ?? 0;
  }

  // Add limit/offset
  let pagination = '';
  if (page && limit) {
    const offset = (page - 1) * limit;
    pagination = `LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
  } else {
    // Safety cap for unpaginated queries to prevent crashes
    pagination = `LIMIT 500`;
  }

  const { rows } = await db.query(
    `SELECT
       b.id, b.name, b.program_id AS "programId",
       b.start_date AS "startDate", b.end_date AS "endDate",
       b.capacity, b.status,
       b.created_at AS "createdAt",
       b.trainer_id AS "trainerId",
       b.class_start_time AS "classStartTime",
       b.class_end_time AS "classEndTime",
       b.class_days AS "classDays",
       b.schedule_notes AS "scheduleNotes",
       p.id AS program_ref_id, p.name AS program_name, p.color_token AS program_color,
       t.name AS trainer_name,
       COUNT(e.id)::int AS enrollment_count,
       COALESCE(
         (SELECT json_agg(json_build_object('id', c.id, 'title', c.title) ORDER BY bc2.sort_order)
          FROM batch_courses bc2 JOIN courses c ON c.id = bc2.course_id
          WHERE bc2.batch_id = b.id),
         '[]'::json
       ) AS batch_course_list
     FROM batches b
     JOIN programs p ON p.id = b.program_id
     LEFT JOIN users t ON t.id = b.trainer_id
     LEFT JOIN enrollments e ON e.batch_id = b.id
     ${where}
     GROUP BY b.id, p.id, t.id
     ORDER BY b.created_at DESC
     ${pagination}`,
    params,
  );

  const batches = rows.map((r) => ({
    id: r.id,
    name: r.name,
    programId: r.programId,
    program: { id: r.program_ref_id, name: r.program_name, colorToken: r.program_color },
    courses: r.batch_course_list ?? [],
    startDate: r.startDate,
    endDate: r.endDate,
    capacity: r.capacity,
    status: r.status,
    createdAt: r.createdAt,
    trainerId: r.trainerId,
    trainerName: r.trainer_name ?? null,
    classStartTime: r.classStartTime ?? null,
    classEndTime: r.classEndTime ?? null,
    classDays: r.classDays ?? null,
    scheduleNotes: r.scheduleNotes ?? null,
    _count: { enrollments: r.enrollment_count },
  }));

  if (page && limit) {
    return { batches, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  
  return batches; // Backward compatibility
}

// ── Get single batch with enrollments ────────────────────────────────────────
export async function getBatch(id: string, trainerId?: string) {
  if (trainerId) await assertTrainerBatchAccess(id, trainerId);

  const { rows } = await db.query(
    `SELECT
       b.id, b.name, b.program_id AS "programId",
       b.start_date AS "startDate", b.end_date AS "endDate",
       b.capacity, b.status, b.created_at AS "createdAt",
       b.trainer_id AS "trainerId",
       b.class_start_time AS "classStartTime",
       b.class_end_time AS "classEndTime",
       b.class_days AS "classDays",
       b.schedule_notes AS "scheduleNotes",
       p.id AS program_ref_id, p.name AS program_name, p.color_token AS program_color,
       t.name AS trainer_name
     FROM batches b
     JOIN programs p ON p.id = b.program_id
     LEFT JOIN users t ON t.id = b.trainer_id
     WHERE b.id = $1`,
    [id],
  );
  if (!rows.length) throw new AppError('Batch not found', 404, 'NOT_FOUND');

  const b = rows[0];

  const enrollRes = await db.query(
    `SELECT
       e.id, e.completion_pct AS "completionPct", e.grade, e.enrolled_at AS "enrolledAt",
       u.id AS student_id, u.name AS student_name, u.email AS student_email
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.batch_id = $1
     ORDER BY u.name`,
    [id],
  );

  return {
    id: b.id,
    name: b.name,
    programId: b.programId,
    program: { id: b.program_ref_id, name: b.program_name, colorToken: b.program_color },
    startDate: b.startDate,
    endDate: b.endDate,
    capacity: b.capacity,
    status: b.status,
    createdAt: b.createdAt,
    trainerId: b.trainerId ?? null,
    trainerName: b.trainer_name ?? null,
    classStartTime: b.classStartTime ?? null,
    classEndTime: b.classEndTime ?? null,
    classDays: b.classDays ?? null,
    scheduleNotes: b.scheduleNotes ?? null,
    enrollments: enrollRes.rows.map((e) => ({
      id: e.id,
      completionPct: e.completionPct,
      grade: e.grade,
      enrolledAt: e.enrolledAt,
      student: { id: e.student_id, name: e.student_name, email: e.student_email },
    })),
  };
}

// ── Archive batch (soft-delete → status=COMPLETED) ───────────────────────────
export async function archiveBatch(id: string, trainerId?: string) {
  const checkSql = trainerId
    ? trainerBatchCheckSql('b')
    : `SELECT id FROM batches WHERE id = $1`;
  const existing = await db.query(checkSql, trainerId ? [id, trainerId] : [id]);
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  await db.query(`UPDATE batches SET status = 'COMPLETED' WHERE id = $1`, [id]);
  return getBatch(id);
}

// ── Restore batch (COMPLETED → UPCOMING) ─────────────────────────────────────
export async function restoreBatch(id: string) {
  const existing = await db.query(`SELECT id FROM batches WHERE id = $1`, [id]);
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  await db.query(`UPDATE batches SET status = 'UPCOMING', updated_at = NOW() WHERE id = $1`, [id]);
  return getBatch(id);
}

/** When a course is linked to a batch, package all course assignments/quizzes/assessments onto that batch.
 *  Per-batch `released` stays false until the trainer marks the session Done for that batch. */
export async function syncCourseContentToBatch(batchId: string, courseId: string, tx?: DbTransaction) {
  await db.query(
    `INSERT INTO assignment_batches (assignment_id, batch_id, released)
     SELECT a.id, $1, FALSE FROM assignments a WHERE a.course_id = $2
     ON CONFLICT DO NOTHING`,
    [batchId, courseId],
    tx,
  );
  await db.query(
    `INSERT INTO quiz_batches (quiz_id, batch_id, released)
     SELECT q.id, $1, FALSE FROM quizzes q WHERE q.course_id = $2
     ON CONFLICT DO NOTHING`,
    [batchId, courseId],
    tx,
  );
  await db.query(
    `INSERT INTO assessment_batches (assessment_id, batch_id)
     SELECT a.id, $1 FROM assessments a WHERE a.course_id = $2
     ON CONFLICT DO NOTHING`,
    [batchId, courseId],
    tx,
  );
}

/** Map a single assignment/quiz to every batch that already includes its course. */
export async function mapContentToCourseBatches(
  kind: 'assignment' | 'quiz',
  contentId: string,
  courseId: string,
  tx?: DbTransaction,
) {
  if (kind === 'assignment') {
    await db.query(
      `INSERT INTO assignment_batches (assignment_id, batch_id, released)
       SELECT $1, bc.batch_id, FALSE FROM batch_courses bc WHERE bc.course_id = $2
       ON CONFLICT DO NOTHING`,
      [contentId, courseId],
      tx,
    );
  } else {
    await db.query(
      `INSERT INTO quiz_batches (quiz_id, batch_id, released)
       SELECT $1, bc.batch_id, FALSE FROM batch_courses bc WHERE bc.course_id = $2
       ON CONFLICT DO NOTHING`,
      [contentId, courseId],
      tx,
    );
  }
}

/** Mark session content released for one batch (per-batch unlock). */
export async function markModuleContentReleasedForBatch(
  batchId: string,
  moduleId: string,
  tx?: DbTransaction,
) {
  await db.query(
    `UPDATE assignment_batches ab
     SET released = TRUE
     FROM assignments a
     WHERE ab.assignment_id = a.id
       AND ab.batch_id = $1
       AND a.module_id = $2
       AND a.pdf_path IS DISTINCT FROM 'git-task'`,
    [batchId, moduleId],
    tx,
  );
  await db.query(
    `UPDATE quiz_batches qb
     SET released = TRUE
     FROM quizzes q
     WHERE qb.quiz_id = q.id
       AND qb.batch_id = $1
       AND q.module_id = $2`,
    [batchId, moduleId],
    tx,
  );
}

/** Un-release session content for one batch only (other batches keep their release). */
export async function unreleaseModuleContentForBatch(
  batchId: string,
  moduleId: string,
  tx?: DbTransaction,
) {
  await db.query(
    `UPDATE assignment_batches ab
     SET released = FALSE
     FROM assignments a
     WHERE ab.assignment_id = a.id
       AND ab.batch_id = $1
       AND a.module_id = $2`,
    [batchId, moduleId],
    tx,
  );
  await db.query(
    `UPDATE quiz_batches qb
     SET released = FALSE
     FROM quizzes q
     WHERE qb.quiz_id = q.id
       AND qb.batch_id = $1
       AND q.module_id = $2`,
    [batchId, moduleId],
    tx,
  );
}

/**
 * For sessions already marked COMPLETED on this batch, flip per-batch released +
 * DRAFT → PUBLISHED/ACTIVE (admin badge) so late-uploaded content still reaches students.
 */
export async function releaseCompletedSessionContent(batchId: string, courseId: string, tx?: DbTransaction) {
  await db.query(
    `UPDATE assignment_batches ab
     SET released = TRUE
     FROM assignments a, batch_module_progress bmp
     WHERE ab.assignment_id = a.id
       AND ab.batch_id = $1
       AND a.course_id = $2
       AND bmp.batch_id = ab.batch_id
       AND bmp.module_id = a.module_id
       AND bmp.status = 'COMPLETED'
       AND a.pdf_path IS DISTINCT FROM 'git-task'`,
    [batchId, courseId],
    tx,
  );
  await db.query(
    `UPDATE quiz_batches qb
     SET released = TRUE
     FROM quizzes q, batch_module_progress bmp
     WHERE qb.quiz_id = q.id
       AND qb.batch_id = $1
       AND q.course_id = $2
       AND bmp.batch_id = qb.batch_id
       AND bmp.module_id = q.module_id
       AND bmp.status = 'COMPLETED'`,
    [batchId, courseId],
    tx,
  );
  await db.query(
    `UPDATE assignments a
     SET status = 'PUBLISHED', updated_at = NOW()
     WHERE a.course_id = $2
       AND a.status = 'DRAFT'
       AND a.pdf_path IS DISTINCT FROM 'git-task'
       AND EXISTS (
         SELECT 1 FROM assignment_batches ab
         JOIN batch_module_progress bmp
           ON bmp.batch_id = ab.batch_id AND bmp.module_id = a.module_id
         WHERE ab.assignment_id = a.id
           AND ab.batch_id = $1
           AND ab.released = TRUE
           AND bmp.status = 'COMPLETED'
       )`,
    [batchId, courseId],
    tx,
  );
  await db.query(
    `UPDATE quizzes q
     SET status = 'ACTIVE', updated_at = NOW()
     WHERE q.course_id = $2
       AND q.status = 'DRAFT'
       AND EXISTS (
         SELECT 1 FROM quiz_batches qb
         JOIN batch_module_progress bmp
           ON bmp.batch_id = qb.batch_id AND bmp.module_id = q.module_id
         WHERE qb.quiz_id = q.id
           AND qb.batch_id = $1
           AND qb.released = TRUE
           AND bmp.status = 'COMPLETED'
       )`,
    [batchId, courseId],
    tx,
  );
}

/** Resolve which courses to link: explicit selection, or all courses in the program on create */
async function resolveBatchCourseIds(
  programId: string,
  courseIds: string[] | undefined,
  forCreate: boolean,
): Promise<string[]> {
  if (courseIds !== undefined) {
    if (courseIds.length === 0) {
      throw new AppError(
        'Select at least one course for this batch',
        400,
        'VALIDATION_ERROR',
      );
    }
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM courses
       WHERE program_id = $1 AND id = ANY($2::uuid[])
       ORDER BY title ASC`,
      [programId, courseIds],
    );
    if (rows.length === 0) {
      throw new AppError(
        'None of the selected courses belong to this program',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (rows.length !== courseIds.length) {
      throw new AppError(
        'One or more selected courses do not belong to this program',
        400,
        'VALIDATION_ERROR',
      );
    }
    return rows.map((r) => r.id);
  }
  if (!forCreate) {
    throw new AppError('courseIds is required when updating batch courses', 400, 'VALIDATION_ERROR');
  }
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM courses WHERE program_id = $1 ORDER BY title ASC`,
    [programId],
  );
  return rows.map((r) => r.id);
}

/** Remove batch mappings for courses no longer linked to this batch */
async function pruneBatchAssessmentMappings(batchId: string, courseIds: string[], tx?: DbTransaction) {
  if (courseIds.length === 0) {
    await db.query('DELETE FROM assignment_batches WHERE batch_id = $1', [batchId], tx);
    await db.query('DELETE FROM quiz_batches WHERE batch_id = $1', [batchId], tx);
    await db.query('DELETE FROM assessment_batches WHERE batch_id = $1', [batchId], tx);
    return;
  }
  await db.query(
    `DELETE FROM assignment_batches ab
     USING assignments a
     WHERE ab.assignment_id = a.id AND ab.batch_id = $1
       AND a.course_id != ALL($2::uuid[])`,
    [batchId, courseIds],
    tx,
  );
  await db.query(
    `DELETE FROM quiz_batches qb
     USING quizzes q
     WHERE qb.quiz_id = q.id AND qb.batch_id = $1
       AND q.course_id != ALL($2::uuid[])`,
    [batchId, courseIds],
    tx,
  );
  await db.query(
    `DELETE FROM assessment_batches ab
     USING assessments a
     WHERE ab.assessment_id = a.id AND ab.batch_id = $1
       AND a.course_id != ALL($2::uuid[])`,
    [batchId, courseIds],
    tx,
  );
}

// ── Sync batch_courses for a batch ──────────────────────────────────────────
async function syncBatchCourses(batchId: string, courseIds: string[]) {
  await db.transaction(async (tx) => {
    await pruneBatchAssessmentMappings(batchId, courseIds, tx);
    await db.query('DELETE FROM batch_courses WHERE batch_id = $1', [batchId], tx);
    for (let i = 0; i < courseIds.length; i++) {
      await db.query(
        'INSERT INTO batch_courses (batch_id,course_id,sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [batchId, courseIds[i], i],
        tx,
      );
      await syncCourseContentToBatch(batchId, courseIds[i], tx);
      await ensureBatchModuleProgress(batchId, courseIds[i], tx);
      await releaseCompletedSessionContent(batchId, courseIds[i], tx);
      await syncCourseRecordingsToBatch(batchId, courseIds[i], tx);
    }
    if (courseIds[0]) {
      await db.query('UPDATE batches SET course_id=$1 WHERE id=$2', [courseIds[0], batchId], tx);
    }
  });
}

// ── Get batch courses (multi) ────────────────────────────────────────────────
export async function getBatchCourses(batchId: string, trainerId?: string) {
  if (trainerId) await assertTrainerBatchAccess(batchId, trainerId);

  const { rows } = await db.query(
    `SELECT c.id, c.title, c.category, c.level, c.color_token AS "colorToken",
            c.duration_months AS "durationMonths", bc.sort_order AS "sortOrder"
     FROM batch_courses bc
     JOIN courses c ON c.id = bc.course_id
     WHERE bc.batch_id = $1 ORDER BY bc.sort_order`,
    [batchId],
  );
  return rows;
}

// ── Create batch ──────────────────────────────────────────────────────────────
export async function createBatch(input: {
  name: string; programId: string; courseIds?: string[]; startDate: string; endDate: string;
  capacity?: number; status?: string; trainerId?: string | null;
  classStartTime?: string | null; classEndTime?: string | null;
  classDays?: string | null; scheduleNotes?: string | null;
}, callerTrainerId?: string) {
  const programRes = await db.query('SELECT id FROM programs WHERE id = $1', [input.programId]);
  if (!programRes.rowCount || programRes.rowCount === 0) {
    throw new AppError('Program not found', 404, 'NOT_FOUND');
  }

  const resolvedCourseIds = await resolveBatchCourseIds(input.programId, input.courseIds, true);
  if (resolvedCourseIds.length === 0) {
    throw new AppError(
      'No courses in this program. Assign courses (e.g. Power BI) to the program in Curriculum Master first.',
      400,
      'VALIDATION_ERROR',
    );
  }

  const firstCourseId = resolvedCourseIds[0] ?? null;
  const { rows } = await db.query(
    `INSERT INTO batches
       (name, program_id, course_id, start_date, end_date, capacity, status,
        trainer_id, class_start_time, class_end_time, class_days, schedule_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      input.name, input.programId, firstCourseId,
      new Date(input.startDate), new Date(input.endDate),
      input.capacity ?? 30,
      input.status ?? 'UPCOMING',
      callerTrainerId ?? input.trainerId ?? null,
      input.classStartTime ?? null,
      input.classEndTime ?? null,
      input.classDays ?? null,
      input.scheduleNotes ?? null,
    ],
  );
  const batchId = rows[0].id as string;
  await syncBatchCourses(batchId, resolvedCourseIds);
  return getBatch(batchId);
}

// ── Update batch ──────────────────────────────────────────────────────────────
export async function updateBatch(id: string, input: {
  name?: string; startDate?: string; endDate?: string;
  capacity?: number; status?: string; courseId?: string; courseIds?: string[];
  trainerId?: string | null;
  classStartTime?: string | null; classEndTime?: string | null;
  classDays?: string | null; scheduleNotes?: string | null;
}, callerTrainerId?: string) {
  const checkSql = callerTrainerId
    ? trainerBatchCheckSql('b')
    : `SELECT id FROM batches WHERE id = $1`;
  const existing = await db.query(checkSql, callerTrainerId ? [id, callerTrainerId] : [id]);
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const map: Record<string, string> = {
    name: 'name',
    startDate: 'start_date',
    endDate: 'end_date',
    capacity: 'capacity',
    status: 'status',
    programId: 'program_id',
    trainerId: 'trainer_id',
    classStartTime: 'class_start_time',
    classEndTime: 'class_end_time',
    classDays: 'class_days',
    scheduleNotes: 'schedule_notes',
  };

  for (const [key, col] of Object.entries(map)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      if (callerTrainerId && key === 'trainerId') continue;
      fields.push(`${col} = $${idx}`);
      params.push(
        (key === 'startDate' || key === 'endDate') && value
          ? new Date(value as string)
          : value === '' ? null : value,
      );
      idx++;
    }
  }

  if (fields.length > 0) {
    params.push(id);
    await db.query(`UPDATE batches SET ${fields.join(', ')}, updated_at=NOW() WHERE id = $${idx}`, params);
  }
  if (input.courseIds !== undefined) {
    const batchRow = await db.query<{ program_id: string }>(
      'SELECT program_id FROM batches WHERE id = $1',
      [id],
    );
    const programId = batchRow.rows[0]?.program_id;
    if (!programId) throw new AppError('Batch program not found', 400, 'VALIDATION_ERROR');

    const resolvedCourseIds = await resolveBatchCourseIds(programId, input.courseIds, false);
    if (resolvedCourseIds.length === 0) {
      throw new AppError(
        'Select at least one course for this batch, or assign courses to the program in Curriculum Master.',
        400,
        'VALIDATION_ERROR',
      );
    }
    await syncBatchCourses(id, resolvedCourseIds);
  }
  
  const updatedBatch = await getBatch(id);

  // If status is updated to COMPLETED, trigger certificate generation
  if (input.status === 'COMPLETED' && updatedBatch) {
    const { rows: students } = await db.query(
      `SELECT u.id, u.email, u.name 
       FROM enrollments e 
       JOIN users u ON e.student_id = u.id 
       WHERE e.batch_id = $1`,
      [id]
    );

    const programName = updatedBatch.program?.name || 'Vtricks LMS Course';
    // Parse duration roughly if available, else 'Completed'
    const duration = updatedBatch.startDate && updatedBatch.endDate 
      ? Math.ceil((new Date(updatedBatch.endDate).getTime() - new Date(updatedBatch.startDate).getTime()) / (1000*60*60*24)) + ' days'
      : 'Completed';
    const issueDate = new Date().toLocaleDateString('en-GB');
    
    // Batch type fallback
    const batchType = updatedBatch.classDays?.toLowerCase().includes('sat') ? 'Weekend Batch' : 'Regular Batch';

    for (const student of students) {
      if (student.email) {
        try {
          const pdfBuffer = await generateCertificatePDF({
            studentName: student.name,
            programName,
            batchType,
            duration,
            date: issueDate,
            studentId: `2025-${student.id.split('-')[0]}`
          });

          await sendEmail({
            to: student.email,
            subject: 'Congratulations! Here is your Certificate of Completion',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #ea580c;">Congratulations, ${student.name}!</h2>
                <p>You have successfully completed <strong>${programName}</strong>.</p>
                <p>We are thrilled to share your well-deserved Certificate of Completion. Please find it attached to this email.</p>
                <p>We wish you the best in your future endeavors!</p>
                <br/>
                <p style="color: #666; font-size: 14px;">Best regards,<br/>Vtricks Technologies Team</p>
              </div>
            `,
            attachments: [
              {
                filename: `Certificate_${student.name.replace(/\s+/g, '_')}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
              }
            ]
          });
        } catch (err) {
          console.error('[email] Error generating/sending certificate for', student.email, err);
        }
      }
    }
  }

  return updatedBatch;
}

// ── Delete batch ──────────────────────────────────────────────────────────────
export async function deleteBatch(id: string) {
  const existing = await db.query('SELECT id FROM batches WHERE id = $1', [id]);
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  await db.query('DELETE FROM batches WHERE id = $1', [id]);
}

// ── Get available students (not yet enrolled in this batch) ──────────────────
export async function getAvailableStudents(batchId: string, trainerId?: string) {
  if (trainerId) {
    await assertTrainerBatchAccess(batchId, trainerId);
  } else {
    const batchCheck = await db.query('SELECT id FROM batches WHERE id = $1', [batchId]);
    if (!batchCheck.rowCount || batchCheck.rowCount === 0) {
      throw new AppError('Batch not found', 404, 'NOT_FOUND');
    }
  }

  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.phone_number AS "phoneNumber"
     FROM users u
     WHERE u.role = 'STUDENT'
       AND u.id NOT IN (
         SELECT e.student_id FROM enrollments e WHERE e.batch_id = $1
       )
     ORDER BY u.name`,
    [batchId],
  );
  return rows;
}

// ── Enroll student ────────────────────────────────────────────────────────────
export async function enrollStudent(batchId: string, studentId: string, trainerId?: string) {
  if (trainerId) await assertTrainerBatchAccess(batchId, trainerId);

  const batchRes = await db.query(
    `SELECT b.id, b.capacity,
       (SELECT COUNT(*) FROM enrollments WHERE batch_id = b.id)::int AS enrolled
     FROM batches b WHERE b.id = $1`,
    [batchId],
  );
  if (!batchRes.rowCount || batchRes.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  const batch = batchRes.rows[0];
  if (batch.enrolled >= batch.capacity) {
    throw new AppError('Batch is at full capacity', 400, 'BATCH_FULL');
  }

  const studentRes = await db.query('SELECT id FROM users WHERE id = $1 AND role = $2', [studentId, 'STUDENT']);
  if (!studentRes.rowCount || studentRes.rowCount === 0) {
    throw new AppError('Student not found', 404, 'NOT_FOUND');
  }

  try {
    await db.query(
      `INSERT INTO enrollments (student_id, batch_id) VALUES ($1, $2)`,
      [studentId, batchId],
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code === '23505') throw new AppError('Student already enrolled in this batch', 409, 'DUPLICATE');
    throw e;
  }

  return getBatch(batchId, trainerId);
}

// ── Unenroll student ──────────────────────────────────────────────────────────
export async function unenrollStudent(batchId: string, studentId: string, trainerId?: string) {
  if (trainerId) await assertTrainerBatchAccess(batchId, trainerId);

  const res = await db.query(
    'DELETE FROM enrollments WHERE batch_id = $1 AND student_id = $2 RETURNING id',
    [batchId, studentId],
  );
  if (!res.rowCount || res.rowCount === 0) {
    throw new AppError('Enrollment not found', 404, 'NOT_FOUND');
  }
}

// ── Update enrollment progress ────────────────────────────────────────────────
export async function updateEnrollment(
  batchId: string,
  enrollmentId: string,
  completionPct: number,
  grade?: string,
  trainerId?: string,
) {
  if (trainerId) await assertTrainerBatchAccess(batchId, trainerId);

  const fields = ['completion_pct = $1'];
  const params: unknown[] = [completionPct];
  let idx = 2;
  if (grade !== undefined) {
    fields.push(`grade = $${idx}`);
    params.push(grade);
    idx++;
  }
  params.push(enrollmentId);

  const res = await db.query(
    `UPDATE enrollments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id`,
    params,
  );
  if (!res.rowCount || res.rowCount === 0) {
    throw new AppError('Enrollment not found', 404, 'NOT_FOUND');
  }
}

// ── Batch analytics ───────────────────────────────────────────────────────────
export async function getBatchAnalytics(batchId: string, trainerId?: string) {
  if (trainerId) await assertTrainerBatchAccess(batchId, trainerId);

  const batchRes = await db.query(
    `SELECT b.id, b.name, b.capacity, b.status,
       b.start_date AS "startDate", b.end_date AS "endDate",
       p.name AS program_name,
       COUNT(e.id)::int                                     AS total_enrolled,
       COALESCE(ROUND(AVG(e.completion_pct))::int, 0)      AS avg_completion,
       COUNT(CASE WHEN e.completion_pct = 100 THEN 1 END)::int AS completed_100
     FROM batches b
     JOIN programs p ON p.id = b.program_id
     LEFT JOIN enrollments e ON e.batch_id = b.id
     WHERE b.id = $1
     GROUP BY b.id, p.name`,
    [batchId],
  );
  if (!batchRes.rowCount || batchRes.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  const row = batchRes.rows[0];

  const studentsRes = await db.query(
    `SELECT u.name AS student_name, e.completion_pct AS "completionPct", e.grade,
            e.enrolled_at AS "enrolledAt"
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.batch_id = $1
     ORDER BY e.completion_pct DESC`,
    [batchId],
  );

  const buckets = [
    { range: '0-20%', min: 0, max: 20, count: 0 },
    { range: '21-40%', min: 21, max: 40, count: 0 },
    { range: '41-60%', min: 41, max: 60, count: 0 },
    { range: '61-80%', min: 61, max: 80, count: 0 },
    { range: '81-100%', min: 81, max: 100, count: 0 },
  ];
  for (const s of studentsRes.rows) {
    const pct = s.completionPct ?? 0;
    const bucket = buckets.find((b) => pct >= b.min && pct <= b.max);
    if (bucket) bucket.count++;
  }

  return {
    batch: {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      programName: row.program_name,
    },
    totalEnrolled: row.total_enrolled,
    capacity: row.capacity,
    avgCompletion: row.avg_completion,
    completed100: row.completed_100,
    completionBuckets: buckets.map(({ range, count }) => ({ range, count })),
    students: studentsRes.rows.map((s) => ({
      studentName: s.student_name,
      completionPct: s.completionPct,
      grade: s.grade ?? null,
      enrolledAt: s.enrolledAt,
    })),
  };
}
