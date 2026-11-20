import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  Globe,
  Image as ImageIcon,
  Lock,
  Mail,
  MapPin,
  Maximize2,
  Minimize2,
  Moon,
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
  POST_SCAN_TEMPLATES,
} from '../data/presets';
import type { PostScanExperience, QrConfig, QrSourceState } from '../types/qr';
import { verifyDynamicPinOnServer } from '../utils/dynamicApi';
import {
  buildReaderMediaBuckets,
  buildReaderThemeTokens,
  getDefaultReaderColorMode,
  resolveMediaDownloadUrl,
  resolveReaderCategory,
  type ReaderColorMode,
} from '../utils/mediaReaderLogic';
import { extractHostname } from '../utils/qrLogic';
import { extractPrimaryFontName, resolveEncodedTextStyle } from '../utils/textStyle';
import { CustomVideoPlayer } from './CustomVideoPlayer';

interface KromaMediaReaderProps {
  source: QrSourceState;
  config?: QrConfig;
  payload: string;
  experience?: PostScanExperience;
  dynamicSlug?: string | null;
  dynamicHasPin?: boolean;
  standalone?: boolean;
  onPinUnlocked?: () => void;
  onClose?: () => void;
  onBackToStudio?: () => void;
}

export const KromaMediaReader: React.FC<KromaMediaReaderProps> = ({
  source,
  config = DEFAULT_CONFIG,
  payload,
  experience = DEFAULT_EXPERIENCE,
  dynamicSlug = null,
  dynamicHasPin = false,
  standalone = false,
  onPinUnlocked,
  onClose,
  onBackToStudio,
}) => {
  const [colorMode, setColorMode] = useState<ReaderColorMode>(() =>
    getDefaultReaderColorMode(config, experience.accentMood || 'auto')
  );
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageFullscreen, setImageFullscreen] = useState(false);

  const [copiedPayload, setCopiedPayload] = useState(false);
  const [postcardFlipped, setPostcardFlipped] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinUnlocked, setPinUnlocked] = useState(!dynamicHasPin);
  const [verifyingPin, setVerifyingPin] = useState(false);

  const enteredNativeFsRef = useRef(false);

  useEffect(() => {
    setPinUnlocked(!dynamicHasPin);
    setPinAttempt('');
    setPinError(null);
    setActiveImageIdx(0);
    setActiveVideoIdx(0);
    setImageZoom(1);
    setImageFullscreen(false);
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

  const buckets = useMemo(
    () => buildReaderMediaBuckets(source, experience),
    [source, experience]
  );

  const exactTextStyle = useMemo(
    () => resolveEncodedTextStyle(config, tokens.textPrimary),
    [config, tokens.textPrimary]
  );

  // Preload exact Google Font so cursive/display fonts render crisply upon opening /m/:id or /d/:slug
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    const primaryFont = extractPrimaryFontName(exactTextStyle.fontFamily);
    if (!primaryFont) return;
    const descriptor = `${exactTextStyle.fontStyle === 'italic' ? 'italic ' : ''}${exactTextStyle.fontWeight} ${exactTextStyle.fontSizePx}px "${primaryFont}"`;
    void document.fonts.load(descriptor).catch(() => {});
  }, [
    exactTextStyle.fontFamily,
    exactTextStyle.fontStyle,
    exactTextStyle.fontWeight,
    exactTextStyle.fontSizePx,
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

  const handleCopyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 1800);
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
      setPinError('Impossible de joindre le serveur.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const titleFontCss =
    FONT_CATALOG[config.fontId]?.cssFamily || FONT_CATALOG.bricolage.cssFamily;
  const subtitleFontCss =
    FONT_CATALOG[config.subtitleFontId]?.cssFamily || titleFontCss;

  const isWebLink = /^https?:\/\//i.test(payload);
  const hostname = isWebLink ? extractHostname(payload) : '';
  const tpl = experience.template || 'standard';
  const tplMeta = POST_SCAN_TEMPLATES.find((t) => t.id === tpl);

  const rawTitle =
    experience.headline.trim() ||
    (category === 'text-free' && config.titleText === 'Mon Code QR'
      ? ''
      : config.titleText.trim()) ||
    source.imageName ||
    source.videoName ||
    '';

  const headline = config.titleUppercase ? rawTitle.toUpperCase() : rawTitle;

  const rawDescription =
    experience.description.trim() ||
    (config.subtitleText !== 'Scannez pour découvrir' ? config.subtitleText.trim() : '');

  const categoryLabel = (() => {
    switch (category) {
      case 'image-single':
        return 'Image';
      case 'image-gallery':
        return `Galerie (${buckets.images.length})`;
      case 'text-free':
        return 'Message';
      case 'video-single':
        return 'Vidéo';
      case 'video-gallery':
        return `Collection vidéo (${buckets.videos.length})`;
      case 'mixed-collection':
        return 'Collection multimédia';
      case 'wifi':
        return 'Réseau Wi-Fi';
      case 'url':
        return 'Lien web';
      default:
        return tplMeta?.label || 'KromaQR';
    }
  })();

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

  const showTextSection =
    category === 'text-free' ||
    (category === 'mixed-collection' && Boolean(buckets.textBody.trim()));

  const displayedTextStyle: React.CSSProperties = {
    fontFamily: exactTextStyle.fontFamily,
    fontSize: `${exactTextStyle.fontSizePx}px`,
    fontWeight: exactTextStyle.fontWeight,
    fontStyle: exactTextStyle.fontStyle,
    textAlign: exactTextStyle.textAlign,
    color: exactTextStyle.color,
    letterSpacing: exactTextStyle.letterSpacing,
    textDecoration: exactTextStyle.textDecoration,
  };

  return (
    <div
      data-testid="kroma-media-reader"
      data-reader-mode={colorMode}
      data-reader-category={category}
      className={
        standalone
          ? 'min-h-screen w-full flex flex-col justify-center p-4 sm:p-8 transition-colors duration-200'
          : 'relative w-full rounded-3xl p-3.5 sm:p-5 border transition-colors duration-200'
      }
      style={{
        background: tokens.outerBackground,
        borderColor: standalone ? 'transparent' : tokens.borderColor,
        color: tokens.textPrimary,
      }}
    >
      <div
        className={
          standalone
            ? `${category === 'text-free' ? 'max-w-4xl' : 'max-w-3xl'} w-full mx-auto space-y-4 my-auto`
            : 'space-y-3.5'
        }
      >
        {/* Minimalist Smartphone-First Header */}
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
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
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight min-w-0">
              <span className="truncate">
                KromaQR<span className="hidden sm:inline"> Studio</span>
              </span>
              <span aria-hidden="true" style={{ color: tokens.textMuted }}>
                ·
              </span>
              <span className="font-medium truncate" style={{ color: tokens.textMuted }}>
                {categoryLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="reader-theme-toggle"
              onClick={() => setColorMode((m) => (m === 'dark' ? 'light' : 'dark'))}
              aria-label={
                colorMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
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

            {standalone && onBackToStudio && (
              <button
                type="button"
                onClick={onBackToStudio}
                className="px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: tokens.surfaceBackground,
                  borderColor: tokens.borderColor,
                  color: tokens.textPrimary,
                }}
              >
                Studio
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer le lecteur"
                className="p-2 rounded-xl border transition-colors cursor-pointer"
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

        {/* Main Editorial Card */}
        <article
          className="rounded-3xl p-5 sm:p-7 border shadow-[0_20px_56px_rgba(0,0,0,0.12)] space-y-5 animate-[fadeIn_180ms_ease-out]"
          style={{
            backgroundColor: tokens.surfaceBackground,
            borderColor: tokens.borderColor,
          }}
        >
          {/* Editorial Title & Description (only shown when meaningful) */}
          {(headline || rawDescription) && (
            <div className="space-y-1.5">
              {headline && (
                <h1
                  id="target-preview-title"
                  className="tracking-tight leading-tight"
                  style={{
                    fontFamily: titleFontCss,
                    fontSize: `${Math.max(22, (config.titleSize || 21) + 4)}px`,
                    fontWeight: config.titleWeight || 700,
                    fontStyle: config.titleItalic ? 'italic' : 'normal',
                    color: tokens.textPrimary,
                  }}
                >
                  {headline}
                </h1>
              )}
              {rawDescription && (
                <p
                  className="leading-relaxed"
                  style={{
                    fontFamily: subtitleFontCss,
                    fontSize: `${Math.max(13, config.subtitleSize || 13)}px`,
                    color: tokens.textMuted,
                  }}
                >
                  {rawDescription}
                </p>
              )}
            </div>
          )}

          {/* Server PIN Gate if dynamic QR has PIN */}
          {dynamicHasPin && !pinUnlocked ? (
            <form
              onSubmit={(e) => void handleServerPinCheck(e)}
              data-testid="modal-pin-gate"
              className="rounded-2xl p-6 border space-y-4"
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
                Entrez le code PIN configuré pour afficher ce contenu confidentiel.
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
              {/* 1. IMAGE READER (Original proportions preserved, zero distortion) */}
              {showImageSection && currentImage && (
                <section
                  aria-label="Lecteur d’images"
                  data-testid="reader-image-section"
                  className="space-y-3.5"
                >
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-2xl border text-xs"
                    style={{
                      backgroundColor: tokens.surfaceElevated,
                      borderColor: tokens.borderColor,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ImageIcon
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: tokens.accentColor }}
                        aria-hidden="true"
                      />
                      <span className="font-semibold truncate max-w-[200px]">
                        {currentImage.caption || `Image ${safeImageIdx + 1}`}
                      </span>
                      {buckets.images.length > 1 && (
                        <span
                          className="font-mono text-[11px] tabular-nums"
                          style={{ color: tokens.textMuted }}
                        >
                          · {safeImageIdx + 1} / {buckets.images.length}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="reader-zoom-out"
                        aria-label="Dézoomer l’image"
                        onClick={() =>
                          setImageZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))
                        }
                        disabled={imageZoom <= 1}
                        style={{
                          backgroundColor: tokens.surfaceBackground,
                          borderColor: tokens.borderColor,
                          color: tokens.textPrimary,
                        }}
                        className="p-1.5 rounded-lg border disabled:opacity-40 transition-opacity cursor-pointer"
                      >
                        <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-testid="reader-zoom-reset"
                        onClick={() => setImageZoom(1)}
                        style={{
                          backgroundColor: tokens.surfaceBackground,
                          borderColor: tokens.borderColor,
                          color: tokens.textPrimary,
                        }}
                        className="px-2.5 py-1 rounded-lg border font-mono text-[11px] tabular-nums cursor-pointer"
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
                          backgroundColor: tokens.surfaceBackground,
                          borderColor: tokens.borderColor,
                          color: tokens.textPrimary,
                        }}
                        className="p-1.5 rounded-lg border disabled:opacity-40 transition-opacity cursor-pointer"
                      >
                        <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        data-testid="reader-fullscreen-btn"
                        aria-label="Plein écran image"
                        onClick={() => void toggleImageFullscreen()}
                        style={{
                          backgroundColor: tokens.surfaceBackground,
                          borderColor: tokens.borderColor,
                          color: tokens.textPrimary,
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-semibold cursor-pointer"
                      >
                        {imageFullscreen ? (
                          <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span className="hidden sm:inline">Plein écran</span>
                      </button>
                    </div>
                  </div>

                  {/* Editorial Gallery Mat (preserves aspect ratio strictly) */}
                  <div
                    className="relative rounded-2xl overflow-hidden border flex items-center justify-center min-h-[260px]"
                    style={{
                      backgroundColor:
                        colorMode === 'dark' ? '#0B0D12' : '#F4F2EC',
                      borderColor: tokens.borderColor,
                    }}
                  >
                    <div className="w-full max-h-[65vh] overflow-auto flex items-center justify-center p-3 sm:p-5">
                      {imageLoadError ? (
                        <div className="p-6 text-center space-y-1.5" style={{ color: tokens.textPrimary }}>
                          <p className="text-sm font-semibold">Impossible de charger cette image</p>
                          <p className="text-xs" style={{ color: tokens.textMuted }}>
                            Vérifiez que l’image est bien accessible publiquement.
                          </p>
                        </div>
                      ) : (
                        <img
                          data-testid="reader-active-image"
                          src={currentImage.url}
                          alt={currentImage.caption || headline || 'Image KromaQR'}
                          referrerPolicy="no-referrer"
                          onLoad={() => setImageLoadError(false)}
                          onError={() => setImageLoadError(true)}
                          onDoubleClick={() => setImageZoom((z) => (z > 1 ? 1 : 2))}
                          style={{
                            transform: `scale(${imageZoom})`,
                            transformOrigin: 'center center',
                            transition: 'transform 160ms ease',
                          }}
                          className="max-w-full max-h-[58vh] w-auto h-auto object-contain rounded-xl shadow-[0_8px_28px_rgba(0,0,0,0.12)] select-none"
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
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          data-testid="reader-img-next"
                          aria-label="Image suivante"
                          onClick={handleNextImage}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {buckets.images.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {buckets.images.map((img, idx) => {
                        const active = idx === safeImageIdx;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => {
                              setImageZoom(1);
                              setActiveImageIdx(idx);
                            }}
                            className="relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-opacity cursor-pointer"
                            style={{
                              borderColor: active ? tokens.accentColor : tokens.borderColor,
                              opacity: active ? 1 : 0.6,
                            }}
                          >
                            <img
                              src={img.url}
                              alt={img.caption || `Miniature ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* 2. NATIVE HTML5 VIDEO READER */}
              {showVideoSection && currentVideo && (
                <section
                  aria-label="Lecteur vidéo natif"
                  data-testid="reader-video-section"
                  className="space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Film
                        className="w-4 h-4 shrink-0"
                        style={{ color: tokens.accentColor }}
                        aria-hidden="true"
                      />
                      <span>{currentVideo.caption || 'Lecture vidéo intégrée'}</span>
                    </div>
                    {buckets.videos.length > 1 && (
                      <span
                        className="font-mono text-[11px] tabular-nums"
                        style={{ color: tokens.textMuted }}
                      >
                        Vidéo {safeVideoIdx + 1} / {buckets.videos.length}
                      </span>
                    )}
                  </div>

                  <CustomVideoPlayer
                    src={currentVideo.url}
                    poster={currentVideo.posterUrl || source.videoPosterUrl}
                    title={currentVideo.caption || headline || 'Vidéo KromaQR'}
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
                            className="flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors cursor-pointer"
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
                                  className="w-full h-full object-cover"
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
                                className="block text-[10px]"
                                style={{ color: tokens.textMuted }}
                              >
                                {active ? 'En lecture' : 'Cliquer pour lire'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* 3. EXACT TYPOGRAPHIC TEXT READER (NO OVERRIDES, NO BULKY NESTED BOX) */}
              {showTextSection && (
                <section
                  aria-label="Lecteur de texte"
                  data-testid="reader-text-section"
                  className={
                    category === 'text-free'
                      ? 'w-full py-2 sm:py-3 min-h-[130px] flex items-center'
                      : 'w-full pt-4 border-t'
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
                  className="rounded-2xl p-5 sm:p-6 border space-y-4"
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer"
                      style={{
                        borderColor: tokens.borderColor,
                        color: tokens.accentColor,
                      }}
                    >
                      <RotateCw className="w-3 h-3" aria-hidden="true" />
                      <span>
                        {postcardFlipped ? 'Voir le recto' : 'Retourner (verso)'}
                      </span>
                    </button>
                  </div>

                  {!postcardFlipped ? (
                    <div className="space-y-3">
                      {source.imageUrl && (
                        <img
                          src={source.imageUrl}
                          alt={headline || 'Carte postale'}
                          className="w-full max-h-[300px] object-contain rounded-xl bg-black/15"
                        />
                      )}
                      <p
                        className="leading-relaxed whitespace-pre-wrap"
                        style={{
                          fontFamily: FONT_CATALOG.dancing.cssFamily,
                          fontSize: '26px',
                          color: tokens.textPrimary,
                        }}
                      >
                        {source.textValue ||
                          experience.description ||
                          'Souvenir précieux envoyé depuis KromaQR Studio.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div
                        className="space-y-2 border-b sm:border-b-0 sm:border-r pb-3 sm:pb-0 sm:pr-4"
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
                          {experience.description ||
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
                  className="rounded-2xl p-5 border grid grid-cols-1 sm:grid-cols-2 gap-4"
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
                    className="sm:col-span-2 pt-2 border-t text-xs"
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
                  className="rounded-2xl p-5 border space-y-3"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div>
                    <div
                      className="text-lg font-bold"
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
                        className="inline-flex items-center gap-1.5 hover:underline"
                        style={{ color: tokens.textPrimary }}
                      >
                        <Mail
                          className="w-3.5 h-3.5"
                          style={{ color: tokens.accentColor }}
                        />
                        <span>{experience.contactEmail}</span>
                      </a>
                    )}
                    {experience.contactPhone && (
                      <a
                        href={`tel:${experience.contactPhone}`}
                        className="inline-flex items-center gap-1.5 hover:underline"
                        style={{ color: tokens.textPrimary }}
                      >
                        <Phone
                          className="w-3.5 h-3.5"
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
                  className="rounded-2xl p-5 border space-y-2"
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
                  className="rounded-2xl p-4 sm:p-5 border flex flex-col gap-2"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: tokens.accentColor }}>
                    <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{hostname}</span>
                  </div>
                  <p
                    className="text-xs sm:text-sm font-mono break-all select-all"
                    style={{ color: tokens.textPrimary }}
                  >
                    {payload}
                  </p>
                </div>
              )}

              {/* 9. WI-FI CARD */}
              {category === 'wifi' && (
                <div
                  className="rounded-2xl p-4 sm:p-5 border space-y-2.5"
                  style={{
                    borderColor: tokens.borderColor,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <Wifi className="w-5 h-5" style={{ color: tokens.accentColor }} aria-hidden="true" />
                      <div>
                        <p className="text-xs" style={{ color: tokens.textMuted }}>
                          Réseau sans fil
                        </p>
                        <p className="text-base font-bold" style={{ color: tokens.textPrimary }}>
                          {source.wifiSsid}
                        </p>
                      </div>
                    </div>
                    <span
                      className="text-xs font-mono font-medium"
                      style={{ color: tokens.accentColor }}
                    >
                      {source.wifiSecurity === 'nopass' ? 'Ouvert' : source.wifiSecurity}
                    </span>
                  </div>
                  {source.wifiSecurity !== 'nopass' && source.wifiPassword && (
                    <div
                      className="pt-2.5 border-t flex items-center justify-between gap-3"
                      style={{ borderColor: tokens.borderColor }}
                    >
                      <span className="text-xs font-mono" style={{ color: tokens.textMuted }}>
                        Mot de passe : {source.wifiPassword}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopyText(source.wifiPassword)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        style={{ color: tokens.accentColor }}
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

          {/* Clean Footer Actions */}
          <footer
            className="pt-4 border-t flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: tokens.borderColor }}
          >
            <button
              type="button"
              onClick={() =>
                void handleCopyText(
                  category === 'text-free'
                    ? buckets.textBody || source.textValue || payload
                    : payload
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                color: tokens.textPrimary,
                backgroundColor: tokens.surfaceElevated,
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

            <div className="flex flex-wrap items-center gap-2">
              {currentImage && showImageSection && (
                <a
                  href={resolveMediaDownloadUrl(currentImage.url)}
                  download={currentImage.caption || 'kromaqr-image'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
                  style={{
                    color: tokens.textPrimary,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Télécharger</span>
                </a>
              )}

              {currentVideo && showVideoSection && (
                <a
                  href={resolveMediaDownloadUrl(currentVideo.url)}
                  download={currentVideo.caption || 'kromaqr-video'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
                  style={{
                    color: tokens.textPrimary,
                    backgroundColor: tokens.surfaceElevated,
                  }}
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Télécharger</span>
                </a>
              )}

              {isWebLink && !standalone && (() => {
                let dedicatedHref = payload;
                try {
                  const u = new URL(payload);
                  if (/^\/(m|d)\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname)) {
                    dedicatedHref = u.pathname;
                  }
                } catch {
                  // Keep original payload
                }
                return (
                  <a
                    href={dedicatedHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
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
            </div>
          </footer>
        </article>
      </div>

      {/* Immersive Image Lightbox Fullscreen Overlay */}
      {imageFullscreen && currentImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visionneuse plein écran"
          data-testid="reader-image-lightbox"
          className="fixed inset-0 z-[70] bg-black/95 flex flex-col justify-between p-4 sm:p-6 text-white"
          onClick={() => void toggleImageFullscreen()}
        >
          <div
            className="flex items-center justify-between gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-semibold truncate">
              {currentImage.caption || headline || 'KromaQR Studio'}
              {buckets.images.length > 1 && ` · ${safeImageIdx + 1} / ${buckets.images.length}`}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
                aria-label="Dézoomer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono tabular-nums">
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.min(3, Number((z + 0.5).toFixed(2))))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
                aria-label="Zoomer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="reader-lightbox-close"
                onClick={() => void toggleImageFullscreen()}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer"
                aria-label="Fermer le plein écran"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 flex items-center justify-center overflow-auto my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentImage.url}
              alt={currentImage.caption || headline || 'Image plein écran'}
              style={{
                transform: `scale(${imageZoom})`,
                transition: 'transform 160ms ease',
              }}
              className="max-w-full max-h-[82vh] w-auto h-auto object-contain rounded-lg"
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Précédent</span>
              </button>
              <button
                type="button"
                onClick={handleNextImage}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer"
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
