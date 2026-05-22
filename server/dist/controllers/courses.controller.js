"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.list = list;
exports.getById = getById;
exports.create = create;
exports.update = update;
exports.unarchive = unarchive;
exports.remove = remove;
const svc = __importStar(require("../services/courses.service"));
const course_validator_1 = require("../validators/course.validator");
const error_middleware_1 = require("../middleware/error.middleware");
const isTrainer = (req) => req.user?.role === 'TRAINER';
async function list(req, res) {
    const parsed = course_validator_1.courseQuerySchema.safeParse(req.query);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    // Trainers see only their own courses
    const trainerId = isTrainer(req) ? req.user.userId : undefined;
    const result = await svc.listCourses({ ...parsed.data, trainerId });
    res.json({ success: true, data: result });
}
async function getById(req, res) {
    const course = await svc.getCourse(String(req.params.id));
    res.json({ success: true, data: course });
}
async function create(req, res) {
    const parsed = course_validator_1.createCourseSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    // Force trainer_id to their own userId when role is TRAINER
    const forcedTrainerId = isTrainer(req) ? req.user.userId : undefined;
    const course = await svc.createCourse(parsed.data, forcedTrainerId);
    res.status(201).json({ success: true, data: course });
}
async function update(req, res) {
    const parsed = course_validator_1.updateCourseSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const trainerId = isTrainer(req) ? req.user.userId : undefined;
    const course = await svc.updateCourse(String(req.params.id), parsed.data, trainerId);
    res.json({ success: true, data: course });
}
async function unarchive(req, res) {
    const course = await svc.unarchiveCourse(String(req.params.id));
    res.json({ success: true, data: course });
}
async function remove(req, res) {
    // Trainers can only soft-delete (archive), not hard-delete
    if (isTrainer(req)) {
        const course = await svc.updateCourse(String(req.params.id), { status: 'ARCHIVED' }, req.user.userId);
        return res.json({ success: true, action: 'archived', data: course });
    }
    const { action } = await svc.deleteCourse(String(req.params.id));
    res.json({
        success: true,
        action,
        message: action === 'archived' ? 'Course archived' : 'Course permanently deleted',
    });
}
//# sourceMappingURL=courses.controller.js.map