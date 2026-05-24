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
const ctrl = __importStar(require("../controllers/syllabus.controller"));
const router = (0, express_1.Router)({ mergeParams: true });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv',
            'application/octet-stream',
        ];
        const nameOk = file.originalname.endsWith('.pdf') ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls') ||
            file.originalname.endsWith('.csv');
        if (allowed.includes(file.mimetype) || nameOk) {
            cb(null, true);
        }
        else {
            cb(new Error('Only PDF, Excel, and CSV files are allowed'));
        }
    },
});
router.use(auth_middleware_1.authenticate);
// Course syllabus routes (mounted at /courses/:courseId/syllabus)
router.get('/', ctrl.listSyllabi);
router.get('/active', ctrl.getSyllabus);
router.post('/', upload.single('syllabus'), ctrl.uploadSyllabus);
router.delete('/:syllabusId', (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.deleteSyllabus);
exports.default = router;
//# sourceMappingURL=syllabus.routes.js.map