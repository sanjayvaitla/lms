"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCourses = listCourses;
exports.getCourse = getCourse;
exports.createCourse = createCourse;
exports.updateCourse = updateCourse;
exports.unarchiveCourse = unarchiveCourse;
exports.deleteCourse = deleteCourse;
const db_1 = __importDefault(require("../lib/db"));
const error_middleware_1 = require("../middleware/error.middleware");
async function listCourses(query) {
    const { search, category, status, level, page, limit, trainerId } = query;
    const offset = (page - 1) * limit;
    // Build dynamic WHERE clause
    const conditions = [];
    const params = [];
    let idx = 1;
    if (search) {
        conditions.push(`(c.title ILIKE $${idx} OR c.category ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
    }
    if (category) {
        conditions.push(`c.category ILIKE $${idx}`);
        params.push(category);
        idx++;
    }
    if (status) {
        conditions.push(`c.status = $${idx}`);
        params.push(status);
        idx++;
    }
    if (level) {
        conditions.push(`c.level = $${idx}`);
        params.push(level);
        idx++;
    }
    if (trainerId) {
        conditions.push(`c.trainer_id = $${idx}`);
        params.push(trainerId);
        idx++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // Count query
    const countRes = await db_1.default.query(`SELECT COUNT(*) FROM courses c ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);
    // Main query — aggregate student count + avg completion per course
    const { rows } = await db_1.default.query(`SELECT
       c.id, c.title, c.category, c.status, c.level,
       c.duration_months AS "durationMonths",
       c.description, c.color_token AS "colorToken",
       c.created_at AS "createdAt", c.updated_at AS "updatedAt",
       u.id   AS trainer_id,
       u.name AS trainer_name,
       COUNT(DISTINCT b.id)::int                          AS "batchCount",
       COALESCE(SUM(b_stats.student_count), 0)::int       AS "studentCount",
       COALESCE(
         ROUND(
           SUM(b_stats.total_completion) /
           NULLIF(SUM(b_stats.student_count), 0)
         )::int,
       0)                                                  AS "completionPct"
     FROM courses c
     LEFT JOIN users       u ON u.id = c.trainer_id
     LEFT JOIN batches     b ON b.course_id = c.id
     LEFT JOIN (
       SELECT
         e.batch_id,
         COUNT(*)::int           AS student_count,
         SUM(e.completion_pct)   AS total_completion
       FROM enrollments e
       GROUP BY e.batch_id
     ) b_stats ON b_stats.batch_id = b.id
     ${where}
     GROUP BY c.id, u.id, u.name
     ORDER BY c.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`, [...params, limit, offset]);
    const courses = rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        level: r.level,
        durationMonths: r.durationMonths,
        description: r.description,
        colorToken: r.colorToken,
        trainer: r.trainer_id ? { id: r.trainer_id, name: r.trainer_name } : null,
        batchCount: r.batchCount,
        studentCount: r.studentCount,
        completionPct: r.completionPct,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    }));
    return { courses, total, page, totalPages: Math.ceil(total / limit) };
}
async function getCourse(id) {
    const { rows } = await db_1.default.query(`SELECT
       c.*,
       u.id   AS trainer_id,
       u.name AS trainer_name,
       (SELECT COUNT(*) FROM batches WHERE course_id = c.id)::int AS batch_count
     FROM courses c
     LEFT JOIN users u ON u.id = c.trainer_id
     WHERE c.id = $1`, [id]);
    const r = rows[0];
    if (!r)
        throw new error_middleware_1.AppError('Course not found', 404, 'NOT_FOUND');
    return {
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        level: r.level,
        durationMonths: r.duration_months,
        description: r.description,
        colorToken: r.color_token,
        trainer: r.trainer_id ? { id: r.trainer_id, name: r.trainer_name } : null,
        batchCount: r.batch_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
async function createCourse(input, forcedTrainerId) {
    const { rows } = await db_1.default.query(`INSERT INTO courses
       (title, category, status, level, duration_months, description, trainer_id, color_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`, [
        input.title,
        input.category,
        input.status ?? 'ACTIVE',
        input.level ?? 'INTERMEDIATE',
        input.durationMonths,
        input.description ?? null,
        forcedTrainerId ?? input.trainerId ?? null,
        input.colorToken ?? 'emerald',
    ]);
    return getCourse(rows[0].id);
}
async function updateCourse(id, input, trainerId) {
    const checkSql = trainerId
        ? 'SELECT id FROM courses WHERE id = $1 AND trainer_id = $2'
        : 'SELECT id FROM courses WHERE id = $1';
    const existing = await db_1.default.query(checkSql, trainerId ? [id, trainerId] : [id]);
    if (!existing.rowCount || existing.rowCount === 0) {
        throw new error_middleware_1.AppError('Course not found', 404, 'NOT_FOUND');
    }
    const fields = [];
    const params = [];
    let idx = 1;
    const map = {
        title: 'title',
        category: 'category',
        status: 'status',
        level: 'level',
        durationMonths: 'duration_months',
        description: 'description',
        trainerId: 'trainer_id',
        colorToken: 'color_token',
    };
    for (const [key, col] of Object.entries(map)) {
        const value = input[key];
        if (value !== undefined) {
            fields.push(`${col} = $${idx}`);
            params.push(value);
            idx++;
        }
    }
    if (fields.length === 0)
        return getCourse(id);
    params.push(id);
    await db_1.default.query(`UPDATE courses SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return getCourse(id);
}
async function unarchiveCourse(id) {
    const { rows } = await db_1.default.query('SELECT id, status FROM courses WHERE id = $1', [id]);
    if (!rows[0])
        throw new error_middleware_1.AppError('Course not found', 404, 'NOT_FOUND');
    if (rows[0].status !== 'ARCHIVED') {
        throw new error_middleware_1.AppError('Only archived courses can be unarchived', 400, 'INVALID_STATE');
    }
    await db_1.default.query(`UPDATE courses SET status = 'ACTIVE' WHERE id = $1`, [id]);
    return getCourse(id);
}
async function deleteCourse(id) {
    const { rows } = await db_1.default.query('SELECT id, status FROM courses WHERE id = $1', [id]);
    if (!rows[0])
        throw new error_middleware_1.AppError('Course not found', 404, 'NOT_FOUND');
    if (rows[0].status !== 'ARCHIVED') {
        // ── Step 1: soft delete → move to ARCHIVED ──────────────────────────────
        await db_1.default.query(`UPDATE courses SET status = 'ARCHIVED' WHERE id = $1`, [id]);
        return { action: 'archived' };
    }
    else {
        // ── Step 2: already archived → hard delete with FK cascade ──────────────
        await db_1.default.query(`DELETE FROM enrollments
       WHERE batch_id IN (SELECT id FROM batches WHERE course_id = $1)`, [id]);
        await db_1.default.query('DELETE FROM batches WHERE course_id = $1', [id]);
        await db_1.default.query('DELETE FROM courses WHERE id = $1', [id]);
        return { action: 'deleted' };
    }
}
//# sourceMappingURL=courses.service.js.map