import crypto from 'crypto';
import path from 'path';
import nodemailer from 'nodemailer';
import { readJsonFileSafe, writeJsonFileSafe } from './retentionEngine.ts';

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
