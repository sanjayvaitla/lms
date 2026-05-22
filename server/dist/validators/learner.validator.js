"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateLearnerSchema = exports.createLearnerSchema = void 0;
const zod_1 = require("zod");
exports.createLearnerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6).optional(),
});
exports.updateLearnerSchema = exports.createLearnerSchema.partial();
//# sourceMappingURL=learner.validator.js.map