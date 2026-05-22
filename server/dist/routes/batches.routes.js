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
const ctrl = __importStar(require("../controllers/batches.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Public
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
// Admin + Trainer (create/edit)
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.create);
router.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.update);
// Soft delete (archive) — trainer allowed
router.patch('/:id/archive', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.archive);
// Hard delete — admin only
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN'), ctrl.remove);
// Enrollment management — admin + trainer
router.get('/:id/students/available', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.availableStudents);
router.post('/:id/enroll', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.enroll);
router.delete('/:id/enroll/:studentId', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.unenroll);
router.put('/:id/enroll/:enrollmentId', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.updateEnrollment);
// Analytics
router.get('/:id/analytics', auth_middleware_1.authenticate, ctrl.analytics);
exports.default = router;
//# sourceMappingURL=batches.routes.js.map