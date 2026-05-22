"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitAttemptSchema = exports.startAttemptSchema = exports.updateQuizSchema = exports.createQuizSchema = exports.updateQuestionSchema = exports.createQuestionSchema = exports.createDatasetSchema = void 0;
const zod_1 = require("zod");
exports.createDatasetSchema = zod_1.z.object({
    courseId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(2),
});
exports.createQuestionSchema = zod_1.z.object({
    courseId: zod_1.z.string().uuid(),
    moduleId: zod_1.z.string().uuid().optional(),
    datasetId: zod_1.z.string().uuid().optional(),
    questionText: zod_1.z.string().min(5),
    questionType: zod_1.z.enum(['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER']).default('MCQ'),
    options: zod_1.z.array(zod_1.z.string().min(1)).min(2).optional(),
    correctAnswer: zod_1.z.string().min(1),
    explanation: zod_1.z.string().optional(),
    points: zod_1.z.coerce.number().int().min(1).default(1),
    difficulty: zod_1.z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
    tags: zod_1.z.string().optional(),
});
exports.updateQuestionSchema = exports.createQuestionSchema.partial().omit({ courseId: true });
exports.createQuizSchema = zod_1.z.object({
    courseId: zod_1.z.string().uuid(),
    moduleId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    questionsPerAttempt: zod_1.z.coerce.number().int().min(1).default(10),
    timeLimitMinutes: zod_1.z.coerce.number().int().min(1).optional(),
    passingScore: zod_1.z.coerce.number().int().min(0).max(100).default(60),
    randomizeQuestions: zod_1.z.boolean().default(true),
    randomizeOptions: zod_1.z.boolean().default(true),
    maxAttempts: zod_1.z.coerce.number().int().min(1).default(1),
    status: zod_1.z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});
exports.updateQuizSchema = exports.createQuizSchema.partial().omit({ courseId: true, moduleId: true });
exports.startAttemptSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid().optional(),
});
exports.submitAttemptSchema = zod_1.z.object({
    answers: zod_1.z.array(zod_1.z.object({
        questionId: zod_1.z.string().uuid(),
        selectedAnswer: zod_1.z.string(),
    })),
});
//# sourceMappingURL=quiz.validator.js.map