import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { readJsonFileSafe, writeJsonFileSafe } from './retentionEngine';

interface AdminAuthStore {
  salt: string;
  hash: string;
  claimedAt: string;
}

export class AdminAuthService {
  private readonly authFile: string;
  private readonly tokenSecret: string;

  constructor(dataDir: string, tokenSecret: string) {
    this.authFile = path.join(dataDir, 'admin-auth.json');
    this.tokenSecret = tokenSecret;
  }

  private getEnvPasscode(): string {
    return (process.env.ADMIN_PASSCODE || '').trim();
  }

  getStatus(): {
    configuredViaEnv: boolean;
    needsInitialClaim: boolean;
  } {
    const envCode = this.getEnvPasscode();
    if (envCode.length > 0) {
      return { configuredViaEnv: true, needsInitialClaim: false };
    }
    const stored = readJsonFileSafe<AdminAuthStore | null>(this.authFile, null);
    return {
      configuredViaEnv: false,
      needsInitialClaim: !stored?.hash,
    };
  }

  claimFirstRunPasscode(passcode: string): { ok: boolean; error?: string; token?: string } {
    const clean = (passcode || '').trim();
    if (clean.length < 6) {
      return { ok: false, error: 'Le code administrateur doit contenir au moins 6 caractères.' };
    }
    if (this.getEnvPasscode().length > 0) {
      return {
        ok: false,
        error: 'Un code administrateur est déjà défini via ADMIN_PASSCODE sur le serveur.',
      };
    }
    const existing = readJsonFileSafe<AdminAuthStore | null>(this.authFile, null);
    if (existing?.hash) {
      return { ok: false, error: 'Le code administrateur a déjà été initialisé.' };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(clean, salt, 64).toString('hex');
    writeJsonFileSafe(this.authFile, {
      salt,
      hash,
      claimedAt: new Date().toISOString(),
    });
    return { ok: true, token: this.issueAdminToken() };
  }

  verifyPasscode(passcode: string): boolean {
    const clean = (passcode || '').trim();
    if (!clean) return false;
    const envCode = this.getEnvPasscode();
    if (envCode.length > 0) {
      const a = crypto.createHash('sha256').update(clean).digest();
      const b = crypto.createHash('sha256').update(envCode).digest();
      return crypto.timingSafeEqual(a, b);
    }
    const stored = readJsonFileSafe<AdminAuthStore | null>(this.authFile, null);
    if (!stored?.salt || !stored?.hash) return false;
    try {
      const derived = crypto.scryptSync(clean, stored.salt, 64);
      const expected = Buffer.from(stored.hash, 'hex');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  issueAdminToken(): string {
    const exp = Date.now() + 2 * 60 * 60 * 1000;
    const body = `admin:${exp}`;
    const sig = crypto.createHmac('sha256', this.tokenSecret).update(body).digest('hex');
    return `${exp}.${sig}`;
  }

  verifyAdminToken(token: string | undefined): boolean {
    if (!token || !token.includes('.')) return false;
    const [expStr, sig] = token.split('.');
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const body = `admin:${exp}`;
    const expectedSig = crypto.createHmac('sha256', this.tokenSecret).update(body).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
    } catch {
      return false;
    }
  }
}

export function isStripeConfigured(env: Record<string, string | undefined> = process.env): {
  configured: boolean;
  missingVars: string[];
} {
  const missingVars: string[] = [];
  if (!(env.STRIPE_SECRET_KEY || '').trim()) missingVars.push('STRIPE_SECRET_KEY');
  if (!(env.STRIPE_WEBHOOK_SECRET || '').trim()) missingVars.push('STRIPE_WEBHOOK_SECRET');
  return {
    configured: missingVars.length === 0,
    missingVars,
  };
}

export function verifyStripeWebhookSignature(
  rawBody: Buffer | string,
  sigHeader: string | undefined,
  webhookSecret: string,
  toleranceSeconds = 300,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!sigHeader || !webhookSecret) return false;
  const parts = sigHeader.split(',').map((p) => p.trim());
  let timestamp = 0;
  const v1Signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = Number(v);
    if (k === 'v1' && v) v1Signatures.push(v);
  }
  if (!timestamp || v1Signatures.length === 0) return false;
  if (Math.abs(nowSec - timestamp) > toleranceSeconds) return false;

  const payloadText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const signedPayload = `${timestamp}.${payloadText}`;
  const expectedHex = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  for (const sigHex of v1Signatures) {
    try {
      const sigBuf = Buffer.from(sigHex, 'hex');
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return true;
      }
    } catch {
      // Ignore malformed signature string
    }
  }
  return false;
}

export async function createStripeCheckoutSession(params: {
  secretKey: string;
  amountCents: number;
  currency: 'eur';
  productName: string;
  productDescription: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', params.successUrl);
  form.set('cancel_url', params.cancelUrl);
  form.set('line_items[0][price_data][currency]', params.currency);
  form.set('line_items[0][price_data][unit_amount]', String(params.amountCents));
  form.set('line_items[0][price_data][product_data][name]', params.productName);
  form.set('line_items[0][price_data][product_data][description]', params.productDescription);
  form.set('line_items[0][quantity]', '1');
  for (const [k, v] of Object.entries(params.metadata)) {
    form.set(`metadata[${k}]`, v);
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const data = (await res.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id || !data.url) {
    throw new Error(data.error?.message || 'Impossible de créer la session Stripe Checkout.');
  }
  return { id: data.id, url: data.url };
}

export async function retrieveStripeCheckoutSession(params: {
  secretKey: string;
  sessionId: string;
}): Promise<{
  id: string;
  paymentStatus: string;
  metadata: Record<string, string>;
}> {
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(params.sessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${params.secretKey}`,
      },
    }
  );
  const data = (await res.json()) as {
    id?: string;
    payment_status?: string;
    metadata?: Record<string, string>;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || 'Session Stripe introuvable.');
  }
  return {
    id: data.id,
    paymentStatus: data.payment_status || 'unpaid',
    metadata: data.metadata || {},
  };
}

export function getConfiguredEmailTransport(
  env: Record<string, string | undefined> = process.env
): 'resend' | 'smtp' | 'none' {
  if ((env.RESEND_API_KEY || '').trim()) return 'resend';
  if ((env.SMTP_HOST || '').trim() && (env.SMTP_USER || '').trim() && (env.SMTP_PASS || '').trim()) {
    return 'smtp';
  }
  return 'none';
}

export async function sendTransactionalEmail(params: {
  email: string;
  subject: string;
  textBody: string;
}): Promise<void> {
  const transport = getConfiguredEmailTransport();
  const from = (process.env.MAIL_FROM || 'SparkQR <no-reply@sparkqr.app>').trim();

  if (transport === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(process.env.RESEND_API_KEY || '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.email],
        subject: params.subject,
        text: params.textBody,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Erreur Resend (${res.status}): ${txt}`);
    }
    return;
  }

  if (transport === 'smtp') {
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from,
      to: params.email,
      subject: params.subject,
      text: params.textBody,
    });
    return;
  }

  throw new Error(
    'Aucun service d’envoi d’e-mails configuré (RESEND_API_KEY ou SMTP_HOST/SMTP_USER/SMTP_PASS).'
  );
}

export function verifyCronSecretHeader(
  authHeader: string | undefined,
  cronSecretHeader: string | undefined,
  expectedSecret: string
): boolean {
  const cleanExpected = expectedSecret.trim();
  if (!cleanExpected) return false;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const candidate = (cronSecretHeader || bearer || '').trim();
  if (!candidate) return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(cleanExpected).digest();
  return crypto.timingSafeEqual(a, b);
}
