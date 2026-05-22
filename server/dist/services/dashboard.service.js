"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = getDashboardStats;
const db_1 = __importDefault(require("../lib/db"));
async function getDashboardStats() {
    // ── Core counts ─────────────────────────────────────────────────────────────
    const [totalCoursesRes, totalStudentsRes, activeBatchesRes, activeCoursesRes, totalTrainersRes] = await Promise.all([
        db_1.default.query(`SELECT COUNT(*)::int AS cnt FROM courses WHERE status != 'ARCHIVED'`),
        db_1.default.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'STUDENT'`),
        db_1.default.query(`SELECT COUNT(*)::int AS cnt FROM batches WHERE status = 'ONGOING'`),
        db_1.default.query(`SELECT COUNT(*)::int AS cnt FROM courses WHERE status = 'ACTIVE'`),
        db_1.default.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'TRAINER'`),
    ]);
    const totalCourses = totalCoursesRes.rows[0].cnt;
    const totalStudents = totalStudentsRes.rows[0].cnt;
    const activeBatches = activeBatchesRes.rows[0].cnt;
    const activeCourses = activeCoursesRes.rows[0].cnt;
    const totalTrainers = totalTrainersRes.rows[0].cnt;
    // ── Category distribution ────────────────────────────────────────────────────
    const catRes = await db_1.default.query(`SELECT category, COUNT(*)::int AS count
     FROM courses
     WHERE status != 'ARCHIVED'
     GROUP BY category
     ORDER BY count DESC`);
    const categoryDistribution = catRes.rows.map((r) => ({
        category: r.category,
        count: r.count,
    }));
    // ── Top courses by student count ─────────────────────────────────────────────
    const topCoursesRes = await db_1.default.query(`SELECT
       c.id, c.title, c.category,
       COALESCE(SUM(b_stats.student_count), 0)::int     AS "studentCount",
       COALESCE(
         ROUND(
           SUM(b_stats.total_completion) /
           NULLIF(SUM(b_stats.student_count), 0)
         )::int,
       0)                                                AS "completionPct"
     FROM courses c
     LEFT JOIN batches b ON b.course_id = c.id
     LEFT JOIN (
       SELECT batch_id, COUNT(*)::int AS student_count, SUM(completion_pct) AS total_completion
       FROM enrollments GROUP BY batch_id
     ) b_stats ON b_stats.batch_id = b.id
     WHERE c.status != 'ARCHIVED'
     GROUP BY c.id
     ORDER BY "studentCount" DESC
     LIMIT 5`);
    const topCourses = topCoursesRes.rows;
    // ── Enrollment trend — last 6 months ────────────────────────────────────────
    const trendRes = await db_1.default.query(`SELECT
       TO_CHAR(DATE_TRUNC('month', enrolled_at), 'Mon') AS month,
       DATE_TRUNC('month', enrolled_at)                 AS month_date,
       COUNT(*)::int                                     AS count
     FROM enrollments
     WHERE enrolled_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
     GROUP BY DATE_TRUNC('month', enrolled_at)
     ORDER BY month_date ASC`);
    const enrollmentTrend = trendRes.rows.map((r) => ({
        month: r.month,
        count: r.count,
    }));
    // ── Batch status distribution ─────────────────────────────────────────────────
    const batchDistRes = await db_1.default.query(`SELECT status, COUNT(*)::int AS count FROM batches GROUP BY status`);
    const batchDistribution = batchDistRes.rows.map((r) => ({
        status: r.status,
        count: r.count,
    }));
    // ── Top trainers by student count ─────────────────────────────────────────────
    const topTrainersRes = await db_1.default.query(`SELECT
       u.id, u.name,
       COUNT(DISTINCT c.id)::int                          AS "courseCount",
       COALESCE(SUM(b_stats.student_count), 0)::int       AS "studentCount"
     FROM users u
     LEFT JOIN courses c ON c.trainer_id = u.id AND c.status != 'ARCHIVED'
     LEFT JOIN batches b ON b.course_id = c.id
     LEFT JOIN (
       SELECT batch_id, COUNT(*)::int AS student_count
       FROM enrollments GROUP BY batch_id
     ) b_stats ON b_stats.batch_id = b.id
     WHERE u.role = 'TRAINER'
     GROUP BY u.id
     ORDER BY "studentCount" DESC
     LIMIT 5`);
    const topTrainers = topTrainersRes.rows;
    return {
        totalCourses,
        totalStudents,
        activeBatches,
        activeCourses,
        totalTrainers,
        categoryDistribution,
        topCourses,
        enrollmentTrend,
        batchDistribution,
        topTrainers,
    };
}
//# sourceMappingURL=dashboard.service.js.map