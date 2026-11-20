import { FONT_CATALOG } from '../data/presets';
import type { QrConfig, QrFontId, QrTextAlign } from '../types/qr';

export interface ResolvedEncodedTextStyle {
  fontId: QrFontId;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: 400 | 500 | 600 | 700;
  fontStyle: 'italic' | 'normal';
  textAlign: QrTextAlign;
  color: string;
  letterSpacing: string;
  textDecoration: 'none' | 'underline';
}

const VALID_WEIGHTS = new Set([400, 500, 600, 700]);
const VALID_ALIGNS = new Set<QrTextAlign>(['left', 'center', 'right']);

export function resolveEncodedTextStyle(
  config: Partial<QrConfig> | null | undefined,
  fallbackColor = '#111214'
): ResolvedEncodedTextStyle {
  const safe = config || {};
  const requestedFontId = safe.messageFontId || safe.fontId || 'bricolage';
  const fontMeta = FONT_CATALOG[requestedFontId] || FONT_CATALOG.bricolage;

  const rawSize = Number(safe.messageFontSize);
  const fontSizePx = Number.isFinite(rawSize)
    ? Math.min(44, Math.max(12, Math.round(rawSize)))
    : 18;

  const rawWeight = safe.messageWeight ?? safe.titleWeight ?? 400;
  const fontWeight = (
    VALID_WEIGHTS.has(rawWeight) ? rawWeight : 400
  ) as 400 | 500 | 600 | 700;

  const isItalic =
    typeof safe.messageItalic === 'boolean'
      ? safe.messageItalic
      : Boolean(safe.titleItalic);

  const rawAlign = safe.messageAlign || safe.textAlign || 'center';
  const textAlign: QrTextAlign = VALID_ALIGNS.has(rawAlign) ? rawAlign : 'center';

  const trimmedColor = (safe.messageColor || '').trim();
  const color = /^#[0-9a-fA-F]{3,8}$/.test(trimmedColor)
    ? trimmedColor
    : fallbackColor;

  const rawSpacing = Number(safe.messageLetterSpacing);
  const clampedSpacing = Number.isFinite(rawSpacing)
    ? Math.min(0.25, Math.max(-0.05, rawSpacing))
    : 0;

  const textDecoration =
    safe.messageTextDecoration === 'underline' ? 'underline' : 'none';

  return {
    fontId: fontMeta.id,
    fontFamily: fontMeta.cssFamily,
    fontSizePx,
    fontWeight,
    fontStyle: isItalic ? 'italic' : 'normal',
    textAlign,
    color,
    letterSpacing: `${clampedSpacing}em`,
    textDecoration,
  };
}

export function extractPrimaryFontName(cssFamily: string): string {
  const first = (cssFamily || '').split(',')[0] || '';
  return first.replace(/^['"\s]+|['"\s]+$/g, '');
}
