import QRCode from 'qrcode';
import jsQR from 'jsqr';
import type {
  QrConfig,
  QrCornerPlacement,
  QrErrorCorrection,
  QrFrameStyle,
  QrSourceState,
  ScannabilityReport,
} from '../types/qr';
import {
  buildPublicReaderUrl,
  inspectMediaUrlForQr,
  isAiStudioOrPreviewHost,
  isLocalOrPrivateHost,
  validatePublicAppUrl,
} from './publicUrl';

export interface QrMatrixData {
  size: number;
  modules: boolean[][];
  version: number;
}

export function buildPayload(source: QrSourceState, publicOrigin = ''): {
  payload: string;
  valid: boolean;
  error?: string;
} {
  if (source.type === 'text') {
    if (source.textMode === 'url') {
      const trimmed = source.urlValue.trim();
      if (!trimmed) {
        return { payload: '', valid: false, error: 'Saisissez un lien URL valide.' };
      }
      const hasScheme = /^(https?:\/\/|mailto:|tel:|sms:)/i.test(trimmed);
      const normalized = hasScheme ? trimmed : `https://${trimmed}`;
      if (/^https?:\/\//i.test(normalized)) {
        try {
          const parsed = new URL(normalized);
          if (!parsed.hostname || !parsed.hostname.includes('.')) {
            return {
              payload: '',
              valid: false,
              error: 'Adresse URL incomplète (ex. : https://monsite.fr).',
            };
          }
          if (isAiStudioOrPreviewHost(parsed.hostname)) {
            return {
              payload: '',
              valid: false,
              error:
                'Lien Google AI Studio détecté : les URL internes ais-dev / aistudio renvoient HTTP 403 après scan. Saisissez une URL publique.',
            };
          }
          if (isLocalOrPrivateHost(parsed.hostname)) {
            return {
              payload: '',
              valid: false,
              error:
                'Adresse locale (localhost / IP privée) inutilisable depuis un smartphone externe.',
            };
          }
        } catch {
          return { payload: '', valid: false, error: 'Format d’adresse URL invalide.' };
        }
      }
      return { payload: normalized, valid: true };
    }
    if (source.textMode === 'wifi') {
      const ssid = source.wifiSsid.trim();
      if (!ssid) {
        return { payload: '', valid: false, error: 'Indiquez le nom du réseau Wi-Fi (SSID).' };
      }
      if (source.wifiSecurity !== 'nopass' && !source.wifiPassword.trim()) {
        return {
          payload: '',
          valid: false,
          error: 'Saisissez le mot de passe Wi-Fi ou sélectionnez le mode « Ouvert ».',
        };
      }
      const esc = (v: string) => v.replace(/([\\;,:"])/g, '\\$1');
      const passPart = source.wifiSecurity === 'nopass' ? '' : `P:${esc(source.wifiPassword)};`;
      return {
        payload: `WIFI:T:${source.wifiSecurity};S:${esc(ssid)};${passPart};`,
        valid: true,
      };
    }
    const text = source.textValue.trim();
    if (!text) {
      return { payload: '', valid: false, error: 'Saisissez un texte à encoder.' };
    }
    return { payload: text, valid: true };
  }

  if (source.type === 'image') {
    const rawMedia = source.imageUrl.trim();
    const rawTarget = (source.imagePageUrl || source.imageUrl).trim();
    if (!rawTarget) {
      return {
        payload: '',
        valid: false,
        error: 'Importez une image ou collez son lien URL public.',
      };
    }
    if (rawMedia) {
      const mediaSafety = inspectMediaUrlForQr(rawMedia);
      if (!mediaSafety.safe) {
        return {
          payload: '',
          valid: false,
          error: mediaSafety.error,
        };
      }
    }
    if (/^https?:\/\//i.test(rawTarget)) {
      const targetSafety = inspectMediaUrlForQr(rawTarget);
      if (!targetSafety.safe) {
        return { payload: '', valid: false, error: targetSafety.error };
      }
      return { payload: rawTarget, valid: true };
    }
    const originCheck = validatePublicAppUrl(publicOrigin);
    if (!originCheck.valid) {
      return {
        payload: '',
        valid: false,
        error: originCheck.error,
      };
    }
    return { payload: buildPublicReaderUrl(originCheck.normalizedUrl, rawTarget), valid: true };
  }

  // video
  const rawVideoMedia = source.videoUrl.trim();
  const rawVideo = (source.videoPageUrl || source.videoUrl).trim();
  if (!rawVideo) {
    return {
      payload: '',
      valid: false,
      error: 'Importez une vidéo ou collez son lien URL public.',
    };
  }
  if (rawVideoMedia) {
    const mediaSafety = inspectMediaUrlForQr(rawVideoMedia);
    if (!mediaSafety.safe) {
      return {
        payload: '',
        valid: false,
        error: mediaSafety.error,
      };
    }
  }
  if (/^https?:\/\//i.test(rawVideo)) {
    const targetSafety = inspectMediaUrlForQr(rawVideo);
    if (!targetSafety.safe) {
      return { payload: '', valid: false, error: targetSafety.error };
    }
    return { payload: rawVideo, valid: true };
  }
  const originCheck = validatePublicAppUrl(publicOrigin);
  if (!originCheck.valid) {
    return {
      payload: '',
      valid: false,
      error: originCheck.error,
    };
  }
  return { payload: buildPublicReaderUrl(originCheck.normalizedUrl, rawVideo), valid: true };
}

export function verifyQrDecodeFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return result ? result.data : null;
}

export function verifyMatrixRoundTrip(matrix: QrMatrixData, expectedPayload: string): boolean {
  const margin = 4;
  const scale = 6;
  const dim = (matrix.size + margin * 2) * scale;
  const buffer = new Uint8ClampedArray(dim * dim * 4);
  buffer.fill(255);

  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.modules[r][c]) continue;
      const startX = (c + margin) * scale;
      const startY = (r + margin) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const idx = ((startY + dy) * dim + (startX + dx)) * 4;
          buffer[idx] = 0;
          buffer[idx + 1] = 0;
          buffer[idx + 2] = 0;
          buffer[idx + 3] = 255;
        }
      }
    }
  }

  const decoded = verifyQrDecodeFromImageData(buffer, dim, dim);
  return decoded === expectedPayload;
}

export function toAbsoluteUrl(input: string, origin: string): string {
  if (/^(https?:\/\/|data:|blob:)/i.test(input)) {
    return input;
  }
  const cleanOrigin = origin.replace(/\/+$/, '');
  const cleanPath = input.startsWith('/') ? input : `/${input}`;
  return `${cleanOrigin}${cleanPath}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
  }
  if (cleaned.length >= 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
  }
  return { r: 0, g: 0, b: 0 };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function hasActiveLogo(config: QrConfig, _source?: QrSourceState): boolean {
  if (config.customLogoDataUrl) return true;
  if (config.logoId) return true;
  if (config.centerEmoji && config.centerEmoji.trim().length > 0) return true;
  return false;
}

export function getEffectiveErrorCorrection(
  config: QrConfig,
  source?: QrSourceState
): QrErrorCorrection {
  if (hasActiveLogo(config, source)) {
    return 'H';
  }
  return config.errorCorrection;
}

export function evaluateScannability(
  config: QrConfig,
  source?: QrSourceState
): ScannabilityReport {
  const logoActive = hasActiveLogo(config, source);
  const effectiveErrorCorrection = getEffectiveErrorCorrection(config, source);

  const primaryContrast = contrastRatio(config.foregroundColor, config.qrBackgroundColor);
  const secondaryContrast =
    config.gradientType !== 'solid'
      ? contrastRatio(config.foregroundSecondaryColor, config.qrBackgroundColor)
      : primaryContrast;

  const minContrast = Math.min(primaryContrast, secondaryContrast);
  const fgLum = relativeLuminance(config.foregroundColor);
  const bgLum = relativeLuminance(config.qrBackgroundColor);
  const isLightOnDark =
    config.filter === 'inverted' ? bgLum > fgLum : fgLum > bgLum;

  if (minContrast < 2.8) {
    return {
      contrastRatio: minContrast,
      effectiveErrorCorrection,
      hasLogo: logoActive,
      status: 'risky',
      label: 'Contraste faible',
      detail: 'Augmentez l’écart entre les modules et le fond pour garantir la lecture.',
    };
  }

  if (minContrast < 4.5 || isLightOnDark) {
    return {
      contrastRatio: minContrast,
      effectiveErrorCorrection,
      hasLogo: logoActive,
      status: 'acceptable',
      label: isLightOnDark ? 'Mode inversé lisible' : 'Lisibilité correcte',
      detail: isLightOnDark
        ? 'La majorité des caméras récentes lisent le clair sur fond sombre.'
        : 'Contraste modéré ; testez le scan avant impression.',
    };
  }

  return {
    contrastRatio: minContrast,
    effectiveErrorCorrection,
    hasLogo: logoActive,
    status: 'optimal',
    label: 'Lisibilité optimale',
    detail: logoActive
      ? 'Correction d’erreur H (30 %) activée pour compenser le logo central.'
      : 'Contraste élevé et géométrie fiable sur tout lecteur.',
  };
}

/**
 * Checks whether (row, col) belongs to one of the three 7x7 finder patterns.
 */
export function isFinderCell(row: number, col: number, size: number): boolean {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= size - 7;
  const inBottomLeft = row >= size - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

/**
 * Checks whether (row, col) falls inside the central knockout clearing zone reserved for a logo.
 */
export function isInLogoKnockoutZone(
  row: number,
  col: number,
  size: number,
  logoSizeRatio: number,
  logoActive: boolean
): boolean {
  if (!logoActive) return false;
  const center = (size - 1) / 2;
  const halfSpan = (size * logoSizeRatio) / 2 + 0.35;
  return Math.abs(row - center) <= halfSpan && Math.abs(col - center) <= halfSpan;
}

export function generateQrMatrix(
  payload: string,
  errorCorrection: QrErrorCorrection
): QrMatrixData {
  const safePayload = payload.trim();
  if (!safePayload) {
    throw new Error('Contenu vide : aucune donnée à encoder dans le QR code.');
  }
  const fallbackOrder: QrErrorCorrection[] = [
    errorCorrection,
    'Q',
    'M',
    'L',
  ];
  let qr: ReturnType<typeof QRCode.create> | null = null;
  let lastError: unknown;
  for (const ecc of fallbackOrder) {
    try {
      qr = QRCode.create(safePayload, { errorCorrectionLevel: ecc });
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!qr) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Données trop volumineuses pour un code QR direct.');
  }
  const size = qr.modules.size;
  const data = qr.modules.data;
  const modules: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(Boolean(data[r * size + c]));
    }
    modules.push(row);
  }
  return {
    size,
    modules,
    version: qr.version,
  };
}

export interface ShowcaseBackdrop {
  outerBackground: string;
  accentGlow: string;
  cardBackground: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
  accentColor: string;
}

export function mixHexColors(hexA: string, hexB: string, weightB: number): string {
  const w = Math.max(0, Math.min(1, weightB));
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r * (1 - w) + b.r * w);
  const g = Math.round(a.g * (1 - w) + b.g * w);
  const bl = Math.round(a.b * (1 - w) + b.b * w);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function buildShowcaseBackdrop(
  config: QrConfig,
  mood: 'auto' | 'gold-velvet' | 'midnight-neon' | 'cinema-35' | 'botanical' = 'auto'
): ShowcaseBackdrop {
  if (mood === 'gold-velvet') {
    return {
      outerBackground:
        'radial-gradient(circle at 20% 15%, rgba(245,208,97,0.22), transparent 55%), radial-gradient(circle at 85% 85%, rgba(198,146,20,0.18), transparent 60%), linear-gradient(155deg, #0b0907 0%, #16120c 55%, #090705 100%)',
      accentGlow: 'rgba(245,208,97,0.34)',
      cardBackground: 'rgba(22, 18, 13, 0.92)',
      cardBorder: 'rgba(245, 208, 97, 0.24)',
      textPrimary: '#FBF3DB',
      textMuted: '#C9B889',
      accentColor: '#F5D061',
    };
  }
  if (mood === 'midnight-neon') {
    return {
      outerBackground:
        'radial-gradient(circle at 18% 15%, rgba(56,189,248,0.28), transparent 52%), radial-gradient(circle at 82% 85%, rgba(129,140,248,0.24), transparent 58%), linear-gradient(155deg, #070a12 0%, #10172a 55%, #05070d 100%)',
      accentGlow: 'rgba(34,211,238,0.35)',
      cardBackground: 'rgba(13, 19, 34, 0.90)',
      cardBorder: 'rgba(56, 189, 248, 0.24)',
      textPrimary: '#F8FAFC',
      textMuted: '#94A3B8',
      accentColor: '#22D3EE',
    };
  }
  if (mood === 'cinema-35') {
    return {
      outerBackground:
        'radial-gradient(circle at 22% 18%, rgba(217,119,6,0.18), transparent 55%), radial-gradient(circle at 82% 85%, rgba(120,90,64,0.20), transparent 60%), linear-gradient(155deg, #14110f 0%, #1e1915 55%, #0f0c0a 100%)',
      accentGlow: 'rgba(245,158,11,0.26)',
      cardBackground: 'rgba(28, 23, 20, 0.92)',
      cardBorder: 'rgba(255, 244, 224, 0.14)',
      textPrimary: '#FAF5EC',
      textMuted: '#B8ABA0',
      accentColor: '#F59E0B',
    };
  }
  if (mood === 'botanical') {
    return {
      outerBackground:
        'radial-gradient(circle at 18% 12%, rgba(21,128,61,0.16), transparent 52%), radial-gradient(circle at 85% 88%, rgba(13,59,46,0.12), transparent 58%), linear-gradient(155deg, #eef4ef 0%, #e4ede6 52%, #f4f7f4 100%)',
      accentGlow: 'rgba(21,128,61,0.22)',
      cardBackground: 'rgba(255, 255, 255, 0.94)',
      cardBorder: 'rgba(13, 59, 46, 0.12)',
      textPrimary: '#0D3B2E',
      textMuted: '#4E6B60',
      accentColor: '#15803D',
    };
  }

  const accent = config.useCustomEyeColor
    ? config.eyeColor
    : config.gradientType !== 'solid'
    ? config.foregroundSecondaryColor
    : config.foregroundColor;

  const { r: ar, g: ag, b: ab } = hexToRgb(accent);
  const { r: pr, g: pg, b: pb } = hexToRgb(config.foregroundColor);
  const cardBg = config.cardBackgroundColor || '#FFFFFF';
  const bgLum = relativeLuminance(cardBg);
  const isDarkTheme = bgLum < 0.22;

  if (isDarkTheme) {
    const darkBaseTop = mixHexColors(cardBg, '#07090E', 0.35);
    const darkBaseMid = mixHexColors(cardBg, '#111622', 0.25);
    const darkCard = mixHexColors(cardBg, '#131722', 0.3);
    return {
      outerBackground: `radial-gradient(circle at 20% 15%, rgba(${ar},${ag},${ab},0.28), transparent 55%), radial-gradient(circle at 82% 85%, rgba(${pr},${pg},${pb},0.22), transparent 60%), linear-gradient(155deg, ${darkBaseTop} 0%, ${darkBaseMid} 55%, #07090D 100%)`,
      accentGlow: `rgba(${ar},${ag},${ab},0.35)`,
      cardBackground: darkCard,
      cardBorder: `rgba(${ar},${ag},${ab},0.24)`,
      textPrimary: '#F8FAFC',
      textMuted: '#A1A8B8',
      accentColor: accent,
    };
  }

  const lightBaseTop = mixHexColors(cardBg, '#F8FAFC', 0.45);
  const lightBaseMid = mixHexColors(cardBg, '#F1F5F9', 0.55);
  return {
    outerBackground: `radial-gradient(circle at 18% 12%, rgba(${ar},${ag},${ab},0.18), transparent 54%), radial-gradient(circle at 85% 88%, rgba(${pr},${pg},${pb},0.13), transparent 58%), linear-gradient(155deg, ${lightBaseTop} 0%, ${lightBaseMid} 52%, #FFFFFF 100%)`,
    accentGlow: `rgba(${ar},${ag},${ab},0.24)`,
    cardBackground: '#FFFFFF',
    cardBorder: `rgba(${ar},${ag},${ab},0.16)`,
    textPrimary: '#111214',
    textMuted: '#5C5E66',
    accentColor: accent,
  };
}

export function extractHostname(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return urlString;
  }
}

export interface CornerStickerPoint {
  corner: 'tl' | 'tr' | 'bl' | 'br';
  x: number;
  y: number;
  rotation: number;
  needsBacking: boolean;
}

export function getCardLayout(frameStyle: QrFrameStyle): {
  width: number;
  height: number;
  qrSize: number;
  qrX: number;
  qrY: number;
} {
  const cardWidth = 400;
  switch (frameStyle) {
    case 'none':
      return { width: cardWidth, height: 400, qrSize: 368, qrX: 16, qrY: 16 };
    case 'signature':
      return { width: cardWidth, height: 504, qrSize: 336, qrX: 32, qrY: 76 };
    case 'ticket':
      return { width: cardWidth, height: 516, qrSize: 336, qrX: 32, qrY: 28 };
    case 'glass':
    case 'smoked-glass':
      return { width: cardWidth, height: 512, qrSize: 328, qrX: 36, qrY: 84 };
    case 'vip-gold':
    case 'limited':
      return { width: cardWidth, height: 520, qrSize: 328, qrX: 36, qrY: 82 };
    case 'polaroid':
      return { width: cardWidth, height: 496, qrSize: 348, qrX: 26, qrY: 26 };
    default:
      return { width: cardWidth, height: 504, qrSize: 336, qrX: 32, qrY: 76 };
  }
}

export function computeCornerStickerPositions(
  placement: QrCornerPlacement,
  frameStyle: QrFrameStyle,
  layout: { width: number; height: number; qrX: number; qrY: number; qrSize: number },
  offsetDelta = 0
): CornerStickerPoint[] {
  if (placement === 'none') return [];

  let coords: Record<'tl' | 'tr' | 'bl' | 'br', Omit<CornerStickerPoint, 'corner'>>;

  if (frameStyle === 'signature') {
    coords = {
      tl: { x: 42, y: 39, rotation: -10, needsBacking: false },
      tr: { x: layout.width - 42, y: 39, rotation: 10, needsBacking: false },
      bl: { x: 42, y: 460, rotation: -8, needsBacking: false },
      br: { x: layout.width - 42, y: 460, rotation: 8, needsBacking: false },
    };
  } else if (
    frameStyle === 'glass' ||
    frameStyle === 'smoked-glass' ||
    frameStyle === 'vip-gold' ||
    frameStyle === 'limited'
  ) {
    coords = {
      tl: { x: 42, y: 46, rotation: -10, needsBacking: false },
      tr: { x: layout.width - 42, y: 46, rotation: 10, needsBacking: false },
      bl: { x: 42, y: layout.height - 46, rotation: -8, needsBacking: false },
      br: { x: layout.width - 42, y: layout.height - 46, rotation: 8, needsBacking: false },
    };
  } else if (frameStyle === 'ticket') {
    coords = {
      tl: { x: 26, y: 26, rotation: -12, needsBacking: true },
      tr: { x: layout.width - 26, y: 26, rotation: 12, needsBacking: true },
      bl: { x: 44, y: 454, rotation: -8, needsBacking: false },
      br: { x: layout.width - 44, y: 454, rotation: 8, needsBacking: false },
    };
  } else if (frameStyle === 'polaroid') {
    coords = {
      tl: { x: 24, y: 24, rotation: -12, needsBacking: true },
      tr: { x: layout.width - 24, y: 24, rotation: 12, needsBacking: true },
      bl: { x: 42, y: 442, rotation: -8, needsBacking: false },
      br: { x: layout.width - 42, y: 442, rotation: 8, needsBacking: false },
    };
  } else {
    // 'none' — sits at the extreme outer card corners in the safe margin
    coords = {
      tl: { x: 22, y: 22, rotation: -12, needsBacking: true },
      tr: { x: layout.width - 22, y: 22, rotation: 12, needsBacking: true },
      bl: { x: 22, y: layout.height - 22, rotation: -10, needsBacking: true },
      br: { x: layout.width - 22, y: layout.height - 22, rotation: 10, needsBacking: true },
    };
  }

  const keysByPlacement: Record<Exclude<QrCornerPlacement, 'none'>, Array<'tl' | 'tr' | 'bl' | 'br'>> = {
    'all-4': ['tl', 'tr', 'bl', 'br'],
    'top-2': ['tl', 'tr'],
    'bottom-2': ['bl', 'br'],
    diagonal: ['tl', 'br'],
    'bottom-right': ['br'],
  };

  return keysByPlacement[placement].map((corner) => {
    const base = coords[corner];
    const dirX = corner === 'tl' || corner === 'bl' ? -1 : 1;
    const dirY = corner === 'tl' || corner === 'tr' ? -1 : 1;
    return {
      corner,
      ...base,
      x: Math.max(16, Math.min(layout.width - 16, base.x + dirX * offsetDelta)),
      y: Math.max(16, Math.min(layout.height - 16, base.y + dirY * offsetDelta)),
    };
  });
}


