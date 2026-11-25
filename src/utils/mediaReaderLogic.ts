import type {
  PostScanExperience,
  PostScanMediaItem,
  QrConfig,
  QrSourceState,
} from '../types/qr';
import { normalizeMediaAssetUrl } from './publicUrl';
import { buildShowcaseBackdrop, hexToRgb, mixHexColors, relativeLuminance } from './qrLogic';

export type ReaderContentCategory =
  | 'image-single'
  | 'image-gallery'
  | 'text-free'
  | 'video-single'
  | 'video-gallery'
  | 'document-single'
  | 'audio-single'
  | 'mixed-collection'
  | 'url'
  | 'wifi'
  | 'vcard'
  | 'event'
  | 'email'
  | 'phone'
  | 'sms'
  | 'whatsapp'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'telegram'
  | 'twitter'
  | 'geo'
  | 'payment'
  | 'postcard'
  | 'event-invite'
  | 'business-card'
  | 'private-page';

export type ReaderColorMode = 'dark' | 'light';
export type ReaderTextFont = 'editorial' | 'modern' | 'script' | 'mono';

export interface VideoCompatibilityResult {
  playableInHtml5: boolean;
  reason:
    | 'ok'
    | 'empty'
    | 'external-platform'
    | 'local-only-path'
    | 'unsupported-extension';
  platformName?: string;
  label: string;
  hint: string;
}

export interface ReadingMetrics {
  characters: number;
  words: number;
  lines: number;
  estimatedMinutes: number;
  isLongText: boolean;
}

export interface ReaderThemeTokens {
  mode: ReaderColorMode;
  outerBackground: string;
  surfaceBackground: string;
  surfaceElevated: string;
  mediaStageBg: string;
  borderColor: string;
  textPrimary: string;
  textMuted: string;
  accentColor: string;
  accentContrastText: string;
}

export function resolveReaderCategory(
  source: QrSourceState,
  experience: PostScanExperience
): ReaderContentCategory {
  const tpl = experience.template || 'standard';
  const items = experience.galleryItems || [];
  const hasDocOrAudio = items.some((i) => i.type === 'document' || i.type === 'audio');

  if (tpl === 'mixed-collection') return 'mixed-collection';
  if (tpl === 'video-gallery') return 'video-gallery';
  if (tpl === 'photo-gallery') return 'image-gallery';
  if (tpl === 'media-gallery') {
    const hasImg = items.some((i) => i.type === 'image') || Boolean(source.imageUrl);
    const hasVid = items.some((i) => i.type === 'video') || Boolean(source.videoUrl);
    const hasMixedText = Boolean(experience.mixedTextBlock?.trim());
    if ((hasImg && hasVid) || hasMixedText || hasDocOrAudio) return 'mixed-collection';
    if (hasVid && !hasImg) return 'video-gallery';
    return 'image-gallery';
  }
  if (tpl === 'postcard') return 'postcard';
  if (tpl === 'event-invite') return 'event-invite';
  if (tpl === 'business-card') return 'business-card';
  if (tpl === 'private-page') return 'private-page';
  if (tpl === 'video-page') {
    const videoItems = items.filter((i) => i.type === 'video');
    return videoItems.length > 1 ? 'video-gallery' : 'video-single';
  }

  // Standard: determined by encoded source (also supports single document/audio media routes)
  const rawType = source.type as string;
  if (rawType === 'document') return 'document-single';
  if (rawType === 'audio') return 'audio-single';
  if (source.type === 'image') {
    if (hasDocOrAudio) return 'mixed-collection';
    return 'image-single';
  }
  if (source.type === 'video') {
    if (hasDocOrAudio) return 'mixed-collection';
    return 'video-single';
  }
  if (hasDocOrAudio) return 'mixed-collection';
  if (source.textMode === 'wifi') return 'wifi';
  if (source.textMode === 'url') return 'url';
  if (
    source.textMode === 'vcard' ||
    source.textMode === 'event' ||
    source.textMode === 'email' ||
    source.textMode === 'phone' ||
    source.textMode === 'sms' ||
    source.textMode === 'whatsapp' ||
    source.textMode === 'tiktok' ||
    source.textMode === 'instagram' ||
    source.textMode === 'facebook' ||
    source.textMode === 'telegram' ||
    source.textMode === 'twitter' ||
    source.textMode === 'geo' ||
    source.textMode === 'payment'
  ) {
    return source.textMode;
  }
  return 'text-free';
}

export function looksLikeFilename(raw?: string | null): boolean {
  const value = (raw || '').trim();
  if (!value) return false;

  // Reject filesystem / URL-style paths with segments
  if (/(?:^|\/|\\)(?:uploads|media|tmp|Users|home|var|Volumes)\b/i.test(value)) {
    return true;
  }
  if (/^[a-zA-Z]:\\/.test(value)) {
    return true;
  }

  // Reject explicit file extensions (media, docs, archives, encrypted .spk1)
  if (
    /\.(?:png|jpe?g|webp|gif|svg|avif|heic|heif|bmp|tiff?|ico|mp4|mov|m4v|webm|ogv|avi|mkv|wmv|flv|3gp|mp3|wav|m4a|aac|ogg|oga|flac|opus|pdf|docx?|xlsx?|pptx?|odt|ods|rtf|txt|csv|md|json|xml|zip|rar|7z|tar|gz|spk1)$/i.test(
      value
    )
  ) {
    return true;
  }

  // Reject common camera / scanner / internal technical generated IDs
  if (
    /^(?:IMG|DSC|DCIM|VID|MOV|PXL|MVI|WA\d+|SCREENSHOT|CAPTURE|SCAN|AUDIO|REC)[_-]?\d+/i.test(
      value
    ) ||
    /^(?:media-[a-z0-9_-]{4,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-)/i.test(value) ||
    /^contenu-chiffre(?:\.spk1)?$/i.test(value)
  ) {
    return true;
  }

  return false;
}

const INTERNAL_PLACEHOLDER_CAPTIONS = new Set([
  'mon code qr',
  'scannez pour découvrir',
  'image externe',
  'vidéo externe',
  'image principale',
  'vidéo principale',
  'contenu chiffré',
  'contenu protégé de bout en bout',
  'partagé via sparkqr — lecteur chiffré',
  'collection sparkqr',
  'document sparkqr',
  'audio sparkqr',
]);

export function sanitizePublicCaption(
  raw?: string | null,
  fallback = ''
): string {
  const value = (raw || '').trim();
  if (!value) return fallback;
  if (INTERNAL_PLACEHOLDER_CAPTIONS.has(value.toLowerCase())) {
    return fallback;
  }
  if (looksLikeFilename(value)) {
    return fallback;
  }
  return value;
}

export function resolvePublicReaderTitle(params: {
  customHeadline?: string | null;
  customTitleText?: string | null;
  uppercase?: boolean;
}): string {
  const fromHeadline = sanitizePublicCaption(params.customHeadline, '');
  const fromTitleText = sanitizePublicCaption(params.customTitleText, '');
  const chosen = fromHeadline || fromTitleText;
  if (!chosen) return '';
  return params.uppercase ? chosen.toUpperCase() : chosen;
}

export function resolveGenericCategoryTitle(
  category: ReaderContentCategory,
  counts?: { images?: number; videos?: number; documents?: number; audios?: number }
): string {
  switch (category) {
    case 'image-single':
      return 'Image';
    case 'image-gallery':
      return (counts?.images ?? 0) > 1 ? `Galerie (${counts?.images})` : 'Image';
    case 'video-single':
      return 'Vidéo';
    case 'video-gallery':
      return (counts?.videos ?? 0) > 1 ? `Vidéos (${counts?.videos})` : 'Vidéo';
    case 'document-single':
      return 'Document';
    case 'audio-single':
      return 'Audio';
    case 'mixed-collection':
      return 'Collection';
    case 'text-free':
      return 'Message';
    case 'wifi':
      return 'Réseau Wi-Fi';
    case 'url':
      return 'Lien web';
    case 'vcard':
      return 'Fiche contact';
    case 'event':
      return 'Événement';
    case 'email':
      return 'E-mail';
    case 'phone':
      return 'Téléphone';
    case 'sms':
      return 'SMS';
    case 'whatsapp':
      return 'WhatsApp';
    case 'tiktok':
      return 'TikTok';
    case 'instagram':
      return 'Instagram';
    case 'facebook':
      return 'Facebook';
    case 'telegram':
      return 'Telegram';
    case 'twitter':
      return 'Twitter (X)';
    case 'geo':
      return 'Localisation GPS';
    case 'payment':
      return 'Paiement';
    case 'postcard':
      return 'Carte postale';
    case 'event-invite':
      return 'Invitation';
    case 'business-card':
      return 'Carte de visite';
    case 'private-page':
      return 'Accès privé';
    default:
      return 'SparkQR';
  }
}

export function buildReaderMediaBuckets(
  source: QrSourceState,
  experience: PostScanExperience
): {
  images: PostScanMediaItem[];
  videos: PostScanMediaItem[];
  documents: PostScanMediaItem[];
  audios: PostScanMediaItem[];
  textBody: string;
} {
  const tpl = experience.template || 'standard';
  const gallery = Array.isArray(experience.galleryItems) ? experience.galleryItems : [];
  const safeHeadline = sanitizePublicCaption(experience.headline, '');

  const galleryImages = gallery
    .filter((item) => item.type === 'image' && item.url.trim())
    .map((item) => ({
      ...item,
      url: normalizeMediaAssetUrl(item.url),
      caption: sanitizePublicCaption(item.caption, ''),
    }));
  const galleryVideos = gallery
    .filter((item) => item.type === 'video' && item.url.trim())
    .map((item) => ({
      ...item,
      url: normalizeMediaAssetUrl(item.url),
      caption: sanitizePublicCaption(item.caption, ''),
      posterUrl: item.posterUrl ? normalizeMediaAssetUrl(item.posterUrl) : undefined,
    }));
  const galleryDocs = gallery
    .filter((item) => item.type === 'document' && item.url.trim())
    .map((item) => ({
      ...item,
      url: normalizeMediaAssetUrl(item.url),
      caption: sanitizePublicCaption(item.caption, ''),
    }));
  const galleryAudios = gallery
    .filter((item) => item.type === 'audio' && item.url.trim())
    .map((item) => ({
      ...item,
      url: normalizeMediaAssetUrl(item.url),
      caption: sanitizePublicCaption(item.caption, ''),
    }));

  const images: PostScanMediaItem[] = [];
  const videos: PostScanMediaItem[] = [];
  const documents: PostScanMediaItem[] = [];
  const audios: PostScanMediaItem[] = [];

  if (source.type === 'image' && source.imageUrl.trim()) {
    images.push({
      id: 'source-primary-image',
      type: 'image',
      url: normalizeMediaAssetUrl(source.imageUrl),
      caption: safeHeadline,
      mimeType: source.imageMimeType,
      isEncrypted: source.imageEncrypted,
      originalSize: source.imageSize,
    });
  }

  if (source.type === 'video' && source.videoUrl.trim()) {
    videos.push({
      id: 'source-primary-video',
      type: 'video',
      url: normalizeMediaAssetUrl(source.videoUrl),
      caption: safeHeadline,
      posterUrl: source.videoPosterUrl?.trim()
        ? normalizeMediaAssetUrl(source.videoPosterUrl)
        : undefined,
      mimeType: source.videoMimeType,
      isEncrypted: source.videoEncrypted,
      originalSize: source.videoSize,
    });
  }

  if (source.type === 'document' && source.documentUrl?.trim()) {
    documents.push({
      id: 'source-primary-document',
      type: 'document',
      url: normalizeMediaAssetUrl(source.documentUrl),
      caption: safeHeadline,
      mimeType: source.documentMimeType,
      isEncrypted: source.documentEncrypted,
      originalSize: source.documentSize,
    });
  }

  if (source.type === 'audio' && source.audioUrl?.trim()) {
    audios.push({
      id: 'source-primary-audio',
      type: 'audio',
      url: normalizeMediaAssetUrl(source.audioUrl),
      caption: safeHeadline,
      mimeType: source.audioMimeType,
      isEncrypted: source.audioEncrypted,
      originalSize: source.audioSize,
    });
  }

  const useGallery =
    tpl === 'photo-gallery' ||
    tpl === 'video-gallery' ||
    tpl === 'media-gallery' ||
    tpl === 'mixed-collection' ||
    galleryDocs.length > 0 ||
    galleryAudios.length > 0;

  if (useGallery) {
    for (const img of galleryImages) {
      if (!images.some((existing) => existing.url === img.url)) {
        images.push(img);
      }
    }
    for (const vid of galleryVideos) {
      if (!videos.some((existing) => existing.url === vid.url)) {
        videos.push(vid);
      }
    }
    for (const doc of galleryDocs) {
      if (!documents.some((existing) => existing.url === doc.url)) {
        documents.push(doc);
      }
    }
    for (const aud of galleryAudios) {
      if (!audios.some((existing) => existing.url === aud.url)) {
        audios.push(aud);
      }
    }
  }

  const textBody =
    (experience.mixedTextBlock && experience.mixedTextBlock.trim()) ||
    (source.type === 'text' && source.textMode === 'text' ? source.textValue : '') ||
    sanitizePublicCaption(experience.description, '') ||
    '';

  return { images, videos, documents, audios, textBody };
}

export function inspectVideoSourceCompatibility(rawUrl: string): VideoCompatibilityResult {
  const url = (rawUrl || '').trim();
  if (!url) {
    return {
      playableInHtml5: false,
      reason: 'empty',
      label: 'Aucune source vidéo définie',
      hint: 'Importez un fichier MP4, WebM ou MOV depuis le studio pour l’héberger sur SparkQR.',
    };
  }

  // Detect local filesystem paths that are never reachable from another device
  if (
    /^file:\/\//i.test(url) ||
    /^[a-zA-Z]:\\/.test(url) ||
    /^\/(Users|home|var\/folders|mnt|Volumes)\//i.test(url)
  ) {
    return {
      playableInHtml5: false,
      reason: 'local-only-path',
      label: 'Chemin local non accessible à distance',
      hint: 'Un fichier situé sur un disque local doit être téléversé sur SparkQR (ou hébergé via URL publique HTTPS) pour être lisible après scan.',
    };
  }

  // Detect external video platforms — SparkQR never redirects automatically to YouTube/Vimeo
  const platformPatterns: Array<{ name: string; regex: RegExp }> = [
    { name: 'YouTube', regex: /(?:youtube\.com|youtu\.be)/i },
    { name: 'Vimeo', regex: /vimeo\.com/i },
    { name: 'Dailymotion', regex: /dailymotion\.com|dai\.ly/i },
    { name: 'TikTok', regex: /tiktok\.com/i },
  ];
  for (const p of platformPatterns) {
    if (p.regex.test(url)) {
      return {
        playableInHtml5: false,
        reason: 'external-platform',
        platformName: p.name,
        label: `Lien externe ${p.name} non lisible en flux natif`,
        hint: `Le lecteur natif SparkQR lit directement des flux vidéo HTML5 (MP4, WebM, OGG, MOV) sans redirection automatique vers ${p.name}. Importez le fichier vidéo pour une lecture native intégrée.`,
      };
    }
  }

  // Detect known unsupported container extensions
  const lowerClean = url.split('?')[0].split('#')[0].toLowerCase();
  if (/\.(mkv|avi|wmv|flv|3gp)$/i.test(lowerClean)) {
    return {
      playableInHtml5: false,
      reason: 'unsupported-extension',
      label: 'Format vidéo non pris en charge nativement',
      hint: 'Convertissez la vidéo au format MP4 (H.264/AAC) ou WebM (VP9/AV1) pour une compatibilité universelle mobile et desktop.',
    };
  }

  return {
    playableInHtml5: true,
    reason: 'ok',
    label: 'Flux HTML5 compatible',
    hint: '',
  };
}

export function formatMediaTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const paddedSecs = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${paddedSecs}`;
  }
  return `${mins}:${paddedSecs}`;
}

export function computeReadingMetrics(rawText: string): ReadingMetrics {
  const text = rawText || '';
  const characters = Array.from(text).length;
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const lines = trimmed ? text.split(/\r?\n/).length : 0;
  const estimatedMinutes = words > 0 ? Math.max(1, Math.ceil(words / 200)) : 0;
  const isLongText = characters >= 240 || lines >= 5 || words >= 45;

  return {
    characters,
    words,
    lines,
    estimatedMinutes,
    isLongText,
  };
}

export function getDefaultReaderColorMode(
  config: QrConfig,
  _mood: PostScanExperience['accentMood'] = 'auto',
  readerThemeMode?: 'light' | 'dark'
): ReaderColorMode {
  if (readerThemeMode === 'dark') return 'dark';
  if (readerThemeMode === 'light') return 'light';
  if (relativeLuminance(config.cardBackgroundColor || '#FFFFFF') < 0.22) {
    return 'dark';
  }
  return 'light';
}

function pickLegibleAccent(
  candidates: string[],
  mode: ReaderColorMode
): string {
  const valid = candidates.filter((c) => /^#[0-9a-f]{3,8}$/i.test((c || '').trim()));
  if (valid.length === 0) return mode === 'dark' ? '#60A5FA' : '#2563EB';

  if (mode === 'dark') {
    const vivid = valid.find((c) => {
      const lum = relativeLuminance(c);
      return lum >= 0.2 && lum <= 0.85;
    });
    const base = vivid || valid[0];
    const lum = relativeLuminance(base);
    if (lum < 0.18) {
      return mixHexColors(base, '#FFFFFF', 0.45);
    }
    return base;
  }

  const rich = valid.find((c) => {
    const lum = relativeLuminance(c);
    return lum >= 0.03 && lum <= 0.48;
  });
  const base = rich || valid[0];
  const lum = relativeLuminance(base);
  if (lum > 0.52) {
    return mixHexColors(base, '#0F172A', 0.42);
  }
  return base;
}

export function buildReaderThemeTokens(
  config: QrConfig,
  mood: PostScanExperience['accentMood'] = 'auto',
  modeOverride?: ReaderColorMode
): ReaderThemeTokens {
  const baseBackdrop = buildShowcaseBackdrop(config, mood);
  const mode = modeOverride ?? getDefaultReaderColorMode(config, mood);

  const primary = config.foregroundColor || '#2563EB';
  const secondary = config.foregroundSecondaryColor || primary;
  const eye = config.useCustomEyeColor ? config.eyeColor : secondary;
  const cardBg = config.cardBackgroundColor || '#FFFFFF';
  const isCardDark = relativeLuminance(cardBg) < 0.22;

  const isExplicitMood =
    mood === 'gold-velvet' ||
    mood === 'midnight-neon' ||
    mood === 'cinema-35' ||
    mood === 'botanical';

  const safeAccent = isExplicitMood
    ? pickLegibleAccent([baseBackdrop.accentColor, eye, secondary, primary], mode)
    : pickLegibleAccent([eye, secondary, primary], mode);

  const accentContrastText = relativeLuminance(safeAccent) > 0.45 ? '#090B10' : '#FFFFFF';
  const { r: ar, g: ag, b: ab } = hexToRgb(safeAccent);
  const { r: pr, g: pg, b: pb } = hexToRgb(primary);

  if (mode === 'dark') {
    const isMoodDark =
      mood === 'gold-velvet' || mood === 'midnight-neon' || mood === 'cinema-35';
    const themedDarkOuter = isCardDark
      ? baseBackdrop.outerBackground
      : `radial-gradient(ellipse 72% 52% at 15% 0%, rgba(${ar},${ag},${ab},0.22), transparent 58%), radial-gradient(ellipse 62% 48% at 88% 12%, rgba(${pr},${pg},${pb},0.18), transparent 55%), linear-gradient(155deg, ${mixHexColors(primary, '#07090F', 0.86)} 0%, #090C14 58%, #06080D 100%)`;

    const themedSurface = isMoodDark
      ? baseBackdrop.cardBackground
      : isCardDark
      ? mixHexColors(cardBg, '#10141F', 0.35)
      : mixHexColors(primary, '#10131C', 0.88);

    const themedElevated = isCardDark
      ? 'rgba(255, 255, 255, 0.065)'
      : `rgba(${ar},${ag},${ab},0.10)`;

    return {
      mode: 'dark',
      outerBackground: isMoodDark ? baseBackdrop.outerBackground : themedDarkOuter,
      surfaceBackground: themedSurface,
      surfaceElevated: themedElevated,
      mediaStageBg: isCardDark ? mixHexColors(cardBg, '#05070B', 0.5) : '#06080D',
      borderColor: isMoodDark
        ? baseBackdrop.cardBorder
        : `rgba(${ar},${ag},${ab},0.26)`,
      textPrimary: isMoodDark ? baseBackdrop.textPrimary : '#F8FAFC',
      textMuted: isMoodDark ? baseBackdrop.textMuted : '#9BA6BA',
      accentColor: safeAccent,
      accentContrastText,
    };
  }

  // Light mode — bright luminous gallery surface infused with the QR model's palette
  const lightTintOuter = !isCardDark && relativeLuminance(cardBg) < 0.96
    ? `radial-gradient(ellipse 75% 55% at 14% 0%, rgba(${ar},${ag},${ab},0.14), transparent 60%), radial-gradient(ellipse 62% 48% at 88% 8%, rgba(${pr},${pg},${pb},0.10), transparent 56%), linear-gradient(155deg, ${mixHexColors(cardBg, '#FFFFFF', 0.35)} 0%, ${mixHexColors(cardBg, '#F8FAFC', 0.5)} 100%)`
    : `radial-gradient(ellipse 75% 55% at 14% 0%, rgba(${ar},${ag},${ab},0.11), transparent 60%), radial-gradient(ellipse 60% 48% at 88% 8%, rgba(${pr},${pg},${pb},0.085), transparent 56%), #F6F7FB`;

  const lightSurface =
    !isCardDark && relativeLuminance(cardBg) > 0.78
      ? mixHexColors(cardBg, '#FFFFFF', 0.82)
      : '#FFFFFF';

  const lightElevated =
    !isCardDark && relativeLuminance(cardBg) > 0.78
      ? mixHexColors(cardBg, '#F3F5FA', 0.55)
      : mixHexColors(safeAccent, '#F8FAFC', 0.93);

  return {
    mode: 'light',
    outerBackground: mood === 'botanical' ? baseBackdrop.outerBackground : lightTintOuter,
    surfaceBackground: lightSurface,
    surfaceElevated: lightElevated,
    mediaStageBg: mixHexColors(safeAccent, '#ECEFF6', 0.91),
    borderColor: `rgba(${ar},${ag},${ab},0.18)`,
    textPrimary: '#0F172A',
    textMuted: '#475569',
    accentColor: safeAccent,
    accentContrastText,
  };
}

export const DIRECT_TEXT_QR_MAX_BYTES = 900;

export function needsHostedMediaCollection(
  source: QrSourceState,
  experience: PostScanExperience
): boolean {
  const tpl = experience.template || 'standard';
  if (
    tpl === 'photo-gallery' ||
    tpl === 'video-gallery' ||
    tpl === 'media-gallery' ||
    tpl === 'mixed-collection' ||
    tpl === 'video-page' ||
    tpl === 'postcard' ||
    tpl === 'event-invite' ||
    tpl === 'business-card' ||
    tpl === 'private-page'
  ) {
    return true;
  }
  if (
    source.type === 'image' ||
    source.type === 'video' ||
    source.type === 'document' ||
    source.type === 'audio'
  ) {
    return true;
  }
  if (source.type === 'text' && source.textMode === 'text') {
    // Always open free text inside SparkQR's typographic reader (/m/:id)
    // so smartphones display the formatted message directly instead of triggering Google Search.
    return true;
  }
  return false;
}

export function resolveMediaDownloadUrl(rawUrl: string): string {
  const clean = normalizeMediaAssetUrl(rawUrl);
  const match = clean.match(/^(https?:\/\/[^/]+)?\/api\/media\/([a-zA-Z0-9_-]+)\/file(?:\?.*)?$/);
  if (match) {
    const origin = match[1] || '';
    return `${origin}/api/media/${match[2]}/download`;
  }
  return clean;
}

