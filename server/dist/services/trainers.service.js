"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTrainers = listTrainers;
exports.getTrainer = getTrainer;
exports.createTrainer = createTrainer;
exports.updateTrainer = updateTrainer;
exports.deleteTrainer = deleteTrainer;
exports.getTrainerStats = getTrainerStats;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../lib/db"));
const error_middleware_1 = require("../middleware/error.middleware");
// ── List trainers with aggregated stats ───────────────────────────────────────
async function listTrainers() {
    const { rows } = await db_1.default.query(`SELECT
       u.id, u.name, u.email, u.avatar_url AS "avatarUrl",
       u.created_at AS "createdAt",
       tp.bio, tp.skills, tp.linkedin, tp.phone,
       COUNT(DISTINCT c.id)::int                              AS "courseCount",
       COALESCE(SUM(b_stats.student_count), 0)::int           AS "studentCount",
       COUNT(DISTINCT CASE WHEN b.status = 'ONGOING' THEN b.id END)::int AS "activeBatches"
     FROM users u
     LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
     LEFT JOIN courses c ON c.trainer_id = u.id AND c.status != 'ARCHIVED'
     LEFT JOIN batches b ON b.course_id = c.id
     LEFT JOIN (
       SELECT batch_id, COUNT(*)::int AS student_count
       FROM enrollments GROUP BY batch_id
     ) b_stats ON b_stats.batch_id = b.id
     WHERE u.role = 'TRAINER'
     GROUP BY u.id, tp.bio, tp.skills, tp.linkedin, tp.phone
     ORDER BY u.created_at DESC`);
    return rows.map(mapTrainer);
}
// ── Get single trainer with courses + performance ─────────────────────────────
async function getTrainer(id) {
    const { rows } = await db_1.default.query(`SELECT
       u.id, u.name, u.email, u.avatar_url AS "avatarUrl",
       u.created_at AS "createdAt",
       tp.bio, tp.skills, tp.linkedin, tp.phone
     FROM users u
     LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'TRAINER'`, [id]);
    if (!rows.length)
        throw new error_middleware_1.AppError('Trainer not found', 404, 'NOT_FOUND');
    // Courses assigned to this trainer
    const coursesRes = await db_1.default.query(`SELECT
       c.id, c.title, c.category, c.status, c.level,
       c.duration_months AS "durationMonths", c.color_token AS "colorToken",
       COUNT(DISTINCT b.id)::int                        AS "batchCount",
       COALESCE(SUM(b_stats.student_count), 0)::int     AS "studentCount",
       COALESCE(
         ROUND(SUM(b_stats.total_completion) / NULLIF(SUM(b_stats.student_count), 0))::int,
       0)                                               AS "completionPct"
     FROM courses c
     LEFT JOIN batches b ON b.course_id = c.id
     LEFT JOIN (
       SELECT batch_id, COUNT(*)::int AS student_count, SUM(completion_pct) AS total_completion
       FROM enrollments GROUP BY batch_id
     ) b_stats ON b_stats.batch_id = b.id
     WHERE c.trainer_id = $1 AND c.status != 'ARCHIVED'
     GROUP BY c.id
     ORDER BY c.created_at DESC`, [id]);
    // Recent enrollments under this trainer's batches (last 6 months)
    const trendRes = await db_1.default.query(`SELECT
       TO_CHAR(DATE_TRUNC('month', e.enrolled_at), 'Mon') AS month,
       DATE_TRUNC('month', e.enrolled_at) AS month_date,
       COUNT(*)::int AS count
     FROM enrollments e
     JOIN batches b ON b.id = e.batch_id
     JOIN courses c ON c.id = b.course_id
     WHERE c.trainer_id = $1
       AND e.enrolled_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
     GROUP BY DATE_TRUNC('month', e.enrolled_at)
     ORDER BY month_date ASC`, [id]);
    const t = rows[0];
    return {
        ...mapTrainer(t),
        courses: coursesRes.rows,
        enrollmentTrend: trendRes.rows.map((r) => ({ month: r.month, count: r.count })),
    };
}
// ── Create trainer ────────────────────────────────────────────────────────────
async function createTrainer(input) {
    // Check email uniqueness
    const existing = await db_1.default.query('SELECT id FROM users WHERE email = $1', [input.email]);
    if (existing.rowCount && existing.rowCount > 0) {
        throw new error_middleware_1.AppError('Email already registered', 409, 'CONFLICT');
    }
    const passwordHash = await bcryptjs_1.default.hash(input.password, 12);
    const userId = await db_1.default.transaction(async (transaction) => {
        const userRes = await db_1.default.query(`INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'TRAINER') RETURNING id`, [input.name, input.email, passwordHash], transaction);
        const userId = userRes.rows[0].id;
        // Create trainer profile
        await db_1.default.query(`INSERT INTO trainer_profiles (user_id, bio, skills, linkedin, phone)
       VALUES ($1, $2, $3, $4, $5)`, [
            userId,
            input.bio ?? null,
            input.skills ?? null,
            input.linkedin || null,
            input.phone ?? null,
        ], transaction);
        return userId;
    });
    return getTrainer(userId);
}
// ── Update trainer ────────────────────────────────────────────────────────────
async function updateTrainer(id, input) {
    const existing = await db_1.default.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'TRAINER']);
    if (!existing.rowCount || existing.rowCount === 0) {
        throw new error_middleware_1.AppError('Trainer not found', 404, 'NOT_FOUND');
    }
    await db_1.default.transaction(async (transaction) => {
        // Update users table fields
        const userFields = [];
        const userParams = [];
        let idx = 1;
        if (input.name !== undefined) {
            userFields.push(`name = $${idx}`);
            userParams.push(input.name);
            idx++;
        }
        if (input.email !== undefined) {
            userFields.push(`email = $${idx}`);
            userParams.push(input.email);
            idx++;
        }
        if (userFields.length > 0) {
            userParams.push(id);
            await db_1.default.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = $${idx}`, userParams, transaction);
        }
        // Upsert trainer_profiles
        await db_1.default.query(`INSERT INTO trainer_profiles (user_id, bio, skills, linkedin, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         bio      = COALESCE(EXCLUDED.bio, trainer_profiles.bio),
         skills   = COALESCE(EXCLUDED.skills, trainer_profiles.skills),
         linkedin = COALESCE(EXCLUDED.linkedin, trainer_profiles.linkedin),
         phone    = COALESCE(EXCLUDED.phone, trainer_profiles.phone),
         updated_at = NOW()`, [
            id,
            input.bio ?? null,
            input.skills ?? null,
            input.linkedin || null,
            input.phone ?? null,
        ], transaction);
    });
    return getTrainer(id);
}
// ── Delete trainer ────────────────────────────────────────────────────────────
async function deleteTrainer(id) {
    const existing = await db_1.default.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'TRAINER']);
    if (!existing.rowCount || existing.rowCount === 0) {
        throw new error_middleware_1.AppError('Trainer not found', 404, 'NOT_FOUND');
    }
    // Unlink from courses before deleting
    await db_1.default.query('UPDATE courses SET trainer_id = NULL WHERE trainer_id = $1', [id]);
    await db_1.default.query('DELETE FROM users WHERE id = $1', [id]);
}
// ── Dashboard stats for trainers ──────────────────────────────────────────────
async function getTrainerStats() {
    const res = await db_1.default.query(`SELECT
       COUNT(*)::int AS total,
       COUNT(CASE WHEN EXISTS (
         SELECT 1 FROM courses c
         JOIN batches b ON b.course_id = c.id
         WHERE c.trainer_id = u.id AND b.status = 'ONGOING'
       ) THEN 1 END)::int AS active
     FROM users u WHERE u.role = 'TRAINER'`);
    return res.rows[0];
}
// ── Internal mapper ───────────────────────────────────────────────────────────
function mapTrainer(r) {
    return {
        id: r.id,
        name: r.name,
        email: r.email,
        avatarUrl: r.avatarUrl,
        bio: r.bio,
        skills: r.skills,
        linkedin: r.linkedin,
        phone: r.phone,
        createdAt: r.createdAt,
        courseCount: r.courseCount ?? 0,
        studentCount: r.studentCount ?? 0,
        activeBatches: r.activeBatches ?? 0,
    };
}
//# sourceMappingURL=trainers.service.js.map