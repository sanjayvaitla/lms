"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateModuleSchema = exports.createModuleSchema = void 0;
const zod_1 = require("zod");
exports.createModuleSchema = zod_1.z.object({
    title: zod_1.z.string().min(2, 'Title required'),
    description: zod_1.z.string().optional(),
    sortOrder: zod_1.z.coerce.number().int().min(0).optional(),
});
exports.updateModuleSchema = exports.createModuleSchema.partial();
//# sourceMappingURL=module.validator.js.map