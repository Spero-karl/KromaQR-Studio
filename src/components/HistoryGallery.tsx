import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  Clock,
  CopyPlus,
  Download,
  Eye,
  ExternalLink,
  FileUp,
  Film,
  FolderHeart,
  Image as ImageIcon,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import {
  DEFAULT_CONFIG,
  DEFAULT_EXPERIENCE,
  DEFAULT_SOURCE,
  PROJECT_CATEGORIES,
} from '../data/presets';
import type {
  DynamicQrRecord,
  PostScanExperience,
  ProjectCategory,
  QrConfig,
  QrSourceState,
  SavedQrItem,
  UploadedMediaInfo,
  WorkspaceInfo,
} from '../types/qr';
import { updateDynamicQr } from '../utils/dynamicApi';
import { decryptJsonWithKey, isValidE2eeEnvelope } from '../utils/e2eeCrypto';
import { normalizeConfigWithDefaults } from '../utils/historyReducer';
import { resolveMediaDownloadUrl } from '../utils/mediaReaderLogic';
import { relativeLuminance, verifyQrDecodeFromImageData } from '../utils/qrLogic';
import {
  describeSavedQrAccessibility,
  formatRemainingDuration,
} from '../utils/serverAvailability';
import {
  encodeSparkQrJsonFile,
  encodeSparkQrSharePackage,
  extractSparkQrReaderEndpoint,
  isUnsafePayloadString,
  parseReceivedQrInput,
} from '../utils/sharedQrPackage';
import { QrCanvasRenderer } from './QrCanvasRenderer';

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 Ko';
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(2)} Mo`;
}

function getAccessibilityStyles(
  status: 'permanent' | 'active' | 'expiring' | 'expired' | 'paused'
): {
  container: string;
  headline: string;
  icon: string;
} {
  switch (status) {
    case 'permanent':
    case 'active':
      return {
        container:
          'bg-[#ECFDF5] dark:bg-[#0D261D] border-[#A7F3D0] dark:border-[#14532D] text-[#065F46] dark:text-[#A7F3D0]',
        headline: 'text-[#047857] dark:text-[#6EE7B7]',
        icon: 'text-[#059669] dark:text-[#34D399]',
      };
    case 'expiring':
      return {
        container:
          'bg-[#FFFBEB] dark:bg-[#291F09] border-[#FDE68A] dark:border-[#78350F] text-[#92400E] dark:text-[#FDE68A]',
        headline: 'text-[#B45309] dark:text-[#FBBF24]',
        icon: 'text-[#D97706] dark:text-[#F59E0B]',
      };
    case 'paused':
      return {
        container:
          'bg-[#F5F3FF] dark:bg-[#1E1635] border-[#DDD6FE] dark:border-[#4C1D95] text-[#5B21B6] dark:text-[#DDD6FE]',
        headline: 'text-[#6D28D9] dark:text-[#C4B5FD]',
        icon: 'text-[#7C3AED] dark:text-[#A78BFA]',
      };
    case 'expired':
      return {
        container:
          'bg-[#FEF2F2] dark:bg-[#2A1215] border-[#FECACA] dark:border-[#7F1D1D] text-[#991B1B] dark:text-[#FECACA]',
        headline: 'text-[#B91C1C] dark:text-[#FCA5A5]',
        icon: 'text-[#DC2626] dark:text-[#F87171]',
      };
  }
}

function getLaserAccentColor(config: QrConfig): string {
  if (config.useCustomEyeColor && config.eyeColor) return config.eyeColor;
  if (config.gradientType !== 'solid' && config.foregroundSecondaryColor) {
    return config.foregroundSecondaryColor;
  }
  return '#2563EB';
}

function thresholdImageData(
  src: Uint8ClampedArray,
  cutoff: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const luma = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
    const val = luma < cutoff ? 0 : 255;
    out[i] = val;
    out[i + 1] = val;
    out[i + 2] = val;
    out[i + 3] = 255;
  }
  return out;
}

function tryDecodeCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): string | null {
  const imageData = ctx.getImageData(0, 0, width, height);
  const direct = verifyQrDecodeFromImageData(imageData.data, width, height);
  if (direct) return direct;

  for (const cutoff of [120, 165, 90]) {
    const bin = thresholdImageData(imageData.data, cutoff);
    const decoded = verifyQrDecodeFromImageData(bin, width, height);
    if (decoded) return decoded;
  }
  return null;
}

function decodeQrImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width || 960;
        const natH = img.naturalHeight || img.height || 960;
        const maxSide = 1400;
        const minSide = 420;
        const rawMax = Math.max(natW, natH, 1);
        const scale =
          rawMax > maxSide
            ? maxSide / rawMax
            : rawMax < minSide
            ? minSide / rawMax
            : 1;
        const width = Math.max(240, Math.round(natW * scale));
        const height = Math.max(240, Math.round(natH * scale));

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas indisponible pour lire l’image QR.'));
          return;
        }

        // Pass 1: Crisp scaled full image
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const pass1 = tryDecodeCanvas(ctx, width, height);
        if (pass1) {
          URL.revokeObjectURL(objectUrl);
          resolve(pass1);
          return;
        }

        // Pass 2: Quiet-zone padded full image (+48px white border)
        const pad = 48;
        canvas.width = width + pad * 2;
        canvas.height = height + pad * 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, pad, pad, width, height);
        const pass2 = tryDecodeCanvas(ctx, canvas.width, canvas.height);
        if (pass2) {
          URL.revokeObjectURL(objectUrl);
          resolve(pass2);
          return;
        }

        // Pass 3: Center-cropped pass (isolates QR code inside exported SparkQR cards)
        const cropW = Math.max(160, Math.round(natW * 0.84));
        const cropH = Math.max(160, Math.round(natH * 0.76));
        const cropX = Math.round((natW - cropW) / 2);
        const cropY = Math.round((natH - cropH) / 2);
        canvas.width = 960;
        canvas.height = 960;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 960, 960);
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 48, 48, 864, 864);
        const pass3 = tryDecodeCanvas(ctx, 960, 960);
        URL.revokeObjectURL(objectUrl);
        if (pass3) {
          resolve(pass3);
          return;
        }

        reject(
          new Error(
            'Aucun QR code valide détecté dans cette image. Importez une image contenant un QR code lisible.'
          )
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(
          err instanceof Error
            ? err
            : new Error('Impossible d’analyser l’image importée.')
        );
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Format d’image non reconnu ou fichier corrompu.'));
    };
    img.src = objectUrl;
  });
}

interface HistoryGalleryProps {
  items: SavedQrItem[];
  dynamicRecords: DynamicQrRecord[];
  hostedMedia?: UploadedMediaInfo[];
  workspace?: WorkspaceInfo | null;
  onOpenWorkspaceModal?: () => void;
  onLoadItem: (item: SavedQrItem) => void;
  onDuplicateItem: (item: SavedQrItem) => void;
  onDeleteItem: (id: string) => void | Promise<void>;
  onDeleteDynamic?: (slug: string) => Promise<void>;
  onRefreshDynamic: () => Promise<void>;
  onDeleteMedia?: (id: string) => Promise<void>;
  onRefreshMedia?: () => Promise<void>;
  onOpenExtend?: (target: {
    targetKind: 'media' | 'collection' | 'dynamic' | 'workspace';
    targetId: string;
    targetTitle: string;
    currentExpiresAt?: string | null;
  }) => void;
  onImportQrItem?: (item: SavedQrItem) => void;
  onOpenTargetPreview?: (item: SavedQrItem) => void;
  onBackToStudio: () => void;
}

export const HistoryGallery: React.FC<HistoryGalleryProps> = ({
  items,
  dynamicRecords,
  hostedMedia = [],
  workspace = null,
  onOpenWorkspaceModal,
  onLoadItem,
  onDuplicateItem,
  onDeleteItem,
  onDeleteDynamic,
  onRefreshDynamic,
  onDeleteMedia,
  onRefreshMedia,
  onOpenExtend,
  onImportQrItem,
  onOpenTargetPreview,
  onBackToStudio,
}) => {
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [deletingDynamicSlug, setDeletingDynamicSlug] = useState<string | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [mediaActionError, setMediaActionError] = useState<string | null>(null);
  const [refreshingMedia, setRefreshingMedia] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProjectCategory>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'scans' | 'name'>('recent');
  const [managedSlug, setManagedSlug] = useState<string | null>(null);

  // Dynamic QR management form state
  const [editTitle, setEditTitle] = useState('');
  const [editDestPayload, setEditDestPayload] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editPin, setEditPin] = useState('');
  const [clearPin, setClearPin] = useState(false);
  const [editMaxScans, setEditMaxScans] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [savingDynamic, setSavingDynamic] = useState(false);
  const [dynamicError, setDynamicError] = useState<string | null>(null);

  // Saved QR Viewer Modal (with laser animation)
  const [viewerItem, setViewerItem] = useState<SavedQrItem | null>(null);
  const [viewerLaserActive, setViewerLaserActive] = useState(true);
  const [viewerCopiedShare, setViewerCopiedShare] = useState(false);

  // Import Received QR Modal (with live preview & laser animation)
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importRawInput, setImportRawInput] = useState('');
  const [importParsed, setImportParsed] = useState<{
    name: string;
    payload: string;
    source: QrSourceState;
    config: QrConfig;
    experience: SavedQrItem['experience'];
    category: ProjectCategory;
    laserEnabled: boolean;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const importSeqRef = useRef(0);

  const openViewerForSavedItem = (item: SavedQrItem) => {
    setViewerItem(item);
    setViewerLaserActive(item.config.laserEnabled !== false);
    setViewerCopiedShare(false);
  };

  const openImportModal = () => {
    importSeqRef.current += 1;
    setImportRawInput('');
    setImportParsed(null);
    setImportError(null);
    setImportBusy(false);
    setImportModalOpen(true);
  };

  const applyParsedInput = async (
    raw: string,
    opts?: { fromDecodedImage?: boolean }
  ) => {
    const seq = ++importSeqRef.current;
    setImportRawInput(raw);
    if (!raw.trim()) {
      setImportParsed(null);
      setImportError(null);
      return;
    }

    const parsed = parseReceivedQrInput(raw, {
      fromDecodedImage: opts?.fromDecodedImage,
    });
    if (!parsed.ok) {
      setImportParsed(null);
      setImportError(
        isUnsafePayloadString(raw)
          ? 'Ce contenu contient un protocole non sécurisé et ne peut pas être importé.'
          : parsed.error
      );
      return;
    }

    setImportError(null);
    let nextName = parsed.item.name;
    let nextPayload = parsed.item.payload;
    let nextSource = parsed.item.source;
    let nextConfig = parsed.item.config;
    let nextExperience = parsed.item.experience ?? DEFAULT_EXPERIENCE;
    const nextCategory = parsed.item.category || 'Personnel';

    const endpointInfo = extractSparkQrReaderEndpoint(parsed.item.payload);
    if (endpointInfo) {
      setImportBusy(true);
      try {
        const apiUrl =
          endpointInfo.kind === 'media'
            ? `/api/reader/media/${encodeURIComponent(endpointInfo.id)}`
            : `/api/reader/dynamic/${encodeURIComponent(endpointInfo.id)}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const body = (await res.json()) as {
            config?: Partial<QrConfig>;
            cardTheme?: Partial<QrConfig>;
            source?: Partial<QrSourceState>;
            experience?: Partial<PostScanExperience>;
            mediaType?: string;
            title?: string;
            payload?: string;
            isEncrypted?: boolean;
            encryptedMeta?: unknown;
            locked?: boolean;
          };

          if (seq !== importSeqRef.current) return;

          if (body.config) {
            nextConfig = normalizeConfigWithDefaults(body.config, DEFAULT_CONFIG);
          } else if (body.cardTheme) {
            nextConfig = normalizeConfigWithDefaults(body.cardTheme, DEFAULT_CONFIG);
          }

          if (body.source) {
            nextSource = {
              ...DEFAULT_SOURCE,
              ...body.source,
              imageName: '',
              videoName: '',
            };
          }

          if (body.experience) {
            nextExperience = { ...DEFAULT_EXPERIENCE, ...body.experience };
          }

          if (
            (body.mediaType === 'document' || body.mediaType === 'audio') &&
            nextExperience.galleryItems.every(
              (g) => !g.url.includes(`/api/media/${endpointInfo.id}/file`)
            )
          ) {
            nextExperience = {
              ...nextExperience,
              template: 'media-gallery',
              galleryItems: [
                {
                  id: `media-${endpointInfo.id}`,
                  type: body.mediaType,
                  url: `/api/media/${endpointInfo.id}/file`,
                  caption: '',
                  isEncrypted: Boolean(body.isEncrypted),
                },
              ],
            };
          }

          if (!body.locked && body.isEncrypted && endpointInfo.keyFragment && isValidE2eeEnvelope(body.encryptedMeta)) {
            const decrypted = await decryptJsonWithKey<{
              source?: Partial<QrSourceState>;
              experience?: Partial<PostScanExperience>;
              title?: string;
            }>(body.encryptedMeta, endpointInfo.keyFragment);

            if (seq !== importSeqRef.current) return;

            if (decrypted.source) {
              nextSource = {
                ...nextSource,
                ...decrypted.source,
                imageName: '',
                videoName: '',
                e2eeEnabled: true,
                e2eeKeyFragment: endpointInfo.keyFragment,
              };
            } else {
              nextSource = {
                ...nextSource,
                e2eeEnabled: true,
                e2eeKeyFragment: endpointInfo.keyFragment,
              };
            }
            if (decrypted.experience) {
              nextExperience = { ...nextExperience, ...decrypted.experience };
            }
            if (decrypted.title && decrypted.title !== 'Contenu chiffré') {
              nextName = decrypted.title;
            }
          } else if (body.title && body.title !== 'Contenu chiffré') {
            nextName = body.title;
          } else if (nextConfig.titleText && nextConfig.titleText !== 'Mon Code QR') {
            nextName = nextConfig.titleText;
          }
        }
      } catch {
        // Keep parsed QR fallback gracefully if offline or external origin
      } finally {
        if (seq === importSeqRef.current) {
          setImportBusy(false);
        }
      }
    }

    if (seq !== importSeqRef.current) return;

    setImportParsed({
      name: nextName,
      payload: nextPayload,
      source: nextSource,
      config: nextConfig,
      experience: nextExperience,
      category: nextCategory,
      laserEnabled: nextConfig.laserEnabled !== false,
    });
  };

  const handleImportFileChange = async (file: File) => {
    setImportBusy(true);
    setImportError(null);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.json') || file.type === 'application/json') {
        const text = await file.text();
        await applyParsedInput(text, { fromDecodedImage: false });
      } else {
        const decoded = await decodeQrImageFile(file);
        await applyParsedInput(decoded, { fromDecodedImage: true });
      }
    } catch (err) {
      setImportParsed(null);
      setImportError(
        err instanceof Error ? err.message : 'Erreur lors de la lecture du fichier QR.'
      );
    } finally {
      setImportBusy(false);
    }
  };

  const handleSaveImportedQr = () => {
    if (!importParsed || !onImportQrItem) return;
    const nowIso = new Date().toISOString();
    const nextItem: SavedQrItem = {
      id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: workspace?.id,
      name: importParsed.name.trim() || 'QR reçu',
      category: importParsed.category,
      createdAt: nowIso,
      source: importParsed.source,
      config: {
        ...importParsed.config,
        laserEnabled: importParsed.laserEnabled,
      },
      experience: importParsed.experience ?? DEFAULT_EXPERIENCE,
      dynamicSlug: null,
      payload: importParsed.payload,
      accessibilityKind: 'permanent',
      serverExpiresAt: null,
    };
    onImportQrItem(nextItem);
    setImportModalOpen(false);
    openViewerForSavedItem(nextItem);
  };

  const buildPreviewSavedItemFromImport = (): SavedQrItem | null => {
    if (!importParsed) return null;
    return {
      id: 'import-preview',
      name: importParsed.name.trim() || 'QR reçu',
      category: importParsed.category,
      createdAt: new Date().toISOString(),
      source: importParsed.source,
      config: {
        ...importParsed.config,
        laserEnabled: importParsed.laserEnabled,
      },
      experience: importParsed.experience ?? DEFAULT_EXPERIENCE,
      dynamicSlug: null,
      payload: importParsed.payload,
      accessibilityKind: 'permanent',
      serverExpiresAt: null,
    };
  };

  const renderModals = () => (
    <>
      {/* Saved QR Viewer Modal with Luminous Laser Beam */}
      {viewerItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visualisation du code QR"
          data-testid="qr-viewer-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#090B12]/72 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setViewerItem(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto animate-modal-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#4F46E5] dark:text-[#818CF8]">
                  Aperçu interactif
                </span>
                <h3 className="font-display text-lg font-bold text-[#111214] dark:text-[#F1F5F9] truncate mt-0.5">
                  {viewerItem.name || viewerItem.config.titleText || 'Code QR SparkQR'}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-testid="viewer-laser-toggle"
                  aria-pressed={viewerLaserActive}
                  onClick={() => setViewerLaserActive((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    viewerLaserActive
                      ? 'border-[#2563EB]/30 dark:border-[#60A5FA]/40 bg-[#EFF4FF] dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#93C5FD]'
                      : 'border-[#E2E6F0] dark:border-[#2A3347] bg-[#F8FAFC] dark:bg-[#0F172A] text-[#5C5E66] dark:text-[#94A3B8]'
                  }`}
                >
                  <ScanLine className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Laser</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewerItem(null)}
                  aria-label="Fermer la visualisation"
                  className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white rounded-xl cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {(() => {
              const isDarkViewer =
                relativeLuminance(viewerItem.config.cardBackgroundColor || '#FFFFFF') < 0.22;
              const beamColor = getLaserAccentColor(viewerItem.config);
              return (
                <div
                  className={`rounded-2xl border p-6 flex flex-col items-center justify-center ${
                    isDarkViewer
                      ? 'studio-grid-dark border-[#1F2433]'
                      : 'studio-grid-mat border-[#E4E1D7] dark:border-[#242C3D]'
                  }`}
                >
                  <div className="relative w-full max-w-[300px] animate-qr-reveal">
                    {/* 4 Optical Reticles */}
                    <div aria-hidden="true" className="pointer-events-none absolute -inset-3 z-10">
                      <span
                        className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 rounded-tl-md"
                        style={{ borderColor: viewerLaserActive ? beamColor : '#94A3B8' }}
                      />
                      <span
                        className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 rounded-tr-md"
                        style={{ borderColor: viewerLaserActive ? beamColor : '#94A3B8' }}
                      />
                      <span
                        className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 rounded-bl-md"
                        style={{ borderColor: viewerLaserActive ? beamColor : '#94A3B8' }}
                      />
                      <span
                        className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 rounded-br-md"
                        style={{ borderColor: viewerLaserActive ? beamColor : '#94A3B8' }}
                      />
                    </div>

                    <div
                      className={`relative w-full rounded-2xl overflow-hidden ${
                        isDarkViewer
                          ? 'drop-shadow-[0_22px_40px_rgba(0,0,0,0.55)]'
                          : 'drop-shadow-[0_18px_32px_rgba(17,18,20,0.12)]'
                      }`}
                    >
                      <QrCanvasRenderer
                        payload={viewerItem.payload}
                        config={viewerItem.config}
                        source={viewerItem.source}
                      />

                      {viewerLaserActive && (
                        <div
                          data-testid="viewer-laser-overlay"
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-20"
                        >
                          <div className="qr-laser-beam relative w-full h-full">
                            <div
                              className="absolute bottom-0.5 left-0 right-0 h-16"
                              style={{
                                background: `linear-gradient(to top, ${beamColor}38 0%, ${beamColor}10 55%, transparent 100%)`,
                              }}
                            />
                            <div
                              className="absolute bottom-0 left-0 right-0 h-[2.5px]"
                              style={{
                                background: `linear-gradient(90deg, transparent 0%, ${beamColor} 16%, #FFFFFF 50%, ${beamColor} 84%, transparent 100%)`,
                                boxShadow: `0 0 12px 2px ${beamColor}, 0 0 24px 4px ${beamColor}70`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onOpenTargetPreview && (
                <button
                  type="button"
                  data-testid="viewer-open-content-btn"
                  onClick={() => {
                    const target = {
                      ...viewerItem,
                      config: { ...viewerItem.config, laserEnabled: viewerLaserActive },
                    };
                    setViewerItem(null);
                    onOpenTargetPreview(target);
                  }}
                  className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Ouvrir le contenu</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  try {
                    const shareCode = encodeSparkQrSharePackage({
                      name: viewerItem.name,
                      payload: viewerItem.payload,
                      source: viewerItem.source,
                      config: { ...viewerItem.config, laserEnabled: viewerLaserActive },
                      experience: viewerItem.experience,
                    });
                    await navigator.clipboard.writeText(shareCode);
                    setViewerCopiedShare(true);
                    setTimeout(() => setViewerCopiedShare(false), 2000);
                  } catch {
                    // Fallback download if clipboard denied
                    const json = encodeSparkQrJsonFile({
                      name: viewerItem.name,
                      payload: viewerItem.payload,
                      source: viewerItem.source,
                      config: { ...viewerItem.config, laserEnabled: viewerLaserActive },
                      experience: viewerItem.experience,
                    });
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'code-sparkqr.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] text-xs font-semibold text-[#4F46E5] dark:text-[#A5B4FC] bg-[#EEF2FF] dark:bg-[#1E1B4B]/60 hover:bg-[#E0E7FF] dark:hover:bg-[#312E81]/60 rounded-xl cursor-pointer whitespace-nowrap shrink-0"
              >
                {viewerCopiedShare ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-[#6EE7B7]" aria-hidden="true" />
                    <span>Code copié</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Partager</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = viewerItem;
                  setViewerItem(null);
                  onLoadItem(target);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F3F4F8] dark:bg-[#1E293B] hover:bg-[#E8EAF2] dark:hover:bg-[#334155] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Éditer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Received QR Modal */}
      {importModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Importer un QR code reçu"
          data-testid="import-qr-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#090B12]/72 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setImportModalOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto animate-modal-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#4F46E5] dark:text-[#818CF8]">
                  Réception &amp; visualisation
                </span>
                <h3 className="font-display text-lg font-bold text-[#111214] dark:text-[#F1F5F9] mt-0.5">
                  Importer un QR code reçu
                </h3>
                <p className="text-xs text-[#5C5E66] dark:text-[#94A3B8] mt-0.5">
                  Importez une image contenant un QR code ou collez un lien QR reçu pour le visualiser et l’enregistrer dans votre espace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                aria-label="Fermer l’importation"
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="import-qr-textarea" className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                  Lien QR ou code partagé
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept="image/*,.json,application/json"
                    data-testid="import-qr-file-input"
                    aria-label="Importer une image contenant un QR code ou un fichier QR"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImportFileChange(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={importBusy}
                    onClick={() => importFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-semibold text-[#4F46E5] dark:text-[#A5B4FC] bg-[#EEF2FF] dark:bg-[#1E1B4B]/60 hover:bg-[#E0E7FF] dark:hover:bg-[#312E81]/60 rounded-xl cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{importBusy ? 'Analyse du QR…' : 'Choisir une image QR'}</span>
                  </button>
                </div>
              </div>

              <textarea
                id="import-qr-textarea"
                data-testid="import-qr-text-input"
                rows={3}
                value={importRawInput}
                onChange={(e) => void applyParsedInput(e.target.value, { fromDecodedImage: false })}
                placeholder="Collez un lien QR (https://…) ou un contenu partagé…"
                className="w-full px-3.5 py-2.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] dark:placeholder:text-[#64748B] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />

              {importError && (
                <p role="alert" data-testid="import-qr-error" className="text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5]">
                  {importError}
                </p>
              )}
            </div>

            {importParsed && (
              <div className="space-y-4 pt-2 border-t border-[#EFEFF5] dark:border-[#242C3D]">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2.5">
                  <div>
                    <label
                      htmlFor="import-qr-name"
                      className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1"
                    >
                      Nom dans Mes QR
                    </label>
                    <input
                      id="import-qr-name"
                      type="text"
                      value={importParsed.name}
                      onChange={(e) =>
                        setImportParsed((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="import-qr-cat"
                      className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1"
                    >
                      Catégorie
                    </label>
                    <select
                      id="import-qr-cat"
                      value={importParsed.category}
                      onChange={(e) =>
                        setImportParsed((prev) =>
                          prev
                            ? { ...prev, category: e.target.value as ProjectCategory }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                    >
                      {PROJECT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(() => {
                  const isDarkPreview =
                    relativeLuminance(importParsed.config.cardBackgroundColor || '#FFFFFF') < 0.22;
                  const beamColor = getLaserAccentColor(importParsed.config);
                  return (
                    <div
                      data-testid="import-qr-preview"
                      className={`rounded-2xl border p-5 flex flex-col items-center justify-center relative ${
                        isDarkPreview
                          ? 'studio-grid-dark border-[#1F2433]'
                          : 'studio-grid-mat border-[#E4E1D7] dark:border-[#242C3D]'
                      }`}
                    >
                      <div className="relative w-full max-w-[230px]">
                        <div className="relative rounded-2xl overflow-hidden shadow-lg">
                          <QrCanvasRenderer
                            payload={importParsed.payload}
                            config={importParsed.config}
                            source={importParsed.source}
                          />
                          {importParsed.laserEnabled && (
                            <div
                              data-testid="import-laser-overlay"
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-20"
                            >
                              <div className="qr-laser-beam relative w-full h-full">
                                <div
                                  className="absolute bottom-0.5 left-0 right-0 h-14"
                                  style={{
                                    background: `linear-gradient(to top, ${beamColor}38 0%, ${beamColor}10 55%, transparent 100%)`,
                                  }}
                                />
                                <div
                                  className="absolute bottom-0 left-0 right-0 h-[2.5px]"
                                  style={{
                                    background: `linear-gradient(90deg, transparent 0%, ${beamColor} 16%, #FFFFFF 50%, ${beamColor} 84%, transparent 100%)`,
                                    boxShadow: `0 0 12px 2px ${beamColor}, 0 0 24px 4px ${beamColor}70`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <label className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer text-xs font-medium text-[#111214] dark:text-[#F1F5F9]">
                  <span>Animation laser lumineuse sur l’aperçu</span>
                  <input
                    type="checkbox"
                    checked={importParsed.laserEnabled}
                    onChange={(e) =>
                      setImportParsed((prev) =>
                        prev ? { ...prev, laserEnabled: e.target.checked } : prev
                      )
                    }
                    className="w-4 h-4 accent-[#4F46E5]"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  {onOpenTargetPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        const previewItem = buildPreviewSavedItemFromImport();
                        if (previewItem) onOpenTargetPreview(previewItem);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F3F4F8] dark:bg-[#1E293B] hover:bg-[#E8EAF2] dark:hover:bg-[#334155] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Ouvrir le contenu</span>
                    </button>
                  )}

                  {onImportQrItem && (
                    <button
                      type="button"
                      data-testid="confirm-import-qr-btn"
                      onClick={handleSaveImportedQr}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Enregistrer dans Mes QR</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const dynamicMap = useMemo(() => {
    const map = new Map<string, DynamicQrRecord>();
    for (const rec of dynamicRecords) {
      map.set(rec.slug, rec);
    }
    return map;
  }, [dynamicRecords]);

  const totalScans = useMemo(
    () => dynamicRecords.reduce((acc, rec) => acc + (rec.stats?.totalScans ?? 0), 0),
    [dynamicRecords]
  );

  const activeDynamicCount = useMemo(
    () => dynamicRecords.filter((rec) => rec.active).length,
    [dynamicRecords]
  );

  const openManageDrawer = (rec: DynamicQrRecord) => {
    setManagedSlug(rec.slug);
    setEditTitle(rec.destination.title || '');
    setEditDestPayload(rec.destination.payload || '');
    setEditActive(rec.active);
    setEditPin('');
    setClearPin(false);
    setEditMaxScans(rec.maxScans ? String(rec.maxScans) : '');
    setEditExpiresAt(rec.expiresAt || '');
    setDynamicError(null);
  };

  const handleSaveDynamicChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managedSlug) return;
    setSavingDynamic(true);
    setDynamicError(null);
    try {
      await updateDynamicQr(managedSlug, {
        active: editActive,
        clearPin,
        ...(editPin.trim() ? { pinCode: editPin.trim() } : {}),
        maxScans: editMaxScans ? Math.max(1, Number(editMaxScans)) : null,
        expiresAt: editExpiresAt || null,
        destination: {
          title: editTitle.trim() || 'Code QR dynamique',
          payload: editDestPayload.trim(),
        },
      });
      await onRefreshDynamic();
      setManagedSlug(null);
    } catch (err) {
      setDynamicError(err instanceof Error ? err.message : 'Erreur de mise à jour.');
    } finally {
      setSavingDynamic(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (categoryFilter !== 'all' && item.category !== categoryFilter) {
          return false;
        }
        if (!q) return true;
        return (
          (item.name || '').toLowerCase().includes(q) ||
          (item.config.titleText || '').toLowerCase().includes(q) ||
          (item.payload || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return (a.name || '').localeCompare(b.name || '', 'fr');
        }
        if (sortBy === 'scans') {
          const scansA = a.dynamicSlug ? dynamicMap.get(a.dynamicSlug)?.stats.totalScans ?? 0 : 0;
          const scansB = b.dynamicSlug ? dynamicMap.get(b.dynamicSlug)?.stats.totalScans ?? 0 : 0;
          return scansB - scansA;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [items, search, categoryFilter, sortBy, dynamicMap]);

  const managedRecord = managedSlug ? dynamicMap.get(managedSlug) ?? null : null;

  const handleRefreshMedia = async () => {
    if (!onRefreshMedia) return;
    setRefreshingMedia(true);
    setMediaActionError(null);
    try {
      await onRefreshMedia();
    } catch (err) {
      setMediaActionError(
        err instanceof Error ? err.message : 'Impossible d’actualiser la médiathèque.'
      );
    } finally {
      setRefreshingMedia(false);
    }
  };

  const handleDeleteMedia = async (id: string) => {
    if (!onDeleteMedia) return;
    setDeletingMediaId(id);
    setMediaActionError(null);
    try {
      await onDeleteMedia(id);
    } catch (err) {
      setMediaActionError(
        err instanceof Error ? err.message : 'Impossible de supprimer ce média.'
      );
    } finally {
      setDeletingMediaId(null);
    }
  };

  const handleDeleteSavedCard = async (id: string) => {
    setDeletingItemId(id);
    setItemActionError(null);
    try {
      await onDeleteItem(id);
    } catch (err) {
      setItemActionError(
        err instanceof Error
          ? err.message
          : 'Impossible de supprimer ce QR code et ses données associées.'
      );
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleDeleteDynamicRow = async (slug: string) => {
    if (!onDeleteDynamic) return;
    setDeletingDynamicSlug(slug);
    setItemActionError(null);
    try {
      await onDeleteDynamic(slug);
    } catch (err) {
      setItemActionError(
        err instanceof Error
          ? err.message
          : 'Impossible de supprimer ce QR dynamique.'
      );
    } finally {
      setDeletingDynamicSlug(null);
    }
  };

  if (items.length === 0 && dynamicRecords.length === 0 && hostedMedia.length === 0) {
    return (
      <section className="space-y-5 max-w-2xl mx-auto">
        <div className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-3xl overflow-hidden shadow-[0_6px_24px_rgba(15,23,42,0.04)] dark:shadow-none text-center">
          <div className="p-8 sm:p-12 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#EEF2FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#60A5FA] border border-[#C7D2FE] dark:border-[#2A3347] flex items-center justify-center mx-auto">
              <QrCode className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#111214] dark:text-[#F1F5F9]">
              Votre espace Mes QR codes est prêt
            </h2>
            <p className="text-sm text-[#5C5E66] dark:text-[#94A3B8] max-w-md mx-auto leading-relaxed">
              Chaque QR code généré dans le studio apparaît automatiquement ici avec sa durée d’accessibilité, ses réglages et vos médias associés.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onBackToStudio}
                className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Créer mon premier QR code</span>
              </button>
              {onImportQrItem && (
                <button
                  type="button"
                  data-testid="open-import-qr-btn"
                  onClick={openImportModal}
                  className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] text-xs sm:text-sm font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F3F4F8] dark:bg-[#1E293B] hover:bg-[#E8EAF2] dark:hover:bg-[#334155] border border-[#E2E6F0] dark:border-[#2A3347] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  <span>Importer un QR reçu</span>
                </button>
              )}
              {workspace && onOpenWorkspaceModal && (
                <button
                  type="button"
                  onClick={onOpenWorkspaceModal}
                  className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] text-xs sm:text-sm font-semibold text-[#4F46E5] dark:text-[#A5B4FC] bg-[#EEF2FF] dark:bg-[#1E1B4B]/60 hover:bg-[#E0E7FF] dark:hover:bg-[#312E81]/60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" aria-hidden="true" />
                  <span>{workspace.name}</span>
                </button>
              )}
            </div>
          </div>
        </div>
        {renderModals()}
      </section>
    );
  }

  return (
    <section aria-labelledby="gallery-heading" className="space-y-6">
      {/* Header + Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4F46E5] dark:text-[#818CF8]">
            Espace personnel SparkQR
          </span>
          <h2 id="gallery-heading" className="font-display text-2xl sm:text-3xl font-bold text-[#111214] dark:text-[#F1F5F9] mt-0.5">
            Mes QR codes
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onImportQrItem && (
            <button
              type="button"
              data-testid="open-import-qr-btn"
              onClick={openImportModal}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[42px] text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-white dark:bg-[#131926] hover:bg-[#F3F4F8] dark:hover:bg-[#1E293B] border border-[#E2E6F0] dark:border-[#242C3D] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Importer un QR reçu</span>
            </button>
          )}
          {workspace && onOpenWorkspaceModal && (
            <button
              type="button"
              data-testid="gallery-workspace-btn"
              onClick={onOpenWorkspaceModal}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[42px] text-xs font-semibold text-[#4F46E5] dark:text-[#A5B4FC] bg-[#EEF2FF] dark:bg-[#1E1B4B]/60 hover:bg-[#E0E7FF] dark:hover:bg-[#312E81]/60 border border-[#C7D2FE] dark:border-[#4338CA]/50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>{workspace.name}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onBackToStudio}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Nouveau QR code</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2563EB] dark:text-[#60A5FA]">
              Créations
            </span>
            <span className="font-display text-xl font-bold text-[#111214] dark:text-[#F1F5F9] tabular-nums">
              {items.length} code{items.length > 1 ? 's' : ''} QR
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#F5F3FF] dark:bg-[#231942] text-[#7C3AED] dark:text-[#A78BFA] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#7C3AED] dark:text-[#A78BFA]">
              QR dynamiques
            </span>
            <span className="font-display text-xl font-bold text-[#111214] dark:text-[#F1F5F9] tabular-nums">
              {activeDynamicCount} actif{activeDynamicCount > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#ECFDF5] dark:bg-[#0D261D] text-[#059669] dark:text-[#34D399] flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
              Consultations
            </span>
            <span className="font-display text-xl font-bold text-[#111214] dark:text-[#F1F5F9] tabular-nums">
              {totalScans} scan{totalScans > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            className="w-4 h-4 text-[#6E7078] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Rechercher un projet"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par titre ou contenu..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] dark:placeholder:text-[#64748B] rounded-xl focus:outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 min-h-[34px] text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
              categoryFilter === 'all'
                ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF4FF] dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#93C5FD]'
                : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#F8FAFC] dark:bg-[#161D2B] text-[#4B4D54] dark:text-[#CBD5E1]'
            }`}
          >
            Tous
          </button>
          {PROJECT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 min-h-[34px] text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                categoryFilter === cat
                  ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF4FF] dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#93C5FD]'
                  : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#F8FAFC] dark:bg-[#161D2B] text-[#4B4D54] dark:text-[#CBD5E1]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <select
          aria-label="Trier les créations"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'recent' | 'scans' | 'name')}
          className="px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
        >
          <option value="recent">Plus récents</option>
          <option value="scans">Plus scannés</option>
          <option value="name">Nom A→Z</option>
        </select>
      </div>

      {itemActionError && (
        <div
          role="alert"
          className="rounded-xl border border-[#FECACA] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2A1215] px-4 py-3 text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5]"
        >
          {itemActionError}
        </div>
      )}

      {/* Saved Projects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredItems.map((item) => {
          const sourceLabel =
            item.source.type === 'image'
              ? 'Image'
              : item.source.type === 'video'
              ? 'Vidéo'
              : item.source.textMode === 'wifi'
              ? 'Wi-Fi'
              : item.source.textMode === 'url'
              ? 'Lien web'
              : 'Texte';
          const formattedDate = new Date(item.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
          });
          const isDark = relativeLuminance(item.config.cardBackgroundColor || '#FFFFFF') < 0.22;
          const dyn = item.dynamicSlug ? dynamicMap.get(item.dynamicSlug) : undefined;
          const availability = describeSavedQrAccessibility(item, dyn);
          const availStyles = getAccessibilityStyles(availability.status);

          return (
            <article
              key={item.id}
              data-testid={`dashboard-card-${item.id}`}
              className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl overflow-hidden flex flex-col justify-between shadow-[0_2px_10px_rgba(15,23,42,0.03)] dark:shadow-none hover:border-[#CBD5E1] dark:hover:border-[#334155] transition-colors"
            >
              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-[#111214] dark:text-[#F1F5F9] truncate">
                      {item.name || item.config.titleText || 'Code QR sans titre'}
                    </h3>
                    {dyn && (
                      <span
                        className={`text-[10px] font-semibold shrink-0 ${
                          dyn.active ? 'text-[#059669] dark:text-[#34D399]' : 'text-[#B91C1C] dark:text-[#F87171]'
                        }`}
                      >
                        {dyn.active ? 'Actif' : 'Suspendu'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6E7078] dark:text-[#94A3B8] mt-1 tabular-nums">
                    <span>{item.category || 'Personnel'}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{sourceLabel}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{formattedDate}</span>
                    {dyn && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-semibold text-[#111214] dark:text-[#F1F5F9]">
                          {dyn.stats.totalScans} scan{dyn.stats.totalScans > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div
                  className={`rounded-xl p-4 flex items-center justify-center border ${
                    isDark
                      ? 'studio-grid-dark border-[#1F2433]'
                      : 'studio-grid-mat border-[#E2E6F0] dark:border-[#242C3D]'
                  }`}
                >
                  <div className="w-40">
                    <QrCanvasRenderer
                      payload={item.payload}
                      config={item.config}
                      source={item.source}
                    />
                  </div>
                </div>

                {/* Server Accessibility Duration Box */}
                <div
                  data-testid={`qr-accessibility-${item.id}`}
                  className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${availStyles.container}`}
                >
                  <Clock className={`w-4 h-4 shrink-0 mt-0.5 ${availStyles.icon}`} aria-hidden="true" />
                  <div className="min-w-0 space-y-0.5">
                    <span className={`block text-xs font-bold leading-snug ${availStyles.headline}`}>
                      {availability.headline}
                    </span>
                    <span className="block text-[11px] opacity-85 leading-snug">
                      {availability.detail}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                  <button
                    type="button"
                    data-testid={`view-saved-qr-${item.id}`}
                    onClick={() => openViewerForSavedItem(item)}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[40px] text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F3F4F8] dark:bg-[#1E293B] hover:bg-[#E8EAF2] dark:hover:bg-[#334155] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Voir</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoadItem(item)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Éditer</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>

                  {onOpenExtend && (item.serverCollectionId || item.dynamicSlug) && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenExtend({
                          targetKind: item.dynamicSlug ? 'dynamic' : 'collection',
                          targetId: item.dynamicSlug || item.serverCollectionId!,
                          targetTitle: item.name || item.config.titleText || 'Code QR SparkQR',
                          currentExpiresAt: dyn?.expiresAt || item.serverExpiresAt,
                        })
                      }
                      title="Prolonger la durée de conservation (1 mois, 3 mois, 6 mois ou 1 an)"
                      className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] text-xs font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] border border-[#BFDBFE] dark:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#334155] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Prolonger</span>
                    </button>
                  )}

                  {dyn && (
                    <button
                      type="button"
                      data-testid={`manage-dynamic-${dyn.slug}`}
                      onClick={() => openManageDrawer(dyn)}
                      title="Gérer le QR dynamique et ses statistiques"
                      className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] hover:bg-[#EFF4FF] dark:hover:bg-[#1E293B] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Gérer</span>
                    </button>
                  )}

                  <button
                    type="button"
                    title="Dupliquer ce projet"
                    aria-label={`Dupliquer ${item.name || 'ce code QR'}`}
                    onClick={() => onDuplicateItem(item)}
                    className="p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white hover:bg-[#EFF4FF] dark:hover:bg-[#1E293B] rounded-xl transition-colors cursor-pointer"
                  >
                    <CopyPlus className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    disabled={deletingItemId === item.id}
                    aria-label={`Supprimer ${item.name || 'ce code QR'}`}
                    onClick={() => void handleDeleteSavedCard(item.id)}
                    className="p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] dark:hover:text-[#FCA5A5] hover:bg-[#FEF2F2] dark:hover:bg-[#2A1215] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Dynamic QRs Quick Overview */}
      {dynamicRecords.length > 0 && (
        <div className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#7C3AED] dark:text-[#A78BFA]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[#111214] dark:text-[#F1F5F9]">
              Mes QR dynamiques ({dynamicRecords.length})
            </h3>
          </div>
          <div className="divide-y divide-[#EFEFF5] dark:divide-[#242C3D]">
            {dynamicRecords.map((rec) => {
              const durationText = rec.expiresAt
                ? formatRemainingDuration(rec.expiresAt).headline
                : 'Accessibilité serveur : Illimitée';
              return (
                <div
                  key={rec.slug}
                  className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="block font-semibold text-[#111214] dark:text-[#F1F5F9] truncate">
                      {rec.destination.title || 'Code QR dynamique'}
                    </span>
                    <span className="block text-[11px] text-[#5C5E66] dark:text-[#94A3B8]">
                      {rec.active ? durationText : 'Accessibilité serveur : Suspendu'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 tabular-nums">
                    <span className="text-[#5C5E66] dark:text-[#94A3B8]">
                      {rec.stats.totalScans} scan{rec.stats.totalScans > 1 ? 's' : ''}
                      {rec.maxScans ? ` / ${rec.maxScans}` : ''}
                    </span>
                    <span
                      className={
                        rec.active
                          ? 'text-[#059669] dark:text-[#34D399] font-semibold'
                          : 'text-[#B91C1C] dark:text-[#F87171] font-semibold'
                      }
                    >
                      {rec.active ? 'Actif' : 'Suspendu'}
                    </span>
                    {rec.hasPin && <Lock className="w-3.5 h-3.5 text-[#7C3AED] dark:text-[#A78BFA]" aria-hidden="true" />}
                    <button
                      type="button"
                      onClick={() => openManageDrawer(rec)}
                      className="px-3 py-1.5 min-h-[34px] text-[11px] font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] hover:bg-[#EFF4FF] dark:hover:bg-[#1E293B] rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Gérer &amp; Stats
                    </button>
                    {onDeleteDynamic && (
                      <button
                        type="button"
                        disabled={deletingDynamicSlug === rec.slug}
                        aria-label={`Supprimer le QR dynamique ${rec.destination.title || rec.slug}`}
                        onClick={() => void handleDeleteDynamicRow(rec.slug)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] text-[11px] font-semibold text-[#B91C1C] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#2A1215] border border-[#FECACA] dark:border-[#7F1D1D] hover:bg-[#FEE2E2] dark:hover:bg-[#3B171B] rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{deletingDynamicSlug === rec.slug ? '...' : 'Supprimer'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Personal Media Library */}
      <div
        data-testid="hosted-media-library"
        className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderHeart className="w-4 h-4 text-[#D97706] dark:text-[#FBBF24]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[#111214] dark:text-[#F1F5F9]">
              Mes photos et vidéos ({hostedMedia.length})
            </h3>
          </div>
          {onRefreshMedia && (
            <button
              type="button"
              onClick={() => void handleRefreshMedia()}
              disabled={refreshingMedia}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-[11px] font-semibold text-[#4B4D54] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#EFF4FF] dark:hover:bg-[#1E293B] border border-[#DCE2EE] dark:border-[#2A3347] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshingMedia ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Actualiser</span>
            </button>
          )}
        </div>

        {mediaActionError && (
          <p role="alert" className="text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5]">
            {mediaActionError}
          </p>
        )}

        {hostedMedia.length === 0 ? (
          <p className="text-xs text-[#6E7078] dark:text-[#94A3B8]">
            Aucune photo ou vidéo importée dans cet espace pour le moment. Importez un média dans le studio pour l’associer à un QR code.
          </p>
        ) : (
          <div className="divide-y divide-[#EFEFF5] dark:divide-[#242C3D]">
            {hostedMedia.map((media) => {
              const downloadHref =
                media.downloadUrl || resolveMediaDownloadUrl(media.fileUrl || media.url);
              const isDeleting = deletingMediaId === media.id;
              const mediaExpiryIso = media.serverExpiresAt;
              const mediaDuration = mediaExpiryIso
                ? formatRemainingDuration(mediaExpiryIso).headline
                : 'Accessibilité serveur : 7 jours gratuits';

              const genericMediaTitle =
                media.type === 'video'
                  ? 'Vidéo importée'
                  : media.type === 'document'
                  ? 'Document importé'
                  : media.type === 'audio'
                  ? 'Audio importé'
                  : 'Image importée';
              const safeDownloadName = `sparkqr-${media.id.slice(0, 6)}`;

              return (
                <div
                  key={media.id}
                  data-testid={`hosted-media-row-${media.id}`}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white dark:bg-[#0F172A] border border-[#E2E6F0] dark:border-[#242C3D] flex items-center justify-center shrink-0 p-0.5">
                      {media.isEncrypted ? (
                        <Lock className="w-5 h-5 text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
                      ) : media.type === 'image' ? (
                        <img
                          src={media.fileUrl || media.url}
                          alt={genericMediaTitle}
                          className="w-full h-full object-contain rounded-lg"
                        />
                      ) : (
                        <Film className="w-5 h-5 text-[#E11D48] dark:text-[#FB7185]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        {media.type === 'image' ? (
                          <ImageIcon className="w-3.5 h-3.5 text-[#D97706] dark:text-[#FBBF24] shrink-0" aria-hidden="true" />
                        ) : (
                          <Film className="w-3.5 h-3.5 text-[#E11D48] dark:text-[#FB7185] shrink-0" aria-hidden="true" />
                        )}
                        <span className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] truncate">
                          {genericMediaTitle}
                        </span>
                        {media.isEncrypted && (
                          <span className="text-[10px] font-semibold text-[#2563EB] dark:text-[#60A5FA] shrink-0">
                            · Protégé
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#6E7078] dark:text-[#94A3B8] tabular-nums truncate">
                        {formatBytes(media.size)} · {mediaDuration}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={media.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-[11px] font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] hover:bg-[#EFF4FF] dark:hover:bg-[#1E293B] rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Voir</span>
                    </a>
                    <a
                      href={downloadHref}
                      download={safeDownloadName}
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-[11px] font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] border border-[#BFDBFE] dark:border-[#334155] hover:bg-[#DBEAFE] dark:hover:bg-[#334155] rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Télécharger</span>
                    </a>
                    {onDeleteMedia && (
                      <button
                        type="button"
                        disabled={isDeleting}
                        aria-label={`Supprimer ${genericMediaTitle}`}
                        onClick={() => void handleDeleteMedia(media.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-[11px] font-semibold text-[#B91C1C] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#2A1215] border border-[#FECACA] dark:border-[#7F1D1D] hover:bg-[#FEE2E2] dark:hover:bg-[#3B171B] rounded-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{isDeleting ? 'Suppression...' : 'Supprimer'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dynamic QR Management & Stats Modal */}
      {managedRecord && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
          onClick={() => setManagedSlug(null)}
        >
          <div
            data-testid="dynamic-manage-modal"
            className="w-full max-w-lg bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#111214] dark:text-[#F1F5F9]">
                  Réglages du QR dynamique
                </h3>
                <p className="text-xs text-[#6E7078] dark:text-[#94A3B8] tabular-nums">
                  {managedRecord.stats.totalScans} consultation(s) enregistrée(s)
                  {managedRecord.stats.lastScannedAt
                    ? ` · Dernier scan : ${new Date(
                        managedRecord.stats.lastScannedAt
                      ).toLocaleString('fr-FR')}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagedSlug(null)}
                aria-label="Fermer"
                className="p-2 text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveDynamicChanges(e)} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                  Titre affiché
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                  Destination (URL ou texte, modifiable sans réimprimer le QR)
                </label>
                <input
                  type="text"
                  data-testid="manage-dest-payload-input"
                  value={editDestPayload}
                  onChange={(e) => setEditDestPayload(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                    Nouveau code PIN (laisser vide = inchangé)
                  </label>
                  <input
                    type="text"
                    value={editPin}
                    onChange={(e) => setEditPin(e.target.value)}
                    placeholder={managedRecord.hasPin ? 'PIN actif' : 'Aucun PIN'}
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                    Limite maximale de scans
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editMaxScans}
                    onChange={(e) => setEditMaxScans(e.target.value)}
                    placeholder="Illimité"
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                    Durée d’accessibilité (expiration)
                  </label>
                  <input
                    type="datetime-local"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                  />
                </div>

                <div className="space-y-1.5 pt-2 sm:pt-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="manage-active-checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="w-4 h-4 accent-[#2563EB]"
                    />
                    <span>Code QR actif</span>
                  </label>
                  {managedRecord.hasPin && (
                    <label className="flex items-center gap-2 text-[11px] text-[#5C5E66] dark:text-[#94A3B8] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clearPin}
                        onChange={(e) => setClearPin(e.target.checked)}
                        className="w-4 h-4 accent-[#2563EB]"
                      />
                      <span>Retirer la protection PIN</span>
                    </label>
                  )}
                </div>
              </div>

              {managedRecord.stats.recentEvents.length > 0 && (
                <div className="pt-2 border-t border-[#EFEFF5] dark:border-[#242C3D] space-y-1.5">
                  <span className="text-[11px] font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Journal des derniers scans
                  </span>
                  <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                    {managedRecord.stats.recentEvents.map((ev, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span>{ev.device}</span>
                        <span>{new Date(ev.at).toLocaleString('fr-FR')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dynamicError && (
                <p role="alert" className="text-xs text-[#B91C1C] dark:text-[#FCA5A5]">
                  {dynamicError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EFEFF5] dark:border-[#242C3D]">
                <button
                  type="button"
                  onClick={() => setManagedSlug(null)}
                  className="px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white rounded-xl cursor-pointer"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  data-testid="save-dynamic-manage-btn"
                  disabled={savingDynamic}
                  className="px-4 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                >
                  {savingDynamic ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renderModals()}
    </section>
  );
};
