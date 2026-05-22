"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courseQuerySchema = exports.updateCourseSchema = exports.createCourseSchema = void 0;
const zod_1 = require("zod");
const courseStatuses = ['ACTIVE', 'NEW', 'DRAFT', 'ARCHIVED'];
const courseLevels = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const colorTokens = ['emerald', 'cyan', 'purple', 'amber', 'rose', 'indigo', 'sky', 'orange'];
exports.createCourseSchema = zod_1.z.object({
    title: zod_1.z.string().min(3, 'Title must be at least 3 characters').max(200),
    category: zod_1.z.string().min(1, 'Category is required').max(50),
    status: zod_1.z.enum(courseStatuses).default('ACTIVE'),
    level: zod_1.z.enum(courseLevels).default('INTERMEDIATE'),
    durationMonths: zod_1.z.number().int().min(1).max(24),
    description: zod_1.z.string().max(1000).optional(),
    trainerId: zod_1.z.string().uuid().optional().nullable().or(zod_1.z.literal('').transform(() => null)),
    colorToken: zod_1.z.enum(colorTokens).default('emerald'),
});
exports.updateCourseSchema = exports.createCourseSchema.partial();
exports.courseQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    status: zod_1.z.enum(courseStatuses).optional(),
    level: zod_1.z.enum(courseLevels).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(12),
});
//# sourceMappingURL=course.validator.js.map