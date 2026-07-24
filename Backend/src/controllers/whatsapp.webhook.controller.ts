import { Request, Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/User';
import { WhatsAppMessage } from '../models/WhatsAppMessage';
import { sendWhatsAppText } from '../lib/whatsapp';

function getVerifyToken(): string {
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!token && process.env.NODE_ENV === 'production') {
    throw new Error('WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured');
  }
  return token || 'dev_whatsapp_verify_only';
}

function verifyPostSignature(req: Request): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Allow in dev when secret not configured
    return process.env.NODE_ENV !== 'production';
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature?.startsWith('sha256=')) return false;

  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// GET — Meta verification handshake
export function verifyWebhook(req: Request, res: Response): void {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  try {
    if (mode === 'subscribe' && token === getVerifyToken()) {
      console.log('[whatsapp-webhook] Verified');
      res.status(200).send(challenge);
      return;
    }
  } catch (err) {
    console.error('[whatsapp-webhook] Verify token error:', err);
  }
  res.sendStatus(403);
}

const KEYWORD_REPLIES: Array<{ patterns: RegExp; reply: string }> = [
  {
    patterns: /\b(hi|hello|hey|start|hlo|namaste)\b/i,
    reply:
      `👋 Hello! Welcome to *Vtricks Technologies LMS*.\n\nYou can ask us about:\n` +
      `• *fees* — Fee details & payment info\n` +
      `• *schedule* — Class timings & batch schedule\n` +
      `• *certificate* — Certification process\n` +
      `• *help* — Full menu\n\nType any keyword to get started!`,
  },
  {
    patterns: /\b(fee|fees|payment|pay|cost|price|pricing|amount)\b/i,
    reply:
      `💰 *Fee & Payment Info*\n\n` +
      `To check your fee balance or make a payment, please log in to the LMS portal or contact your batch coordinator.\n\n` +
      `For payment queries, reach us at: ${process.env.SMTP_FROM_EMAIL ?? 'support@vtricks.in'}`,
  },
  {
    patterns: /\b(schedule|class|timing|timings|time|batch|timetable|calendar)\b/i,
    reply:
      `📅 *Class Schedule*\n\n` +
      `Your class schedule is available on the LMS portal under *My Batches*.\n\n` +
      `Log in at: ${process.env.CLIENT_URL ?? 'http://localhost:5173'}\n\n` +
      `Can't access? Contact your trainer or coordinator.`,
  },
  {
    patterns: /\b(certificate|cert|certification|degree|completion)\b/i,
    reply:
      `🏆 *Certificates*\n\n` +
      `Certificates are issued after:\n` +
      `✅ Completing all modules\n` +
      `✅ Passing the final assessment\n` +
      `✅ Attendance ≥ 75%\n\n` +
      `Check your progress on the LMS portal.`,
  },
  {
    patterns: /\b(help|menu|options|support|assist)\b/i,
    reply:
      `🆘 *Help Menu*\n\n` +
      `Reply with a keyword:\n` +
      `• *fees* — Fee & payment info\n` +
      `• *schedule* — Class timings\n` +
      `• *certificate* — Certification info\n` +
      `• *portal* — LMS portal link\n\n` +
      `For urgent support, email: ${process.env.SMTP_FROM_EMAIL ?? 'support@vtricks.in'}`,
  },
  {
    patterns: /\b(portal|login|link|website|site|url)\b/i,
    reply:
      `🔗 *LMS Portal*\n\n` +
      `Access your LMS here:\n${process.env.CLIENT_URL ?? 'http://localhost:5173'}\n\n` +
      `Use your registered email and password to log in.`,
  },
];

const DEFAULT_REPLY =
  `Thank you for reaching out to *Vtricks Technologies*! 🙏\n\n` +
  `We've received your message and will get back to you soon.\n\n` +
  `Type *help* to see available options.`;

async function handleInboundMessage(from: string, type: string, text: string, waMessageId: string) {
  // Match learner phones stored as 10-digit, +91..., or 91...
  const last10 = from.replace(/\D/g, '').slice(-10);
  const phoneVariants = Array.from(
    new Set(
      [
        from,
        last10,
        `91${last10}`,
        `+91${last10}`,
        `+${from}`,
        from.startsWith('91') ? from.slice(2) : null,
      ].filter(Boolean) as string[],
    ),
  );

  let user: User | null = null;
  try {
    const { Op } = await import('sequelize');
    user = await User.findOne({ where: { phoneNumber: { [Op.in]: phoneVariants } } });
  } catch (err) {
    console.error('[whatsapp-webhook] User lookup failed:', err);
  }

  await WhatsAppMessage.create({
    fromPhone: from,
    userId: user?.id ?? null,
    direction: 'INBOUND',
    messageType: type,
    content: text || null,
    waMessageId,
  }).catch((err) => console.error('[whatsapp-webhook] DB store error:', err));

  if (type !== 'text' || !text.trim()) return;

  const matched = KEYWORD_REPLIES.find(({ patterns }) => patterns.test(text));
  const reply = matched?.reply ?? DEFAULT_REPLY;

  await sendWhatsAppText(from, reply);

  await WhatsAppMessage.create({
    fromPhone: from,
    userId: user?.id ?? null,
    direction: 'OUTBOUND',
    messageType: 'text',
    content: reply,
    waMessageId: null,
  }).catch((err) => console.error('[whatsapp-webhook] DB store outbound error:', err));
}

// POST — incoming messages from WhatsApp
export function receiveWebhook(req: Request, res: Response): void {
  if (!verifyPostSignature(req)) {
    res.sendStatus(401);
    return;
  }

  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    res.sendStatus(404);
    return;
  }

  res.sendStatus(200);

  try {
    const entries: any[] = body.entry ?? [];
    for (const entry of entries) {
      const changes: any[] = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value;
        const messages: any[] = value?.messages ?? [];
        for (const msg of messages) {
          const from       = msg.from as string;
          const type       = msg.type as string;
          const text       = (msg.text?.body as string) ?? '';
          const waId       = msg.id as string;
          console.log(`[whatsapp-webhook] From ${from} [${type}]: ${text}`);
          handleInboundMessage(from, type, text, waId).catch((err) =>
            console.error('[whatsapp-webhook] Handler error:', err),
          );
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] Processing error:', err);
  }
}
