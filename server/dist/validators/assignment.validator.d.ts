import { z } from 'zod';
/**
 * Handles FormData quirks:
 * - batchIds arrives as a JSON string (e.g. '["uuid1","uuid2"]') from FormData
 * - dueDate may be an ISO string or absent
 * - maxScore comes as a string from FormData → z.coerce handles it
 */
export declare const createAssignmentSchema: z.ZodObject<{
    courseId: z.ZodString;
    moduleId: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    dueDate: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    maxScore: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<["DRAFT", "PUBLISHED", "CLOSED"]>>;
    batchIds: z.ZodEffects<z.ZodDefault<z.ZodArray<z.ZodString, "many">>, string[], unknown>;
}, "strip", z.ZodTypeAny, {
    title: string;
    status: "DRAFT" | "PUBLISHED" | "CLOSED";
    courseId: string;
    maxScore: number;
    batchIds: string[];
    description?: string | undefined;
    moduleId?: string | undefined;
    dueDate?: string | undefined;
}, {
    title: string;
    courseId: string;
    description?: string | undefined;
    status?: "DRAFT" | "PUBLISHED" | "CLOSED" | undefined;
    moduleId?: string | undefined;
    dueDate?: string | undefined;
    maxScore?: number | undefined;
    batchIds?: unknown;
}>;
export declare const updateAssignmentSchema: z.ZodObject<Omit<{
    courseId: z.ZodOptional<z.ZodString>;
    moduleId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    dueDate: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>>;
    maxScore: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["DRAFT", "PUBLISHED", "CLOSED"]>>>;
    batchIds: z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodArray<z.ZodString, "many">>, string[], unknown>>;
}, "courseId">, "strip", z.ZodTypeAny, {
    description?: string | undefined;
    title?: string | undefined;
    status?: "DRAFT" | "PUBLISHED" | "CLOSED" | undefined;
    moduleId?: string | undefined;
    dueDate?: string | undefined;
    maxScore?: number | undefined;
    batchIds?: string[] | undefined;
}, {
    description?: string | undefined;
    title?: string | undefined;
    status?: "DRAFT" | "PUBLISHED" | "CLOSED" | undefined;
    moduleId?: string | undefined;
    dueDate?: string | undefined;
    maxScore?: number | undefined;
    batchIds?: unknown;
}>;
export declare const gradeSubmissionSchema: z.ZodObject<{
    score: z.ZodNumber;
    feedback: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["SUBMITTED", "GRADED"]>>;
}, "strip", z.ZodTypeAny, {
    status: "SUBMITTED" | "GRADED";
    score: number;
    feedback?: string | undefined;
}, {
    score: number;
    status?: "SUBMITTED" | "GRADED" | undefined;
    feedback?: string | undefined;
}>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
//# sourceMappingURL=assignment.validator.d.ts.map