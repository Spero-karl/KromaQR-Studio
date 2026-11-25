import path from 'path';
import type { QrIntent } from '../types/qr';
import { readJsonFileAtomic, withDataDirLock, writeJsonFileAtomic } from './jsonStore';
import type { S3StateBackupService } from './s3StateBackup';
import { sanitizeJsonObject } from './securityGuard';
import { buildSocialPayload } from '../utils/qrLogic';

export const ALLOWED_EXAMPLE_INTENTS: readonly QrIntent[] = [
  'url',
  'text',
  'wifi',
  'vcard',
  'event',
  'email',
  'phone',
  'sms',
  'whatsapp',
  'tiktok',
  'instagram',
  'facebook',
  'telegram',
  'twitter',
  'geo',
  'payment',
  'image',
  'video',
  'document',
  'audio',
] as const;

export const MAX_DAILY_AI_REQUESTS = 10;
export const MAX_DAILY_AI_TOKENS = 4000;
const PER_REQUEST_MAX_TOKENS = 220;

interface DailyQuotaState {
  dateUtc: string;
  requestsUsed: number;
  tokensUsed: number;
}

export interface GeneratedExampleResult {
  ok: true;
  intent: QrIntent;
  sample: Record<string, string>;
  source: 'smart' | 'fallback';
  remainingToday: number;
  limitReached: boolean;
}

export interface RadoxExamplesOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  maxDailyRequests?: number;
  maxDailyTokens?: number;
}

const LOCAL_CURATED_POOLS: Record<QrIntent, Array<Record<string, string>>> = {
  url: [
    { urlValue: 'https://galerie-travers.fr/formes-geometriques' },
    { urlValue: 'https://atelier-lumiere.paris/programme-2026' },
    { urlValue: 'https://maison-orfevre.fr/collection-automne' },
  ],
  text: [
    { textValue: 'Invitation privée — Exposition Formes Géométriques, Paris 2026.' },
    { textValue: 'Bienvenue à notre conférence annuelle. Salle Horizon, accueil dès 9h30.' },
    { textValue: 'Code privilège invité : ATELIER-2026 · Valable jusqu’au 30 juin.' },
  ],
  wifi: [
    { wifiSsid: 'Galerie_Travers_5G', wifiPassword: 'sculpture2026', wifiSecurity: 'WPA' },
    { wifiSsid: 'Atelier_Invite_WiFi', wifiPassword: 'lumiereParis2026', wifiSecurity: 'WPA' },
  ],
  vcard: [
    {
      vcardFirstName: 'Camille',
      vcardLastName: 'Laurent',
      vcardOrg: 'Atelier Travers Studio',
      vcardTitle: 'Directrice Artistique',
      vcardPhone: '+33 1 42 68 55 10',
      vcardEmail: 'bonjour@atelier-travers.fr',
      vcardWebsite: 'https://atelier-travers.fr',
      vcardAddress: '14 Rue de Turenne, 75004 Paris',
    },
    {
      vcardFirstName: 'Lucas',
      vcardLastName: 'Mercier',
      vcardOrg: 'Studio Méridien',
      vcardTitle: 'Architecte Designer',
      vcardPhone: '+33 6 45 78 90 12',
      vcardEmail: 'lucas@studio-meridien.fr',
      vcardWebsite: 'https://studio-meridien.fr',
      vcardAddress: '28 Cours Julien, 13006 Marseille',
    },
  ],
  event: [
    {
      eventTitle: 'Vernissage Exposition Lumière',
      eventStart: '2026-06-18T19:30',
      eventEnd: '2026-06-18T22:30',
      eventLocation: 'Palais de Tokyo — Salle 4, Paris',
      eventDescription: 'Présentation privée et cocktail d’ouverture.',
    },
    {
      eventTitle: 'Rencontre Design & Architecture',
      eventStart: '2026-09-22T18:00',
      eventEnd: '2026-09-22T21:00',
      eventLocation: 'Fondation Confluence, Lyon',
      eventDescription: 'Table ronde et visite guidée de la galerie.',
    },
  ],
  email: [
    {
      emailAddress: 'contact@atelier-travers.fr',
      emailSubject: 'Demande d’informations',
      emailBody: 'Bonjour, je souhaite en savoir plus suite au scan de votre QR code.',
    },
  ],
  phone: [{ phoneNumber: '+33 1 42 68 55 10' }, { phoneNumber: '+33 6 12 34 56 78' }],
  sms: [
    { smsPhone: '+33 6 12 34 56 78', smsMessage: 'Bonjour, je confirme ma venue !' },
  ],
  whatsapp: [
    {
      whatsappPhone: '+33 6 12 34 56 78',
      whatsappMessage: 'Bonjour ! Je vous contacte depuis votre QR SparkQR.',
    },
  ],
  tiktok: [{ tiktokHandle: '@atelier.travers' }, { tiktokHandle: '@studio.lumiere' }],
  instagram: [{ instagramHandle: '@atelier.travers' }, { instagramHandle: '@maison.horizons' }],
  facebook: [{ facebookHandle: 'atelier.travers.paris' }, { facebookHandle: 'galerie.lumiere' }],
  telegram: [{ telegramHandle: '@atelier_travers' }, { telegramHandle: '@canal_atelier' }],
  twitter: [{ twitterHandle: '@ateliertravers' }, { twitterHandle: '@studiolumi' }],
  geo: [
    { geoLat: '48.864716', geoLng: '2.297461', geoLabel: 'Palais de Tokyo, Paris' },
    { geoLat: '45.746368', geoLng: '4.819532', geoLabel: 'Musée des Confluences, Lyon' },
  ],
  payment: [
    {
      paymentMode: 'sepa',
      paymentName: 'Atelier Travers SAS',
      paymentIban: 'FR7630006000011234567890189',
      paymentBic: 'AGRIFRPPXXX',
      paymentAmount: '45.00',
      paymentReference: 'FACTURE-2026-042',
      paymentUrl: 'https://paiement.atelier-travers.fr/reglement',
    },
  ],
  image: [{ headline: 'Exposition Formes Géométriques' }],
  video: [{ headline: 'Teaser Atelier Lumière' }],
  document: [{ headline: 'Catalogue Officiel 2026' }],
  audio: [{ headline: 'Guide Audio Exposition' }],
};

function cleanStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

function isDangerousString(val: string): boolean {
  return /(?:javascript:|vbscript:|data:text\/html|<script|onerror=|onload=)/i.test(val);
}

function getTodayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function pickLocalFallback(intent: QrIntent): Record<string, string> {
  const pool = LOCAL_CURATED_POOLS[intent] || LOCAL_CURATED_POOLS.url;
  const idx = Math.floor(Math.random() * pool.length);
  return { ...pool[idx] };
}

function buildIntentInstruction(intent: QrIntent): string {
  switch (intent) {
    case 'url':
      return 'JSON object with {"urlValue":"https://..."} (realistic French public HTTPS URL, no localhost/credentials).';
    case 'text':
      return 'JSON object with {"textValue":"..."} (short realistic French invitation or info message, max 140 chars).';
    case 'wifi':
      return 'JSON object with {"wifiSsid":"...","wifiPassword":"...","wifiSecurity":"WPA"} (password 10+ chars).';
    case 'vcard':
      return 'JSON object with {"vcardFirstName","vcardLastName","vcardOrg","vcardTitle","vcardPhone","vcardEmail","vcardWebsite","vcardAddress"} (fictional French professional contact).';
    case 'event':
      return 'JSON object with {"eventTitle","eventStart":"YYYY-MM-DDTHH:MM","eventEnd":"YYYY-MM-DDTHH:MM","eventLocation","eventDescription"}.';
    case 'email':
      return 'JSON object with {"emailAddress","emailSubject","emailBody"}.';
    case 'phone':
      return 'JSON object with {"phoneNumber":"+33 ..."}.';
    case 'sms':
      return 'JSON object with {"smsPhone":"+33 ...","smsMessage":"..."}.';
    case 'whatsapp':
      return 'JSON object with {"whatsappPhone":"+33 ...","whatsappMessage":"..."}.';
    case 'tiktok':
      return 'JSON object with {"tiktokHandle":"@identifiant"} (valid ASCII handle 4-20 chars).';
    case 'instagram':
      return 'JSON object with {"instagramHandle":"@identifiant"} (valid ASCII handle).';
    case 'facebook':
      return 'JSON object with {"facebookHandle":"nom.de.page"} (valid ASCII page slug 6-30 chars).';
    case 'telegram':
      return 'JSON object with {"telegramHandle":"@identifiant"} (starts with letter, 5-24 chars).';
    case 'twitter':
      return 'JSON object with {"twitterHandle":"@identifiant"} (max 15 chars after @).';
    case 'geo':
      return 'JSON object with {"geoLat":"48.85...","geoLng":"2.35...","geoLabel":"Lieu, Ville"}.';
    case 'payment':
      return 'JSON object with {"paymentMode":"sepa","paymentName":"...","paymentIban":"FR7630006000011234567890189","paymentBic":"AGRIFRPPXXX","paymentAmount":"35.00","paymentReference":"REF-2026"}.';
    default:
      return 'JSON object with {"headline":"Titre court en français"}.';
  }
}

export function sanitizeGeneratedSample(
  intent: QrIntent,
  rawObj: unknown
): Record<string, string> | null {
  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) {
    return null;
  }
  const obj = sanitizeJsonObject(rawObj as Record<string, unknown>);

  switch (intent) {
    case 'url': {
      const u = cleanStr(obj.urlValue, 220);
      if (!u || isDangerousString(u)) return null;
      try {
        const parsed = new URL(u.startsWith('http') ? u : `https://${u}`);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
        return { urlValue: parsed.toString() };
      } catch {
        return null;
      }
    }
    case 'text': {
      const t = cleanStr(obj.textValue, 240);
      if (!t || isDangerousString(t)) return null;
      return { textValue: t };
    }
    case 'wifi': {
      const ssid = cleanStr(obj.wifiSsid, 32);
      const pass = cleanStr(obj.wifiPassword, 63);
      if (!ssid || pass.length < 8) return null;
      return { wifiSsid: ssid, wifiPassword: pass, wifiSecurity: 'WPA' };
    }
    case 'vcard': {
      const first = cleanStr(obj.vcardFirstName, 40);
      const last = cleanStr(obj.vcardLastName, 40);
      const org = cleanStr(obj.vcardOrg, 60);
      const title = cleanStr(obj.vcardTitle, 60);
      const phone = cleanStr(obj.vcardPhone, 24);
      const email = cleanStr(obj.vcardEmail, 80);
      const website = cleanStr(obj.vcardWebsite, 120);
      const address = cleanStr(obj.vcardAddress, 120);
      if (!first && !last) return null;
      if (!phone && !email) return null;
      return {
        vcardFirstName: first,
        vcardLastName: last,
        vcardOrg: org,
        vcardTitle: title,
        vcardPhone: phone,
        vcardEmail: email,
        vcardWebsite: website.startsWith('https://') ? website : '',
        vcardAddress: address,
      };
    }
    case 'event': {
      const eventTitle = cleanStr(obj.eventTitle, 80);
      const eventStart = cleanStr(obj.eventStart, 24);
      const eventEnd = cleanStr(obj.eventEnd, 24) || eventStart;
      const eventLocation = cleanStr(obj.eventLocation, 100);
      const eventDescription = cleanStr(obj.eventDescription, 180);
      if (!eventTitle || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(eventStart)) return null;
      return { eventTitle, eventStart, eventEnd, eventLocation, eventDescription };
    }
    case 'email': {
      const emailAddress = cleanStr(obj.emailAddress, 90);
      const emailSubject = cleanStr(obj.emailSubject, 90);
      const emailBody = cleanStr(obj.emailBody, 200);
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(emailAddress)) return null;
      return { emailAddress, emailSubject, emailBody };
    }
    case 'phone': {
      const phoneNumber = cleanStr(obj.phoneNumber, 24);
      if (phoneNumber.replace(/\D/g, '').length < 6) return null;
      return { phoneNumber };
    }
    case 'sms': {
      const smsPhone = cleanStr(obj.smsPhone, 24);
      const smsMessage = cleanStr(obj.smsMessage, 140);
      if (smsPhone.replace(/\D/g, '').length < 6 || !smsMessage) return null;
      return { smsPhone, smsMessage };
    }
    case 'whatsapp': {
      const whatsappPhone = cleanStr(obj.whatsappPhone, 24);
      const whatsappMessage = cleanStr(obj.whatsappMessage, 140);
      if (whatsappPhone.replace(/\D/g, '').length < 7 || !whatsappMessage) return null;
      return { whatsappPhone, whatsappMessage };
    }
    case 'tiktok': {
      const check = buildSocialPayload(cleanStr(obj.tiktokHandle, 60), 'tiktok');
      if (!check.valid || !check.normalizedHandle) return null;
      return { tiktokHandle: `@${check.normalizedHandle}` };
    }
    case 'instagram': {
      const check = buildSocialPayload(cleanStr(obj.instagramHandle, 60), 'instagram');
      if (!check.valid || !check.normalizedHandle) return null;
      return { instagramHandle: `@${check.normalizedHandle}` };
    }
    case 'facebook': {
      const check = buildSocialPayload(cleanStr(obj.facebookHandle, 60), 'facebook');
      if (!check.valid || !check.normalizedHandle) return null;
      return { facebookHandle: check.normalizedHandle };
    }
    case 'telegram': {
      const check = buildSocialPayload(cleanStr(obj.telegramHandle, 60), 'telegram');
      if (!check.valid || !check.normalizedHandle) return null;
      return { telegramHandle: `@${check.normalizedHandle}` };
    }
    case 'twitter': {
      const check = buildSocialPayload(cleanStr(obj.twitterHandle, 60), 'twitter');
      if (!check.valid || !check.normalizedHandle) return null;
      return { twitterHandle: `@${check.normalizedHandle}` };
    }
    case 'geo': {
      const lat = Number(cleanStr(obj.geoLat, 20));
      const lng = Number(cleanStr(obj.geoLng, 20));
      const geoLabel = cleanStr(obj.geoLabel, 90);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return null;
      }
      return { geoLat: lat.toFixed(6), geoLng: lng.toFixed(6), geoLabel };
    }
    case 'payment': {
      const paymentName = cleanStr(obj.paymentName, 70);
      const paymentIban = cleanStr(obj.paymentIban, 34).replace(/\s+/g, '').toUpperCase();
      const paymentBic = cleanStr(obj.paymentBic, 11).replace(/\s+/g, '').toUpperCase();
      const paymentAmount = cleanStr(obj.paymentAmount, 12);
      const paymentReference = cleanStr(obj.paymentReference, 80);
      if (!paymentName || !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(paymentIban)) return null;
      return {
        paymentMode: 'sepa',
        paymentName,
        paymentIban,
        paymentBic,
        paymentAmount,
        paymentReference,
      };
    }
    default: {
      const headline = cleanStr(obj.headline, 64);
      if (!headline) return null;
      return { headline };
    }
  }
}

export class RadoxExamplesService {
  private readonly quotaFile: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly maxDailyRequests: number;
  private readonly maxDailyTokens: number;

  constructor(
    private readonly dataDir: string,
    private readonly stateBackup?: S3StateBackupService,
    options?: RadoxExamplesOptions
  ) {
    this.quotaFile = path.join(dataDir, 'ai-quota.json');
    this.apiKey = (options?.apiKey ?? process.env.RADOX_AI_API_KEY ?? '').trim();
    this.baseUrl = (options?.baseUrl ?? process.env.RADOX_AI_BASE_URL ?? 'https://radoxai.com/v1')
      .trim()
      .replace(/\/+$/, '');
    this.model = (options?.model ?? process.env.RADOX_AI_MODEL ?? 'gpt-4o-mini').trim();
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.now = options?.now ?? (() => new Date());
    this.maxDailyRequests = options?.maxDailyRequests ?? MAX_DAILY_AI_REQUESTS;
    this.maxDailyTokens = options?.maxDailyTokens ?? MAX_DAILY_AI_TOKENS;
  }

  private readQuotaUnlocked(): DailyQuotaState {
    const today = getTodayUtc(this.now());
    const stored = readJsonFileAtomic<Partial<DailyQuotaState>>(this.quotaFile, {});
    if (stored.dateUtc !== today) {
      return { dateUtc: today, requestsUsed: 0, tokensUsed: 0 };
    }
    return {
      dateUtc: today,
      requestsUsed: typeof stored.requestsUsed === 'number' && stored.requestsUsed >= 0 ? stored.requestsUsed : 0,
      tokensUsed: typeof stored.tokensUsed === 'number' && stored.tokensUsed >= 0 ? stored.tokensUsed : 0,
    };
  }

  private writeQuotaUnlocked(state: DailyQuotaState): void {
    writeJsonFileAtomic(this.quotaFile, state);
    this.stateBackup?.scheduleFileSync(this.quotaFile);
  }

  async generateExample(intent: QrIntent): Promise<GeneratedExampleResult> {
    if (!this.apiKey) {
      return {
        ok: true,
        intent,
        sample: pickLocalFallback(intent),
        source: 'fallback',
        remainingToday: 0,
        limitReached: false,
      };
    }

    const reservation = await withDataDirLock(this.dataDir, () => {
      const q = this.readQuotaUnlocked();
      if (q.requestsUsed >= this.maxDailyRequests || q.tokensUsed >= this.maxDailyTokens) {
        return {
          allowed: false as const,
          remainingToday: 0,
        };
      }
      q.requestsUsed += 1;
      this.writeQuotaUnlocked(q);
      return {
        allowed: true as const,
        remainingToday: Math.max(0, this.maxDailyRequests - q.requestsUsed),
      };
    });

    if (!reservation.allowed) {
      return {
        ok: true,
        intent,
        sample: pickLocalFallback(intent),
        source: 'fallback',
        remainingToday: 0,
        limitReached: true,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0.7,
          max_tokens: PER_REQUEST_MAX_TOKENS,
          messages: [
            {
              role: 'system',
              content:
                'Generate one clean, realistic fictional French QR sample. Return strictly one valid JSON object only, no markdown fences, no commentary.',
            },
            {
              role: 'user',
              content: `Format: ${intent}. ${buildIntentInstruction(intent)}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        return {
          ok: true,
          intent,
          sample: pickLocalFallback(intent),
          source: 'fallback',
          remainingToday: reservation.remainingToday,
          limitReached: reservation.remainingToday === 0,
        };
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      const tokensUsedThisCall =
        typeof payload?.usage?.total_tokens === 'number' && payload.usage.total_tokens > 0
          ? Math.min(2000, Math.round(payload.usage.total_tokens))
          : 180;

      const updatedRemaining = await withDataDirLock(this.dataDir, () => {
        const q = this.readQuotaUnlocked();
        q.tokensUsed += tokensUsedThisCall;
        this.writeQuotaUnlocked(q);
        return q.tokensUsed >= this.maxDailyTokens
          ? 0
          : Math.max(0, this.maxDailyRequests - q.requestsUsed);
      });

      const rawContent = payload?.choices?.[0]?.message?.content || '';
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          ok: true,
          intent,
          sample: pickLocalFallback(intent),
          source: 'fallback',
          remainingToday: updatedRemaining,
          limitReached: updatedRemaining === 0,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      const sanitized = sanitizeGeneratedSample(intent, parsed);
      if (!sanitized) {
        return {
          ok: true,
          intent,
          sample: pickLocalFallback(intent),
          source: 'fallback',
          remainingToday: updatedRemaining,
          limitReached: updatedRemaining === 0,
        };
      }

      return {
        ok: true,
        intent,
        sample: sanitized,
        source: 'smart',
        remainingToday: updatedRemaining,
        limitReached: updatedRemaining === 0,
      };
    } catch {
      return {
        ok: true,
        intent,
        sample: pickLocalFallback(intent),
        source: 'fallback',
        remainingToday: reservation.remainingToday,
        limitReached: reservation.remainingToday === 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
