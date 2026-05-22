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
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const ctrl = __importStar(require("../controllers/quizzes.controller"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel', 'text/csv', 'application/json'].includes(file.mimetype) ||
            /\.(pdf|xlsx|xls|csv|json)$/i.test(file.originalname);
        cb(ok ? null : new Error('Invalid file type. Allowed: PDF, Excel, CSV, JSON.'), ok);
    },
});
function handleUpload(fieldName) {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err)
                return next(err);
            next();
        });
    };
}
const router = (0, express_1.Router)();
const adminRoles = (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER');
router.use(auth_middleware_1.authenticate);
// Dashboard
router.get('/dashboard', adminRoles, ctrl.dashboard);
// Datasets
router.get('/datasets', adminRoles, ctrl.listDatasets);
router.post('/datasets', adminRoles, handleUpload('file'), ctrl.uploadDataset);
router.get('/datasets/:id', adminRoles, ctrl.getDataset);
router.delete('/datasets/:id', adminRoles, ctrl.deleteDataset);
// Questions
router.get('/questions', adminRoles, ctrl.listQuestions);
router.post('/questions', adminRoles, ctrl.createQuestion);
router.delete('/questions/:id', adminRoles, ctrl.deleteQuestion);
// Quizzes
router.get('/', ctrl.listQuizzes);
router.post('/', adminRoles, ctrl.createQuiz);
router.put('/:id', adminRoles, ctrl.updateQuiz);
router.delete('/:id', adminRoles, ctrl.deleteQuiz);
router.get('/:id/preview', adminRoles, ctrl.previewRandom);
// Attempts
router.post('/:id/attempt', auth_middleware_1.authenticate, ctrl.startAttempt);
router.post('/attempts/:attemptId/submit', auth_middleware_1.authenticate, ctrl.submitAttempt);
router.get('/attempts/list', adminRoles, ctrl.listAttempts);
exports.default = router;
//# sourceMappingURL=quizzes.routes.js.map