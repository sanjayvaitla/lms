import { z } from 'zod';
export declare const createDatasetSchema: z.ZodObject<{
    courseId: z.ZodString;
    title: z.ZodString;
}, "strip", z.ZodTypeAny, {
    title: string;
    courseId: string;
}, {
    title: string;
    courseId: string;
}>;
export declare const createQuestionSchema: z.ZodObject<{
    courseId: z.ZodString;
    moduleId: z.ZodOptional<z.ZodString>;
    datasetId: z.ZodOptional<z.ZodString>;
    questionText: z.ZodString;
    questionType: z.ZodDefault<z.ZodEnum<["MCQ", "TRUE_FALSE", "SHORT_ANSWER"]>>;
    options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    correctAnswer: z.ZodString;
    explanation: z.ZodOptional<z.ZodString>;
    points: z.ZodDefault<z.ZodNumber>;
    difficulty: z.ZodDefault<z.ZodEnum<["EASY", "MEDIUM", "HARD"]>>;
    tags: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    courseId: string;
    questionText: string;
    questionType: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER";
    correctAnswer: string;
    points: number;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    options?: string[] | undefined;
    moduleId?: string | undefined;
    datasetId?: string | undefined;
    explanation?: string | undefined;
    tags?: string | undefined;
}, {
    courseId: string;
    questionText: string;
    correctAnswer: string;
    options?: string[] | undefined;
    moduleId?: string | undefined;
    datasetId?: string | undefined;
    questionType?: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | undefined;
    explanation?: string | undefined;
    points?: number | undefined;
    difficulty?: "EASY" | "MEDIUM" | "HARD" | undefined;
    tags?: string | undefined;
}>;
export declare const updateQuestionSchema: z.ZodObject<Omit<{
    courseId: z.ZodOptional<z.ZodString>;
    moduleId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    datasetId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    questionText: z.ZodOptional<z.ZodString>;
    questionType: z.ZodOptional<z.ZodDefault<z.ZodEnum<["MCQ", "TRUE_FALSE", "SHORT_ANSWER"]>>>;
    options: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    correctAnswer: z.ZodOptional<z.ZodString>;
    explanation: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    points: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    difficulty: z.ZodOptional<z.ZodDefault<z.ZodEnum<["EASY", "MEDIUM", "HARD"]>>>;
    tags: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "courseId">, "strip", z.ZodTypeAny, {
    options?: string[] | undefined;
    moduleId?: string | undefined;
    datasetId?: string | undefined;
    questionText?: string | undefined;
    questionType?: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | undefined;
    correctAnswer?: string | undefined;
    explanation?: string | undefined;
    points?: number | undefined;
    difficulty?: "EASY" | "MEDIUM" | "HARD" | undefined;
    tags?: string | undefined;
}, {
    options?: string[] | undefined;
    moduleId?: string | undefined;
    datasetId?: string | undefined;
    questionText?: string | undefined;
    questionType?: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | undefined;
    correctAnswer?: string | undefined;
    explanation?: string | undefined;
    points?: number | undefined;
    difficulty?: "EASY" | "MEDIUM" | "HARD" | undefined;
    tags?: string | undefined;
}>;
export declare const createQuizSchema: z.ZodObject<{
    courseId: z.ZodString;
    moduleId: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    questionsPerAttempt: z.ZodDefault<z.ZodNumber>;
    timeLimitMinutes: z.ZodOptional<z.ZodNumber>;
    passingScore: z.ZodDefault<z.ZodNumber>;
    randomizeQuestions: z.ZodDefault<z.ZodBoolean>;
    randomizeOptions: z.ZodDefault<z.ZodBoolean>;
    maxAttempts: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<["DRAFT", "ACTIVE", "ARCHIVED"]>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    status: "ACTIVE" | "DRAFT" | "ARCHIVED";
    courseId: string;
    moduleId: string;
    questionsPerAttempt: number;
    passingScore: number;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    maxAttempts: number;
    description?: string | undefined;
    timeLimitMinutes?: number | undefined;
}, {
    title: string;
    courseId: string;
    moduleId: string;
    description?: string | undefined;
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED" | undefined;
    questionsPerAttempt?: number | undefined;
    timeLimitMinutes?: number | undefined;
    passingScore?: number | undefined;
    randomizeQuestions?: boolean | undefined;
    randomizeOptions?: boolean | undefined;
    maxAttempts?: number | undefined;
}>;
export declare const updateQuizSchema: z.ZodObject<Omit<{
    courseId: z.ZodOptional<z.ZodString>;
    moduleId: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    questionsPerAttempt: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    timeLimitMinutes: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    passingScore: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    randomizeQuestions: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    randomizeOptions: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    maxAttempts: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["DRAFT", "ACTIVE", "ARCHIVED"]>>>;
}, "courseId" | "moduleId">, "strip", z.ZodTypeAny, {
    description?: string | undefined;
    title?: string | undefined;
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED" | undefined;
    questionsPerAttempt?: number | undefined;
    timeLimitMinutes?: number | undefined;
    passingScore?: number | undefined;
    randomizeQuestions?: boolean | undefined;
    randomizeOptions?: boolean | undefined;
    maxAttempts?: number | undefined;
}, {
    description?: string | undefined;
    title?: string | undefined;
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED" | undefined;
    questionsPerAttempt?: number | undefined;
    timeLimitMinutes?: number | undefined;
    passingScore?: number | undefined;
    randomizeQuestions?: boolean | undefined;
    randomizeOptions?: boolean | undefined;
    maxAttempts?: number | undefined;
}>;
export declare const startAttemptSchema: z.ZodObject<{
    studentId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    studentId?: string | undefined;
}, {
    studentId?: string | undefined;
}>;
export declare const submitAttemptSchema: z.ZodObject<{
    answers: z.ZodArray<z.ZodObject<{
        questionId: z.ZodString;
        selectedAnswer: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        questionId: string;
        selectedAnswer: string;
    }, {
        questionId: string;
        selectedAnswer: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    answers: {
        questionId: string;
        selectedAnswer: string;
    }[];
}, {
    answers: {
        questionId: string;
        selectedAnswer: string;
    }[];
}>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
//# sourceMappingURL=quiz.validator.d.ts.map