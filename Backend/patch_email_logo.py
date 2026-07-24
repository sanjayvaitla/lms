import re
import sys

try:
    with open('src/lib/email.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add path import
    content = content.replace("import nodemailer, { Transporter } from 'nodemailer';", "import nodemailer, { Transporter } from 'nodemailer';\nimport path from 'path';")

    # Update sendEmail function
    old_send = """export async function sendEmail(opts: EmailOptions): Promise<void> {
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
    attachments: opts.attachments,
  });"""
    new_send = """export async function sendEmail(opts: EmailOptions): Promise<void> {
  const logoAttachment = {
    filename: 'logo.png',
    path: path.join(__dirname, '../assets/logo.png'),
    cid: 'vtricks-logo'
  };
  const finalAttachments = opts.attachments ? [...opts.attachments, logoAttachment] : [logoAttachment];

  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
    attachments: finalAttachments,
  });"""
    content = content.replace(old_send, new_send)

    # Replace <h1> tags with logo image
    # Note: \g<1> retains the "LMS" or "Technologies" if needed, but we'll just put the text in the alt.
    content = re.sub(r'<h1[^>]*>Vtricks (LMS|Technologies)</h1>', r'<img src="cid:vtricks-logo" alt="Vtricks \1" style="height: 48px; width: auto; margin-bottom: 8px;" />', content)

    with open('src/lib/email.ts', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Patch applied successfully")
except Exception as e:
    print("Error:", e)
    sys.exit(1)
