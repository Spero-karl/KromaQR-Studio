import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  Globe,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Maximize2,
  Minimize2,
  Moon,
  Music,
  Phone,
  RotateCw,
  ShieldCheck,
  Sun,
  Wifi,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  DEFAULT_CONFIG,
  DEFAULT_EXPERIENCE,
  FONT_CATALOG,
} from '../data/presets';
import type { PostScanExperience, PostScanMediaItem, QrConfig, QrSourceState } from '../types/qr';
import { verifyDynamicPinOnServer } from '../utils/dynamicApi';
import {
  decryptBufferChunked,
  extractKeyFromHash,
  isEncryptedSpk1Buffer,
} from '../utils/e2eeCrypto';
import {
  buildReaderMediaBuckets,
  buildReaderThemeTokens,
  getDefaultReaderColorMode,
  resolveGenericCategoryTitle,
  resolveMediaDownloadUrl,
  resolvePublicReaderTitle,
  resolveReaderCategory,
  sanitizePublicCaption,
  type ReaderColorMode,
} from '../utils/mediaReaderLogic';
import { extractHostname, relativeLuminance } from '../utils/qrLogic';
import { extractPrimaryFontName, resolveEncodedTextStyle } from '../utils/textStyle';
import { CustomVideoPlayer } from './CustomVideoPlayer';

interface SparkMediaReaderProps {
  source: QrSourceState;
  config?: QrConfig;
  payload: string;
  experience?: PostScanExperience;
  dynamicSlug?: string | null;
  dynamicHasPin?: boolean;
  standalone?: boolean;
  isEncrypted?: boolean;
  e2eeKey?: string | null;
  onPinUnlocked?: () => void;
  onClose?: () => void;
}

interface DecryptedAssetEntry {
  blobUrl: string;
  mimeType: string;
  textPreview?: string;
}

function inferMimeFromMagicBytes(
  bytes: Uint8Array,
  fallbackType: PostScanMediaItem['type']
): string {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'application/pdf';
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif';
    }
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      return 'video/webm';
    }
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      return 'audio/ogg';
    }
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      return 'audio/mpeg';
    }
  }
  if (bytes.length >= 12) {
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp';
      }
      if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
        return 'audio/wav';
      }
    }
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return 'video/mp4';
    }
  }

  switch (fallbackType) {
    case 'image':
      return 'image/jpeg';
    case 'video':
      return 'video/mp4';
    case 'audio':
      return 'audio/mpeg';
    case 'document':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export const SparkMediaReader: React.FC<SparkMediaReaderProps> = ({
  source,
  config = DEFAULT_CONFIG,
  payload,
  experience = DEFAULT_EXPERIENCE,
  dynamicSlug = null,
  dynamicHasPin = false,
  standalone = false,
  isEncrypted = false,
  e2eeKey = null,
  onPinUnlocked,
  onClose,
}) => {
  const [colorMode, setColorMode] = useState<ReaderColorMode>(() =>
    getDefaultReaderColorMode(config, experience.accentMood || 'auto', experience.readerThemeMode)
  );
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageFullscreen, setImageFullscreen] = useState(false);
  const [pdfExpanded, setPdfExpanded] = useState(false);

  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);
  const [postcardFlipped, setPostcardFlipped] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinUnlocked, setPinUnlocked] = useState(!dynamicHasPin);
  const [verifyingPin, setVerifyingPin] = useState(false);

  const [decryptedAssets, setDecryptedAssets] = useState<Record<string, DecryptedAssetEntry>>({});
  const [decryptingMedia, setDecryptingMedia] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [mediaDecryptError, setMediaDecryptError] = useState<string | null>(null);

  const enteredNativeFsRef = useRef(false);

  const resolvedE2eeKey = useMemo(() => {
    if (e2eeKey) return e2eeKey;
    const fromPayload = extractKeyFromHash(payload);
    if (fromPayload) return fromPayload;
    if (typeof window !== 'undefined') {
      const fromWin = extractKeyFromHash(window.location.hash);
      if (fromWin) return fromWin;
    }
    return source.e2eeKeyFragment || null;
  }, [e2eeKey, payload, source.e2eeKeyFragment]);

  useEffect(() => {
    setColorMode(
      getDefaultReaderColorMode(
        config,
        experience.accentMood || 'auto',
        experience.readerThemeMode
      )
    );
  }, [config, experience.accentMood, experience.readerThemeMode]);

  useEffect(() => {
    setPinUnlocked(!dynamicHasPin);
    setPinAttempt('');
    setPinError(null);
    setActiveImageIdx(0);
    setActiveVideoIdx(0);
    setImageZoom(1);
    setImageFullscreen(false);
    setPdfExpanded(false);
    setImageLoadError(false);
    setPostcardFlipped(false);
  }, [payload, dynamicHasPin, config]);

  const tokens = useMemo(
    () => buildReaderThemeTokens(config, experience.accentMood || 'auto', colorMode),
    [config, experience.accentMood, colorMode]
  );

  const category = useMemo(
    () => resolveReaderCategory(source, experience),
    [source, experience]
  );

  const rawBuckets = useMemo(
    () => buildReaderMediaBuckets(source, experience),
    [source, experience]
  );

  // Decrypt encrypted SPK1 media files (/api/media/:id/file) client-side into Object URLs
  useEffect(() => {
    if (!pinUnlocked) return;

    const candidates: Array<{
      url: string;
      type: PostScanMediaItem['type'];
      mimeType?: string;
      forceDecrypt: boolean;
    }> = [];

    const addCandidate = (
      url: string | undefined,
      type: PostScanMediaItem['type'],
      mimeType?: string,
      forceDecrypt = false
    ) => {
      if (!url) return;
      if (!/\/api\/media\/[a-zA-Z0-9_-]+\/file/.test(url)) return;
      if (!forceDecrypt && !isEncrypted && !resolvedE2eeKey) return;
      if (!candidates.some((c) => c.url === url)) {
        candidates.push({ url, type, mimeType, forceDecrypt });
      }
    };

    for (const img of rawBuckets.images) {
      addCandidate(
        img.url,
        'image',
        img.mimeType,
        Boolean(img.isEncrypted || isEncrypted || source.imageEncrypted)
      );
    }
    for (const vid of rawBuckets.videos) {
      addCandidate(
        vid.url,
        'video',
        vid.mimeType,
        Boolean(vid.isEncrypted || isEncrypted || source.videoEncrypted)
      );
      if (vid.posterUrl) {
        addCandidate(vid.posterUrl, 'image', undefined, Boolean(isEncrypted));
      }
    }
    for (const doc of rawBuckets.documents) {
      addCandidate(doc.url, 'document', doc.mimeType, Boolean(doc.isEncrypted || isEncrypted));
    }
    for (const aud of rawBuckets.audios) {
      addCandidate(aud.url, 'audio', aud.mimeType, Boolean(aud.isEncrypted || isEncrypted));
    }
    if (source.videoPosterUrl) {
      addCandidate(source.videoPosterUrl, 'image', undefined, Boolean(isEncrypted));
    }

    if (candidates.length === 0) {
      setDecryptedAssets({});
      setMediaDecryptError(null);
      setDecryptingMedia(false);
      setLoadingProgress(100);
      return;
    }

    let cancelled = false;
    const createdBlobUrls: string[] = [];
    setDecryptingMedia(true);
    setLoadingProgress(0);
    setMediaDecryptError(null);

    void (async () => {
      const nextMap: Record<string, DecryptedAssetEntry> = {};
      const totalCandidates = candidates.length;
      try {
        for (let idx = 0; idx < totalCandidates; idx++) {
          const item = candidates[idx];
          const res = await fetch(item.url);
          if (!res.ok) continue;

          const contentLengthHeader = res.headers.get('content-length');
          const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;
          let bytes: Uint8Array;

          if (res.body && typeof res.body.getReader === 'function') {
            const reader = res.body.getReader();
            const chunks: Uint8Array[] = [];
            let received = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value && value.byteLength > 0) {
                chunks.push(value);
                received += value.byteLength;
                const dlFrac =
                  totalBytes > 0
                    ? Math.min(1, received / totalBytes)
                    : Math.min(0.95, 1 - Math.exp(-received / (512 * 1024)));
                const pct = Math.min(99, Math.round(((idx + dlFrac * 0.65) / totalCandidates) * 100));
                if (!cancelled) setLoadingProgress((prev) => Math.max(prev, pct));
              }
            }
            bytes = new Uint8Array(received);
            let offset = 0;
            for (const c of chunks) {
              bytes.set(c, offset);
              offset += c.byteLength;
            }
          } else {
            const arrayBuf = await res.arrayBuffer();
            bytes = new Uint8Array(arrayBuf);
            if (!cancelled) {
              setLoadingProgress((prev) =>
                Math.max(prev, Math.round(((idx + 0.65) / totalCandidates) * 100))
              );
            }
          }

          if (!isEncryptedSpk1Buffer(bytes)) {
            if (!cancelled) {
              setLoadingProgress(Math.round(((idx + 1) / totalCandidates) * 100));
            }
            continue;
          }
          if (!resolvedE2eeKey) {
            throw new Error(
              'Lien incomplet : la clé d’accès requise pour ouvrir ce contenu est absente.'
            );
          }
          const plain = await decryptBufferChunked(bytes, resolvedE2eeKey, (frac) => {
            if (cancelled) return;
            const pct = Math.min(
              99,
              Math.round(((idx + 0.65 + frac * 0.35) / totalCandidates) * 100)
            );
            setLoadingProgress((prev) => Math.max(prev, pct));
          });
          const resolvedMime = item.mimeType || inferMimeFromMagicBytes(plain, item.type);
          const safeCopy = new Uint8Array(plain.byteLength);
          safeCopy.set(plain);
          const blob = new Blob([safeCopy.buffer], { type: resolvedMime });
          const blobUrl = URL.createObjectURL(blob);
          createdBlobUrls.push(blobUrl);

          let textPreview: string | undefined;
          if (
            resolvedMime.startsWith('text/') &&
            plain.byteLength <= 512 * 1024
          ) {
            textPreview = new TextDecoder('utf-8', { fatal: false }).decode(plain);
          }

          nextMap[item.url] = {
            blobUrl,
            mimeType: resolvedMime,
            textPreview,
          };
          if (!cancelled) {
            setLoadingProgress(Math.round(((idx + 1) / totalCandidates) * 100));
          }
        }
        if (!cancelled) {
          setLoadingProgress(100);
          setDecryptedAssets(nextMap);
          setImageLoadError(false);
        } else {
          createdBlobUrls.forEach((u) => URL.revokeObjectURL(u));
        }
      } catch (err) {
        createdBlobUrls.forEach((u) => URL.revokeObjectURL(u));
        if (!cancelled) {
          setMediaDecryptError(
            err instanceof Error
              ? err.message
              : 'Impossible de charger ce contenu protégé avec ce lien.'
          );
        }
      } finally {
        if (!cancelled) setDecryptingMedia(false);
      }
    })();

    return () => {
      cancelled = true;
      createdBlobUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [rawBuckets, resolvedE2eeKey, isEncrypted, pinUnlocked, source.imageEncrypted, source.videoEncrypted, source.videoPosterUrl]);

  const buckets = useMemo(() => {
    const mapUrl = (u: string) => decryptedAssets[u]?.blobUrl || u;
    return {
      images: rawBuckets.images.map((item) => ({ ...item, url: mapUrl(item.url) })),
      videos: rawBuckets.videos.map((item) => ({
        ...item,
        url: mapUrl(item.url),
        posterUrl: item.posterUrl ? mapUrl(item.posterUrl) : undefined,
      })),
      documents: rawBuckets.documents.map((item) => ({
        ...item,
        rawUrl: item.url,
        url: mapUrl(item.url),
        resolvedMime: decryptedAssets[item.url]?.mimeType || item.mimeType || 'application/pdf',
        textPreview: decryptedAssets[item.url]?.textPreview,
      })),
      audios: rawBuckets.audios.map((item) => ({
        ...item,
        rawUrl: item.url,
        url: mapUrl(item.url),
        resolvedMime: decryptedAssets[item.url]?.mimeType || item.mimeType || 'audio/mpeg',
      })),
      textBody: rawBuckets.textBody,
    };
  }, [rawBuckets, decryptedAssets]);

  const exactTextStyle = useMemo(
    () => resolveEncodedTextStyle(config, tokens.textPrimary),
    [config, tokens.textPrimary]
  );

  const titleFontCss =
    FONT_CATALOG[config.fontId]?.cssFamily || FONT_CATALOG.bricolage.cssFamily;
  const subtitleFontCss =
    FONT_CATALOG[config.subtitleFontId]?.cssFamily || titleFontCss;

  // Preload exact Google Fonts so cursive/display fonts render crisply upon opening
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    const families = new Set<string>();
    for (const css of [exactTextStyle.fontFamily, titleFontCss, subtitleFontCss]) {
      const primary = extractPrimaryFontName(css);
      if (primary) families.add(primary);
    }
    for (const family of families) {
      const descriptor = `${exactTextStyle.fontStyle === 'italic' ? 'italic ' : ''}${exactTextStyle.fontWeight} ${exactTextStyle.fontSizePx}px "${family}"`;
      void document.fonts.load(descriptor).catch(() => {});
      void document.fonts.load(`700 22px "${family}"`).catch(() => {});
    }
  }, [
    exactTextStyle.fontFamily,
    exactTextStyle.fontStyle,
    exactTextStyle.fontWeight,
    exactTextStyle.fontSizePx,
    titleFontCss,
    subtitleFontCss,
  ]);

  const safeImageIdx = Math.min(activeImageIdx, Math.max(0, buckets.images.length - 1));
  const safeVideoIdx = Math.min(activeVideoIdx, Math.max(0, buckets.videos.length - 1));
  const currentImage = buckets.images[safeImageIdx];
  const currentVideo = buckets.videos[safeVideoIdx];

  const handleNextImage = useCallback(() => {
    if (buckets.images.length <= 1) return;
    setImageZoom(1);
    setActiveImageIdx((i) => (i + 1) % buckets.images.length);
  }, [buckets.images.length]);

  const handlePrevImage = useCallback(() => {
    if (buckets.images.length <= 1) return;
    setImageZoom(1);
    setActiveImageIdx((i) => (i - 1 + buckets.images.length) % buckets.images.length);
  }, [buckets.images.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (imageFullscreen && e.key === 'Escape') {
        e.stopPropagation();
        setImageFullscreen(false);
        return;
      }
      if (buckets.images.length > 1) {
        if (e.key === 'ArrowRight') handleNextImage();
        if (e.key === 'ArrowLeft') handlePrevImage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imageFullscreen, buckets.images.length, handleNextImage, handlePrevImage]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && enteredNativeFsRef.current) {
        enteredNativeFsRef.current = false;
        setImageFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleImageFullscreen = async () => {
    if (!imageFullscreen) {
      setImageFullscreen(true);
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          enteredNativeFsRef.current = true;
        }
      } catch {
        // Fallback lightbox remains active even if Fullscreen API is restricted
      }
    } else {
      enteredNativeFsRef.current = false;
      setImageFullscreen(false);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // Ignore
        }
      }
    }
  };

  const handleCopyText = async (value: string, docId?: string) => {
    try {
      await navigator.clipboard.writeText(value);
      if (docId) {
        setCopiedDocId(docId);
        setTimeout(() => setCopiedDocId(null), 1800);
      } else {
        setCopiedPayload(true);
        setTimeout(() => setCopiedPayload(false), 1800);
      }
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleServerPinCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dynamicSlug) {
      setPinUnlocked(true);
      return;
    }
    setPinError(null);
    setVerifyingPin(true);
    try {
      const res = await verifyDynamicPinOnServer(dynamicSlug, pinAttempt);
      if (res.valid) {
        setPinUnlocked(true);
        onPinUnlocked?.();
      } else {
        setPinError(res.error || 'Code PIN incorrect.');
      }
    } catch {
      setPinError('Connexion momentanément indisponible. Réessayez.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const isWebLink = /^https?:\/\//i.test(payload);
  const hostname = isWebLink ? extractHostname(payload) : '';

  // Strict title rule: show custom user title when configured, else clean generic category label (never raw filenames)
  const customTitle = resolvePublicReaderTitle({
    customHeadline: experience.headline,
    customTitleText: config.titleText,
    uppercase: config.titleUppercase,
  });
  const genericTitle = resolveGenericCategoryTitle(category, {
    images: buckets.images.length,
    videos: buckets.videos.length,
    documents: buckets.documents.length,
    audios: buckets.audios.length,
  });
  const displayTitle = customTitle || genericTitle;

  const customDescription = sanitizePublicCaption(experience.description, '');

  const showImageSection =
    (category === 'image-single' ||
      category === 'image-gallery' ||
      category === 'mixed-collection' ||
      (category === 'private-page' && buckets.images.length > 0)) &&
    buckets.images.length > 0;

  const showVideoSection =
    (category === 'video-single' ||
      category === 'video-gallery' ||
      category === 'mixed-collection') &&
    buckets.videos.length > 0;

  const showDocumentSection = buckets.documents.length > 0;
  const showAudioSection = buckets.audios.length > 0;

  const showTextSection =
    category === 'text-free' ||
    (category === 'mixed-collection' && Boolean(buckets.textBody.trim()));

  // Preserve exact typography while protecting legibility if user switches reader to Dark mode
  const safeTextColor =
    colorMode === 'dark' && relativeLuminance(exactTextStyle.color) < 0.09
      ? tokens.textPrimary
      : exactTextStyle.color;

  const displayedTextStyle: React.CSSProperties = {
    fontFamily: exactTextStyle.fontFamily,
    fontSize: `${exactTextStyle.fontSizePx}px`,
    fontWeight: exactTextStyle.fontWeight,
    fontStyle: exactTextStyle.fontStyle,
    textAlign: exactTextStyle.textAlign,
    color: safeTextColor,
    letterSpacing: exactTextStyle.letterSpacing,
    textDecoration: exactTextStyle.textDecoration,
  };

  const resolveSafeDownloadHref = (url: string): string => {
    if (url.startsWith('blob:')) return url;
    return resolveMediaDownloadUrl(url);
  };

  const hasDedicatedPageAction = isWebLink && !standalone;
  const showCopyInFooter =
    category === 'text-free' || category === 'url' || category === 'mixed-collection';

  const showFooter =
    pinUnlocked && (showCopyInFooter || hasDedicatedPageAction);

  // Subtle reader-width adjustment: documents/mixed collections/long text enjoy comfortable breadth
  const standaloneMaxWidth =
    category === 'text-free' || showDocumentSection || category === 'mixed-collection'
      ? 'max-w-4xl'
      : 'max-w-3xl';

  const isGlassTheme =
    config.frameStyle === 'glass' || config.frameStyle === 'smoked-glass';
  const articleRadiusPx = Math.max(16, Math.min(28, config.cornerRadius || 20));
  const articleAccentBorder =
    config.borderWidth && config.borderWidth > 0 && config.borderColor
      ? config.borderColor
      : tokens.borderColor;

  return (
    <div
      data-testid="spark-media-reader"
      data-reader-mode={colorMode}
      data-reader-category={category}
      className={
        standalone
          ? 'min-h-[100dvh] w-full flex flex-col px-3.5 py-5 pb-safe pt-safe sm:px-6 sm:py-8 transition-colors duration-200'
          : 'relative w-full transition-colors duration-200 rounded-2xl'
      }
      style={{
        background: tokens.outerBackground,
        color: tokens.textPrimary,
      }}
    >
      <div
        className={
          standalone
            ? `${standaloneMaxWidth} w-full mx-auto sm:my-auto space-y-3.5`
            : 'w-full p-3 sm:p-5 space-y-3.5'
        }
      >
        {/* Top Brand + Theme Toggle Bar */}
        <header
          className="flex items-center justify-between gap-2 px-1"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center border shrink-0"
              style={{
                backgroundColor: tokens.surfaceBackground,
                borderColor: tokens.borderColor,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                style={{ color: tokens.accentColor }}
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="2"
                  width="8"
                  height="8"
                  rx="2.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                />
                <rect
                  x="14"
                  y="2"
                  width="8"
                  height="8"
                  rx="4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                />
                <rect
                  x="2"
                  y="14"
                  width="8"
                  height="8"
                  rx="2.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                />
                <rect x="14.5" y="14.5" width="3.5" height="3.5" rx="1" fill="currentColor" />
                <rect x="19" y="19" width="3.5" height="3.5" rx="1" fill="currentColor" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5 text-xs tracking-tight min-w-0">
              <span className="font-display font-bold truncate" style={{ fontFamily: titleFontCss }}>
                SparkQR
              </span>
              {(isEncrypted || Boolean(resolvedE2eeKey)) && (
                <>
                  <span aria-hidden="true" style={{ color: tokens.textMuted }}>
                    ·
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap"
                    style={{ color: tokens.accentColor }}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Protégé</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="reader-theme-toggle"
              onClick={() => setColorMode((m) => (m === 'dark' ? 'light' : 'dark'))}
              aria-label={
                colorMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'
              }
              className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              style={{
                backgroundColor: tokens.surfaceBackground,
                borderColor: tokens.borderColor,
                color: tokens.textPrimary,
              }}
            >
              {colorMode === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clair</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sombre</span>
                </>
              )}
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer le lecteur"
                className="w-[38px] h-[38px] inline-flex items-center justify-center rounded-xl border transition-colors cursor-pointer"
                style={{
                  backgroundColor: tokens.surfaceBackground,
                  borderColor: tokens.borderColor,
                  color: tokens.textPrimary,
                }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Unified Content Surface Inheriting QR Model Theme */}
        <article
          className={`border shadow-[0_18px_50px_rgba(15,23,42,0.10)] p-4 sm:p-6 space-y-4 animate-spark-enter relative overflow-hidden ${
            isGlassTheme ? 'backdrop-blur-md' : ''
          }`}
          style={{
            backgroundColor: tokens.surfaceBackground,
            borderColor: articleAccentBorder,
            borderRadius: `${articleRadiusPx}px`,
            fontFamily: subtitleFontCss,
          }}
        >
          {/* Editorial Heading & Optional Custom Subtitle */}
          {category === 'text-free' && !customTitle && !customDescription ? (
            <h1 id="target-preview-title" className="sr-only">
              {displayTitle}
            </h1>
          ) : (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <h1
                  id="target-preview-title"
                  className="tracking-tight leading-snug break-words"
                  style={{
                    fontFamily: titleFontCss,
                    fontSize: customTitle
                      ? `${Math.max(20, Math.min(28, (config.titleSize || 20) + 2))}px`
                      : '18px',
                    fontWeight: customTitle ? config.titleWeight || 700 : 700,
                    fontStyle: customTitle && config.titleItalic ? 'italic' : 'normal',
                    color: tokens.textPrimary,
                  }}
                >
                  {displayTitle}
                </h1>
                {customDescription && (
                  <p
                    className="leading-relaxed"
                    style={{
                      fontFamily: subtitleFontCss,
                      fontSize: `${Math.max(13, config.subtitleSize || 13)}px`,
                      color: tokens.textMuted,
                    }}
                  >
                    {customDescription}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {showImageSection && buckets.images.length > 1 && (
                  <span
                    className="text-xs font-mono tabular-nums shrink-0"
                    style={{ color: tokens.textMuted }}
                  >
                    {safeImageIdx + 1} / {buckets.images.length}
                  </span>
                )}
                {showVideoSection && buckets.videos.length > 1 && !showImageSection && (
                  <span
                    className="text-xs font-mono tabular-nums shrink-0"
                    style={{ color: tokens.textMuted }}
                  >
                    {safeVideoIdx + 1} / {buckets.videos.length}
                  </span>
                )}
                {currentVideo && showVideoSection && !showImageSection && !showDocumentSection && !showAudioSection && (
                  <a
                    href={resolveSafeDownloadHref(currentVideo.url)}
                    download="video-sparkqr"
                    className="inline-flex items-center gap-1.5 px-3 min-h-[34px] text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0"
                    style={{
                      color: tokens.textPrimary,
                      backgroundColor: tokens.surfaceElevated,
                      borderColor: tokens.borderColor,
                    }}
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Télécharger</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Server PIN Gate if dynamic QR has PIN */}
          {dynamicHasPin && !pinUnlocked ? (
            <form
              onSubmit={(e) => void handleServerPinCheck(e)}
              data-testid="modal-pin-gate"
              className="rounded-xl p-5 border space-y-3.5"
              style={{
                borderColor: tokens.borderColor,
                backgroundColor: tokens.surfaceElevated,
              }}
            >
              <div
                className="flex items-center gap-2 text-xs font-semibold"
                style={{ color: tokens.accentColor }}
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>Accès protégé par code PIN</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: tokens.textMuted }}>
                Entrez le code PIN configuré pour afficher ce contenu.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  value={pinAttempt}
                  onChange={(e) => setPinAttempt(e.target.value)}
                  placeholder="Code PIN"
                  required
                  className="flex-1 min-w-[140px] px-3.5 py-2.5 text-sm rounded-xl border bg-transparent focus:outline-none"
                  style={{ borderColor: tokens.borderColor, color: tokens.textPrimary }}
                />
                <button
                  type="submit"
                  disabled={verifyingPin}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-opacity disabled:opacity-60"
                  style={{
                    backgroundColor: tokens.accentColor,
                    color: tokens.accentContrastText,
                  }}
                >
                  {verifyingPin ? 'Vérification...' : 'Déverrouiller'}
                </button>
              </div>
              {pinError && (
                <p role="alert" className="text-xs font-semibold text-red-500">
                  {pinError}
                </p>
              )}
            </form>
          ) : (
            <>
              {decryptingMedia && (
                <div
                  data-testid="reader-loading-progress"
                  className="rounded-xl border px-4 py-4 space-y-2.5"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <Loader2
                        className="w-4 h-4 animate-spin shrink-0"
                        style={{ color: tokens.accentColor }}
                        aria-hidden="true"
                      />
                      <span style={{ color: tokens.textPrimary }}>Chargement</span>
                    </div>
                    <span
                      className="font-mono tabular-nums"
                      style={{ color: tokens.accentColor }}
                    >
                      {loadingProgress}%
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={loadingProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: tokens.borderColor }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-150"
                      style={{
                        width: `${Math.max(4, loadingProgress)}%`,
                        backgroundColor: tokens.accentColor,
                      }}
                    />
                  </div>
                </div>
              )}

              {mediaDecryptError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-red-400/40 bg-red-500/10 text-xs text-red-500"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{mediaDecryptError}</span>
                </div>
              )}

              {/* 1. IMAGE VIEWER */}
              {showImageSection && currentImage && !(decryptingMedia && /\/api\/media\/[a-zA-Z0-9_-]+\/file/.test(currentImage.url)) && (
                <section
                  aria-label="Visionneuse d’image"
                  data-testid="reader-image-section"
                  className="space-y-2.5"
                >
                  {currentImage.caption && currentImage.caption !== displayTitle && (
                    <p className="text-xs font-semibold" style={{ color: tokens.textMuted }}>
                      {currentImage.caption}
                    </p>
                  )}

                  {/* Edge-clean visual viewport (preserves original proportions with zero crop) */}
                  <div
                    className="relative rounded-xl overflow-hidden border flex items-center justify-center p-2 sm:p-3"
                    style={{
                      backgroundColor: tokens.mediaStageBg,
                      borderColor: tokens.borderColor,
                    }}
                  >
                    <div className="w-full max-h-[72dvh] overflow-auto flex items-center justify-center">
                      {imageLoadError ? (
                        <div className="p-6 text-center space-y-1.5" style={{ color: tokens.textPrimary }}>
                          <p className="text-sm font-semibold">Impossible de charger cette image</p>
                          <p className="text-xs" style={{ color: tokens.textMuted }}>
                            Vérifiez que l’image est accessible ou que le lien complet est conservé.
                          </p>
                        </div>
                      ) : (
                        <img
                          data-testid="reader-active-image"
                          src={currentImage.url}
                          alt={currentImage.caption || customTitle || 'Image'}
                          referrerPolicy="no-referrer"
                          onLoad={() => setImageLoadError(false)}
                          onError={() => {
                            if (!decryptingMedia) setImageLoadError(true);
                          }}
                          onClick={() => {
                            if (imageZoom === 1) {
                              void toggleImageFullscreen();
                            }
                          }}
                          onDoubleClick={() => setImageZoom((z) => (z > 1 ? 1 : 2))}
                          style={{
                            transform: `scale(${imageZoom})`,
                            transformOrigin: 'center center',
                            transition: 'transform 160ms ease',
                          }}
                          className={`max-w-full max-h-[68dvh] w-auto h-auto object-contain select-none rounded-lg ${
                            imageZoom === 1 ? 'cursor-zoom-in' : 'cursor-grab'
                          }`}
                        />
                      )}
                    </div>

                    {buckets.images.length > 1 && (
                      <>
                        <button
                          type="button"
                          data-testid="reader-img-prev"
                          aria-label="Image précédente"
                          onClick={handlePrevImage}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 transition-colors cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          data-testid="reader-img-next"
                          aria-label="Image suivante"
                          onClick={handleNextImage}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 transition-colors cursor-pointer"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Slim Unified Image Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        data-testid="reader-zoom-out"
                        aria-label="Dézoomer l’image"
                        onClick={() =>
                          setImageZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))
                        }
                        disabled={imageZoom <= 1}
                        style={{
                          backgroundColor: tokens.surfaceElevated,
                          borderColor: tokens.borderColor,
                          color: tokens.textPrimary,
                        }}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-lg border disabled:opacity-40 transition-opacity cursor-pointer"
                      >
                        <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-testid="reader-zoom-reset"
                        onClick={() => setImageZoom(1)}
                        style={{
                          backgroundColor: tokens.surfaceElevated,
                          borderColor: tokens.borderColor,
                          color: tokens.textPrimary,
                        }}
                        className="px-2.5 h-9 rounded-lg border font-mono text-xs tabular-nums cursor-pointer"
                      >
                        {Math.round(imageZoom * 100)}%
                      </button>
                      <button
                        type="button"
                        data-testid="reader-zoom-in"
                        aria-label="Zoomer sur l’image"
                        onClick={() =>
                          setImageZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))
                        }
                        disabled={imageZoom >= 3}
                        style={{
                          backgroundColor: tokens.surfaceElevated,
                          borderColor: tokens.borderColor,
                          color: tokens.textPrimary,
                        }}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-lg border disabled:opacity-40 transition-opacity cursor-pointer"
                      >
                        <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="reader-fullscreen-btn"
                        aria-label="Plein écran image"
                        onClick={() => void toggleImageFullscreen()}
                        style={{
                          backgroundColor: tokens.surfaceElevated,
                          borderColor: tokens.borderColor,
                          color: tokens.textPrimary,
                        }}
                        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-semibold whitespace-nowrap cursor-pointer"
                      >
                        {imageFullscreen ? (
                          <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>Plein écran</span>
                      </button>

                      <a
                        href={resolveSafeDownloadHref(currentImage.url)}
                        download="image-sparkqr"
                        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
                        style={{
                          backgroundColor: tokens.accentColor,
                          color: tokens.accentContrastText,
                        }}
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Télécharger</span>
                      </a>
                    </div>
                  </div>

                  {buckets.images.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pt-0.5 pb-1 no-scrollbar">
                      {buckets.images.map((img, idx) => {
                        const active = idx === safeImageIdx;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            aria-label={`Afficher l’image ${idx + 1}`}
                            onClick={() => {
                              setImageZoom(1);
                              setActiveImageIdx(idx);
                            }}
                            className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-opacity cursor-pointer"
                            style={{
                              borderColor: active ? tokens.accentColor : tokens.borderColor,
                              opacity: active ? 1 : 0.65,
                            }}
                          >
                            <img
                              src={img.url}
                              alt={`Image ${idx + 1}`}
                              className="w-full h-full object-contain"
                              style={{ backgroundColor: tokens.mediaStageBg }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* 2. VIDEO PLAYER */}
              {showVideoSection && currentVideo && !(decryptingMedia && /\/api\/media\/[a-zA-Z0-9_-]+\/file/.test(currentVideo.url)) && (
                <section
                  aria-label="Lecteur vidéo"
                  data-testid="reader-video-section"
                  className="space-y-3"
                >
                  {currentVideo.caption && currentVideo.caption !== displayTitle && (
                    <p className="text-xs font-semibold" style={{ color: tokens.textMuted }}>
                      {currentVideo.caption}
                    </p>
                  )}

                  <CustomVideoPlayer
                    src={currentVideo.url}
                    poster={currentVideo.posterUrl || source.videoPosterUrl}
                    title={currentVideo.caption || customTitle || 'Vidéo'}
                    accentColor={tokens.accentColor}
                    borderColor={tokens.borderColor}
                  />

                  {buckets.videos.length > 1 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {buckets.videos.map((vid, idx) => {
                        const active = idx === safeVideoIdx;
                        return (
                          <button
                            key={vid.id}
                            type="button"
                            data-testid={`reader-video-item-${idx}`}
                            onClick={() => setActiveVideoIdx(idx)}
                            className="flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors cursor-pointer"
                            style={{
                              borderColor: active ? tokens.accentColor : tokens.borderColor,
                              backgroundColor: active
                                ? tokens.surfaceElevated
                                : 'transparent',
                            }}
                          >
                            <div className="w-14 h-10 rounded-lg overflow-hidden bg-black shrink-0 flex items-center justify-center">
                              {vid.posterUrl ? (
                                <img
                                  src={vid.posterUrl}
                                  alt=""
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <Film className="w-4 h-4 text-white/70" aria-hidden="true" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="block text-xs font-semibold truncate">
                                {vid.caption || `Séquence ${idx + 1}`}
                              </span>
                              <span
                                className="block text-[11px]"
                                style={{ color: tokens.textMuted }}
                              >
                                {active ? 'En lecture' : 'Lire'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* 2b. AUDIO PLAYER */}
              {showAudioSection && (
                <section aria-label="Lecteur audio" className="space-y-2.5">
                  {buckets.audios.map((aud, idx) => (
                    <div
                      key={aud.id}
                      className="rounded-xl p-3.5 sm:p-4 border space-y-3"
                      style={{
                        borderColor: tokens.borderColor,
                        backgroundColor: tokens.surfaceElevated,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: tokens.accentColor,
                              color: tokens.accentContrastText,
                            }}
                          >
                            <Music className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <span className="text-sm font-semibold truncate">
                            {aud.caption || (buckets.audios.length > 1 ? `Audio ${idx + 1}` : 'Audio')}
                          </span>
                        </div>
                        <a
                          href={resolveSafeDownloadHref(aud.url)}
                          download="audio-sparkqr"
                          className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-85"
                          style={{
                            borderColor: tokens.borderColor,
                            backgroundColor: tokens.surfaceBackground,
                            color: tokens.textPrimary,
                          }}
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Télécharger</span>
                        </a>
                      </div>
                      <audio controls src={aud.url} className="w-full h-11" />
                    </div>
                  ))}
                </section>
              )}

              {/* 2c. DOCUMENT & PDF VIEWER */}
              {showDocumentSection && (
                <section aria-label="Lecteur de documents" className="space-y-3">
                  {buckets.documents.map((doc, idx) => {
                    const isPdf = doc.resolvedMime === 'application/pdf';
                    const isTextDoc = doc.textPreview !== undefined;
                    const canRenderPdfFrame = isPdf && (doc.url.startsWith('blob:') || !doc.isEncrypted);
                    const label =
                      doc.caption ||
                      (isPdf
                        ? buckets.documents.length > 1
                          ? `Document PDF ${idx + 1}`
                          : 'Document PDF'
                        : buckets.documents.length > 1
                        ? `Document ${idx + 1}`
                        : 'Document');

                    return (
                      <div
                        key={doc.id}
                        className="rounded-xl border overflow-hidden"
                        style={{
                          borderColor: tokens.borderColor,
                          backgroundColor: tokens.surfaceElevated,
                        }}
                      >
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b"
                          style={{ borderColor: tokens.borderColor }}
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold min-w-0">
                            <FileText
                              className="w-4 h-4 shrink-0"
                              style={{ color: tokens.accentColor }}
                              aria-hidden="true"
                            />
                            <span className="truncate">{label}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isTextDoc && (
                              <button
                                type="button"
                                onClick={() => void handleCopyText(doc.textPreview || '', doc.id)}
                                className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] rounded-lg border text-xs font-semibold whitespace-nowrap cursor-pointer"
                                style={{
                                  backgroundColor: tokens.surfaceBackground,
                                  borderColor: tokens.borderColor,
                                  color: tokens.textPrimary,
                                }}
                              >
                                {copiedDocId === doc.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                                    <span>Copié</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>Copier</span>
                                  </>
                                )}
                              </button>
                            )}

                            {canRenderPdfFrame && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPdfExpanded((v) => !v)}
                                  className="hidden sm:inline-flex items-center gap-1 px-2.5 min-h-[34px] rounded-lg border text-xs font-semibold whitespace-nowrap cursor-pointer"
                                  style={{
                                    backgroundColor: tokens.surfaceBackground,
                                    borderColor: tokens.borderColor,
                                    color: tokens.textPrimary,
                                  }}
                                >
                                  {pdfExpanded ? (
                                    <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  ) : (
                                    <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  )}
                                  <span>{pdfExpanded ? 'Réduire' : 'Agrandir'}</span>
                                </button>
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] rounded-lg border text-xs font-semibold whitespace-nowrap"
                                  style={{
                                    backgroundColor: tokens.surfaceBackground,
                                    borderColor: tokens.borderColor,
                                    color: tokens.textPrimary,
                                  }}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Ouvrir</span>
                                </a>
                              </>
                            )}

                            <a
                              href={resolveSafeDownloadHref(doc.url)}
                              download={isPdf ? 'document-sparkqr.pdf' : 'document-sparkqr'}
                              className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
                              style={{
                                backgroundColor: tokens.accentColor,
                                color: tokens.accentContrastText,
                              }}
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Télécharger</span>
                            </a>
                          </div>
                        </div>

                        {isTextDoc ? (
                          <pre
                            className="p-4 text-xs sm:text-sm font-mono whitespace-pre-wrap break-words max-h-[62dvh] overflow-y-auto leading-relaxed"
                            style={{
                              backgroundColor: tokens.surfaceBackground,
                              color: tokens.textPrimary,
                            }}
                          >
                            {doc.textPreview}
                          </pre>
                        ) : canRenderPdfFrame ? (
                          <iframe
                            src={doc.url}
                            title={label}
                            className={`w-full bg-white transition-all duration-200 ${
                              pdfExpanded ? 'h-[82dvh]' : 'h-[62dvh] sm:h-[70dvh]'
                            }`}
                          />
                        ) : (
                          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <p className="text-xs leading-relaxed" style={{ color: tokens.textMuted }}>
                              Ce document est prêt à être consulté sur votre appareil via le bouton Télécharger.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {/* 3. EXACT TYPOGRAPHIC TEXT READER */}
              {showTextSection && (
                <section
                  aria-label="Message"
                  data-testid="reader-text-section"
                  className={
                    category === 'text-free'
                      ? 'w-full py-2 sm:py-4'
                      : 'w-full pt-3.5 border-t'
                  }
                  style={
                    category === 'text-free'
                      ? undefined
                      : { borderColor: tokens.borderColor }
                  }
                >
                  <p
                    data-testid="reader-text-body"
                    className="w-full leading-relaxed whitespace-pre-wrap break-words"
                    style={displayedTextStyle}
                  >
                    {buckets.textBody || source.textValue}
                  </p>
                </section>
              )}

              {/* 4. INTERACTIVE POSTCARD */}
              {category === 'postcard' && (
                <div
                  data-testid="exp-postcard-view"
                  className="rounded-xl p-4 sm:p-5 border space-y-3.5"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div
                    className="flex items-center justify-between gap-2 text-xs"
                    style={{ color: tokens.textMuted }}
                  >
                    <span>{experience.postcardFrom}</span>
                    <button
                      type="button"
                      data-testid="flip-postcard-btn"
                      onClick={() => setPostcardFlipped((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer"
                      style={{
                        borderColor: tokens.borderColor,
                        color: tokens.accentColor,
                      }}
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {postcardFlipped ? 'Voir le recto' : 'Retourner (verso)'}
                      </span>
                    </button>
                  </div>

                  {!postcardFlipped ? (
                    <div className="space-y-3">
                      {source.imageUrl && (
                        <img
                          src={decryptedAssets[source.imageUrl]?.blobUrl || source.imageUrl}
                          alt={customTitle || 'Carte postale'}
                          className="w-full max-h-[320px] object-contain rounded-lg bg-black/10"
                        />
                      )}
                      <p
                        className="leading-relaxed whitespace-pre-wrap"
                        style={{
                          fontFamily: FONT_CATALOG.dancing.cssFamily,
                          fontSize: '24px',
                          color: tokens.textPrimary,
                        }}
                      >
                        {source.textValue ||
                          customDescription ||
                          'Souvenir envoyé via SparkQR.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <div
                        className="space-y-1.5 border-b sm:border-b-0 sm:border-r pb-3 sm:pb-0 sm:pr-4"
                        style={{ borderColor: tokens.borderColor }}
                      >
                        <span
                          className="text-[11px] uppercase tracking-wider"
                          style={{ color: tokens.textMuted }}
                        >
                          Correspondance
                        </span>
                        <p
                          className="text-sm leading-relaxed whitespace-pre-wrap"
                          style={{ color: tokens.textPrimary }}
                        >
                          {customDescription ||
                            source.textValue ||
                            'Merci de votre visite.'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div
                          className="inline-block px-2.5 py-1 border border-dashed rounded text-[10px] font-mono"
                          style={{
                            borderColor: tokens.accentColor,
                            color: tokens.accentColor,
                          }}
                        >
                          {experience.postcardStampText}
                        </div>
                        <p className="text-xs" style={{ color: tokens.textMuted }}>
                          Destinataire :{' '}
                          <strong style={{ color: tokens.textPrimary }}>
                            {experience.postcardTo}
                          </strong>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 5. EVENT INVITE */}
              {category === 'event-invite' && (
                <div
                  data-testid="exp-event-view"
                  className="rounded-xl p-4 sm:p-5 border grid grid-cols-1 sm:grid-cols-2 gap-4"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <Calendar
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: tokens.accentColor }}
                    />
                    <div>
                      <span
                        className="block text-[11px]"
                        style={{ color: tokens.textMuted }}
                      >
                        Date &amp; heure
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: tokens.textPrimary }}
                      >
                        {experience.eventDate} · {experience.eventTime}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <MapPin
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: tokens.accentColor }}
                    />
                    <div>
                      <span
                        className="block text-[11px]"
                        style={{ color: tokens.textMuted }}
                      >
                        Lieu
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: tokens.textPrimary }}
                      >
                        {experience.eventLocation}
                      </span>
                    </div>
                  </div>
                  <div
                    className="sm:col-span-2 pt-2.5 border-t text-xs"
                    style={{
                      borderColor: tokens.borderColor,
                      color: tokens.textMuted,
                    }}
                  >
                    Accès &amp; dress code :{' '}
                    <strong style={{ color: tokens.textPrimary }}>
                      {experience.eventDressCode}
                    </strong>
                  </div>
                </div>
              )}

              {/* 6. BUSINESS CARD */}
              {category === 'business-card' && (
                <div
                  data-testid="exp-business-view"
                  className="rounded-xl p-4 sm:p-5 border space-y-3"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div>
                    <div
                      className="text-base sm:text-lg font-bold"
                      style={{ color: tokens.textPrimary }}
                    >
                      {experience.personName}
                    </div>
                    <div
                      className="text-xs font-semibold"
                      style={{ color: tokens.accentColor }}
                    >
                      {experience.personRole} · {experience.companyName}
                    </div>
                  </div>
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"
                    style={{ color: tokens.textMuted }}
                  >
                    {experience.contactEmail && (
                      <a
                        href={`mailto:${experience.contactEmail}`}
                        className="inline-flex items-center gap-1.5 hover:underline min-w-0 truncate"
                        style={{ color: tokens.textPrimary }}
                      >
                        <Mail
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: tokens.accentColor }}
                        />
                        <span className="truncate">{experience.contactEmail}</span>
                      </a>
                    )}
                    {experience.contactPhone && (
                      <a
                        href={`tel:${experience.contactPhone}`}
                        className="inline-flex items-center gap-1.5 hover:underline"
                        style={{ color: tokens.textPrimary }}
                      >
                        <Phone
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: tokens.accentColor }}
                        />
                        <span>{experience.contactPhone}</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* 7. PRIVATE PAGE */}
              {category === 'private-page' && (
                <div
                  data-testid="exp-private-view"
                  className="rounded-xl p-4 sm:p-5 border space-y-2"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div
                    className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: tokens.accentColor }}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{experience.privateBadgeLabel}</span>
                  </div>
                  <p
                    className="text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ color: tokens.textPrimary }}
                  >
                    {experience.privateSecretNote}
                  </p>
                </div>
              )}

              {/* 8. URL CARD */}
              {category === 'url' && (
                <div
                  className="rounded-xl p-4 border space-y-3"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: tokens.accentColor }}>
                    <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{hostname || 'Lien externe'}</span>
                  </div>
                  <p
                    className="text-xs sm:text-sm font-mono break-all select-all"
                    style={{ color: tokens.textPrimary }}
                  >
                    {payload}
                  </p>
                  {isWebLink && (
                    <a
                      href={payload}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl text-xs font-semibold transition-opacity hover:opacity-90"
                      style={{
                        backgroundColor: tokens.accentColor,
                        color: tokens.accentContrastText,
                      }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Ouvrir le lien</span>
                    </a>
                  )}
                </div>
              )}

              {/* 9. WI-FI CARD */}
              {category === 'wifi' && (
                <div
                  className="rounded-xl p-4 border space-y-3"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Wifi className="w-5 h-5 shrink-0" style={{ color: tokens.accentColor }} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[11px]" style={{ color: tokens.textMuted }}>
                          Nom du réseau
                        </p>
                        <p className="text-base font-bold truncate" style={{ color: tokens.textPrimary }}>
                          {source.wifiSsid}
                        </p>
                      </div>
                    </div>
                    <span
                      className="text-xs font-mono font-semibold shrink-0"
                      style={{ color: tokens.accentColor }}
                    >
                      {source.wifiSecurity === 'nopass' ? 'Ouvert' : source.wifiSecurity}
                    </span>
                  </div>
                  {source.wifiSecurity !== 'nopass' && source.wifiPassword && (
                    <div
                      className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2"
                      style={{ borderColor: tokens.borderColor }}
                    >
                      <span className="text-xs font-mono break-all" style={{ color: tokens.textMuted }}>
                        Mot de passe :{' '}
                        <strong style={{ color: tokens.textPrimary }}>{source.wifiPassword}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopyText(source.wifiPassword)}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border text-xs font-semibold cursor-pointer"
                        style={{
                          borderColor: tokens.borderColor,
                          backgroundColor: tokens.surfaceBackground,
                          color: tokens.accentColor,
                        }}
                      >
                        {copiedPayload ? (
                          <>
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Contextual Utility Footer */}
          {showFooter && (
            <footer
              className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
              style={{ borderColor: tokens.borderColor }}
            >
              <div className="flex flex-wrap items-center gap-2">
                {showCopyInFooter && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyText(
                        category === 'text-free'
                          ? buckets.textBody || source.textValue || payload
                          : payload
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    style={{
                      color: tokens.textPrimary,
                      backgroundColor: tokens.surfaceElevated,
                      borderColor: tokens.borderColor,
                    }}
                  >
                    {copiedPayload ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                        <span>Copié</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copier</span>
                      </>
                    )}
                  </button>
                )}

                {currentImage && showImageSection && !showDocumentSection && !showAudioSection && (
                  <a
                    href={resolveSafeDownloadHref(currentImage.url)}
                    download="image-sparkqr"
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0"
                    style={{
                      color: tokens.textPrimary,
                      backgroundColor: tokens.surfaceElevated,
                      borderColor: tokens.borderColor,
                    }}
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Télécharger</span>
                  </a>
                )}

                {currentVideo && showVideoSection && !showDocumentSection && !showAudioSection && (
                  <a
                    href={resolveSafeDownloadHref(currentVideo.url)}
                    download="video-sparkqr"
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0"
                    style={{
                      color: tokens.textPrimary,
                      backgroundColor: tokens.surfaceElevated,
                      borderColor: tokens.borderColor,
                    }}
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Télécharger</span>
                  </a>
                )}
              </div>

              {hasDedicatedPageAction && (() => {
                let dedicatedHref = payload;
                try {
                  const u = new URL(payload);
                  if (/^\/(m|d)\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname)) {
                    dedicatedHref = `${u.pathname}${u.hash}`;
                  }
                } catch {
                  // Keep original payload
                }
                return (
                  <a
                    href={dedicatedHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 min-h-[38px] text-xs font-semibold rounded-xl transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: tokens.accentColor,
                      color: tokens.accentContrastText,
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Ouvrir la page</span>
                  </a>
                );
              })()}
            </footer>
          )}
        </article>
      </div>

      {/* Fullscreen Image Lightbox */}
      {imageFullscreen && currentImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visionneuse plein écran"
          data-testid="reader-image-lightbox"
          className="fixed inset-0 z-[70] bg-black/95 flex flex-col justify-between p-3.5 sm:p-6 text-white"
          onClick={() => void toggleImageFullscreen()}
        >
          <div
            className="flex items-center justify-between gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-semibold truncate">
              {currentImage.caption || customTitle || 'Image'}
              {buckets.images.length > 1 && ` · ${safeImageIdx + 1} / ${buckets.images.length}`}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))))}
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
                aria-label="Dézoomer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono tabular-nums px-1">
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.min(3, Number((z + 0.5).toFixed(2))))}
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
                aria-label="Zoomer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="reader-lightbox-close"
                onClick={() => void toggleImageFullscreen()}
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer"
                aria-label="Fermer le plein écran"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 flex items-center justify-center overflow-auto my-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentImage.url}
              alt={currentImage.caption || customTitle || 'Image plein écran'}
              style={{
                transform: `scale(${imageZoom})`,
                transition: 'transform 160ms ease',
              }}
              className="max-w-full max-h-[82dvh] w-auto h-auto object-contain rounded-lg"
            />
          </div>

          {buckets.images.length > 1 && (
            <div
              className="flex items-center justify-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handlePrevImage}
                className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Précédent</span>
              </button>
              <button
                type="button"
                onClick={handleNextImage}
                className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer"
              >
                <span>Suivant</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
