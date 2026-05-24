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
exports.archive = archive;
exports.restore = restore;
exports.remove = remove;
exports.enroll = enroll;
exports.unenroll = unenroll;
exports.updateEnrollment = updateEnrollment;
exports.availableStudents = availableStudents;
exports.analytics = analytics;
const svc = __importStar(require("../services/batches.service"));
const batch_validator_1 = require("../validators/batch.validator");
const error_middleware_1 = require("../middleware/error.middleware");
const isTrainer = (req) => req.user?.role === 'TRAINER';
async function list(req, res) {
    const { courseId } = req.query;
    const trainerId = isTrainer(req) ? req.user.userId : undefined;
    const batches = await svc.listBatches(courseId, trainerId);
    res.json({ success: true, data: batches });
}
async function getById(req, res) {
    const batch = await svc.getBatch(String(req.params.id));
    res.json({ success: true, data: batch });
}
async function create(req, res) {
    const parsed = batch_validator_1.createBatchSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const trainerId = isTrainer(req) ? req.user.userId : undefined;
    const batch = await svc.createBatch(parsed.data, trainerId);
    res.status(201).json({ success: true, data: batch });
}
async function update(req, res) {
    const parsed = batch_validator_1.updateBatchSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const trainerId = isTrainer(req) ? req.user.userId : undefined;
    const batch = await svc.updateBatch(String(req.params.id), parsed.data, trainerId);
    res.json({ success: true, data: batch });
}
async function archive(req, res) {
    const trainerId = isTrainer(req) ? req.user.userId : undefined;
    const batch = await svc.archiveBatch(String(req.params.id), trainerId);
    res.json({ success: true, data: batch });
}
async function restore(req, res) {
    if (isTrainer(req))
        throw new error_middleware_1.AppError('Trainers cannot restore batches', 403, 'FORBIDDEN');
    const batch = await svc.restoreBatch(String(req.params.id));
    res.json({ success: true, data: batch });
}
async function remove(req, res) {
    if (isTrainer(req))
        throw new error_middleware_1.AppError('Trainers cannot permanently delete batches', 403, 'FORBIDDEN');
    await svc.deleteBatch(String(req.params.id));
    res.json({ success: true, message: 'Batch deleted' });
}
async function enroll(req, res) {
    const { studentId } = req.body;
    if (!studentId)
        throw new error_middleware_1.AppError('studentId is required', 400, 'VALIDATION_ERROR');
    const batch = await svc.enrollStudent(String(req.params.id), studentId);
    res.status(201).json({ success: true, data: batch });
}
async function unenroll(req, res) {
    await svc.unenrollStudent(String(req.params.id), String(req.params.studentId));
    res.json({ success: true, message: 'Student unenrolled' });
}
async function updateEnrollment(req, res) {
    const { completionPct, grade } = req.body;
    await svc.updateEnrollment(String(req.params.enrollmentId), completionPct, grade);
    res.json({ success: true, message: 'Enrollment updated' });
}
async function availableStudents(req, res) {
    const students = await svc.getAvailableStudents(String(req.params.id));
    res.json({ success: true, data: students });
}
async function analytics(req, res) {
    const result = await svc.getBatchAnalytics(String(req.params.id));
    res.json({ success: true, data: result });
}
//# sourceMappingURL=batches.controller.js.map