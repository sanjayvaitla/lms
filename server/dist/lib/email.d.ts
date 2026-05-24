/**
 * email.ts — Nodemailer-based email sender
 *
 * Configure via env vars:
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   → any SMTP (Gmail, Outlook, etc.)
 *   SENDGRID_API_KEY                              → SendGrid
 *   AWS_SES_REGION (+ AWS_ACCESS_KEY_ID/SECRET)  → AWS SES (uses SMTP bridge)
 *
 *   EMAIL_FROM  → "Vtricks LMS <no-reply@vtricks.com>"
 *
 * If no config is set, emails are logged to console (dev fallback).
 */
export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}
export declare function sendEmail(opts: EmailOptions): Promise<void>;
export declare function forgotPasswordEmail(name: string, resetUrl: string): EmailOptions;
//# sourceMappingURL=email.d.ts.map