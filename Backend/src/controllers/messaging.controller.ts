import { Request, Response } from 'express';
import { z } from 'zod';
import { sendMail } from '../services/email.service';

const sendEmailSchema = z.object({
  recipients: z.array(z.string().email()),
  subject: z.string().min(1, 'Subject is required'),
  htmlBody: z.string().min(1, 'Email body is required'),
});

export async function sendEmail(req: Request, res: Response) {
  const parsed = sendEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid input data',
      errors: parsed.error.format(),
    });
  }

  const { recipients, subject, htmlBody } = parsed.data;

  try {
    // Send individual emails
    await Promise.all(recipients.map(email => sendMail(email, subject, htmlBody)));
    res.json({ success: true, message: `Email sent to ${recipients.length} recipients successfully.` });
  } catch (error) {
    console.error('Error in sendEmail controller:', error);
    res.status(500).json({ success: false, message: 'Failed to send emails.' });
  }
}
