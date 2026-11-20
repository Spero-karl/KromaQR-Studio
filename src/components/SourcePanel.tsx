import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  QrCode,
  ShieldCheck,
  Sparkles,
  Type,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import {
  DEMO_IMAGE_PATH,
  DEMO_SOURCE_SAMPLES,
  DEMO_VIDEO_PATH,
  FONT_CATALOG,
} from '../data/presets';
import type { QrConfig, QrIntent, QrSourceState } from '../types/qr';
import { inspectMediaUrlForQr } from '../utils/publicUrl';
import { resolveEncodedTextStyle } from '../utils/textStyle';

interface SourcePanelProps {
  selectedIntent: QrIntent | null;
  onSelectIntent: (intent: QrIntent) => void;
  source: QrSourceState;
  onChange: (next: QrSourceState) => void;
  onGenerate: () => void;
  isGenerated: boolean;
  isGenerating?: boolean;
  config: QrConfig;
  validationError?: string;
  onMediaUploaded?: () => void;
  onJumpToTypography?: () => void;
}

const INTENT_OPTIONS: Array<{
  id: QrIntent;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'url', label: 'Lien web', hint: 'Site ou page', icon: LinkIcon },
  { id: 'text', label: 'Texte', hint: 'Message typographique', icon: Type },
  { id: 'wifi', label: 'Wi-Fi', hint: 'Accès instantané', icon: Wifi },
  { id: 'image', label: 'Image', hint: 'Photo ou affiche', icon: ImageIcon },
  { id: 'video', label: 'Vidéo', hint: 'Lecteur natif HD', icon: Film },
];

export const SourcePanel: React.FC<SourcePanelProps> = ({
  selectedIntent,
  onSelectIntent,
  source,
  onChange,
  onGenerate,
  isGenerated,
  isGenerating = false,
  config,
  validationError,
  onMediaUploaded,
  onJumpToTypography,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<'image' | 'video' | 'poster' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const imageUrlWarning =
    selectedIntent === 'image' && source.imageUrl.trim()
      ? (() => {
          const check = inspectMediaUrlForQr(source.imageUrl);
          return check.safe ? null : check.error || null;
        })()
      : null;

  const videoUrlWarning =
    selectedIntent === 'video' && source.videoUrl.trim()
      ? (() => {
          const check = inspectMediaUrlForQr(source.videoUrl);
          return check.safe ? null : check.error || null;
        })()
      : null;

  const handleChooseIntent = (intent: QrIntent) => {
    setUploadError(null);
    onSelectIntent(intent);
  };

  const handleFileUpload = async (
    file: File,
    expectedType: 'image' | 'video' | 'poster'
  ) => {
    setUploadError(null);
    setUploading(expectedType);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Échec du téléversement.');
      }
      if (expectedType === 'image') {
        onChange({
          ...source,
          type: 'image',
          imageUrl: data.fileUrl || data.url,
          imagePageUrl: data.pageUrl,
          imageName: data.originalName || file.name,
        });
      } else if (expectedType === 'poster') {
        onChange({
          ...source,
          type: 'video',
          videoPosterUrl: data.fileUrl || data.url,
        });
      } else {
        onChange({
          ...source,
          type: 'video',
          videoUrl: data.fileUrl || data.url,
          videoPageUrl: data.pageUrl,
          videoName: data.originalName || file.name,
        });
      }
      onMediaUploaded?.();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Erreur réseau lors du téléversement.'
      );
    } finally {
      setUploading(null);
    }
  };

  const handleUseDemoImage = async () => {
    setUploadError(null);
    setUploading('image');
    try {
      const res = await fetch('/api/register-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          url: DEMO_IMAGE_PATH,
          title: 'Exposition Formes Géométriques — Paris',
        }),
      });
      const data = await res.json();
      onChange({
        ...source,
        type: 'image',
        imageUrl: DEMO_IMAGE_PATH,
        imagePageUrl: data.pageUrl || DEMO_IMAGE_PATH,
        imageName: 'Exposition Formes Géométriques.jpg',
      });
    } catch {
      onChange({
        ...source,
        type: 'image',
        imageUrl: DEMO_IMAGE_PATH,
        imagePageUrl: DEMO_IMAGE_PATH,
        imageName: 'Exposition Formes Géométriques.jpg',
      });
    } finally {
      setUploading(null);
    }
  };

  const handleUseDemoVideo = async () => {
    setUploadError(null);
    setUploading('video');
    try {
      const res = await fetch('/api/register-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          url: DEMO_VIDEO_PATH,
          title: 'Teaser Atelier — Mouvement & Lumière',
        }),
      });
      const data = await res.json();
      onChange({
        ...source,
        type: 'video',
        videoUrl: DEMO_VIDEO_PATH,
        videoPageUrl: data.pageUrl || DEMO_VIDEO_PATH,
        videoName: 'Teaser Atelier.mp4',
      });
    } catch {
      onChange({
        ...source,
        type: 'video',
        videoUrl: DEMO_VIDEO_PATH,
        videoPageUrl: DEMO_VIDEO_PATH,
        videoName: 'Teaser Atelier.mp4',
      });
    } finally {
      setUploading(null);
    }
  };

  const handleDrop = (e: React.DragEvent, expectedType: 'image' | 'video') => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileUpload(file, expectedType);
    }
  };

  const liveTextStyle = resolveEncodedTextStyle(config, '#111214');
  const activeFontLabel = FONT_CATALOG[liveTextStyle.fontId]?.label || 'Bricolage';

  return (
    <section
      aria-labelledby="source-heading"
      className="bg-white border border-[#E6E4DC] rounded-2xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(17,18,20,0.03)] transition-all"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#F1EFE9]">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1D4ED8]">
            Étape 1
          </span>
          <h2
            id="source-heading"
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#111214] mt-0.5"
          >
            Contenu du QR code
          </h2>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs text-[#5C5E66]">
          <ShieldCheck className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
          <span>Chiffrement à la demande</span>
        </span>
      </div>

      {/* Tactile Visual Cards */}
      <div
        role="tablist"
        aria-label="Choix du contenu à encoder"
        className="pt-5 grid grid-cols-2 sm:grid-cols-5 gap-2.5"
      >
        {INTENT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = selectedIntent === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`intent-${opt.id}`}
              onClick={() => handleChooseIntent(opt.id)}
              className={`group flex flex-col items-start justify-between gap-3 p-3.5 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                active
                  ? 'border-[#1D4ED8] bg-[#F4F7FF] text-[#1D4ED8] shadow-[0_2px_10px_rgba(29,78,216,0.08)]'
                  : 'border-[#E8E6DF] bg-[#FAF9F5] text-[#2C2E33] hover:border-[#CFCBC0] hover:bg-white'
              }`}
            >
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-[#1D4ED8] text-white'
                    : 'bg-white border border-[#E6E4DC] text-[#111214] group-hover:border-[#CFCBC0]'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 w-full">
                <span className="block text-sm font-semibold leading-tight text-[#111214] truncate">
                  {opt.label}
                </span>
                <span className="block text-[11px] text-[#6E7078] truncate mt-0.5">
                  {opt.hint}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Empty state before selection */}
      {selectedIntent === null && (
        <div
          data-testid="intent-prompt-state"
          className="mt-5 rounded-xl border border-dashed border-[#DAD7CD] bg-[#FAF9F5] px-4 py-4 text-xs text-[#5C5E66]"
        >
          Sélectionnez un type de contenu ci-dessus pour saisir votre lien, texte, Wi-Fi, image ou vidéo.
        </div>
      )}

      {/* URL INPUT */}
      {selectedIntent === 'url' && (
        <div className="pt-5 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="qr-url-input" className="text-xs font-semibold text-[#111214]">
              Adresse web de destination
            </label>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...source,
                  type: 'text',
                  textMode: 'url',
                  urlValue: DEMO_SOURCE_SAMPLES.url,
                })
              }
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exemple</span>
            </button>
          </div>
          <input
            id="qr-url-input"
            type="text"
            value={source.urlValue}
            onChange={(e) =>
              onChange({
                ...source,
                type: 'text',
                textMode: 'url',
                urlValue: e.target.value,
              })
            }
            placeholder="https://votre-site.fr/projet"
            className="w-full px-4 py-3 text-sm bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15 focus:border-[#1D4ED8] transition-colors"
          />
        </div>
      )}

      {/* FREE TEXT INPUT WITH EXACT LIVE TYPOGRAPHY PREVIEW */}
      {selectedIntent === 'text' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="qr-text-input" className="text-xs font-semibold text-[#111214]">
              Message typographique
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'text',
                    textValue: DEMO_SOURCE_SAMPLES.text,
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Exemple</span>
              </button>
              <span className="text-xs text-[#6E7078] tabular-nums">
                {source.textValue.length} car.
              </span>
            </div>
          </div>

          <textarea
            id="qr-text-input"
            rows={5}
            value={source.textValue}
            onChange={(e) =>
              onChange({
                ...source,
                type: 'text',
                textMode: 'text',
                textValue: e.target.value,
              })
            }
            placeholder="Écrivez votre message ici… La police, taille, couleur et mise en forme seront conservées à l’identique après scan."
            style={{
              fontFamily: liveTextStyle.fontFamily,
              fontSize: `${liveTextStyle.fontSizePx}px`,
              fontStyle: liveTextStyle.fontStyle,
              fontWeight: liveTextStyle.fontWeight,
              textAlign: liveTextStyle.textAlign,
              color: liveTextStyle.color,
              letterSpacing: liveTextStyle.letterSpacing,
              textDecoration: liveTextStyle.textDecoration,
            }}
            className="w-full min-h-[148px] px-4 py-3.5 bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15 focus:border-[#1D4ED8] transition-colors resize-y leading-relaxed"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C5E66]">
            <span>
              Rendu actif : <strong className="text-[#111214]">{activeFontLabel}</strong> ·{' '}
              {liveTextStyle.fontSizePx}px
            </span>
            {onJumpToTypography && (
              <button
                type="button"
                onClick={onJumpToTypography}
                className="text-xs font-semibold text-[#1D4ED8] hover:underline cursor-pointer"
              >
                Modifier la typographie →
              </button>
            )}
          </div>
        </div>
      )}

      {/* WI-FI INPUT */}
      {selectedIntent === 'wifi' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#111214]">
              Paramètres du réseau Wi-Fi
            </span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...source,
                  type: 'text',
                  textMode: 'wifi',
                  wifiSsid: DEMO_SOURCE_SAMPLES.wifiSsid,
                  wifiPassword: DEMO_SOURCE_SAMPLES.wifiPassword,
                  wifiSecurity: 'WPA',
                })
              }
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exemple</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="qr-wifi-ssid"
                className="block text-xs font-medium text-[#4B4D54] mb-1.5"
              >
                Nom du réseau (SSID)
              </label>
              <input
                id="qr-wifi-ssid"
                type="text"
                value={source.wifiSsid}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'wifi',
                    wifiSsid: e.target.value,
                  })
                }
                placeholder="Mon_WiFi"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            <div>
              <label
                htmlFor="qr-wifi-pass"
                className="block text-xs font-medium text-[#4B4D54] mb-1.5"
              >
                Mot de passe
              </label>
              <input
                id="qr-wifi-pass"
                type="text"
                value={source.wifiPassword}
                disabled={source.wifiSecurity === 'nopass'}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'wifi',
                    wifiPassword: e.target.value,
                  })
                }
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:border-[#1D4ED8] disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="qr-wifi-sec"
                className="block text-xs font-medium text-[#4B4D54] mb-1.5"
              >
                Sécurité
              </label>
              <select
                id="qr-wifi-sec"
                value={source.wifiSecurity}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'wifi',
                    wifiSecurity: e.target.value as 'WPA' | 'WEP' | 'nopass',
                  })
                }
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
              >
                <option value="WPA">WPA / WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Ouvert</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE */}
      {selectedIntent === 'image' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => handleDrop(e, 'image')}
            className={`rounded-xl border border-dashed px-4 py-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              dragActive
                ? 'border-[#1D4ED8] bg-[#F4F7FF]'
                : 'border-[#DAD7CD] bg-[#FAF9F5]'
            }`}
          >
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              aria-label="Importer un fichier image"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file, 'image');
              }}
            />

            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#E6E4DC] flex items-center justify-center shrink-0">
                <ImageIcon className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#111214] truncate">
                  {uploading === 'image'
                    ? 'Hébergement sécurisé...'
                    : 'Déposez une image (PNG, JPG, WebP)'}
                </p>
                <p className="text-xs text-[#6E7078] truncate">
                  Proportions d’origine préservées avec zoom &amp; plein écran.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={uploading === 'image'}
                onClick={() => imageInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#111214] hover:bg-[#27292E] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Importer</span>
              </button>
              <button
                type="button"
                disabled={uploading === 'image'}
                onClick={handleUseDemoImage}
                className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#E0EAFF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Démo</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <label htmlFor="qr-image-url" className="sr-only">
              Lien direct vers une image (URL)
            </label>
            <input
              id="qr-image-url"
              type="text"
              value={source.imageUrl}
              onChange={(e) =>
                onChange({
                  ...source,
                  type: 'image',
                  imageUrl: e.target.value,
                  imagePageUrl: '',
                  imageName: 'Image externe',
                })
              }
              placeholder="Ou collez l’URL directe d’une image…"
              className="flex-1 px-3.5 py-2.5 text-xs bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
            />

            {source.imageUrl && (
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#F4F2EC] rounded-xl shrink-0">
                <img
                  src={source.imageUrl}
                  alt={source.imageName || 'Aperçu'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-md object-cover border border-black/10"
                />
                <span className="text-xs font-medium text-[#15803D] inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Prête</span>
                </span>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2C2E33] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={source.useSourceImageAsLogo}
                    onChange={(e) =>
                      onChange({
                        ...source,
                        useSourceImageAsLogo: e.target.checked,
                      })
                    }
                    className="w-3.5 h-3.5 rounded accent-[#1D4ED8]"
                  />
                  <span>Au centre</span>
                </label>
                <button
                  type="button"
                  aria-label="Retirer l’image sélectionnée"
                  onClick={() =>
                    onChange({
                      ...source,
                      imageUrl: '',
                      imageName: '',
                      imagePageUrl: '',
                    })
                  }
                  className="p-1 text-[#6E7078] hover:text-[#111214] rounded-md cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {imageUrlWarning && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C]">
              {imageUrlWarning}
            </p>
          )}
        </div>
      )}

      {/* VIDEO */}
      {selectedIntent === 'video' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => handleDrop(e, 'video')}
            className={`rounded-xl border border-dashed px-4 py-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              dragActive
                ? 'border-[#1D4ED8] bg-[#F4F7FF]'
                : 'border-[#DAD7CD] bg-[#FAF9F5]'
            }`}
          >
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              aria-label="Importer un fichier vidéo"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file, 'video');
              }}
            />

            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#E6E4DC] flex items-center justify-center shrink-0">
                <Film className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#111214] truncate">
                  {uploading === 'video'
                    ? 'Téléversement en cours...'
                    : 'Déposez une vidéo (MP4, WebM, MOV)'}
                </p>
                <p className="text-xs text-[#6E7078] truncate">
                  Lecteur intégré sans redirection externe.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={uploading === 'video'}
                onClick={() => videoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#111214] hover:bg-[#27292E] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Importer</span>
              </button>
              <button
                type="button"
                disabled={uploading === 'video'}
                onClick={handleUseDemoVideo}
                className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#E0EAFF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Démo</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <label htmlFor="qr-video-url" className="sr-only">
              Lien vidéo externe
            </label>
            <input
              id="qr-video-url"
              type="text"
              value={source.videoUrl}
              onChange={(e) =>
                onChange({
                  ...source,
                  type: 'video',
                  videoUrl: e.target.value,
                  videoPageUrl: '',
                  videoName: 'Vidéo externe',
                })
              }
              placeholder="Ou collez une URL vidéo directe (MP4, WebM, MOV)…"
              className="flex-1 px-3.5 py-2.5 text-xs bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
            />

            {source.videoUrl && (
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#F4F2EC] rounded-xl shrink-0">
                <div className="w-10 h-7 rounded overflow-hidden bg-black shrink-0">
                  <video
                    src={source.videoUrl}
                    poster={source.videoPosterUrl || undefined}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs font-medium text-[#15803D] inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Prête</span>
                </span>
                <button
                  type="button"
                  aria-label="Retirer la vidéo sélectionnée"
                  onClick={() =>
                    onChange({
                      ...source,
                      videoUrl: '',
                      videoName: '',
                      videoPageUrl: '',
                    })
                  }
                  className="p-1 text-[#6E7078] hover:text-[#111214] rounded-md cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Optional video poster */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E8E6DF]">
            <input
              ref={posterInputRef}
              type="file"
              accept="image/*"
              aria-label="Importer une miniature vidéo"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file, 'poster');
              }}
            />
            <span className="text-xs font-medium text-[#5C5E66] whitespace-nowrap">
              Miniature (optionnel)
            </span>
            <input
              type="text"
              aria-label="URL de la miniature vidéo"
              value={source.videoPosterUrl || ''}
              onChange={(e) =>
                onChange({
                  ...source,
                  videoPosterUrl: e.target.value,
                })
              }
              placeholder="URL d’image de couverture…"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-[#DFDDD4] rounded-lg"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={uploading === 'poster'}
                onClick={() => posterInputRef.current?.click()}
                className="px-2.5 py-1 text-xs font-semibold text-[#111214] bg-white border border-[#DFDDD4] hover:bg-[#F2F1EB] rounded-lg cursor-pointer"
              >
                {uploading === 'poster' ? 'Envoi…' : 'Importer'}
              </button>
              {source.videoPosterUrl && (
                <button
                  type="button"
                  aria-label="Retirer la miniature"
                  onClick={() => onChange({ ...source, videoPosterUrl: '' })}
                  className="p-1 text-[#6E7078] hover:text-[#111214] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {videoUrlWarning && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C]">
              {videoUrlWarning}
            </p>
          )}
        </div>
      )}

      {(uploadError || validationError) && (
        <div
          role="alert"
          data-testid="source-validation-error"
          className="mt-4 flex items-center gap-2 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3.5 py-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{uploadError || validationError}</span>
        </div>
      )}

      {/* MANDATORY CONFIDENTIAL GENERATE CTA */}
      {selectedIntent !== null && (
        <div className="mt-5 pt-4 border-t border-[#F1EFE9] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#5C5E66]">
            {isGenerated ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#15803D]">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>QR code généré dans l’aperçu.</span>
              </span>
            ) : (
              <span>Validez pour générer et révéler votre QR code.</span>
            )}
          </div>

          <button
            type="button"
            data-testid="generate-qr-btn"
            onClick={onGenerate}
            disabled={uploading !== null || isGenerating}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
            <span>
              {isGenerating
                ? 'Génération…'
                : isGenerated
                ? 'Régénérer mon QR code'
                : 'Générer mon QR code'}
            </span>
          </button>
        </div>
      )}
    </section>
  );
};
