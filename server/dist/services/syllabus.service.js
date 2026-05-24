"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSyllabus = uploadSyllabus;
exports.listSyllabi = listSyllabi;
exports.getSyllabus = getSyllabus;
exports.deleteSyllabus = deleteSyllabus;
exports.assignSyllabusToBatch = assignSyllabusToBatch;
exports.getBatchSyllabus = getBatchSyllabus;
const db_1 = __importDefault(require("../lib/db"));
const error_middleware_1 = require("../middleware/error.middleware");
// ── Excel structured parser ──────────────────────────────────────────────────
// Handles the format: Session# | Module | Expanded Detailed Topics | Duration
// Rows where Session# is null are continuation rows (additional bullets)
function parseExcelStructured(buffer) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheets = [];
    for (const sheetName of wb.SheetNames) {
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
            header: 1,
            defval: null,
        });
        // Find the header row (contains "Session" or "Day" in col B/C area)
        let headerRow = -1;
        let courseTitle = sheetName;
        let sessionCol = 1, moduleCol = 2, topicsCol = 3, durationCol = 4;
        for (let i = 0; i < Math.min(raw.length, 10); i++) {
            const row = raw[i];
            // Check for course title row (has text in col 1 but not numeric)
            if (row[1] && typeof row[1] === 'string' && row[1].trim() && !row[2] && !row[3]) {
                courseTitle = String(row[1]).trim();
            }
            // Find header row
            const rowStr = row.map((c) => String(c ?? '').toLowerCase());
            if (rowStr.some((c) => c.includes('session') || c.includes('day'))) {
                headerRow = i;
                // Detect column positions from header
                for (let j = 0; j < rowStr.length; j++) {
                    if (rowStr[j].includes('session') || rowStr[j].includes('day'))
                        sessionCol = j;
                    else if (rowStr[j].includes('module'))
                        moduleCol = j;
                    else if (rowStr[j].includes('topic') || rowStr[j].includes('component'))
                        topicsCol = j;
                    else if (rowStr[j].includes('duration') || rowStr[j].includes('min'))
                        durationCol = j;
                }
                break;
            }
        }
        if (headerRow === -1)
            continue; // Skip sheets without recognizable structure
        const sessions = [];
        let currentSession = null;
        for (let i = headerRow + 1; i < raw.length; i++) {
            const row = raw[i];
            const sessionVal = row[sessionCol];
            const moduleVal = row[moduleCol];
            const topicsVal = row[topicsCol];
            const durVal = row[durationCol];
            // Skip completely empty rows
            if (!sessionVal && !moduleVal && !topicsVal)
                continue;
            const topicText = topicsVal ? String(topicsVal).trim() : '';
            if (sessionVal !== null && sessionVal !== undefined && sessionVal !== '') {
                // New session row
                currentSession = {
                    session: String(sessionVal).trim(),
                    module: moduleVal ? String(moduleVal).trim() : 'Untitled',
                    topics: topicText ? [topicText] : [],
                    duration: durVal ? (parseInt(String(durVal), 10) || null) : null,
                };
                sessions.push(currentSession);
            }
            else if (currentSession && topicText) {
                // Continuation row — append topic to current session
                currentSession.topics.push(topicText);
            }
        }
        if (sessions.length > 0) {
            sheets.push({ name: sheetName, courseTitle, sessions });
        }
    }
    return { type: 'excel_structured', sheets };
}
// ── CSV structured parser ────────────────────────────────────────────────────
// Format: week, topic, subtopics, description, resources
function parseCsvStructured(buffer) {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2)
        throw new error_middleware_1.AppError('CSV must have a header row and at least one data row', 400, 'INVALID_CSV');
    const header = lines[0].split(',').map((h) => h.toLowerCase().trim());
    const weekCol = header.indexOf('week');
    const topicCol = header.indexOf('topic');
    const subCol = header.indexOf('subtopics');
    const descCol = header.indexOf('description');
    const resCol = header.indexOf('resources');
    const sessions = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const week = weekCol >= 0 ? cols[weekCol] : String(i);
        const topic = topicCol >= 0 ? cols[topicCol] : '';
        const sub = subCol >= 0 ? cols[subCol] : '';
        const desc = descCol >= 0 ? cols[descCol] : '';
        const res = resCol >= 0 ? cols[resCol] : '';
        const topics = [];
        if (sub)
            topics.push(sub);
        if (desc)
            topics.push(desc);
        if (res)
            topics.push('Resources: ' + res);
        sessions.push({ session: week, module: topic, topics, duration: null });
    }
    return {
        type: 'csv_structured',
        sheets: [{ name: 'Syllabus', courseTitle: 'Course Syllabus', sessions }],
    };
}
// ── Main upload function ─────────────────────────────────────────────────────
async function uploadSyllabus(courseId, uploadedBy, file, label) {
    const courseRes = await db_1.default.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!courseRes.rowCount || courseRes.rowCount === 0)
        throw new error_middleware_1.AppError('Course not found', 404, 'NOT_FOUND');
    const mimeType = file.mimetype;
    const name = file.originalname.toLowerCase();
    let contentText = '';
    let fileType = 'PDF';
    let structuredData = null;
    if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse/lib/pdf-parse');
            const parsed = await pdfParse(file.buffer);
            contentText = parsed.text.trim();
        }
        catch {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse');
            const parsed = await pdfParse(file.buffer);
            contentText = parsed.text.trim();
        }
        fileType = 'PDF';
    }
    else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        name.endsWith('.xlsx') || name.endsWith('.xls')) {
        // Parse structured Excel (multi-sheet Session/Module/Topics/Duration format)
        try {
            structuredData = parseExcelStructured(file.buffer);
            // Also generate plain text summary for legacy/search
            contentText = structuredData.sheets
                .map((s) => {
                const lines = [`=== ${s.courseTitle} ===`];
                s.sessions.forEach((sess) => {
                    lines.push('Session ' + String(sess.session) + ': ' + sess.module + (sess.duration ? ' (' + sess.duration + ' min)' : ''));
                    sess.topics.forEach((t) => lines.push(`  - ${t}`));
                });
                return lines.join('\n');
            })
                .join('\n\n');
        }
        catch {
            // Fallback to raw CSV text extraction
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const XLSX = require('xlsx');
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const parts = [];
            for (const sn of workbook.SheetNames) {
                const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sn]);
                if (csv.trim())
                    parts.push(`=== ${sn} ===\n${csv.trim()}`);
            }
            contentText = parts.join('\n\n');
        }
        fileType = 'EXCEL';
    }
    else if (mimeType === 'text/csv' || mimeType === 'application/csv' ||
        name.endsWith('.csv')) {
        structuredData = parseCsvStructured(file.buffer);
        contentText = structuredData.sheets[0]?.sessions
            .map((s) => `Week ${s.session}: ${s.module} — ${s.topics.join(', ')}`)
            .join('\n') ?? '';
        fileType = 'CSV';
    }
    else {
        throw new error_middleware_1.AppError('Unsupported file type. Upload PDF, Excel (.xlsx/.xls), or CSV.', 400, 'INVALID_FILE_TYPE');
    }
    if (!contentText && !structuredData) {
        throw new error_middleware_1.AppError('Could not extract content from file. Make sure it is not empty.', 422, 'EMPTY_CONTENT');
    }
    const uploaderExists = uploadedBy
        ? (await db_1.default.query('SELECT id FROM users WHERE id = $1', [uploadedBy])).rowCount ?? 0 > 0
        : false;
    const safeUploadedBy = uploaderExists ? uploadedBy : null;
    const { rows } = await db_1.default.query(`INSERT INTO course_syllabi (course_id, filename, file_type, content_text, structured_data, uploaded_by, label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, filename, file_type AS "fileType",
               content_text AS "contentText",
               structured_data AS "structuredData",
               label,
               created_at AS "createdAt"`, [courseId, file.originalname, fileType, contentText,
        structuredData ? JSON.stringify(structuredData) : null, safeUploadedBy,
        label ?? null]);
    return rows[0];
}
// ── List all syllabi for a course ────────────────────────────────────────────
async function listSyllabi(courseId) {
    const { rows } = await db_1.default.query(`SELECT s.id, s.filename, s.file_type AS "fileType",
            s.label,
            s.structured_data AS "structuredData",
            s.content_text AS "contentText",
            s.created_at AS "createdAt",
            u.name AS "uploadedByName"
     FROM course_syllabi s
     LEFT JOIN users u ON u.id = s.uploaded_by
     WHERE s.course_id = $1
     ORDER BY s.created_at DESC`, [courseId]);
    return rows;
}
// ── Get single syllabus (latest for course, or specific id) ──────────────────
async function getSyllabus(courseId, syllabusId) {
    if (syllabusId) {
        const { rows } = await db_1.default.query(`SELECT s.id, s.filename, s.file_type AS "fileType",
              s.label, s.content_text AS "contentText",
              s.structured_data AS "structuredData",
              s.created_at AS "createdAt",
              u.name AS "uploadedByName"
       FROM course_syllabi s
       LEFT JOIN users u ON u.id = s.uploaded_by
       WHERE s.id = $1 AND s.course_id = $2`, [syllabusId, courseId]);
        return rows[0] ?? null;
    }
    const { rows } = await db_1.default.query(`SELECT s.id, s.filename, s.file_type AS "fileType",
            s.label, s.content_text AS "contentText",
            s.structured_data AS "structuredData",
            s.created_at AS "createdAt",
            u.name AS "uploadedByName"
     FROM course_syllabi s
     LEFT JOIN users u ON u.id = s.uploaded_by
     WHERE s.course_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`, [courseId]);
    return rows[0] ?? null;
}
// ── Delete a syllabus version ────────────────────────────────────────────────
async function deleteSyllabus(courseId, syllabusId) {
    const res = await db_1.default.query('DELETE FROM course_syllabi WHERE id = $1 AND course_id = $2 RETURNING id', [syllabusId, courseId]);
    if (!res.rowCount || res.rowCount === 0) {
        throw new error_middleware_1.AppError('Syllabus not found', 404, 'NOT_FOUND');
    }
}
// ── Assign syllabus to batch ──────────────────────────────────────────────────
async function assignSyllabusToBatch(batchId, syllabusId) {
    await db_1.default.query(`INSERT INTO batch_syllabi (batch_id, syllabus_id)
     VALUES ($1, $2)
     ON CONFLICT (batch_id) DO UPDATE SET syllabus_id = $2, assigned_at = NOW()`, [batchId, syllabusId]);
}
// ── Get syllabus assigned to a batch ─────────────────────────────────────────
async function getBatchSyllabus(batchId) {
    const { rows } = await db_1.default.query(`SELECT s.id, s.filename, s.file_type AS "fileType",
            s.label, s.content_text AS "contentText",
            s.structured_data AS "structuredData",
            s.created_at AS "createdAt",
            u.name AS "uploadedByName"
     FROM batch_syllabi bs
     JOIN course_syllabi s ON s.id = bs.syllabus_id
     LEFT JOIN users u ON u.id = s.uploaded_by
     WHERE bs.batch_id = $1`, [batchId]);
    return rows[0] ?? null;
}
//# sourceMappingURL=syllabus.service.js.map