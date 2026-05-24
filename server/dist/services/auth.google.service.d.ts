/**
 * auth.google.service.ts — Google OAuth 2.0 via passport-google-oauth20
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GOOGLE_CALLBACK_URL  (default: http://localhost:5000/api/v1/auth/google/callback)
 *   CLIENT_URL           (default: http://localhost:5173)
 */
export declare const GOOGLE_CONFIGURED: boolean;
export declare function setupGooglePassport(): void;
interface GoogleProfile {
    id: string;
    displayName: string;
    emails?: Array<{
        value: string;
    }>;
    photos?: Array<{
        value: string;
    }>;
}
export declare function upsertGoogleUser(profile: GoogleProfile): Promise<{
    id: string;
    role: string;
    email: string;
    name: string;
}>;
export declare function issueTokensForUser(userId: string, role: string): Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export {};
//# sourceMappingURL=auth.google.service.d.ts.map