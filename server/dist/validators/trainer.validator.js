"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTrainerSchema = exports.createTrainerSchema = void 0;
const zod_1 = require("zod");
exports.createTrainerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    bio: zod_1.z.string().optional(),
    skills: zod_1.z.string().optional(),
    linkedin: zod_1.z.string().url('Invalid LinkedIn URL').optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().optional(),
});
exports.updateTrainerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    email: zod_1.z.string().email().optional(),
    bio: zod_1.z.string().optional(),
    skills: zod_1.z.string().optional(),
    linkedin: zod_1.z.string().url('Invalid LinkedIn URL').optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().optional(),
});
//# sourceMappingURL=trainer.validator.js.map