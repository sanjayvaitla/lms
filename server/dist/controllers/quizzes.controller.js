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
exports.listDatasets = listDatasets;
exports.uploadDataset = uploadDataset;
exports.getDataset = getDataset;
exports.deleteDataset = deleteDataset;
exports.listQuestions = listQuestions;
exports.createQuestion = createQuestion;
exports.deleteQuestion = deleteQuestion;
exports.listQuizzes = listQuizzes;
exports.createQuiz = createQuiz;
exports.updateQuiz = updateQuiz;
exports.deleteQuiz = deleteQuiz;
exports.previewRandom = previewRandom;
exports.startAttempt = startAttempt;
exports.submitAttempt = submitAttempt;
exports.listAttempts = listAttempts;
const svc = __importStar(require("../services/quizzes.service"));
const quiz_validator_1 = require("../validators/quiz.validator");
const error_middleware_1 = require("../middleware/error.middleware");
async function dashboard(_req, res) {
    res.json({ success: true, data: await svc.getQuizDashboard() });
}
async function listDatasets(req, res) {
    res.json({ success: true, data: await svc.listDatasets(req.query.courseId) });
}
async function uploadDataset(req, res) {
    const parsed = quiz_validator_1.createDatasetSchema.safeParse({ ...req.body, courseId: req.body.courseId });
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    if (!req.file)
        throw new error_middleware_1.AppError('Dataset file required', 400, 'FILE_REQUIRED');
    const data = await svc.uploadDataset(parsed.data.courseId, parsed.data.title, req.user.userId, req.file);
    res.status(201).json({ success: true, data });
}
async function getDataset(req, res) {
    res.json({ success: true, data: await svc.getDataset(String(req.params.id)) });
}
async function deleteDataset(req, res) {
    await svc.deleteDataset(String(req.params.id));
    res.json({ success: true, message: 'Dataset deleted' });
}
async function listQuestions(req, res) {
    res.json({
        success: true,
        data: await svc.listQuestions({
            courseId: req.query.courseId,
            moduleId: req.query.moduleId,
        }),
    });
}
async function createQuestion(req, res) {
    const parsed = quiz_validator_1.createQuestionSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    res.status(201).json({ success: true, data: await svc.createQuestion(parsed.data) });
}
async function deleteQuestion(req, res) {
    await svc.deleteQuestion(String(req.params.id));
    res.json({ success: true, message: 'Question deleted' });
}
async function listQuizzes(req, res) {
    res.json({
        success: true,
        data: await svc.listQuizzes({
            courseId: req.query.courseId,
            releasedOnly: req.query.releasedOnly === 'true',
        }),
    });
}
async function createQuiz(req, res) {
    const parsed = quiz_validator_1.createQuizSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    res.status(201).json({ success: true, data: await svc.createQuiz(parsed.data, req.user.userId) });
}
async function updateQuiz(req, res) {
    const parsed = quiz_validator_1.updateQuizSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    res.json({ success: true, data: await svc.updateQuiz(String(req.params.id), parsed.data) });
}
async function deleteQuiz(req, res) {
    await svc.deleteQuiz(String(req.params.id));
    res.json({ success: true, message: 'Quiz deleted' });
}
async function previewRandom(req, res) {
    res.json({ success: true, data: await svc.previewRandomDraw(String(req.params.id)) });
}
async function startAttempt(req, res) {
    const parsed = quiz_validator_1.startAttemptSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const studentId = parsed.data.studentId ?? req.user.userId;
    res.json({ success: true, data: await svc.startAttempt(String(req.params.id), studentId) });
}
async function submitAttempt(req, res) {
    const parsed = quiz_validator_1.submitAttemptSchema.safeParse(req.body);
    if (!parsed.success)
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    res.json({ success: true, data: await svc.submitAttempt(String(req.params.attemptId), parsed.data.answers) });
}
async function listAttempts(req, res) {
    res.json({ success: true, data: await svc.listAttempts(req.query.quizId) });
}
//# sourceMappingURL=quizzes.controller.js.map