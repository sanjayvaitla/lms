import type { RegisterInput, LoginInput } from '../validators/auth.validator';
export declare function register(input: RegisterInput): Promise<{
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
        avatarUrl: string | null;
        createdAt: Date;
    };
    accessToken: string;
    refreshToken: string;
}>;
export declare function login(input: LoginInput): Promise<{
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
        avatarUrl: string | null;
        createdAt: Date;
    };
    accessToken: string;
    refreshToken: string;
}>;
export declare function refresh(token: string): Promise<{
    accessToken: string;
}>;
export declare function logout(userId: string): Promise<void>;
export declare function getMe(userId: string): Promise<{
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl: string | null;
    createdAt: Date;
}>;
//# sourceMappingURL=auth.service.d.ts.map