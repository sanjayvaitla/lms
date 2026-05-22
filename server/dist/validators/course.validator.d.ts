import { z } from 'zod';
export declare const createCourseSchema: z.ZodObject<{
    title: z.ZodString;
    category: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<["ACTIVE", "NEW", "DRAFT", "ARCHIVED"]>>;
    level: z.ZodDefault<z.ZodEnum<["BEGINNER", "INTERMEDIATE", "ADVANCED"]>>;
    durationMonths: z.ZodNumber;
    description: z.ZodOptional<z.ZodString>;
    trainerId: z.ZodUnion<[z.ZodNullable<z.ZodOptional<z.ZodString>>, z.ZodEffects<z.ZodLiteral<"">, null, "">]>;
    colorToken: z.ZodDefault<z.ZodEnum<["emerald", "cyan", "purple", "amber", "rose", "indigo", "sky", "orange"]>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    category: string;
    status: "ACTIVE" | "NEW" | "DRAFT" | "ARCHIVED";
    level: "INTERMEDIATE" | "BEGINNER" | "ADVANCED";
    durationMonths: number;
    colorToken: "emerald" | "cyan" | "purple" | "amber" | "rose" | "indigo" | "sky" | "orange";
    description?: string | undefined;
    trainerId?: string | null | undefined;
}, {
    title: string;
    category: string;
    durationMonths: number;
    description?: string | undefined;
    status?: "ACTIVE" | "NEW" | "DRAFT" | "ARCHIVED" | undefined;
    level?: "INTERMEDIATE" | "BEGINNER" | "ADVANCED" | undefined;
    trainerId?: string | null | undefined;
    colorToken?: "emerald" | "cyan" | "purple" | "amber" | "rose" | "indigo" | "sky" | "orange" | undefined;
}>;
export declare const updateCourseSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["ACTIVE", "NEW", "DRAFT", "ARCHIVED"]>>>;
    level: z.ZodOptional<z.ZodDefault<z.ZodEnum<["BEGINNER", "INTERMEDIATE", "ADVANCED"]>>>;
    durationMonths: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    trainerId: z.ZodOptional<z.ZodUnion<[z.ZodNullable<z.ZodOptional<z.ZodString>>, z.ZodEffects<z.ZodLiteral<"">, null, "">]>>;
    colorToken: z.ZodOptional<z.ZodDefault<z.ZodEnum<["emerald", "cyan", "purple", "amber", "rose", "indigo", "sky", "orange"]>>>;
}, "strip", z.ZodTypeAny, {
    description?: string | undefined;
    title?: string | undefined;
    category?: string | undefined;
    status?: "ACTIVE" | "NEW" | "DRAFT" | "ARCHIVED" | undefined;
    level?: "INTERMEDIATE" | "BEGINNER" | "ADVANCED" | undefined;
    durationMonths?: number | undefined;
    trainerId?: string | null | undefined;
    colorToken?: "emerald" | "cyan" | "purple" | "amber" | "rose" | "indigo" | "sky" | "orange" | undefined;
}, {
    description?: string | undefined;
    title?: string | undefined;
    category?: string | undefined;
    status?: "ACTIVE" | "NEW" | "DRAFT" | "ARCHIVED" | undefined;
    level?: "INTERMEDIATE" | "BEGINNER" | "ADVANCED" | undefined;
    durationMonths?: number | undefined;
    trainerId?: string | null | undefined;
    colorToken?: "emerald" | "cyan" | "purple" | "amber" | "rose" | "indigo" | "sky" | "orange" | undefined;
}>;
export declare const courseQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "NEW", "DRAFT", "ARCHIVED"]>>;
    level: z.ZodOptional<z.ZodEnum<["BEGINNER", "INTERMEDIATE", "ADVANCED"]>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    search?: string | undefined;
    category?: string | undefined;
    status?: "ACTIVE" | "NEW" | "DRAFT" | "ARCHIVED" | undefined;
    level?: "INTERMEDIATE" | "BEGINNER" | "ADVANCED" | undefined;
}, {
    search?: string | undefined;
    category?: string | undefined;
    status?: "ACTIVE" | "NEW" | "DRAFT" | "ARCHIVED" | undefined;
    level?: "INTERMEDIATE" | "BEGINNER" | "ADVANCED" | undefined;
    limit?: number | undefined;
    page?: number | undefined;
}>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
//# sourceMappingURL=course.validator.d.ts.map