"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
class AppError extends Error {
    constructor(message, statusCode = 500, code) {
        super(message);
        this.message = message;
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
function errorHandler(err, _req, res, _next) {
    // Application errors
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
            code: err.code,
        });
        return;
    }
    // Multer file-upload errors
    const multerErr = err;
    if (multerErr.name === 'MulterError') {
        const messages = {
            LIMIT_FILE_SIZE: 'File is too large. Please check the size limit.',
            LIMIT_FILE_COUNT: 'Too many files uploaded.',
            LIMIT_UNEXPECTED_FILE: 'Unexpected file field name.',
            LIMIT_PART_COUNT: 'Too many parts in the upload.',
            LIMIT_FIELD_KEY: 'Field name is too long.',
            LIMIT_FIELD_VALUE: 'Field value is too long.',
            LIMIT_FIELD_COUNT: 'Too many fields.',
        };
        res.status(400).json({
            success: false,
            message: messages[multerErr.code] ?? multerErr.message ?? 'File upload error.',
            code: 'UPLOAD_ERROR',
        });
        return;
    }
    // File filter rejection
    if (err.message &&
        (err.message.includes('Only PDF') ||
            err.message.includes('Invalid file type') ||
            err.message.includes('Allowed') ||
            (err.message.includes('file') && err.message.toLowerCase().includes('allowed')))) {
        res.status(400).json({
            success: false,
            message: err.message,
            code: 'INVALID_FILE_TYPE',
        });
        return;
    }
    // PostgreSQL errors
    const pgErr = err;
    if (pgErr.code) {
        switch (pgErr.code) {
            case '23505':
                res.status(409).json({ success: false, message: 'A record with this value already exists.', code: 'DUPLICATE' });
                return;
            case '23503':
                res.status(400).json({ success: false, message: 'Referenced record does not exist.', code: 'FOREIGN_KEY' });
                return;
            case '22P02':
                res.status(400).json({ success: false, message: 'Invalid ID format.', code: 'INVALID_ID' });
                return;
            case '23502':
                res.status(400).json({ success: false, message: 'A required field is missing.', code: 'NOT_NULL' });
                return;
        }
    }
    // Fallback
    console.error('[ErrorHandler]', err);
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        code: 'INTERNAL_ERROR',
    });
}
//# sourceMappingURL=error.middleware.js.map