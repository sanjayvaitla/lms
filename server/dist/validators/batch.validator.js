"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBatchSchema = exports.createBatchSchema = void 0;
const zod_1 = require("zod");
const batchStatuses = ['UPCOMING', 'ONGOING', 'COMPLETED'];
exports.createBatchSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200),
    courseId: zod_1.z.string().uuid(),
    startDate: zod_1.z.string().min(1, 'Start date is required'),
    endDate: zod_1.z.string().min(1, 'End date is required'),
    capacity: zod_1.z.number().int().min(1).max(500).default(30),
    status: zod_1.z.enum(batchStatuses).default('UPCOMING'),
});
exports.updateBatchSchema = exports.createBatchSchema.partial();
//# sourceMappingURL=batch.validator.js.map