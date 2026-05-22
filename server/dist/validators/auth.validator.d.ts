import { z } from 'zod';
export declare const registerSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodDefault<z.ZodOptional<z.ZodEnum<["SUPER_ADMIN", "ADMIN", "TRAINER", "STUDENT"]>>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    role: "STUDENT" | "SUPER_ADMIN" | "ADMIN" | "TRAINER";
    password: string;
}, {
    name: string;
    email: string;
    password: string;
    role?: "STUDENT" | "SUPER_ADMIN" | "ADMIN" | "TRAINER" | undefined;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const refreshSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
//# sourceMappingURL=auth.validator.d.ts.map