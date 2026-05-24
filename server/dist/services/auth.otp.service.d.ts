/**
 * auth.otp.service.ts — MSG91 OTP / MFA
 *
 * Required env vars:
 *   MSG91_API_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID
 *   OTP_EXPIRY_MINUTES  (default: 10)
 */
export declare const MSG91_CONFIGURED: boolean;
export declare function sendOtp(phone: string): Promise<{
    message: string;
    dev_otp?: string;
}>;
export declare function verifyOtp(phone: string, otp: string, userData?: {
    name?: string;
    email?: string;
}): Promise<{
    user: object;
    accessToken: string;
    refreshToken: string;
}>;
//# sourceMappingURL=auth.otp.service.d.ts.map