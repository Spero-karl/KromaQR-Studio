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
  fallbackTitle?: string
): { ok: true; item: SavedQrItem; originKind: 'sparkqr-package' | 'raw-qr' } | { ok: false; error: string } {
  const payload = typeof raw.payload === 'string' ? raw.payload.trim() : '';
  if (!payload) {
    return { ok: false, error: 'Le contenu du QR code reçu est vide.' };
  }
  if (isUnsafePayloadString(payload)) {
    return { ok: false, error: 'Contenu non sécurisé refusé.' };
  }

  const rawCfg =
    raw.config && typeof raw.config === 'object'
      ? (raw.config as Partial<QrConfig>)
      : {};
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

  const validCats: ProjectCategory[] = ['Personnel', 'Professionnel', 'Événement', 'Média', 'Privé'];
  const cat = validCats.includes(raw.category as ProjectCategory)
    ? (raw.category as ProjectCategory)
    : 'Personnel';

  const title =
    (typeof raw.name === 'string' && raw.name.trim()) ||
    (mergedCfg.titleText && mergedCfg.titleText !== 'Mon Code QR' ? mergedCfg.titleText : '') ||
    fallbackTitle ||
    'QR reçu';

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
  if (/^BEGIN:VCARD[\s\S]+END:VCARD$/i.test(trimmed)) {
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
  if (/^mailto:/i.test(trimmed)) return 'E-mail';
  if (/^tel:/i.test(trimmed)) return 'Téléphone';
  if (/^sms:/i.test(trimmed)) return 'SMS';
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
  options?: { fallbackTitle?: string; laserEnabled?: boolean; fromDecodedImage?: boolean }
): { ok: true; item: SavedQrItem; originKind: 'sparkqr-package' | 'raw-qr' } | { ok: false; error: string } {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Importez une image contenant un QR code ou collez un lien QR valide.',
    };
  }
  if (isUnsafePayloadString(trimmed)) {
    return { ok: false, error: 'Contenu non sécurisé refusé.' };
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
      return sanitizeParsedPackage(parsed, options?.fallbackTitle);
    } catch {
      return { ok: false, error: 'Ce code partagé est invalide ou incomplet.' };
    }
  }

  // 2. Check structured JSON export object
  if (trimmed.startsWith('{') || trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.payload === 'string') {
        return sanitizeParsedPackage(parsed, options?.fallbackTitle);
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
      error: 'Texte non reconnu comme un QR code valide. Collez un lien (https://…), un code Wi-Fi ou importez directement l’image du QR code.',
    };
  }

  const source = buildSourceFromPlainPayload(trimmed);
  let derivedTitle = options?.fallbackTitle || '';
  if (!derivedTitle) {
    if (source.textMode === 'url') {
      try {
        derivedTitle = new URL(trimmed).hostname.replace(/^www\./, '');
      } catch {
        derivedTitle = 'Lien QR';
      }
    } else if (source.textMode === 'wifi') {
      derivedTitle = `Wi-Fi ${source.wifiSsid}`;
    } else if (/^BEGIN:VCARD/i.test(trimmed)) {
      const fnMatch = trimmed.match(/(?:FN|N):([^\r\n;]+)/i);
      derivedTitle = fnMatch?.[1]?.trim() || 'Contact vCard';
    } else if (/^mailto:/i.test(trimmed)) {
      derivedTitle = trimmed.replace(/^mailto:/i, '').split('?')[0].slice(0, 38) || 'E-mail';
    } else if (/^tel:/i.test(trimmed)) {
      derivedTitle = trimmed.replace(/^tel:/i, '').slice(0, 28) || 'Téléphone';
    } else if (/^geo:/i.test(trimmed)) {
      derivedTitle = 'Position GPS';
    } else {
      derivedTitle = trimmed.slice(0, 34);
    }
  }

  const nowIso = new Date().toISOString();
  const item: SavedQrItem = {
    id: `imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: derivedTitle || 'QR importé',
    category: 'Personnel',
    createdAt: nowIso,
    updatedAt: nowIso,
    payload: trimmed,
    source,
    config: {
      ...DEFAULT_CONFIG,
      titleText: derivedTitle || 'Mon Code QR',
      subtitleText: 'Scannez pour découvrir',
      laserEnabled: options?.laserEnabled ?? true,
    },
    experience: { ...DEFAULT_EXPERIENCE },
    accessibilityKind: 'permanent',
  };

  return { ok: true, item, originKind: 'raw-qr' };
}
