import { z } from 'zod';
export declare const createTrainerSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    bio: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodString>;
    linkedin: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    phone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
    bio?: string | undefined;
    skills?: string | undefined;
    linkedin?: string | undefined;
    phone?: string | undefined;
}, {
    name: string;
    email: string;
    password: string;
    bio?: string | undefined;
    skills?: string | undefined;
    linkedin?: string | undefined;
    phone?: string | undefined;
}>;
export declare const updateTrainerSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodString>;
    linkedin: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    phone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    email?: string | undefined;
    bio?: string | undefined;
    skills?: string | undefined;
    linkedin?: string | undefined;
    phone?: string | undefined;
}, {
    name?: string | undefined;
    email?: string | undefined;
    bio?: string | undefined;
    skills?: string | undefined;
    linkedin?: string | undefined;
    phone?: string | undefined;
}>;
export type CreateTrainerInput = z.infer<typeof createTrainerSchema>;
export type UpdateTrainerInput = z.infer<typeof updateTrainerSchema>;
//# sourceMappingURL=trainer.validator.d.ts.map