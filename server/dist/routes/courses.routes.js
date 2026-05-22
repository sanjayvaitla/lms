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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ctrl = __importStar(require("../controllers/courses.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const syllabus_routes_1 = __importDefault(require("./syllabus.routes"));
const router = (0, express_1.Router)({ mergeParams: true });
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.create);
router.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.update);
// Delete (soft archive first, hard delete second press for admins)
router.patch('/:id/unarchive', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.unarchive);
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('SUPER_ADMIN', 'ADMIN', 'TRAINER'), ctrl.remove);
// Syllabus sub-routes mounted at /courses/:courseId/syllabus
router.use('/:courseId/syllabus', syllabus_routes_1.default);
exports.default = router;
//# sourceMappingURL=courses.routes.js.map