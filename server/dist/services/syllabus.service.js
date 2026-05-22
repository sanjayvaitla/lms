"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSyllabus = uploadSyllabus;
exports.getSyllabus = getSyllabus;
const db_1 = __importDefault(require("../lib/db"));
const error_middleware_1 = require("../middleware/error.middleware");
async function uploadSyllabus(courseId, uploadedBy, file) {
    const courseRes = await db_1.default.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!courseRes.rowCount || courseRes.rowCount === 0)
        throw new error_middleware_1.AppError('Course not found', 404, 'NOT_FOUND');
    const mimeType = file.mimetype;
    let contentText = '';
    let fileType = 'PDF';
    if (mimeType === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
        try {
            // Use the internal module path to avoid pdf-parse test-file side-effects
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse/lib/pdf-parse');
            const parsed = await pdfParse(file.buffer);
            contentText = parsed.text.trim();
        }
        catch {
            // Fallback to main entry if internal path fails
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse');
            const parsed = await pdfParse(file.buffer);
            contentText = parsed.text.trim();
        }
        fileType = 'PDF';
    }
    else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const XLSX = require('xlsx');
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const lines = [];
        for (const sheetName of workbook.SheetNames) {
            const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
            if (csvText.trim()) {
                lines.push('=== Sheet: ' + sheetName + ' ===');
                lines.push(csvText.trim());
            }
        }
        contentText = lines.join('\n\n');
        fileType = 'EXCEL';
    }
    else {
        throw new error_middleware_1.AppError('Unsupported file type. Upload a PDF or Excel file (.pdf, .xlsx, .xls)', 400, 'INVALID_FILE_TYPE');
    }
    if (!contentText) {
        throw new error_middleware_1.AppError('Could not extract text from the file. Make sure it is not empty or scanned-only.', 422, 'EMPTY_CONTENT');
    }
    // Replace previous syllabus (keep latest only)
    await db_1.default.query('DELETE FROM course_syllabi WHERE course_id = $1', [courseId]);
    // Verify the uploader still exists (guard against stale JWT after DB reseed)
    const uploaderExists = uploadedBy
        ? (await db_1.default.query('SELECT id FROM users WHERE id = $1', [uploadedBy])).rowCount ?? 0 > 0
        : false;
    const safeUploadedBy = uploaderExists ? uploadedBy : null;
    const { rows } = await db_1.default.query(`INSERT INTO course_syllabi (course_id, filename, file_type, content_text, uploaded_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, filename, file_type AS "fileType",
               content_text AS "contentText", created_at AS "createdAt"`, [courseId, file.originalname, fileType, contentText, safeUploadedBy]);
    return rows[0];
}
async function getSyllabus(courseId) {
    const { rows } = await db_1.default.query(`SELECT s.id, s.filename, s.file_type AS "fileType",
            s.content_text AS "contentText", s.created_at AS "createdAt",
            u.name AS "uploadedByName"
     FROM course_syllabi s
     LEFT JOIN users u ON u.id = s.uploaded_by
     WHERE s.course_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`, [courseId]);
    return rows[0] ?? null;
}
//# sourceMappingURL=syllabus.service.js.map