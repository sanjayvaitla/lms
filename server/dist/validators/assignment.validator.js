"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gradeSubmissionSchema = exports.updateAssignmentSchema = exports.createAssignmentSchema = void 0;
const zod_1 = require("zod");
/**
 * Handles FormData quirks:
 * - batchIds arrives as a JSON string (e.g. '["uuid1","uuid2"]') from FormData
 * - dueDate may be an ISO string or absent
 * - maxScore comes as a string from FormData → z.coerce handles it
 */
exports.createAssignmentSchema = zod_1.z.object({
    courseId: zod_1.z.string().uuid(),
    moduleId: zod_1.z.string().uuid().optional(),
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    dueDate: zod_1.z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), { message: 'Invalid date format' }),
    maxScore: zod_1.z.coerce.number().int().min(1).default(100),
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).default('DRAFT'),
    batchIds: zod_1.z.preprocess((val) => {
        if (Array.isArray(val))
            return val;
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? parsed : [];
            }
            catch {
                return [];
            }
        }
        return [];
    }, zod_1.z.array(zod_1.z.string().uuid()).default([])),
});
exports.updateAssignmentSchema = exports.createAssignmentSchema.partial().omit({ courseId: true });
exports.gradeSubmissionSchema = zod_1.z.object({
    score: zod_1.z.coerce.number().min(0),
    feedback: zod_1.z.string().optional(),
    status: zod_1.z.enum(['SUBMITTED', 'GRADED']).default('GRADED'),
});
//# sourceMappingURL=assignment.validator.js.map