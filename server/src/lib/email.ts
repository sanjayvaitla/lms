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

import nodemailer, { Transporter } from 'nodemailer';

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Vtricks LMS <no-reply@vtricks.com>';

function createTransport(): Transporter {
  // SendGrid
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
  }

  // AWS SES via SMTP
  if (process.env.AWS_SES_REGION) {
    return nodemailer.createTransport({
      host: `email-smtp.${process.env.AWS_SES_REGION}.amazonaws.com`,
      port: 587,
      auth: {
        user: process.env.AWS_ACCESS_KEY_ID,
        pass: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  // Generic SMTP (Gmail, Outlook, custom)
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Dev fallback — print to console
  return nodemailer.createTransport({ jsonTransport: true });
}

const transporter = createTransport();
const isDev = !process.env.SMTP_HOST && !process.env.SENDGRID_API_KEY && !process.env.AWS_SES_REGION;

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
  });

  if (isDev) {
    // Log to console in dev so you can see the link without a real SMTP server
    console.log('\n[email] ─────────────────────────────────────────');
    console.log(`  To:      ${opts.to}`);
    console.log(`  Subject: ${opts.subject}`);
    // Extract the reset URL from the HTML for easy copy-paste
    const urlMatch = opts.html.match(/href="([^"]+)"/);
    if (urlMatch) console.log(`  Link:    ${urlMatch[1]}`);
    console.log('[email] ─────────────────────────────────────────\n');
  } else {
    console.log(`[email] Sent "${opts.subject}" to ${opts.to} (id: ${(info as { messageId?: string }).messageId ?? 'n/a'})`);
  }
}

// ── Branded email templates ───────────────────────────────────────────────────

export function forgotPasswordEmail(name: string, resetUrl: string): EmailOptions {
  const expiryMinutes = 30;
  return {
    to: '',   // set by caller
    subject: 'Reset your Vtricks LMS password',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Vtricks LMS</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Learning Management System</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:600;">Reset your password</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Hi ${name}, we received a request to reset the password for your account.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${resetUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                  Reset Password
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
              Or copy this link into your browser:
            </p>
            <p style="margin:0 0 24px;word-break:break-all;">
              <a href="${resetUrl}" style="color:#2563eb;font-size:12px;">${resetUrl}</a>
            </p>
            <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
              <p style="margin:0;color:#854d0e;font-size:13px;">⏱ This link expires in <strong>${expiryMinutes} minutes</strong>. If you didn't request a reset, you can safely ignore this email.</p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
