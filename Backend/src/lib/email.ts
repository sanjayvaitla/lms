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
import path from 'path';

const EMAIL_FROM =
  process.env.EMAIL_FROM ??
  (process.env.SMTP_FROM_EMAIL
    ? `${process.env.SMTP_FROM_NAME ?? 'Vtricks LMS'} <${process.env.SMTP_FROM_EMAIL}>`
    : 'Vtricks LMS <no-reply@vtricks.com>');

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
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const finalAttachments = opts.attachments;

  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
    attachments: finalAttachments,
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

export function forgotPasswordEmail(name: string, resetUrl: string, expiryMinutes = 60): EmailOptions {
  const forgotUrl = (process.env.CLIENT_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '') + '/forgot-password';
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
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks LMS" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Learning Management System</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:600;">Reset your password</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Hi ${name}, we received a request to reset the password for your Vtricks LMS account. Click the button below to choose a new password.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${resetUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                  Set New Password
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
              Or copy this link into your browser:
            </p>
            <p style="margin:0 0 24px;word-break:break-all;">
              <a href="${resetUrl}" style="color:#2563eb;font-size:12px;">${resetUrl}</a>
            </p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
              This link expires in <strong>${expiryMinutes} minutes</strong> and can be used only once.
              If you did not request a reset, you can ignore this email.
              Link expired? Request a new one at
              <a href="${forgotUrl}" style="color:#2563eb;">Forgot password</a>.
            </p>
          </td>
        </tr>
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

export function setupAccountEmail(name: string, role: string, setupUrl: string): EmailOptions {
  const expiryMinutes = 30;
  const roleDisplay = role === 'LD_MANAGER' ? 'L&D Manager' : role === 'OPERATIONAL_MANAGER' ? 'Operations Manager' : role === 'FEES_ADMIN' ? 'Fee Manager' : role === 'SUPER_ADMIN' ? 'Super Admin' : role.charAt(0) + role.slice(1).toLowerCase();

  return {
    to: '',   // set by caller
    subject: 'Set up your Vtricks LMS account',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks LMS" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Learning Management System</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:600;">Welcome to Vtricks LMS!</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Hi ${name}, an account has been created for you with the role of <strong>${roleDisplay}</strong>. Please click the button below to set up your password and access your account.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${setupUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                  Set Password
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
              Or copy this link into your browser:
            </p>
            <p style="margin:0 0 24px;word-break:break-all;">
              <a href="${setupUrl}" style="color:#2563eb;font-size:12px;">${setupUrl}</a>
            </p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
              This link expires in <strong>${expiryMinutes} minutes</strong>. If you did not expect this, please ignore this email.
            </p>
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

export function mockInterviewAssignedEmail(studentName: string, date: string, time: string, meetingLink: string): EmailOptions {
  return {
    to: '', // set by caller
    subject: 'Virtual Mock Interview Scheduled - Vtricks LMS',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks LMS" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Mock Interview Scheduled</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:600;">Your Mock Interview Details</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Hi ${studentName}, a mock interview has been scheduled for you. Please be prepared to join on time!</p>
            
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-size:14px;"><strong>Date:</strong> ${date}</p>
              <p style="margin:0 0 0;font-size:14px;"><strong>Time:</strong> ${time}</p>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${meetingLink}"
                   style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                  Join Meeting
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
              Or copy this link into your browser:
            </p>
            <p style="margin:0 0 24px;word-break:break-all;">
              <a href="${meetingLink}" style="color:#2563eb;font-size:12px;">${meetingLink}</a>
            </p>
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

export function trainerMockInterviewAssignedEmail(trainerName: string, studentName: string, date: string, time: string, meetingLink: string): EmailOptions {
  return {
    to: '', // set by caller
    subject: 'New Mock Interview Assigned - Vtricks LMS',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks LMS" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Mock Interview Assigned</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:600;">New Mock Interview</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Hi ${trainerName}, you have been assigned to conduct a mock interview with ${studentName}.</p>
            
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-size:14px;"><strong>Student:</strong> ${studentName}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Date:</strong> ${date}</p>
              <p style="margin:0 0 0;font-size:14px;"><strong>Time:</strong> ${time}</p>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${meetingLink}"
                   style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                  Join Meeting
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
              Or copy this link into your browser:
            </p>
            <p style="margin:0 0 24px;word-break:break-all;">
              <a href="${meetingLink}" style="color:#2563eb;font-size:12px;">${meetingLink}</a>
            </p>
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

export function feeUpdateEmail(name: string, paymentAmount: number, dueAmount: number, isCleared: boolean): EmailOptions {
  return {
    to: '', // set by caller
    subject: isCleared ? 'Your Vtricks LMS fees are cleared' : 'Your Vtricks LMS fee payment receipt',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks LMS" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Fee Payment Receipt</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:600;">Payment Successful</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Hi ${name}, we have successfully received your recent fee payment.</p>
            
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-size:14px;color:#1e293b;"><strong>Amount Paid:</strong> ₹${paymentAmount}</p>
              ${isCleared
        ? '<p style="margin:0 0 0;font-size:14px;color:#10b981;font-weight:600;">Status: Term fees fully cleared!</p>'
        : '<p style="margin:0 0 0;font-size:14px;color:#1e293b;"><strong>Remaining Due:</strong> ₹' + dueAmount + '</p>'
      }
            </div>

            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
              You can check your detailed payment history anytime by logging into the portal.
            </p>
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

export function registrationPaymentEmail(name: string, programName: string, amount: number, date: string, dueAmount: number): EmailOptions {
  return {
    to: '',
    subject: 'Registration Payment Received Successfully',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Fee Payment Receipt</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${name}</strong>,</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Greetings from Vtricks Technologies!</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">We are pleased to confirm that we have successfully received your registration payment of ₹${amount} towards your enrollment in the <strong>${programName}</strong>.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Payment Summary</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Program Name:</strong> ${programName}</li>
              <li>• <strong>Installment Paid:</strong> Registration Payment</li>
              <li>• <strong>Amount Received:</strong> ₹${amount}</li>
              <li>• <strong>Payment Date:</strong> ${date}</li>
              <li>• <strong>Remaining Balance:</strong> ₹${dueAmount}</li>
            </ul>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Thank you for your timely payment. We encourage you to continue your learning journey with dedication and actively participate in all course activities, assignments, and projects.</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">We look forward to supporting you throughout your learning experience.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Happy Learning!</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Warm Regards,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function firstInstallmentEmail(name: string, programName: string, amount: number, date: string, dueAmount: number): EmailOptions {
  return {
    to: '',
    subject: 'First Installment Payment Received Successfully',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Fee Payment Receipt</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${name}</strong>,</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Greetings from Vtricks Technologies!</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">We are pleased to confirm that we have successfully received your 1st installment payment of ₹${amount} towards your enrollment in the <strong>${programName}</strong>.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Payment Summary</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Program Name:</strong> ${programName}</li>
              <li>• <strong>Installment Paid:</strong> 1st Installment</li>
              <li>• <strong>Amount Received:</strong> ₹${amount}</li>
              <li>• <strong>Payment Date:</strong> ${date}</li>
              <li>• <strong>Remaining Balance:</strong> ₹${dueAmount}</li>
            </ul>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Thank you for your timely payment. We encourage you to continue your learning journey with dedication and actively participate in all course activities, assignments, and projects.</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">We look forward to supporting you throughout your learning experience.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Happy Learning!</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Warm Regards,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function secondInstallmentEmail(name: string, programName: string, amount: number, date: string, dueAmount: number): EmailOptions {
  return {
    to: '',
    subject: 'Second Installment Payment Received Successfully',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Fee Payment Receipt</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${name}</strong>,</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Greetings from Vtricks Technologies!</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">We are happy to inform you that your 2nd installment payment of ₹${amount} for the <strong>${programName}</strong> has been successfully received.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Payment Summary</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Program Name:</strong> ${programName}</li>
              <li>• <strong>Installment Paid:</strong> 2nd Installment</li>
              <li>• <strong>Amount Received:</strong> ₹${amount}</li>
              <li>• <strong>Payment Date:</strong> ${date}</li>
              <li>• <strong>Remaining Balance:</strong> ₹${dueAmount}</li>
            </ul>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Thank you for staying committed to your learning journey. Your continued participation and dedication will help you gain maximum value from the program.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Should you require any assistance, our team is always here to support you.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Keep Learning, Keep Growing!</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Warm Regards,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function finalInstallmentEmail(name: string, programName: string, amount: number, date: string, totalAmount: number): EmailOptions {
  return {
    to: '',
    subject: 'Program Fee Payment Completed Successfully',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Fee Payment Receipt</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${name}</strong>,</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Greetings from Vtricks Technologies!</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Congratulations! We are pleased to confirm the successful receipt of your Final Installment payment of ₹${amount} towards the <strong>${programName}</strong>.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">With this payment, your program fee has been paid in full.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Payment Summary</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Program Name:</strong> ${programName}</li>
              <li>• <strong>Installment Paid:</strong> Final Installment</li>
              <li>• <strong>Amount Received:</strong> ₹${amount}</li>
              <li>• <strong>Payment Date:</strong> ${date}</li>
              <li>• <strong>Total Program Fee Paid:</strong> ₹${totalAmount}</li>
              <li>• <strong>Outstanding Balance:</strong> ₹0</li>
            </ul>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Thank you for your commitment and trust in Vtricks Technologies. We are delighted to be a part of your learning and career development journey.</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">We encourage you to continue leveraging the program resources, mentorship, projects, and placement support opportunities available to you.</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">We wish you great success in your academic, professional, and personal endeavors.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Congratulations on completing your fee payment formalities and best wishes for a successful future!</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Warm Regards,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function assignmentReleaseEmail(
  learnerName: string,
  programName: string,
  assignmentName: string,
  courseName: string,
  releaseDate: string,
  submissionDeadline: string,
  maxMarks: number
): EmailOptions {
  return {
    to: '',
    subject: `New Assignment Released - ${assignmentName} | ${courseName}`,
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Assignment Notification</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${learnerName}</strong>,</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Greetings from Vtricks Technologies!</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">A new assignment has been released as part of your <strong>${courseName}</strong> under the <strong>${programName}</strong>.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Assignment Details</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Assignment Name:</strong> ${assignmentName}</li>
              <li>• <strong>Course:</strong> ${courseName}</li>
              <li>• <strong>Release Date:</strong> ${releaseDate}</li>
              <li>• <strong>Submission Deadline:</strong> ${submissionDeadline}</li>
              <li>• <strong>Maximum Marks:</strong> ${maxMarks}</li>
            </ul>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">This assignment has been designed to help you apply the concepts covered during the course and strengthen your practical skills.</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Please review the assignment guidelines carefully and submit your work before the deadline.</p>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">For any clarifications, please contact your trainer or LMS support team.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Happy Learning!</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Warm Regards,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function sessionCompleteEmail(
  learnerName: string,
  programName: string,
  courseName: string,
  sessionLabel: string,
  sessionTitle: string,
  completedDate: string,
): EmailOptions {
  return {
    to: '',
    subject: `Session Completed - ${sessionLabel} | ${courseName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
            <p style="margin:0;color:#fff;font-size:18px;font-weight:600;">Session Completed</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${courseName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${learnerName}</strong>,</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">
              Your trainer has marked <strong>${sessionLabel}: ${sessionTitle}</strong> as completed under <strong>${courseName}</strong> (${programName}).
            </p>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Completed on:</strong> ${completedDate}</li>
              <li>• Linked assignments and quizzes (if any) are now available in your portal</li>
              <li>• Check recordings and materials in the session page</li>
            </ul>
            <p style="margin:0;color:#64748b;font-size:15px;">Log in to the LMS portal to view assignments and session content.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function assignmentReminderEmail(
  learnerName: string,
  assignmentName: string,
  courseName: string,
  submissionDeadline: string,
  daysRemaining: string
): EmailOptions {
  return {
    to: '',
    subject: `Reminder: Assignment Submission Due on ${submissionDeadline.split(',')[0]} - ${assignmentName}`,
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Submission Reminder</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${learnerName}</strong>,</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">This is a friendly reminder that the submission deadline for the following assignment is approaching.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Assignment Details</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Assignment Name:</strong> ${assignmentName}</li>
              <li>• <strong>Course:</strong> ${courseName}</li>
              <li>• <strong>Submission Deadline:</strong> ${submissionDeadline}</li>
              <li>• <strong>Days Remaining:</strong> ${daysRemaining}</li>
            </ul>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">We encourage you to complete and submit your assignment on time to maintain your learning progress and eligibility for course completion.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Please ignore this email if you have already submitted the assignment.</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Best Wishes,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function assignmentEvaluationEmail(
  learnerName: string,
  assignmentName: string,
  courseName: string,
  score: string,
  totalMarks: string,
  evaluationDate: string,
  feedbackComments: string
): EmailOptions {
  return {
    to: '',
    subject: `Assignment Evaluation Completed - ${assignmentName}`,
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Evaluation Result</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${learnerName}</strong>,</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">We are pleased to inform you that your submitted assignment has been evaluated.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Evaluation Summary</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Assignment Name:</strong> ${assignmentName}</li>
              <li>• <strong>Course:</strong> ${courseName}</li>
              <li>• <strong>Marks Obtained:</strong> <strong style="color:#059669;">${score}/${totalMarks}</strong></li>
              <li>• <strong>Evaluation Date:</strong> ${evaluationDate}</li>
            </ul>

            <h3 style="margin:0 0 12px;color:#1e293b;font-size:16px;font-weight:600;">Trainer Feedback</h3>
            <div style="margin:0 0 24px;background:#f8fafc;border-left:4px solid #2563eb;padding:12px 16px;color:#475569;font-size:14px;line-height:1.6;">
              ${feedbackComments}
            </div>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">We appreciate your efforts and encourage you to incorporate the feedback into your future assignments and projects.</p>
            
            <h3 style="margin:0 0 12px;color:#1e293b;font-size:16px;font-weight:600;">Attachments</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#2563eb;font-size:14px;line-height:1.8;">
              <li>• Evaluated Assignment Report (Check your dashboard)</li>
            </ul>

            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Keep up the good work!</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Warm Regards,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function assessmentNotificationEmail(
  learnerName: string,
  assessmentName: string,
  courseName: string,
  date: string,
  time: string,
  duration: string,
  mode: string
): EmailOptions {
  return {
    to: '',
    subject: `Upcoming Assessment Scheduled - ${courseName}`,
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
          <td style="background:linear-gradient(135deg,#6366f1 0%,#a855f7 100%);padding:32px 40px;text-align:center;">
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Assessment Notification</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${learnerName}</strong>,</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">As part of your learning journey, an assessment has been scheduled for your course.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Assessment Details</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Assessment Name:</strong> ${assessmentName}</li>
              <li>• <strong>Course:</strong> ${courseName}</li>
              <li>• <strong>Date:</strong> ${date}</li>
              <li>• <strong>Time:</strong> ${time}</li>
              <li>• <strong>Duration:</strong> ${duration}</li>
              <li>• <strong>Mode:</strong> ${mode}</li>
            </ul>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">The assessment will evaluate your understanding of the concepts covered so far.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Please ensure that you are prepared and available during the scheduled time.</p>
            
            <h3 style="margin:0 0 12px;color:#1e293b;font-size:16px;font-weight:600;">Attachments</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#2563eb;font-size:14px;line-height:1.8;">
              <li>• Assessment Guidelines (Check Dashboard)</li>
              <li>• Syllabus Coverage Document (Check Dashboard)</li>
            </ul>

            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">We wish you the very best.</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Warm Regards,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function assessmentResultEmail(
  learnerName: string,
  assessmentName: string,
  courseName: string,
  score: string,
  totalMarks: string,
  percentage: string,
  resultStatus: string
): EmailOptions {
  return {
    to: '',
    subject: `Assessment Results Published - ${assessmentName}`,
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
          <td style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:32px 40px;text-align:center;">
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Assessment Result</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${learnerName}</strong>,</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Your assessment results for <strong>${assessmentName}</strong> have been published.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Result Summary</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Course:</strong> ${courseName}</li>
              <li>• <strong>Score:</strong> <strong style="color:#059669;">${score}/${totalMarks}</strong></li>
              <li>• <strong>Percentage:</strong> ${percentage}%</li>
              <li>• <strong>Result Status:</strong> <span style="font-weight:600;color:${resultStatus === 'Pass' ? '#059669' : '#dc2626'}">${resultStatus}</span></li>
            </ul>

            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Please review your detailed performance report through the LMS.</p>
            
            <h3 style="margin:0 0 12px;color:#1e293b;font-size:16px;font-weight:600;">Attachments</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#2563eb;font-size:14px;line-height:1.8;">
              <li>• Assessment Report Card (Check Dashboard)</li>
              <li>• Performance Analysis (Check Dashboard)</li>
            </ul>

            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Congratulations on your progress!</p>
            
            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Warm Regards,</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function mockInterviewFeedbackEmail(studentName: string): EmailOptions {
  return {
    to: '', // set by caller
    subject: 'Mock Interview Feedback Available',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks LMS" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Feedback Available</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:600;">Mock Interview Evaluated</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Dear ${studentName},<br><br>Thank you for attending the Mock Interview Session.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Your interview performance has been evaluated and feedback is now available.</p>
            
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-size:15px;font-weight:600;">Evaluation Areas:</p>
              <ul style="margin:0;padding-left:20px;font-size:14px;color:#475569;line-height:1.6;">
                <li>Technical Knowledge</li>
                <li>Communication Skills</li>
                <li>Problem Solving</li>
                <li>Confidence Level</li>
                <li>Overall Performance</li>
              </ul>
            </div>

            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Please login to your LMS portal to review the detailed feedback and recommendations for improvement.</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">We encourage you to work on the suggested areas before attending placement drives.</p>
            <p style="margin:0;color:#64748b;font-size:15px;line-height:1.6;">Warm Regards,<br><strong>Vtricks Technologies</strong></p>
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

export function placementOpportunityEmail(
  learnerName: string,
  companyName: string,
  jobRole: string,
  experienceRequired: string
): EmailOptions {
  return {
    to: '',
    subject: 'New Job Opportunity Available – Apply Now',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks Technologies" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Placement Opportunity Notification</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Dear <strong>${learnerName}</strong>,</p>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">A new placement opportunity matching your profile has been identified.</p>
            
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">Opportunity Details</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#1e293b;font-size:14px;line-height:1.8;">
              <li>• <strong>Company:</strong> ${companyName}</li>
              <li>• <strong>Position:</strong> ${jobRole}</li>
              <li>• <strong>Experience Required:</strong> ${experienceRequired}</li>
              <li>• <strong>Application Deadline:</strong> Check Portal</li>
            </ul>

            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Interested candidates are requested to apply through the LMS before the specified deadline.</p>
            
            <h3 style="margin:0 0 12px;color:#1e293b;font-size:16px;font-weight:600;">Attachments</h3>
            <ul style="margin:0 0 24px;padding:0;list-style-type:none;color:#2563eb;font-size:14px;line-height:1.8;">
              <li>• Job Description (Check Dashboard)</li>
            </ul>

            <p style="margin:0;color:#1e293b;font-size:15px;font-weight:600;">Best Wishes,</p>
            <p style="margin:4px 0 0;color:#1e293b;font-size:15px;font-weight:600;">Placement Team</p>
            <p style="margin:0;color:#64748b;font-size:15px;">Vtricks Technologies</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Empowering Careers Through Technology & Innovation</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Vtricks Technologies. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function passwordChangedEmail(name: string): EmailOptions {
  return {
    to: '',
    subject: 'Your Vtricks LMS password has been changed',
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
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks LMS" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Learning Management System</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:600;">Password Changed Successfully</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Hi ${name}, your password has been successfully updated by an administrator. You can now use your new password to log in.</p>
            <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">If you did not authorize this change, please contact your administrator immediately.</p>
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

/** Sent when fee admin approves a student/intern signup */
export function accountApprovedWelcomeEmail(opts: {
  name: string;
  programName?: string | null;
  portal: 'student' | 'intern';
  loginUrl: string;
  resetPasswordUrl: string;
  resetExpiresHours?: number;
  forgotPasswordUrl?: string;
}): EmailOptions {
  const portalLabel = opts.portal === 'intern' ? 'Intern Portal' : 'Student Portal';
  const hours = opts.resetExpiresHours ?? 48;
  const forgotUrl = opts.forgotPasswordUrl
    ?? ((process.env.CLIENT_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '') + '/forgot-password');
  const programLine = opts.programName
    ? `<p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">You have been enrolled in <strong>${opts.programName}</strong>.</p>`
    : '';
  return {
    to: '',
    subject: 'Welcome to Vtricks LMS — your account is approved',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
            <img src="https://files.catbox.moe/46tvc4.png" alt="Vtricks LMS" style="height: 48px; width: auto; margin-bottom: 8px;" />
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Learning Management System</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:600;">Your account is approved!</h2>
            <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">Hi ${opts.name}, welcome to Vtricks LMS. Your registration has been approved and you can now access the <strong>${portalLabel}</strong>.</p>
            ${programLine}
            <p style="margin:0 0 8px;color:#64748b;font-size:15px;line-height:1.6;">You can sign in with the email and password from registration, or set a new password using the button below.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:16px 0 8px;">
                <a href="${opts.resetPasswordUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#059669,#047857);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">
                  Set / Change Password
                </a>
              </td></tr>
              <tr><td align="center" style="padding:8px 0 24px;">
                <a href="${opts.loginUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
                  Open LMS Login
                </a>
              </td></tr>
            </table>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
              The password link expires in <strong>${hours} hours</strong> and works once.
              After that, use <a href="${forgotUrl}" style="color:#2563eb;">Forgot password</a> on the login page.
            </p>
          </td>
        </tr>
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

export function internTaskAssignedEmail(
  internName: string,
  taskTitle: string,
  dueDate: string,
  programName: string,
): EmailOptions {
  return {
    to: '',
    subject: `New Internship Task: ${taskTitle}`,
    html: `<p>Hi ${internName},</p><p>A new task <strong>${taskTitle}</strong> has been assigned in <strong>${programName}</strong>.</p><p>Due date: ${dueDate}</p><p>Please log in to your intern portal to get started.</p><p>— Vtricks Technologies</p>`,
  };
}

export function internTaskEvaluatedEmail(
  internName: string,
  taskTitle: string,
  score: number,
  maxScore: number,
  feedback: string,
): EmailOptions {
  return {
    to: '',
    subject: `Task Evaluated: ${taskTitle}`,
    html: `<p>Hi ${internName},</p><p>Your task <strong>${taskTitle}</strong> has been evaluated.</p><p>Score: ${score}/${maxScore}</p><p>Feedback: ${feedback}</p><p>— Vtricks Technologies</p>`,
  };
}

export function internshipCompletedEmail(
  internName: string,
  programName: string,
): EmailOptions {
  return {
    to: '',
    subject: 'Internship Completed',
    html: `<p>Hi ${internName},</p><p>Congratulations! You have completed the internship program <strong>${programName}</strong>.</p><p>— Vtricks Technologies</p>`,
  };
}
