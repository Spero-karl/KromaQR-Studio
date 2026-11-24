import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
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
import { workspaceHeaders } from '../utils/dynamicApi';
import {
  encryptFileForUpload,
  generateE2eeKeyBase64Url,
} from '../utils/e2eeCrypto';
import { inspectMediaUrlForQr, isInternalMediaPath } from '../utils/publicUrl';
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
  iconSolid: string;
  idleSurface: string;
  activeBorder: string;
  activeSurface: string;
}> = [
  {
    id: 'url',
    label: 'Lien web',
    hint: 'Site ou page',
    icon: LinkIcon,
    iconSolid: 'bg-[#2563EB] text-white shadow-[0_6px_14px_rgba(37,99,235,0.28)]',
    idleSurface: 'border-[#DCE6FF] bg-[#F5F8FF] hover:border-[#93C5FD] hover:bg-[#EFF5FF]',
    activeBorder: 'border-[#2563EB]',
    activeSurface: 'bg-[#EAF1FF] shadow-[0_10px_24px_rgba(37,99,235,0.16)]',
  },
  {
    id: 'text',
    label: 'Texte',
    hint: 'Message libre',
    icon: Type,
    iconSolid: 'bg-[#7C3AED] text-white shadow-[0_6px_14px_rgba(124,58,237,0.28)]',
    idleSurface: 'border-[#E6DDFF] bg-[#F7F4FF] hover:border-[#C4B5FD] hover:bg-[#F2ECFF]',
    activeBorder: 'border-[#7C3AED]',
    activeSurface: 'bg-[#EFE8FF] shadow-[0_10px_24px_rgba(124,58,237,0.16)]',
  },
  {
    id: 'wifi',
    label: 'Wi-Fi',
    hint: 'Accès instantané',
    icon: Wifi,
    iconSolid: 'bg-[#059669] text-white shadow-[0_6px_14px_rgba(5,150,105,0.28)]',
    idleSurface: 'border-[#CCF3E3] bg-[#F2FCF8] hover:border-[#6EE7B7] hover:bg-[#E8FAF2]',
    activeBorder: 'border-[#059669]',
    activeSurface: 'bg-[#E2F9EF] shadow-[0_10px_24px_rgba(5,150,105,0.16)]',
  },
  {
    id: 'image',
    label: 'Image',
    hint: 'Photo ou affiche',
    icon: ImageIcon,
    iconSolid: 'bg-[#D97706] text-white shadow-[0_6px_14px_rgba(217,119,6,0.28)]',
    idleSurface: 'border-[#FDE6B8] bg-[#FFFBEB] hover:border-[#FCD34D] hover:bg-[#FEF5D6]',
    activeBorder: 'border-[#D97706]',
    activeSurface: 'bg-[#FEF2C7] shadow-[0_10px_24px_rgba(217,119,6,0.16)]',
  },
  {
    id: 'video',
    label: 'Vidéo',
    hint: 'Lecteur natif HD',
    icon: Film,
    iconSolid: 'bg-[#E11D48] text-white shadow-[0_6px_14px_rgba(225,29,72,0.28)]',
    idleSurface: 'border-[#FFD5DF] bg-[#FFF4F6] hover:border-[#FDA4AF] hover:bg-[#FFEAEF]',
    activeBorder: 'border-[#E11D48]',
    activeSurface: 'bg-[#FFE4EB] shadow-[0_10px_24px_rgba(225,29,72,0.16)]',
  },
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
  const [showExternalUrlInput, setShowExternalUrlInput] = useState<'image' | 'video' | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const localPreviewsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const refMap = localPreviewsRef.current;
    return () => {
      Object.values(refMap).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const isE2eeActive = source.e2eeEnabled !== false;

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
      let activeKey = source.e2eeKeyFragment || '';
      let encryptedMeta: {
        originalName: string;
        originalMimeType: string;
        originalSize: number;
      } | null = null;

      if (isE2eeActive) {
        if (!activeKey) {
          activeKey = generateE2eeKeyBase64Url();
        }
        const { encryptedFile, meta } = await encryptFileForUpload(file, activeKey);
        encryptedMeta = meta;
        formData.append('file', encryptedFile);
        formData.append('isEncrypted', 'true');
        formData.append('mediaType', expectedType === 'video' ? 'video' : 'image');
        formData.append('originalSize', String(meta.originalSize));
      } else {
        formData.append('file', file);
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: workspaceHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Échec du téléversement.');
      }

      const uploadedUrl = data.fileUrl || data.url;
      if (uploadedUrl && isE2eeActive) {
        const previewBlobUrl = URL.createObjectURL(file);
        if (localPreviewsRef.current[uploadedUrl]) {
          URL.revokeObjectURL(localPreviewsRef.current[uploadedUrl]);
        }
        localPreviewsRef.current[uploadedUrl] = previewBlobUrl;
        setLocalPreviews({ ...localPreviewsRef.current });
      }

      if (expectedType === 'image') {
        setShowExternalUrlInput(null);
        onChange({
          ...source,
          type: 'image',
          imageUrl: uploadedUrl,
          imagePageUrl: data.pageUrl,
          imageName: '',
          imageMimeType: encryptedMeta?.originalMimeType || file.type,
          imageSize: encryptedMeta?.originalSize || file.size,
          imageEncrypted: isE2eeActive,
          e2eeKeyFragment: isE2eeActive ? activeKey : source.e2eeKeyFragment,
        });
      } else if (expectedType === 'poster') {
        onChange({
          ...source,
          type: 'video',
          videoPosterUrl: uploadedUrl,
          e2eeKeyFragment: isE2eeActive ? activeKey : source.e2eeKeyFragment,
        });
      } else {
        setShowExternalUrlInput(null);
        onChange({
          ...source,
          type: 'video',
          videoUrl: uploadedUrl,
          videoPageUrl: data.pageUrl,
          videoName: '',
          videoMimeType: encryptedMeta?.originalMimeType || file.type,
          videoSize: encryptedMeta?.originalSize || file.size,
          videoEncrypted: isE2eeActive,
          e2eeKeyFragment: isE2eeActive ? activeKey : source.e2eeKeyFragment,
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
      setShowExternalUrlInput(null);
      onChange({
        ...source,
        type: 'image',
        imageUrl: DEMO_IMAGE_PATH,
        imagePageUrl: data.pageUrl || DEMO_IMAGE_PATH,
        imageName: '',
      });
    } catch {
      setShowExternalUrlInput(null);
      onChange({
        ...source,
        type: 'image',
        imageUrl: DEMO_IMAGE_PATH,
        imagePageUrl: DEMO_IMAGE_PATH,
        imageName: '',
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
      setShowExternalUrlInput(null);
      onChange({
        ...source,
        type: 'video',
        videoUrl: DEMO_VIDEO_PATH,
        videoPageUrl: data.pageUrl || DEMO_VIDEO_PATH,
        videoName: '',
      });
    } catch {
      setShowExternalUrlInput(null);
      onChange({
        ...source,
        type: 'video',
        videoUrl: DEMO_VIDEO_PATH,
        videoPageUrl: DEMO_VIDEO_PATH,
        videoName: '',
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
      className="bg-white/95 border border-[#E2E6F0] rounded-2xl p-5 sm:p-6 shadow-[0_6px_24px_rgba(37,99,235,0.05)] transition-all overflow-hidden relative"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#EC4899]"
      />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#F0F2F8]">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563EB]">
            Étape 1
          </span>
          <h2
            id="source-heading"
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#111214] mt-0.5"
          >
            Que voulez-vous transformer ?
          </h2>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569]">
          <ShieldCheck className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
          <span>Privé &amp; sécurisé</span>
        </span>
      </div>

      {/* Tactile Visual Cards — centered cleanly on smartphones & balanced on desktop */}
      <div
        role="tablist"
        aria-label="Choix du contenu à encoder"
        className="pt-5 flex flex-wrap justify-center gap-2.5 sm:grid sm:grid-cols-5"
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
              className={`group w-[calc(50%-0.3125rem)] sm:w-auto min-h-[44px] flex flex-col items-center sm:items-start justify-between gap-2.5 p-3.5 rounded-xl border text-center sm:text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer ${
                active ? `${opt.activeBorder} ${opt.activeSurface}` : opt.idleSurface
              }`}
            >
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-200 ${
                  opt.iconSolid
                } ${active ? 'scale-105' : 'group-hover:scale-105'}`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 w-full">
                <span className="block text-sm font-semibold leading-tight text-[#111214] truncate">
                  {opt.label}
                </span>
                <span className="block text-[11px] text-[#525866] truncate mt-0.5">
                  {opt.hint}
                </span>
              </div>
            </button>
          );
        })}
      </div>

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
        <div className="pt-4 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            aria-label="Importer un fichier image"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file, 'image');
              e.target.value = '';
            }}
          />

          {source.imageUrl && isInternalMediaPath(source.imageUrl) ? (
            <div
              data-testid="image-loaded-card"
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'image')}
              className={`rounded-xl border px-3.5 py-2.5 transition-colors flex flex-wrap items-center justify-between gap-3 ${
                dragActive
                  ? 'border-[#1D4ED8] bg-[#F4F7FF]'
                  : 'border-[#DCE6FF] bg-[#F8FAFF]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={localPreviews[source.imageUrl] || source.imageUrl}
                  alt="Aperçu de l’image"
                  referrerPolicy="no-referrer"
                  data-testid="image-source-thumbnail"
                  className="w-12 h-12 rounded-lg object-cover border border-[#DCE2EE] bg-white shrink-0"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-[#111214] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
                      <span>{uploading === 'image' ? 'Envoi en cours…' : 'Image prête'}</span>
                    </span>
                    {source.imageEncrypted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1D4ED8] bg-[#EFF4FF] px-1.5 py-0.5 rounded-md">
                        <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>E2EE</span>
                      </span>
                    )}
                    {source.imageUrl === DEMO_IMAGE_PATH && (
                      <span className="text-[10px] font-semibold text-[#7C3AED] bg-[#F5F3FF] px-1.5 py-0.5 rounded-md">
                        Démo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#5C5E66]">
                    Affichée en plein format après scan
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'image'}
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111214] bg-white border border-[#DCE2EE] hover:bg-[#EFF4FF] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3 h-3" aria-hidden="true" />
                  <span>Remplacer</span>
                </button>
                <button
                  type="button"
                  aria-label="Retirer l’image sélectionnée"
                  onClick={() => {
                    setShowExternalUrlInput(null);
                    onChange({
                      ...source,
                      imageUrl: '',
                      imageName: '',
                      imagePageUrl: '',
                      imageEncrypted: false,
                    });
                  }}
                  className="p-1.5 text-[#6E7078] hover:text-[#B91C1C] hover:bg-white rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'image')}
              className={`rounded-xl border border-dashed px-3.5 py-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                dragActive
                  ? 'border-[#1D4ED8] bg-[#F4F7FF]'
                  : 'border-[#DAD7CD] bg-[#FAF9F5]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white border border-[#E6E4DC] flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-[#D97706]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-[#111214] truncate">
                    {uploading === 'image'
                      ? 'Hébergement sécurisé...'
                      : 'Importer une image (PNG, JPG, WebP)'}
                  </p>
                  <p className="text-[11px] text-[#6E7078] truncate">
                    Qualité d’origine préservée avec zoom &amp; plein écran.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'image'}
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] hover:bg-[#27292E] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Importer</span>
                </button>
                <button
                  type="button"
                  disabled={uploading === 'image'}
                  onClick={handleUseDemoImage}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#E0EAFF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Démo</span>
                </button>
              </div>
            </div>
          )}

          {(!source.imageUrl || !isInternalMediaPath(source.imageUrl) || showExternalUrlInput === 'image') ? (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <label htmlFor="qr-image-url" className="sr-only">
                Lien HTTPS externe vers une image
              </label>
              <input
                id="qr-image-url"
                type="text"
                value={isInternalMediaPath(source.imageUrl) ? '' : source.imageUrl}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'image',
                    imageUrl: e.target.value,
                    imagePageUrl: '',
                    imageName: '',
                    imageEncrypted: false,
                  })
                }
                placeholder="Ou collez un lien HTTPS externe vers une image…"
                className="flex-1 px-3 py-2 text-xs bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
              />

              {source.imageUrl && !isInternalMediaPath(source.imageUrl) && (
                <div className="flex items-center gap-2 px-2.5 py-1 bg-[#F4F2EC] rounded-xl shrink-0">
                  <img
                    src={source.imageUrl}
                    alt="Aperçu de l’image"
                    referrerPolicy="no-referrer"
                    data-testid="image-source-thumbnail"
                    className="w-7 h-7 rounded-md object-cover border border-black/10"
                  />
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
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowExternalUrlInput('image')}
                className="text-[11px] font-medium text-[#5C5E66] hover:text-[#1D4ED8] hover:underline cursor-pointer"
              >
                Utiliser plutôt un lien HTTPS externe
              </button>
            </div>
          )}

          {imageUrlWarning && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C]">
              {imageUrlWarning}
            </p>
          )}
        </div>
      )}

      {/* VIDEO */}
      {selectedIntent === 'video' && (
        <div className="pt-4 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            aria-label="Importer un fichier vidéo"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file, 'video');
              e.target.value = '';
            }}
          />
          <input
            ref={posterInputRef}
            type="file"
            accept="image/*"
            aria-label="Importer une miniature vidéo"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file, 'poster');
              e.target.value = '';
            }}
          />

          {source.videoUrl && isInternalMediaPath(source.videoUrl) ? (
            <div
              data-testid="video-loaded-card"
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'video')}
              className={`rounded-xl border px-3.5 py-2.5 transition-colors flex flex-wrap items-center justify-between gap-3 ${
                dragActive
                  ? 'border-[#1D4ED8] bg-[#F4F7FF]'
                  : 'border-[#FFD5DF] bg-[#FFF8FA]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-10 rounded-lg overflow-hidden bg-[#111214] border border-[#DCE2EE] shrink-0">
                  <video
                    src={localPreviews[source.videoUrl] || source.videoUrl}
                    poster={
                      (source.videoPosterUrl && localPreviews[source.videoPosterUrl]) ||
                      source.videoPosterUrl ||
                      undefined
                    }
                    muted
                    playsInline
                    data-testid="video-source-thumbnail"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-[#111214] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
                      <span>{uploading === 'video' ? 'Envoi en cours…' : 'Vidéo prête'}</span>
                    </span>
                    {source.videoEncrypted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1D4ED8] bg-[#EFF4FF] px-1.5 py-0.5 rounded-md">
                        <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>E2EE</span>
                      </span>
                    )}
                    {source.videoUrl === DEMO_VIDEO_PATH && (
                      <span className="text-[10px] font-semibold text-[#7C3AED] bg-[#F5F3FF] px-1.5 py-0.5 rounded-md">
                        Démo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6E7078] truncate">
                    Lecteur intégré plein écran compatible iOS et Android.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'video'}
                  onClick={() => videoInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111214] bg-white border border-[#DCE2EE] hover:bg-[#FFF0F3] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3 h-3" aria-hidden="true" />
                  <span>Remplacer</span>
                </button>
                <button
                  type="button"
                  aria-label="Retirer la vidéo sélectionnée"
                  onClick={() => {
                    setShowExternalUrlInput(null);
                    onChange({
                      ...source,
                      videoUrl: '',
                      videoName: '',
                      videoPageUrl: '',
                      videoEncrypted: false,
                    });
                  }}
                  className="p-1.5 text-[#6E7078] hover:text-[#B91C1C] hover:bg-white rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'video')}
              className={`rounded-xl border border-dashed px-3.5 py-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                dragActive
                  ? 'border-[#1D4ED8] bg-[#F4F7FF]'
                  : 'border-[#DAD7CD] bg-[#FAF9F5]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white border border-[#E6E4DC] flex items-center justify-center shrink-0">
                  <Film className="w-4 h-4 text-[#E11D48]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-[#111214] truncate">
                    {uploading === 'video'
                      ? 'Téléversement en cours...'
                      : 'Importer une vidéo (MP4, WebM, MOV)'}
                  </p>
                  <p className="text-[11px] text-[#6E7078] truncate">
                    Lecteur intégré sans redirection externe.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'video'}
                  onClick={() => videoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] hover:bg-[#27292E] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Importer</span>
                </button>
                <button
                  type="button"
                  disabled={uploading === 'video'}
                  onClick={handleUseDemoVideo}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#E0EAFF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Démo</span>
                </button>
              </div>
            </div>
          )}

          {(!source.videoUrl || !isInternalMediaPath(source.videoUrl) || showExternalUrlInput === 'video') ? (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <label htmlFor="qr-video-url" className="sr-only">
                Lien HTTPS externe vers une vidéo
              </label>
              <input
                id="qr-video-url"
                type="text"
                value={isInternalMediaPath(source.videoUrl) ? '' : source.videoUrl}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'video',
                    videoUrl: e.target.value,
                    videoPageUrl: '',
                    videoName: '',
                    videoEncrypted: false,
                  })
                }
                placeholder="Ou collez une URL vidéo HTTPS externe (MP4, WebM, MOV)…"
                className="flex-1 px-3 py-2 text-xs bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
              />

              {source.videoUrl && !isInternalMediaPath(source.videoUrl) && (
                <div className="flex items-center gap-2 px-2.5 py-1 bg-[#F4F2EC] rounded-xl shrink-0">
                  <div className="w-10 h-7 rounded overflow-hidden bg-black shrink-0">
                    <video
                      src={source.videoUrl}
                      poster={
                        (source.videoPosterUrl && localPreviews[source.videoPosterUrl]) ||
                        source.videoPosterUrl ||
                        undefined
                      }
                      muted
                      playsInline
                      data-testid="video-source-thumbnail"
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
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowExternalUrlInput('video')}
                className="text-[11px] font-medium text-[#5C5E66] hover:text-[#1D4ED8] hover:underline cursor-pointer"
              >
                Utiliser plutôt un lien HTTPS externe
              </button>
            </div>
          )}

          {/* Optional video poster (never exposes internal path) */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#FAF9F5] border border-[#E8E6DF]">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {source.videoPosterUrl ? (
                <img
                  src={localPreviews[source.videoPosterUrl] || source.videoPosterUrl}
                  alt="Miniature vidéo"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-md object-cover border border-[#DCE2EE] shrink-0"
                />
              ) : null}
              {source.videoPosterUrl && isInternalMediaPath(source.videoPosterUrl) ? (
                <span className="text-xs font-medium text-[#15803D] inline-flex items-center gap-1 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Miniature de couverture prête</span>
                </span>
              ) : (
                <>
                  <span className="text-xs font-medium text-[#5C5E66] whitespace-nowrap">
                    Miniature (optionnel)
                  </span>
                  <input
                    type="text"
                    aria-label="Lien HTTPS de la miniature vidéo"
                    value={
                      source.videoPosterUrl && isInternalMediaPath(source.videoPosterUrl)
                        ? ''
                        : source.videoPosterUrl || ''
                    }
                    onChange={(e) =>
                      onChange({
                        ...source,
                        videoPosterUrl: e.target.value,
                      })
                    }
                    placeholder="Lien HTTPS d’image de couverture…"
                    className="flex-1 min-w-[140px] px-2.5 py-1 text-xs bg-white border border-[#DFDDD4] rounded-lg"
                  />
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={uploading === 'poster'}
                onClick={() => posterInputRef.current?.click()}
                className="px-2.5 py-1 text-xs font-semibold text-[#111214] bg-white border border-[#DFDDD4] hover:bg-[#F2F1EB] rounded-lg cursor-pointer"
              >
                {uploading === 'poster'
                  ? 'Envoi…'
                  : source.videoPosterUrl
                  ? 'Remplacer'
                  : 'Importer'}
              </button>
              {source.videoPosterUrl && (
                <button
                  type="button"
                  aria-label="Retirer la miniature"
                  onClick={() => onChange({ ...source, videoPosterUrl: '' })}
                  className="p-1 text-[#6E7078] hover:text-[#B91C1C] cursor-pointer"
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

      {/* E2EE PRIVACY BAR + CONSERVATION SUMMARY */}
      {selectedIntent !== null && (
        <div className="mt-4 rounded-xl border border-[#DCE6FF] bg-[#F5F8FF]/80 px-3.5 py-2.5 flex flex-wrap items-start justify-between gap-3">
          <label
            htmlFor="e2ee-toggle-checkbox"
            className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1"
          >
            <input
              id="e2ee-toggle-checkbox"
              data-testid="e2ee-toggle-checkbox"
              type="checkbox"
              checked={isE2eeActive}
              onChange={(e) =>
                onChange({
                  ...source,
                  e2eeEnabled: e.target.checked,
                  e2eeKeyFragment:
                    e.target.checked && !source.e2eeKeyFragment
                      ? generateE2eeKeyBase64Url()
                      : source.e2eeKeyFragment,
                })
              }
              className="mt-0.5 w-4 h-4 accent-[#2563EB] shrink-0 cursor-pointer"
            />
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111214]">
                <Lock className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
                <span>Chiffrement de bout en bout (AES-256-GCM)</span>
              </span>
              <p className="text-[11px] text-[#475569] leading-relaxed mt-0.5">
                {isE2eeActive
                  ? 'Contenu chiffré sur votre appareil avant envoi · Conservation gratuite 7 jours. Attention : toute personne possédant le QR code ou le lien complet (#k=...) peut le déchiffrer tant qu’il est actif.'
                  : 'Mode standard non chiffré · Conservation gratuite 7 jours sur votre espace.'}
              </p>
            </div>
          </label>
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
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] shadow-[0_6px_18px_rgba(37,99,235,0.22)] hover:-translate-y-0.5 active:scale-[0.98] rounded-xl transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 disabled:translate-y-0"
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
