"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const courses_routes_1 = __importDefault(require("./courses.routes"));
const batches_routes_1 = __importDefault(require("./batches.routes"));
const dashboard_routes_1 = __importDefault(require("./dashboard.routes"));
const trainers_routes_1 = __importDefault(require("./trainers.routes"));
const learners_routes_1 = __importDefault(require("./learners.routes"));
const modules_routes_1 = __importDefault(require("./modules.routes"));
const quizzes_routes_1 = __importDefault(require("./quizzes.routes"));
const assignments_routes_1 = __importDefault(require("./assignments.routes"));
const router = (0, express_1.Router)();
router.use('/auth', auth_routes_1.default);
router.use('/courses', courses_routes_1.default);
router.use('/courses/:courseId/modules', modules_routes_1.default);
router.use('/batches', batches_routes_1.default);
router.use('/dashboard', dashboard_routes_1.default);
router.use('/trainers', trainers_routes_1.default);
router.use('/learners', learners_routes_1.default);
router.use('/quizzes', quizzes_routes_1.default);
router.use('/assignments', assignments_routes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map