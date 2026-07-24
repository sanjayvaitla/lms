import axios from 'axios';

const BASE_URL = 'https://graph.facebook.com/v25.0';

export interface WaTemplateMessage {
  to: string;
  templateName: string;
  languageCode?: string;
  fallbackText?: string;
  components?: Array<{
    type: string;
    parameters: Array<{ type: string; text: string }>;
  }>;
}

const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

export function isWhatsAppConfigured(): boolean {
  return !!(accessToken && phoneNumberId);
}

/**
 * Normalize to WhatsApp Cloud API format (digits only, India → 91xxxxxxxxxx).
 * Accepts: 9876543210, +91 98765 43210, 919876543210, 09876543210
 */
export function normalizePhone(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Strip leading trunk 0 (09876543210 → 9876543210)
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** Last 10 digits — useful for matching variously-stored DB phones */
export function phoneLast10(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * Meta rejects empty / newline-heavy template body params (error 131009).
 */
export function sanitizeWaParam(value: string | null | undefined, fallback = '-'): string {
  const cleaned = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Max practical length for body params
  const clipped = cleaned.slice(0, 200);
  return clipped.length ? clipped : fallback;
}

function extractWaError(err: unknown): { code?: number; message: string; detail: unknown } {
  const anyErr = err as { response?: { data?: { error?: { code?: number; message?: string } } }; message?: string };
  const apiErr = anyErr?.response?.data?.error;
  return {
    code: apiErr?.code,
    message: apiErr?.message ?? anyErr?.message ?? 'Unknown WhatsApp error',
    detail: anyErr?.response?.data?.error ?? anyErr?.message,
  };
}

export async function sendWhatsAppTemplate(msg: WaTemplateMessage): Promise<void> {
  if (!isWhatsAppConfigured()) {
    console.log(`[whatsapp] Not configured — skipping "${msg.templateName}" to ${msg.to}`);
    return;
  }

  // Sanitize body parameters before send
  const components = (msg.components ?? []).map((c) => ({
    ...c,
    parameters: (c.parameters ?? []).map((p) =>
      p.type === 'text' ? { ...p, text: sanitizeWaParam(p.text) } : p,
    ),
  }));

  try {
    await axios.post(
      `${BASE_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: msg.to,
        type: 'template',
        template: {
          name: msg.templateName,
          language: { code: msg.languageCode ?? 'en' },
          components,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );
    console.log(`[whatsapp] ✓ Sent "${msg.templateName}" to ...${msg.to.slice(-4)}`);
  } catch (err: unknown) {
    const { code, detail } = extractWaError(err);
    // Template missing / not approved / paused → try free-form text (only works in 24h window)
    if ((code === 132001 || code === 132000 || code === 132005) && msg.fallbackText) {
      console.warn(
        `[whatsapp] Template "${msg.templateName}" unavailable (code ${code}), trying text fallback`,
      );
      await sendWhatsAppText(msg.to, msg.fallbackText);
      return;
    }
    console.error(`[whatsapp] ✗ Failed "${msg.templateName}" to ...${msg.to.slice(-4)}:`, detail);
  }
}

export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  const text = sanitizeWaParam(body, 'Notification from Vtricks LMS');
  try {
    await axios.post(
      `${BASE_URL}/${phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      },
    );
    console.log(`[whatsapp] ✓ Text sent to ...${to.slice(-4)}`);
  } catch (err: unknown) {
    const { code, detail } = extractWaError(err);
    // 131047 = outside 24h customer-care window — expected for cold outreach without a template
    if (code === 131047) {
      console.warn(
        `[whatsapp] Text blocked for ...${to.slice(-4)} (outside 24h window). Use an approved template for proactive messages.`,
      );
      return;
    }
    console.error(`[whatsapp] ✗ Text failed to ...${to.slice(-4)}:`, detail);
  }
}
