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
exports.dashboard = dashboard;
exports.list = list;
exports.getById = getById;
exports.create = create;
exports.update = update;
exports.remove = remove;
exports.grade = grade;
const svc = __importStar(require("../services/assignments.service"));
const assignment_validator_1 = require("../validators/assignment.validator");
const error_middleware_1 = require("../middleware/error.middleware");
async function dashboard(_req, res) {
    res.json({ success: true, data: await svc.getAssignmentDashboard() });
}
async function list(req, res) {
    res.json({
        success: true,
        data: await svc.listAssignments({
            courseId: req.query.courseId,
            status: req.query.status,
        }),
    });
}
async function getById(req, res) {
    res.json({ success: true, data: await svc.getAssignment(String(req.params.id)) });
}
async function create(req, res) {
    if (!req.file)
        throw new error_middleware_1.AppError('PDF file required', 400, 'FILE_REQUIRED');
    const parsed = assignment_validator_1.createAssignmentSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const data = await svc.createAssignment(parsed.data, req.user.userId, { originalname: req.file.originalname, buffer: req.file.buffer, size: req.file.size });
    res.status(201).json({ success: true, data });
}
async function update(req, res) {
    const parsed = assignment_validator_1.updateAssignmentSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    res.json({ success: true, data: await svc.updateAssignment(String(req.params.id), parsed.data) });
}
async function remove(req, res) {
    await svc.deleteAssignment(String(req.params.id));
    res.json({ success: true, message: 'Assignment deleted' });
}
async function grade(req, res) {
    const parsed = assignment_validator_1.gradeSubmissionSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    res.json({ success: true, data: await svc.gradeSubmission(String(req.params.submissionId), parsed.data.score, parsed.data.feedback) });
}
//# sourceMappingURL=assignments.controller.js.map