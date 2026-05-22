import { z } from 'zod';
export declare const createBatchSchema: z.ZodObject<{
    name: z.ZodString;
    courseId: z.ZodString;
    startDate: z.ZodString;
    endDate: z.ZodString;
    capacity: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<["UPCOMING", "ONGOING", "COMPLETED"]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    status: "UPCOMING" | "ONGOING" | "COMPLETED";
    capacity: number;
    courseId: string;
    startDate: string;
    endDate: string;
}, {
    name: string;
    courseId: string;
    startDate: string;
    endDate: string;
    status?: "UPCOMING" | "ONGOING" | "COMPLETED" | undefined;
    capacity?: number | undefined;
}>;
export declare const updateBatchSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    courseId: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    capacity: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["UPCOMING", "ONGOING", "COMPLETED"]>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    status?: "UPCOMING" | "ONGOING" | "COMPLETED" | undefined;
    capacity?: number | undefined;
    courseId?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    name?: string | undefined;
    status?: "UPCOMING" | "ONGOING" | "COMPLETED" | undefined;
    capacity?: number | undefined;
    courseId?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
}>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
//# sourceMappingURL=batch.validator.d.ts.map