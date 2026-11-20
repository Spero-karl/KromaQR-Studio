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
}

const INTENT_OPTIONS: Array<{
  id: QrIntent;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'url', label: 'Lien web', hint: 'Site, portfolio, page', icon: LinkIcon },
  { id: 'text', label: 'Texte libre', hint: 'Message, note, citation', icon: Type },
  { id: 'wifi', label: 'Réseau Wi-Fi', hint: 'Connexion instantanée', icon: Wifi },
  { id: 'image', label: 'Image', hint: 'Photo ou affiche HD', icon: ImageIcon },
  { id: 'video', label: 'Vidéo', hint: 'Clip ou teaser lecteur', icon: Film },
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

  const fontCss = FONT_CATALOG[config.fontId]?.cssFamily || FONT_CATALOG.bricolage.cssFamily;

  return (
    <section
      aria-labelledby="source-heading"
      className="bg-white border border-[#E2E0D8] rounded-2xl p-4 sm:p-5"
    >
      {/* Header + Privacy indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#EFECE4]">
        <div>
          <h2
            id="source-heading"
            className="font-display text-sm sm:text-base font-bold tracking-tight text-[#111214]"
          >
            1. Que souhaitez-vous encoder ?
          </h2>
          <p className="text-[11px] text-[#6E7078] mt-0.5">
            Choisissez une action puis validez avec « Générer le code QR » — rien n’est exposé avant votre clic.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#4B4D54]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#1D4ED8]" aria-hidden="true" />
          <span>Mode confidentiel</span>
        </span>
      </div>

      {/* Horizontal 5-intent chooser bar */}
      <div
        role="tablist"
        aria-label="Choix du contenu à encoder"
        className="pt-3.5 grid grid-cols-2 sm:grid-cols-5 gap-2"
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
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                active
                  ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                  : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33] hover:border-[#C5C2B8] hover:bg-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <span className="block text-xs font-bold leading-tight truncate">
                  {opt.label}
                </span>
                <span className="block text-[10px] opacity-75 truncate mt-0.5">
                  {opt.hint}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Empty state before user selects an action */}
      {selectedIntent === null && (
        <div
          data-testid="intent-prompt-state"
          className="mt-3.5 rounded-xl border border-dashed border-[#D8D5CB] bg-[#FAF9F5] px-4 py-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs text-[#5C5E66]">
            Sélectionnez un type ci-dessus (<strong className="text-[#111214]">Lien web</strong>,{' '}
            <strong className="text-[#111214]">Texte libre</strong>,{' '}
            <strong className="text-[#111214]">Wi-Fi</strong>,{' '}
            <strong className="text-[#111214]">Image</strong> ou{' '}
            <strong className="text-[#111214]">Vidéo</strong>) pour saisir vos données et faire apparaître le bouton de génération.
          </p>
        </div>
      )}

      {/* URL INPUT */}
      {selectedIntent === 'url' && (
        <div className="pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="qr-url-input" className="text-xs font-semibold text-[#2C2E33]">
              Adresse URL de destination
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
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8] hover:underline cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              <span>Essayer un exemple</span>
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
            className="w-full px-3.5 py-2.5 text-sm bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] transition-colors"
          />
        </div>
      )}

      {/* FREE TEXT INPUT WITH LIVE FONT/SIZE PREVIEW */}
      {selectedIntent === 'text' && (
        <div className="pt-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="qr-text-input" className="text-xs font-semibold text-[#2C2E33]">
              Texte ou message à encoder
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
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8] hover:underline cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                <span>Exemple</span>
              </button>
              <span className="text-[11px] text-[#6E7078] tabular-nums">
                {source.textValue.length} car.
              </span>
            </div>
          </div>

          <textarea
            id="qr-text-input"
            rows={3}
            value={source.textValue}
            onChange={(e) =>
              onChange({
                ...source,
                type: 'text',
                textMode: 'text',
                textValue: e.target.value,
              })
            }
            placeholder="Saisissez votre message personnalisé (ex. : invitation, mot doux, citation)..."
            style={{
              fontFamily: fontCss,
              fontSize: `${config.messageFontSize || 18}px`,
              fontStyle: config.titleItalic ? 'italic' : 'normal',
              fontWeight: config.titleWeight || 600,
              textAlign: config.textAlign || 'left',
            }}
            className="w-full px-4 py-3 bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] transition-colors resize-y leading-relaxed"
          />
          <p className="text-[11px] text-[#6E7078]">
            Votre texte s’ouvre directement dans le lecteur typographique KromaQR (/m/…) avec votre police, taille, retours à la ligne et emojis — sans aucune redirection Google.
          </p>
        </div>
      )}

      {/* WI-FI INPUT */}
      {selectedIntent === 'wifi' && (
        <div className="pt-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#2C2E33]">
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
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8] hover:underline cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              <span>Exemple</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label
                htmlFor="qr-wifi-ssid"
                className="block text-[11px] font-medium text-[#4B4D54] mb-1"
              >
                Réseau (SSID)
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
                className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            <div>
              <label
                htmlFor="qr-wifi-pass"
                className="block text-[11px] font-medium text-[#4B4D54] mb-1"
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
                className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl focus:outline-none focus:border-[#1D4ED8] disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="qr-wifi-sec"
                className="block text-[11px] font-medium text-[#4B4D54] mb-1"
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
                className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
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
        <div className="pt-4 space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => handleDrop(e, 'image')}
            className={`rounded-xl border border-dashed px-4 py-3.5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              dragActive
                ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                : 'border-[#D4D1C7] bg-[#FAF9F5]'
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
              <div className="w-9 h-9 rounded-lg bg-white border border-[#E2E0D8] flex items-center justify-center shrink-0">
                <ImageIcon className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#111214] truncate">
                  {uploading === 'image'
                    ? 'Hébergement en cours...'
                    : 'Déposez une image (PNG, JPG, WebP)'}
                </p>
                <p className="text-[11px] text-[#6E7078] truncate">
                  S’ouvre en plein format dès le scan du code QR.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={uploading === 'image'}
                onClick={() => imageInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] hover:bg-[#27292E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Importer</span>
              </button>
              <button
                type="button"
                disabled={uploading === 'image'}
                onClick={handleUseDemoImage}
                className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#E0EAFF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Image démo</span>
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
              placeholder="Ou collez une URL d’image directe..."
              className="flex-1 px-3.5 py-2 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
            />

            {source.imageUrl && (
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#F2F1EB] rounded-xl shrink-0">
                <img
                  src={source.imageUrl}
                  alt={source.imageName || 'Aperçu'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-md object-cover border border-black/10"
                />
                <span className="text-[11px] font-medium text-[#15803D] inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Prête</span>
                </span>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#2C2E33] cursor-pointer">
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
            <p role="alert" className="text-[11px] font-medium text-[#B91C1C]">
              {imageUrlWarning}
            </p>
          )}

          <p className="text-[11px] text-[#6E7078]">
            Les images importées sont stockées sur Dosya.dev (S3) et s’ouvrent sur votre domaine public (/m/…) avec zoom et plein écran.
          </p>
        </div>
      )}

      {/* VIDEO */}
      {selectedIntent === 'video' && (
        <div className="pt-4 space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => handleDrop(e, 'video')}
            className={`rounded-xl border border-dashed px-4 py-3.5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              dragActive
                ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                : 'border-[#D4D1C7] bg-[#FAF9F5]'
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
              <div className="w-9 h-9 rounded-lg bg-white border border-[#E2E0D8] flex items-center justify-center shrink-0">
                <Film className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#111214] truncate">
                  {uploading === 'video'
                    ? 'Téléversement vidéo en cours...'
                    : 'Déposez une vidéo (MP4, WebM, MOV)'}
                </p>
                <p className="text-[11px] text-[#6E7078] truncate">
                  Lecteur vidéo intégré prêt dès le scan.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={uploading === 'video'}
                onClick={() => videoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] hover:bg-[#27292E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Importer</span>
              </button>
              <button
                type="button"
                disabled={uploading === 'video'}
                onClick={handleUseDemoVideo}
                className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#E0EAFF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Vidéo démo</span>
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
              placeholder="Ou collez une URL vidéo directe (MP4, WebM, MOV)..."
              className="flex-1 px-3.5 py-2 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
            />

            {source.videoUrl && (
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#F2F1EB] rounded-xl shrink-0">
                <div className="w-10 h-7 rounded overflow-hidden bg-black shrink-0">
                  <video
                    src={source.videoUrl}
                    poster={source.videoPosterUrl || undefined}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[11px] font-medium text-[#15803D] inline-flex items-center gap-1">
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

          {/* Custom Video Miniature / Poster */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E6E4DC]">
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
            <span className="text-[11px] font-semibold text-[#4B4D54] whitespace-nowrap">
              Miniature vidéo (optionnel)
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
              placeholder="URL d’image miniature..."
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-[#DBD8CE] rounded-lg"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={uploading === 'poster'}
                onClick={() => posterInputRef.current?.click()}
                className="px-2.5 py-1 text-[11px] font-semibold text-[#111214] bg-white border border-[#DBD8CE] hover:bg-[#F2F1EB] rounded-lg cursor-pointer"
              >
                {uploading === 'poster' ? 'Envoi...' : 'Importer'}
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...source,
                    videoPosterUrl: DEMO_IMAGE_PATH,
                  })
                }
                className="px-2.5 py-1 text-[11px] font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#E0EAFF] rounded-lg cursor-pointer"
              >
                Démo
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
            <p role="alert" className="text-[11px] font-medium text-[#B91C1C]">
              {videoUrlWarning}
            </p>
          )}

          <p className="text-[11px] text-[#6E7078]">
            Lecture HTML5 native intégrée sur KromaQR Studio (/m/…), sans redirection vers YouTube. Importez un fichier local ici pour l’héberger sur le serveur avant le scan.
          </p>
        </div>
      )}

      {(uploadError || validationError) && (
        <div
          role="alert"
          data-testid="source-validation-error"
          className="mt-3 flex items-center gap-2 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3 py-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{uploadError || validationError}</span>
        </div>
      )}

      {/* MANDATORY GENERATE BUTTON: Appears only after the user picks what to do */}
      {selectedIntent !== null && (
        <div className="mt-4 pt-3.5 border-t border-[#EFECE4] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#5C5E66]">
            {isGenerated ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#15803D]">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Code QR généré et visible dans l’aperçu.</span>
              </span>
            ) : (
              <span>
                Cliquez pour chiffrer et révéler le code QR dans l’atelier.
              </span>
            )}
          </div>

          <button
            type="button"
            data-testid="generate-qr-btn"
            onClick={onGenerate}
            disabled={uploading !== null || isGenerating}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 shadow-xs"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
            <span>
              {isGenerating
                ? 'Sécurisation...'
                : isGenerated
                ? 'Régénérer le code QR'
                : 'Générer le code QR'}
            </span>
          </button>
        </div>
      )}
    </section>
  );
};
