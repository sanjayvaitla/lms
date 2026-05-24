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
exports.uploadSyllabus = uploadSyllabus;
exports.listSyllabi = listSyllabi;
exports.getSyllabus = getSyllabus;
exports.deleteSyllabus = deleteSyllabus;
exports.assignSyllabusToBatch = assignSyllabusToBatch;
exports.getBatchSyllabus = getBatchSyllabus;
const syllabusService = __importStar(require("../services/syllabus.service"));
const error_middleware_1 = require("../middleware/error.middleware");
async function uploadSyllabus(req, res) {
    if (!req.user)
        throw new error_middleware_1.AppError('Unauthorized', 401, 'UNAUTHORIZED');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = req.file;
    if (!file)
        throw new error_middleware_1.AppError('No file uploaded', 400, 'NO_FILE');
    const label = req.body.label ?? null;
    const result = await syllabusService.uploadSyllabus(String(req.params.courseId), req.user.userId, file, label ?? undefined);
    res.status(201).json({ success: true, data: result });
}
async function listSyllabi(req, res) {
    const syllabi = await syllabusService.listSyllabi(String(req.params.courseId));
    res.json({ success: true, data: syllabi });
}
async function getSyllabus(req, res) {
    const syllabusId = req.query.syllabusId ? String(req.query.syllabusId) : undefined;
    const syllabus = await syllabusService.getSyllabus(String(req.params.courseId), syllabusId);
    if (!syllabus) {
        res.json({ success: true, data: null });
        return;
    }
    res.json({ success: true, data: syllabus });
}
async function deleteSyllabus(req, res) {
    await syllabusService.deleteSyllabus(String(req.params.courseId), String(req.params.syllabusId));
    res.json({ success: true, message: 'Syllabus deleted' });
}
async function assignSyllabusToBatch(req, res) {
    const { syllabusId } = req.body;
    if (!syllabusId)
        throw new error_middleware_1.AppError('syllabusId is required', 400, 'VALIDATION_ERROR');
    await syllabusService.assignSyllabusToBatch(String(req.params.batchId), syllabusId);
    res.json({ success: true, message: 'Syllabus assigned to batch' });
}
async function getBatchSyllabus(req, res) {
    const syllabus = await syllabusService.getBatchSyllabus(String(req.params.batchId));
    res.json({ success: true, data: syllabus ?? null });
}
//# sourceMappingURL=syllabus.controller.js.map