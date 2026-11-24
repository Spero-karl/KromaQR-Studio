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

export function parseReceivedQrInput(
  rawInput: string,
  options?: { fallbackTitle?: string; laserEnabled?: boolean }
): { ok: true; item: SavedQrItem; originKind: 'sparkqr-package' | 'raw-qr' } | { ok: false; error: string } {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Collez un code SparkQR, un lien reçu ou importez une image QR.',
    };
  }
  if (isUnsafePayloadString(trimmed)) {
    return { ok: false, error: 'Lien non sécurisé refusé.' };
  }

  // 1. Check SPARKQR1:... prefix (either directly or inside ?sq= / #sq= param)
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
      return { ok: false, error: 'Code de partage SparkQR invalide ou incomplet.' };
    }
  }

  // 2. Check raw JSON object (.sparkqr.json content)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.payload === 'string') {
        return sanitizeParsedPackage(parsed, options?.fallbackTitle);
      }
    } catch {
      return { ok: false, error: 'Fichier JSON SparkQR invalide.' };
    }
  }

  // 3. Plain QR payload (URL, Wi-Fi, or text decoded from an image or pasted link)
  const source = buildSourceFromPlainPayload(trimmed);
  let derivedTitle = options?.fallbackTitle || '';
  if (!derivedTitle) {
    if (source.textMode === 'url') {
      try {
        derivedTitle = new URL(trimmed).hostname.replace(/^www\./, '');
      } catch {
        derivedTitle = 'Lien reçu';
      }
    } else if (source.textMode === 'wifi') {
      derivedTitle = `Wi-Fi ${source.wifiSsid}`;
    } else {
      derivedTitle = trimmed.slice(0, 34);
    }
  }

  const nowIso = new Date().toISOString();
  const item: SavedQrItem = {
    id: `imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: derivedTitle || 'QR reçu',
    category: 'Personnel',
    createdAt: nowIso,
    updatedAt: nowIso,
    payload: trimmed,
    source,
    config: {
      ...DEFAULT_CONFIG,
      titleText: derivedTitle || 'Code QR reçu',
      subtitleText: 'Scannez pour découvrir',
      laserEnabled: options?.laserEnabled ?? true,
    },
    experience: { ...DEFAULT_EXPERIENCE },
    accessibilityKind: 'permanent',
  };

  return { ok: true, item, originKind: 'raw-qr' };
}
