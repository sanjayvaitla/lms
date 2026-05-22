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
const ctrl = __importStar(require("../controllers/assignments.controller"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
        cb(ok ? null : new Error('Only PDF files are allowed.'), ok);
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
// Assignments CRUD
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', adminRoles, handleUpload('file'), ctrl.create);
router.put('/:id', adminRoles, ctrl.update);
router.delete('/:id', adminRoles, ctrl.remove);
// Submissions grading
router.put('/submissions/:submissionId/grade', adminRoles, ctrl.grade);
exports.default = router;
//# sourceMappingURL=assignments.routes.js.map