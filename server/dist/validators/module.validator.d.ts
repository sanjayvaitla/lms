import { z } from 'zod';
export declare const createModuleSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description?: string | undefined;
    sortOrder?: number | undefined;
}, {
    title: string;
    description?: string | undefined;
    sortOrder?: number | undefined;
}>;
export declare const updateModuleSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    description?: string | undefined;
    sortOrder?: number | undefined;
}, {
    title?: string | undefined;
    description?: string | undefined;
    sortOrder?: number | undefined;
}>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
//# sourceMappingURL=module.validator.d.ts.map