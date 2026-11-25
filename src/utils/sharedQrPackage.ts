import {
  DEFAULT_CONFIG,
  DEFAULT_EXPERIENCE,
  DEFAULT_SOURCE,
  THEME_PRESETS,
} from '../data/presets';
import type {
  PostScanExperience,
  ProjectCategory,
  QrConfig,
  QrSourceState,
  SavedQrItem,
} from '../types/qr';
import { normalizeConfigWithDefaults } from './historyReducer';

export interface SparkQrSharePackageV1 {
  format: 'sparkqr-share-v1';
  name: string;
  category: ProjectCategory;
  payload: string;
  config: QrConfig;
  source: QrSourceState;
  experience?: PostScanExperience;
  createdAt?: string;
}

const SHARE_PREFIX = 'SPARKQR1:';

function utf8ToBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToUtf8(b64Url: string): string {
  const padded = b64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export function isUnsafePayloadString(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  return (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('data:text/html')
  );
}

export function buildSourceFromPlainPayload(rawPayload: string): QrSourceState {
  const trimmed = rawPayload.trim();
  if (/^WIFI:/i.test(trimmed)) {
    const ssidMatch = trimmed.match(/S:([^;]*)/);
    const passMatch = trimmed.match(/P:([^;]*)/);
    const secMatch = trimmed.match(/T:(WPA|WEP|nopass)/i);
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'wifi',
      wifiSsid: ssidMatch ? ssidMatch[1].replace(/\\([\\;,:"])/g, '$1') : 'Wi-Fi',
      wifiPassword: passMatch ? passMatch[1].replace(/\\([\\;,:"])/g, '$1') : '',
      wifiSecurity: (secMatch?.[1]?.toUpperCase() as 'WPA' | 'WEP' | 'nopass') || 'WPA',
      useSourceImageAsLogo: false,
    };
  }
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    const fn = trimmed.match(/FN:([^\r\n]+)/i)?.[1]?.trim() || '';
    const nLine = trimmed.match(/\nN:([^\r\n]+)/i)?.[1] || '';
    const [last = '', first = ''] = nLine.split(';');
    const org = trimmed.match(/ORG:([^\r\n]+)/i)?.[1]?.trim() || '';
    const title = trimmed.match(/TITLE:([^\r\n]+)/i)?.[1]?.trim() || '';
    const tel = trimmed.match(/TEL[^:]*:([^\r\n]+)/i)?.[1]?.trim() || '';
    const email = trimmed.match(/EMAIL[^:]*:([^\r\n]+)/i)?.[1]?.trim() || '';
    const url = trimmed.match(/URL[^:]*:([^\r\n]+)/i)?.[1]?.trim() || '';
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'vcard',
      vcardFirstName: first.trim() || fn.split(' ')[0] || '',
      vcardLastName: last.trim() || fn.split(' ').slice(1).join(' ') || '',
      vcardOrg: org,
      vcardTitle: title,
      vcardPhone: tel,
      vcardEmail: email,
      vcardWebsite: url,
      useSourceImageAsLogo: false,
    };
  }
  if (/^BEGIN:VCALENDAR/i.test(trimmed)) {
    const summary = trimmed.match(/SUMMARY:([^\r\n]+)/i)?.[1]?.trim() || '';
    const location = trimmed.match(/LOCATION:([^\r\n]+)/i)?.[1]?.trim() || '';
    const description = trimmed.match(/DESCRIPTION:([^\r\n]+)/i)?.[1]?.replace(/\\n/g, '\n').trim() || '';
    const dtStart = trimmed.match(/DTSTART[^:]*:([^\r\n]+)/i)?.[1]?.trim() || '';
    const dtEnd = trimmed.match(/DTEND[^:]*:([^\r\n]+)/i)?.[1]?.trim() || '';
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'event',
      eventTitle: summary,
      eventStart: dtStart,
      eventEnd: dtEnd,
      eventLocation: location,
      eventDescription: description,
      useSourceImageAsLogo: false,
    };
  }
  if (/^mailto:/i.test(trimmed)) {
    const withoutScheme = trimmed.slice(7);
    const [addr, qs] = withoutScheme.split('?');
    const params = new URLSearchParams(qs || '');
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'email',
      emailAddress: decodeURIComponent(addr || ''),
      emailSubject: params.get('subject') || '',
      emailBody: params.get('body') || '',
      useSourceImageAsLogo: false,
    };
  }
  if (/^tel:/i.test(trimmed)) {
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'phone',
      phoneNumber: trimmed.slice(4).trim(),
      useSourceImageAsLogo: false,
    };
  }
  if (/^sms:/i.test(trimmed)) {
    const withoutScheme = trimmed.slice(4);
    const [phone, qs] = withoutScheme.split('?');
    const params = new URLSearchParams(qs || '');
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'sms',
      smsPhone: phone || '',
      smsMessage: params.get('body') || '',
      useSourceImageAsLogo: false,
    };
  }
  if (/^https:\/\/(?:www\.)?tiktok\.com\/@/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const handle = u.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '') || '';
      if (handle) {
        return {
          ...DEFAULT_SOURCE,
          type: 'text',
          textMode: 'tiktok',
          tiktokHandle: `@${handle}`,
          useSourceImageAsLogo: false,
        };
      }
    } catch {
      // Fall through to URL
    }
  }
  if (/^https:\/\/(?:www\.)?instagram\.com\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const handle = u.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '') || '';
      if (handle) {
        return {
          ...DEFAULT_SOURCE,
          type: 'text',
          textMode: 'instagram',
          instagramHandle: `@${handle}`,
          useSourceImageAsLogo: false,
        };
      }
    } catch {
      // Fall through to URL
    }
  }
  if (/^https:\/\/(?:www\.)?(?:facebook|fb)\.com\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const handle = u.pathname.split('/').filter(Boolean)[0] || '';
      if (handle) {
        return {
          ...DEFAULT_SOURCE,
          type: 'text',
          textMode: 'facebook',
          facebookHandle: handle,
          useSourceImageAsLogo: false,
        };
      }
    } catch {
      // Fall through to URL
    }
  }
  if (/^https:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const handle = u.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '') || '';
      if (handle) {
        return {
          ...DEFAULT_SOURCE,
          type: 'text',
          textMode: 'telegram',
          telegramHandle: `@${handle}`,
          useSourceImageAsLogo: false,
        };
      }
    } catch {
      // Fall through to URL
    }
  }
  if (/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const handle = u.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '') || '';
      if (handle) {
        return {
          ...DEFAULT_SOURCE,
          type: 'text',
          textMode: 'twitter',
          twitterHandle: `@${handle}`,
          useSourceImageAsLogo: false,
        };
      }
    } catch {
      // Fall through to URL
    }
  }
  if (/^https:\/\/wa\.me\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return {
        ...DEFAULT_SOURCE,
        type: 'text',
        textMode: 'whatsapp',
        whatsappPhone: u.pathname.replace(/\//g, ''),
        whatsappMessage: u.searchParams.get('text') || '',
        useSourceImageAsLogo: false,
      };
    } catch {
      // Fall through to URL
    }
  }
  if (/^geo:/i.test(trimmed)) {
    const coords = trimmed.slice(4).split('?')[0].split(',');
    const qMatch = trimmed.match(/\(([^)]+)\)/);
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'geo',
      geoLat: coords[0] || '',
      geoLng: coords[1] || '',
      geoLabel: qMatch?.[1] ? decodeURIComponent(qMatch[1]) : '',
      useSourceImageAsLogo: false,
    };
  }
  if (/^BCD\r?\n002\r?\n1\r?\nSCT/i.test(trimmed)) {
    const lines = trimmed.split(/\r?\n/);
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'payment',
      paymentMode: 'sepa',
      paymentBic: lines[4] || '',
      paymentName: lines[5] || '',
      paymentIban: lines[6] || '',
      paymentAmount: (lines[7] || '').replace(/^EUR/i, ''),
      paymentReference: lines[9] || '',
      useSourceImageAsLogo: false,
    };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      ...DEFAULT_SOURCE,
      type: 'text',
      textMode: 'url',
      urlValue: trimmed,
      useSourceImageAsLogo: false,
    };
  }
  return {
    ...DEFAULT_SOURCE,
    type: 'text',
    textMode: 'text',
    textValue: trimmed,
    useSourceImageAsLogo: false,
  };
}

export function encodeSparkQrSharePackage(item: {
  name?: string;
  category?: ProjectCategory;
  payload: string;
  config: QrConfig;
  source: QrSourceState;
  experience?: PostScanExperience;
}): string {
  const safeConfig: QrConfig = {
    ...item.config,
    // Strip large inline custom data URLs only if gigantic (> 120 KB), otherwise keep intact
    customLogoDataUrl:
      item.config.customLogoDataUrl && item.config.customLogoDataUrl.length <= 120_000
        ? item.config.customLogoDataUrl
        : null,
    laserEnabled: item.config.laserEnabled !== false,
  };

  const pkg: SparkQrSharePackageV1 = {
    format: 'sparkqr-share-v1',
    name: (item.name || item.config.titleText || 'Code QR reçu').trim(),
    category: item.category || 'Personnel',
    payload: item.payload,
    config: safeConfig,
    source: {
      ...item.source,
      useSourceImageAsLogo: false,
    },
    experience: item.experience,
    createdAt: new Date().toISOString(),
  };

  return `${SHARE_PREFIX}${utf8ToBase64Url(JSON.stringify(pkg))}`;
}

export function encodeSparkQrJsonFile(item: {
  name?: string;
  category?: ProjectCategory;
  payload: string;
  config: QrConfig;
  source: QrSourceState;
  experience?: PostScanExperience;
}): string {
  const pkg: SparkQrSharePackageV1 = {
    format: 'sparkqr-share-v1',
    name: (item.name || item.config.titleText || 'Code QR SparkQR').trim(),
    category: item.category || 'Personnel',
    payload: item.payload,
    config: {
      ...item.config,
      laserEnabled: item.config.laserEnabled !== false,
    },
    source: {
      ...item.source,
      useSourceImageAsLogo: false,
    },
    experience: item.experience,
    createdAt: new Date().toISOString(),
  };
  return JSON.stringify(pkg, null, 2);
}

function sanitizeParsedPackage(
  raw: Record<string, unknown>,
  fallbackTitle?: string,
  forceCategory?: ProjectCategory
): { ok: true; item: SavedQrItem; originKind: 'sparkqr-package' | 'raw-qr' } | { ok: false; error: string } {
  const payload = typeof raw.payload === 'string' ? raw.payload.trim() : '';
  if (!payload) {
    return { ok: false, error: 'Le contenu du QR code reçu est vide.' };
  }
  if (isUnsafePayloadString(payload)) {
    return { ok: false, error: 'Contenu non conforme refusé.' };
  }

  const rawCfg =
    raw.config && typeof raw.config === 'object'
      ? ({ ...(raw.config as Partial<QrConfig>) })
      : {};
  const legacyThemeMap: Record<string, string> = {
    'gta-vice-city': 'vice-city-neon',
    'gta-los-santos': 'los-santos-prestige',
    'enterprise-executive': 'meridien-ardoise',
    'enterprise-banque-privee': 'foret-laiton',
    'enterprise-corporate-cobalt': 'atelier-alpin',
    'enterprise-summit': 'verre-glassmorph',
  };
  if (rawCfg.themeId && legacyThemeMap[rawCfg.themeId]) {
    rawCfg.themeId = legacyThemeMap[rawCfg.themeId];
  }
  let mergedCfg = normalizeConfigWithDefaults(rawCfg, DEFAULT_CONFIG);
  if (rawCfg.themeId && rawCfg.themeId !== 'custom') {
    const preset = THEME_PRESETS.find((t) => t.id === rawCfg.themeId);
    if (preset && !rawCfg.foregroundColor) {
      mergedCfg = normalizeConfigWithDefaults({ ...preset.patch, ...rawCfg }, DEFAULT_CONFIG);
    }
  }

  const rawSrc =
    raw.source && typeof raw.source === 'object'
      ? (raw.source as Partial<QrSourceState>)
      : buildSourceFromPlainPayload(payload);
  const mergedSrc: QrSourceState = {
    ...DEFAULT_SOURCE,
    ...rawSrc,
    useSourceImageAsLogo: false,
  };

  const rawExp =
    raw.experience && typeof raw.experience === 'object'
      ? ({ ...DEFAULT_EXPERIENCE, ...(raw.experience as Partial<PostScanExperience>) })
      : undefined;

  const validCats: ProjectCategory[] = [
    'Personnel',
    'Professionnel',
    'Événement',
    'Média',
    'Privé',
    'Importé',
  ];
  const cat =
    forceCategory ||
    (validCats.includes(raw.category as ProjectCategory)
      ? (raw.category as ProjectCategory)
      : 'Personnel');

  const formatNeutral = describeQrPayloadFormat(payload);
  const title =
    (typeof raw.name === 'string' && raw.name.trim()) ||
    (mergedCfg.titleText && mergedCfg.titleText !== 'Mon Code QR' ? mergedCfg.titleText : '') ||
    fallbackTitle ||
    `Code QR · ${formatNeutral}`;

  const nowIso = new Date().toISOString();
  const item: SavedQrItem = {
    id: `imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: title.slice(0, 60),
    category: cat,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso,
    updatedAt: nowIso,
    payload,
    config: mergedCfg,
    source: mergedSrc,
    experience: rawExp,
    accessibilityKind: 'permanent',
  };

  return { ok: true, item, originKind: 'sparkqr-package' };
}

export function isValidQrPayloadFormat(raw: string): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed.length > 4200 || isUnsafePayloadString(trimmed)) {
    return false;
  }
  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return Boolean(parsed.hostname && (parsed.hostname.includes('.') || parsed.hostname === 'localhost'));
    } catch {
      return false;
    }
  }
  if (/^WIFI:T:(?:WPA|WEP|nopass|WPA2);S:[^;]+;.*;;?$/i.test(trimmed)) {
    return true;
  }
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+/i.test(trimmed)) {
    return true;
  }
  if (/^tel:[+0-9().\-\s]{5,}$/i.test(trimmed)) {
    return true;
  }
  if (/^sms:[+0-9().\-\s]{5,}/i.test(trimmed)) {
    return true;
  }
  if (/^BEGIN:VCALENDAR[\s\S]+END:VCALENDAR$/i.test(trimmed)) {
    return true;
  }
  if (/^BEGIN:VCARD[\s\S]+END:VCARD$/i.test(trimmed)) {
    return true;
  }
  if (/^BCD\r?\n002\r?\n1\r?\nSCT/i.test(trimmed)) {
    return true;
  }
  if (/^MATMSG:TO:[^;]+;/i.test(trimmed)) {
    return true;
  }
  if (/^geo:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function describeQrPayloadFormat(raw: string): string {
  const trimmed = (raw || '').trim();
  if (/^WIFI:/i.test(trimmed)) return 'Wi-Fi';
  if (/^BEGIN:VCARD/i.test(trimmed)) return 'Contact vCard';
  if (/^BEGIN:VCALENDAR/i.test(trimmed)) return 'Événement iCal';
  if (/^BCD\r?\n002\r?\n1\r?\nSCT/i.test(trimmed)) return 'Virement SEPA';
  if (/^mailto:/i.test(trimmed)) return 'E-mail';
  if (/^tel:/i.test(trimmed)) return 'Téléphone';
  if (/^sms:/i.test(trimmed)) return 'SMS';
  if (/^https:\/\/(?:www\.)?tiktok\.com\//i.test(trimmed)) return 'TikTok';
  if (/^https:\/\/(?:www\.)?instagram\.com\//i.test(trimmed)) return 'Instagram';
  if (/^https:\/\/(?:www\.)?(?:facebook|fb)\.com\//i.test(trimmed)) return 'Facebook';
  if (/^https:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i.test(trimmed)) return 'Telegram';
  if (/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(trimmed)) return 'Twitter (X)';
  if (/^https:\/\/wa\.me\//i.test(trimmed)) return 'WhatsApp';
  if (/^geo:/i.test(trimmed)) return 'Position GPS';
  if (/^MATMSG:/i.test(trimmed)) return 'E-mail';
  if (/^https?:\/\//i.test(trimmed)) return 'Lien web';
  return 'Texte';
}

export function extractSparkQrReaderEndpoint(
  payload: string
): { kind: 'media' | 'dynamic'; id: string; keyFragment: string | null } | null {
  const trimmed = (payload || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : trimmed.startsWith('/')
      ? new URL(`https://sparkqr.local${trimmed}`)
      : null;
    if (!parsed) return null;

    const hashParams = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
    const keyFragment = hashParams.get('k') || hashParams.get('key') || null;

    const mediaMatch = parsed.pathname.match(/^\/m\/([a-zA-Z0-9_-]{4,64})$/);
    if (mediaMatch?.[1]) {
      return { kind: 'media', id: mediaMatch[1], keyFragment };
    }
    const dynamicMatch = parsed.pathname.match(/^\/d\/([a-zA-Z0-9_-]{3,64})$/);
    if (dynamicMatch?.[1]) {
      return { kind: 'dynamic', id: dynamicMatch[1], keyFragment };
    }
    return null;
  } catch {
    return null;
  }
}

export function parseReceivedQrInput(
  rawInput: string,
  options?: {
    fallbackTitle?: string;
    laserEnabled?: boolean;
    fromDecodedImage?: boolean;
    forceCategory?: ProjectCategory;
  }
): { ok: true; item: SavedQrItem; originKind: 'sparkqr-package' | 'raw-qr' } | { ok: false; error: string } {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Importez une image contenant un QR code généré par SparkQR.',
    };
  }
  if (isUnsafePayloadString(trimmed)) {
    return { ok: false, error: 'Contenu non conforme refusé.' };
  }

  // 1. Check SparkQR shared wrapper (directly or inside ?sq= / #sq= param)
  let token = '';
  if (trimmed.startsWith(SHARE_PREFIX)) {
    token = trimmed.slice(SHARE_PREFIX.length).trim();
  } else {
    const sqMatch = trimmed.match(/[?#&]sq=([^&#]+)/);
    if (sqMatch?.[1]) {
      token = decodeURIComponent(sqMatch[1]);
      if (token.startsWith(SHARE_PREFIX)) {
        token = token.slice(SHARE_PREFIX.length);
      }
    }
  }

  if (token) {
    try {
      const jsonText = base64UrlToUtf8(token);
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      return sanitizeParsedPackage(parsed, options?.fallbackTitle, options?.forceCategory);
    } catch {
      return { ok: false, error: 'Ce code partagé est invalide ou incomplet.' };
    }
  }

  // 2. Check structured JSON export object
  if (trimmed.startsWith('{') || trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.payload === 'string') {
        return sanitizeParsedPackage(parsed, options?.fallbackTitle, options?.forceCategory);
      }
      return { ok: false, error: 'Ce fichier ne contient aucun QR code exploitable.' };
    } catch {
      return { ok: false, error: 'Format de fichier QR invalide ou corrompu.' };
    }
  }

  // 3. Strict validation when pasted as text (must be a real QR payload scheme, unless genuinely decoded from a QR matrix image)
  if (!options?.fromDecodedImage && !isValidQrPayloadFormat(trimmed)) {
    return {
      ok: false,
      error: 'Format non reconnu. Importez directement une image de QR code générée par SparkQR.',
    };
  }

  const source = buildSourceFromPlainPayload(trimmed);
  const neutralFormatLabel = describeQrPayloadFormat(trimmed);
  const derivedTitle = options?.fallbackTitle || `Code QR · ${neutralFormatLabel}`;

  const nowIso = new Date().toISOString();
  const item: SavedQrItem = {
    id: `imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: derivedTitle,
    category: options?.forceCategory || 'Personnel',
    createdAt: nowIso,
    updatedAt: nowIso,
    payload: trimmed,
    source,
    config: {
      ...DEFAULT_CONFIG,
      titleText: 'Mon Code QR',
      subtitleText: 'Scannez pour découvrir',
      laserEnabled: options?.laserEnabled ?? true,
    },
    experience: { ...DEFAULT_EXPERIENCE },
    accessibilityKind: 'permanent',
  };

  return { ok: true, item, originKind: 'raw-qr' };
}

/**
 * Strictly validates and restores a QR image generated by SparkQR into category 'Importé'
 * preserving every generated attribute (style, fonts, colors, laser, energy waves, source, experience).
 */
export function buildImportedSparkQrItem(params: {
  decodedPayload: string;
  sparkQrAuthentic?: boolean;
  sparkQrMetadata?: Record<string, unknown> | null;
  sparkQrRejectReason?: string;
  fallbackTitle?: string;
}): { ok: true; item: SavedQrItem } | { ok: false; error: string } {
  if (!params.sparkQrAuthentic || !params.sparkQrMetadata) {
    return {
      ok: false,
      error:
        params.sparkQrRejectReason ||
        'Ce code QR n’a pas été généré par SparkQR. Seules les images QR créées sur SparkQR sont acceptées.',
    };
  }

  const restored = sanitizeParsedPackage(
    {
      ...params.sparkQrMetadata,
      payload: params.decodedPayload,
    },
    params.fallbackTitle,
    'Importé'
  );
  if (!restored.ok) {
    return restored;
  }

  return {
    ok: true,
    item: {
      ...restored.item,
      category: 'Importé',
    },
  };
}
