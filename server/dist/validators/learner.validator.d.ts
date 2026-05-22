import { z } from 'zod';
export declare const createLearnerSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password?: string | undefined;
}, {
    name: string;
    email: string;
    password?: string | undefined;
}>;
export declare const updateLearnerSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    email?: string | undefined;
    password?: string | undefined;
}, {
    name?: string | undefined;
    email?: string | undefined;
    password?: string | undefined;
}>;
export type CreateLearnerInput = z.infer<typeof createLearnerSchema>;
export type UpdateLearnerInput = z.infer<typeof updateLearnerSchema>;
//# sourceMappingURL=learner.validator.d.ts.map