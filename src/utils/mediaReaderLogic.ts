import type {
  PostScanExperience,
  PostScanMediaItem,
  QrConfig,
  QrSourceState,
} from '../types/qr';
import { normalizeMediaAssetUrl } from './publicUrl';
import { buildShowcaseBackdrop, relativeLuminance } from './qrLogic';

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
  return 'text-free';
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

  const galleryImages = gallery
    .filter((item) => item.type === 'image' && item.url.trim())
    .map((item) => ({ ...item, url: normalizeMediaAssetUrl(item.url) }));
  const galleryVideos = gallery
    .filter((item) => item.type === 'video' && item.url.trim())
    .map((item) => ({
      ...item,
      url: normalizeMediaAssetUrl(item.url),
      posterUrl: item.posterUrl ? normalizeMediaAssetUrl(item.posterUrl) : undefined,
    }));
  const galleryDocs = gallery
    .filter((item) => item.type === 'document' && item.url.trim())
    .map((item) => ({ ...item, url: normalizeMediaAssetUrl(item.url) }));
  const galleryAudios = gallery
    .filter((item) => item.type === 'audio' && item.url.trim())
    .map((item) => ({ ...item, url: normalizeMediaAssetUrl(item.url) }));

  const images: PostScanMediaItem[] = [];
  const videos: PostScanMediaItem[] = [];
  const documents: PostScanMediaItem[] = [];
  const audios: PostScanMediaItem[] = [];

  if (source.type === 'image' && source.imageUrl.trim()) {
    images.push({
      id: 'source-primary-image',
      type: 'image',
      url: normalizeMediaAssetUrl(source.imageUrl),
      caption: source.imageName || experience.headline || 'Image principale',
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
      caption: source.videoName || experience.headline || 'Vidéo principale',
      posterUrl: source.videoPosterUrl?.trim()
        ? normalizeMediaAssetUrl(source.videoPosterUrl)
        : undefined,
      mimeType: source.videoMimeType,
      isEncrypted: source.videoEncrypted,
      originalSize: source.videoSize,
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
    experience.description ||
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
  _config: QrConfig,
  _mood: PostScanExperience['accentMood'] = 'auto',
  readerThemeMode?: 'light' | 'dark'
): ReaderColorMode {
  if (readerThemeMode === 'dark') return 'dark';
  return 'light';
}

export function buildReaderThemeTokens(
  config: QrConfig,
  mood: PostScanExperience['accentMood'] = 'auto',
  modeOverride?: ReaderColorMode
): ReaderThemeTokens {
  const baseBackdrop = buildShowcaseBackdrop(config, mood);
  const mode = modeOverride ?? getDefaultReaderColorMode(config, mood);

  // Pick a vivid accent with good contrast in the chosen mode
  const rawAccent = baseBackdrop.accentColor || '#1D4ED8';
  const accentLum = relativeLuminance(rawAccent);

  if (mode === 'dark') {
    const safeAccent = accentLum < 0.14 ? '#60A5FA' : rawAccent;
    const accentContrastText = relativeLuminance(safeAccent) > 0.45 ? '#0B0D12' : '#FFFFFF';
    const isMoodDark =
      mood === 'gold-velvet' || mood === 'midnight-neon' || mood === 'cinema-35';
    return {
      mode: 'dark',
      outerBackground: isMoodDark
        ? baseBackdrop.outerBackground
        : 'radial-gradient(circle at 18% 12%, rgba(29,78,216,0.22), transparent 52%), linear-gradient(160deg, #090B10 0%, #101420 55%, #07080D 100%)',
      surfaceBackground: isMoodDark ? baseBackdrop.cardBackground : 'rgba(17, 20, 29, 0.94)',
      surfaceElevated: 'rgba(255, 255, 255, 0.06)',
      mediaStageBg: '#06070A',
      borderColor: isMoodDark ? baseBackdrop.cardBorder : 'rgba(255, 255, 255, 0.12)',
      textPrimary: isMoodDark ? baseBackdrop.textPrimary : '#F8FAFC',
      textMuted: isMoodDark ? baseBackdrop.textMuted : '#9CA3AF',
      accentColor: safeAccent,
      accentContrastText,
    };
  }

  // Light mode — editorial gallery paper
  const safeAccent = accentLum > 0.65 ? '#1D4ED8' : rawAccent;
  const accentContrastText = relativeLuminance(safeAccent) > 0.45 ? '#111214' : '#FFFFFF';
  return {
    mode: 'light',
    outerBackground:
      mood === 'botanical'
        ? baseBackdrop.outerBackground
        : 'radial-gradient(circle at 18% 12%, rgba(29,78,216,0.10), transparent 52%), linear-gradient(160deg, #F6F5F0 0%, #ECEAE2 55%, #FAF9F5 100%)',
    surfaceBackground: 'rgba(255, 255, 255, 0.96)',
    surfaceElevated: '#F3F2EC',
    mediaStageBg: '#121318',
    borderColor: 'rgba(17, 18, 20, 0.11)',
    textPrimary: '#111214',
    textMuted: '#5C5E66',
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
  if (source.type === 'image' || source.type === 'video') {
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

