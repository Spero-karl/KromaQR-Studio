import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
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
  MapPin,
  Monitor,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import {
  DEFAULT_EXPERIENCE,
  PROJECT_CATEGORIES,
} from '../data/presets';
import type {
  DynamicQrRecord,
  ProjectCategory,
  QrConfig,
  QrSourceState,
  SavedQrItem,
  UploadedMediaInfo,
  WorkspaceInfo,
} from '../types/qr';
import { updateDynamicQr } from '../utils/dynamicApi';
import { resolveMediaDownloadUrl } from '../utils/mediaReaderLogic';
import { relativeLuminance } from '../utils/qrLogic';
import { summarizeDynamicScanStats } from '../utils/scanStatsSummary';
import {
  describeSavedQrAccessibility,
  formatRemainingDuration,
} from '../utils/serverAvailability';
import {
  encodeSparkQrJsonFile,
  encodeSparkQrSharePackage,
} from '../utils/sharedQrPackage';
import {
  recognizeAndImportSparkQrFile,
  type SparkQrRecognizedCharacteristics,
} from '../utils/sparkqrRecognizer';
import { LegendEnergyWaveOverlay } from './LegendEnergyWaveOverlay';
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

function getSourceDisplayLabel(source: QrSourceState): string {
  if (source.type === 'image') return 'Image';
  if (source.type === 'video') return 'Vidéo';
  if (source.type === 'document') return 'Document';
  if (source.type === 'audio') return 'Audio';
  switch (source.textMode) {
    case 'wifi':
      return 'Wi-Fi';
    case 'url':
      return 'Lien web';
    case 'vcard':
      return 'Contact vCard';
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
      return 'Position GPS';
    case 'payment':
      return 'Paiement';
    default:
      return 'Texte';
  }
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
  const [refreshingDynamic, setRefreshingDynamic] = useState(false);
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

  // Saved QR Viewer Modal (with laser & energy wave animations)
  const [viewerItem, setViewerItem] = useState<SavedQrItem | null>(null);
  const [viewerLaserActive, setViewerLaserActive] = useState(true);
  const [viewerEnergyWaveActive, setViewerEnergyWaveActive] = useState(false);
  const [viewerCopiedShare, setViewerCopiedShare] = useState(false);

  // Import Received QR Modal (SparkQR-signed QR images only -> category 'Importé')
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importDragActive, setImportDragActive] = useState(false);
  const [importParsed, setImportParsed] = useState<{
    name: string;
    payload: string;
    source: QrSourceState;
    config: QrConfig;
    experience: SavedQrItem['experience'];
    category: 'Importé';
    laserEnabled: boolean;
    energyWaveEnabled: boolean;
    formatLabel: string;
    fingerprint?: string;
    characteristics: SparkQrRecognizedCharacteristics;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const importSeqRef = useRef(0);

  const openViewerForSavedItem = (item: SavedQrItem) => {
    setViewerItem(item);
    setViewerLaserActive(item.config.laserEnabled !== false);
    setViewerEnergyWaveActive(Boolean(item.config.energyWaveEnabled));
    setViewerCopiedShare(false);
  };

  const openImportModal = () => {
    importSeqRef.current += 1;
    setImportParsed(null);
    setImportError(null);
    setImportBusy(false);
    setImportDragActive(false);
    setImportModalOpen(true);
  };

  const handleImportFileChange = async (file: File) => {
    const seq = ++importSeqRef.current;
    setImportBusy(true);
    setImportError(null);
    setImportParsed(null);
    try {
      const recognition = await recognizeAndImportSparkQrFile(file);
      if (seq !== importSeqRef.current) return;

      if (!recognition.recognized) {
        setImportError(recognition.reason);
        return;
      }

      const { item, characteristics, fingerprint } = recognition;
      setImportParsed({
        name: item.name,
        payload: item.payload,
        source: item.source,
        config: item.config,
        experience: item.experience ?? DEFAULT_EXPERIENCE,
        category: 'Importé',
        laserEnabled: item.config.laserEnabled !== false,
        energyWaveEnabled: Boolean(item.config.energyWaveEnabled),
        formatLabel: characteristics.formatLabel,
        fingerprint,
        characteristics,
      });
    } catch (err) {
      if (seq !== importSeqRef.current) return;
      setImportParsed(null);
      setImportError(
        err instanceof Error ? err.message : 'Erreur lors de l’analyse de l’image QR.'
      );
    } finally {
      if (seq === importSeqRef.current) {
        setImportBusy(false);
      }
    }
  };

  const handleSaveImportedQr = () => {
    if (!importParsed || !onImportQrItem) return;
    const nowIso = new Date().toISOString();
    const nextItem: SavedQrItem = {
      id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: workspace?.id,
      name: importParsed.name.trim() || 'QR SparkQR importé',
      category: 'Importé',
      createdAt: nowIso,
      source: importParsed.source,
      config: {
        ...importParsed.config,
        laserEnabled: importParsed.laserEnabled,
        energyWaveEnabled: importParsed.energyWaveEnabled,
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
      name: importParsed.name.trim() || 'QR SparkQR importé',
      category: 'Importé',
      createdAt: new Date().toISOString(),
      source: importParsed.source,
      config: {
        ...importParsed.config,
        laserEnabled: importParsed.laserEnabled,
        energyWaveEnabled: importParsed.energyWaveEnabled,
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
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
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
                  data-testid="viewer-energy-wave-toggle"
                  aria-pressed={viewerEnergyWaveActive}
                  onClick={() => setViewerEnergyWaveActive((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    viewerEnergyWaveActive
                      ? 'border-[#2563EB]/30 dark:border-[#60A5FA]/40 bg-[#EFF4FF] dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#93C5FD]'
                      : 'border-[#E2E6F0] dark:border-[#2A3347] bg-[#F8FAFC] dark:bg-[#0F172A] text-[#5C5E66] dark:text-[#94A3B8]'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Ondes</span>
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
                    {viewerEnergyWaveActive && (
                      <LegendEnergyWaveOverlay
                        testId="viewer-energy-wave-overlay"
                        accentColor={beamColor}
                      />
                    )}

                    {/* 4 Optical Reticles */}
                    <div aria-hidden="true" className="pointer-events-none absolute -inset-3 z-10">
                      <span
                        className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 rounded-tl-md"
                        style={{ borderColor: viewerLaserActive || viewerEnergyWaveActive ? beamColor : '#94A3B8' }}
                      />
                      <span
                        className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 rounded-tr-md"
                        style={{ borderColor: viewerLaserActive || viewerEnergyWaveActive ? beamColor : '#94A3B8' }}
                      />
                      <span
                        className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 rounded-bl-md"
                        style={{ borderColor: viewerLaserActive || viewerEnergyWaveActive ? beamColor : '#94A3B8' }}
                      />
                      <span
                        className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 rounded-br-md"
                        style={{ borderColor: viewerLaserActive || viewerEnergyWaveActive ? beamColor : '#94A3B8' }}
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
                      config: {
                        ...viewerItem.config,
                        laserEnabled: viewerLaserActive,
                        energyWaveEnabled: viewerEnergyWaveActive,
                      },
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
                  const updatedCfg = {
                    ...viewerItem.config,
                    laserEnabled: viewerLaserActive,
                    energyWaveEnabled: viewerEnergyWaveActive,
                  };
                  try {
                    const shareCode = encodeSparkQrSharePackage({
                      name: viewerItem.name,
                      payload: viewerItem.payload,
                      source: viewerItem.source,
                      config: updatedCfg,
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
                      config: updatedCfg,
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
          aria-label="Importer un QR code"
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
                <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563EB] dark:text-[#60A5FA]">
                  Importateur SparkQR authentifié
                </span>
                <h3 className="font-display text-lg font-bold text-[#111214] dark:text-[#F1F5F9] mt-0.5">
                  Importer un QR SparkQR
                </h3>
                <p className="text-xs text-[#5C5E66] dark:text-[#94A3B8] mt-0.5 leading-relaxed">
                  Importez uniquement une image de QR code générée sur SparkQR. Tous ses attributs (modèle, polices, couleurs, laser, ondes d’énergie et contenu) sont analysés et classés dans « Importé ».
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
              {/* Drag & Drop SparkQR-only QR Image Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setImportDragActive(true);
                }}
                onDragLeave={() => setImportDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setImportDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleImportFileChange(file);
                }}
                className={`rounded-2xl border border-dashed p-4 text-center transition-colors ${
                  importDragActive
                    ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E293B]'
                    : 'border-[#CBD5E1] dark:border-[#2E3850] bg-[#F8FAFC] dark:bg-[#0F172A]'
                }`}
              >
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                  data-testid="import-qr-file-input"
                  aria-label="Importer une image de QR code générée par SparkQR"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFileChange(file);
                    e.target.value = '';
                  }}
                />
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                      <ScanLine className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                        Déposez une image de QR code SparkQR
                      </p>
                      <p className="text-[11px] text-[#5C5E66] dark:text-[#94A3B8]">
                        PNG, SVG, JPG ou WEBP créés sur SparkQR uniquement
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={importBusy}
                    onClick={() => importFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{importBusy ? 'Analyse…' : 'Choisir une image'}</span>
                  </button>
                </div>
              </div>

              {importError && (
                <div
                  role="alert"
                  data-testid="import-qr-error"
                  className="rounded-xl border border-[#FECACA] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2A1215] px-3.5 py-2.5 text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5]"
                >
                  {importError}
                </div>
              )}
            </div>

            {importParsed && (
              <div className="space-y-4 pt-3 border-t border-[#EFEFF5] dark:border-[#242C3D]">
                {/* Recognition Summary & Decoded Characteristics */}
                <div
                  data-testid="import-recognition-summary"
                  className="rounded-xl border border-[#DCE6FF] dark:border-[#243047] bg-[#F5F8FF] dark:bg-[#0F172A] px-3.5 py-3 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold">
                    <span className="inline-flex items-center gap-1.5 text-[#1D4ED8] dark:text-[#60A5FA]">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Code SparkQR reconnu</span>
                      {importParsed.fingerprint && (
                        <span className="font-mono text-[10px] opacity-80">
                          #{importParsed.fingerprint.slice(0, 8)}
                        </span>
                      )}
                    </span>
                    <span className="text-[#5C5E66] dark:text-[#94A3B8]">
                      Format · {importParsed.formatLabel}
                    </span>
                  </div>

                  <p className="text-xs text-[#111214] dark:text-[#E2E8F0] break-all line-clamp-2">
                    {importParsed.payload}
                  </p>

                  <div
                    data-testid="import-characteristics-panel"
                    className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 pt-2 border-t border-[#DCE6FF]/80 dark:border-[#243047] text-[11px]"
                  >
                    <div>
                      <span className="block text-[10px] text-[#6E7078] dark:text-[#94A3B8]">
                        Modèle visuel
                      </span>
                      <span className="font-semibold text-[#111214] dark:text-[#F1F5F9] truncate block">
                        {importParsed.characteristics.presetName}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#6E7078] dark:text-[#94A3B8]">
                        Modules &amp; Yeux
                      </span>
                      <span className="font-semibold text-[#111214] dark:text-[#F1F5F9] truncate block">
                        {importParsed.characteristics.moduleShapeLabel} · {importParsed.characteristics.eyeShapeLabel}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#6E7078] dark:text-[#94A3B8]">
                        Cadre &amp; Police
                      </span>
                      <span className="font-semibold text-[#111214] dark:text-[#F1F5F9] truncate block">
                        {importParsed.characteristics.frameStyleLabel} · {importParsed.characteristics.fontName}
                      </span>
                    </div>
                    <div className="col-span-2 sm:col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#4B4D54] dark:text-[#CBD5E1] pt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                          style={{ backgroundColor: importParsed.characteristics.foregroundColor }}
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                          style={{ backgroundColor: importParsed.characteristics.cardBackgroundColor }}
                        />
                        <span>Couleurs conservées</span>
                      </span>
                      <span>·</span>
                      <span>
                        Laser {importParsed.laserEnabled ? 'actif' : 'inactif'}
                      </span>
                      <span>·</span>
                      <span>
                        Ondes {importParsed.energyWaveEnabled ? 'actives' : 'inactives'}
                      </span>
                      {importParsed.characteristics.hasCenterLogo && (
                        <>
                          <span>·</span>
                          <span>Logo central inclus</span>
                        </>
                      )}
                      {importParsed.characteristics.hasCornerStickers && (
                        <>
                          <span>·</span>
                          <span>Autocollants inclus</span>
                        </>
                      )}
                      {importParsed.characteristics.isEncrypted && (
                        <>
                          <span>·</span>
                          <span>Chiffrement E2EE</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

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
                    <span className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                      Catégorie
                    </span>
                    <div
                      data-testid="import-qr-category-badge"
                      className="w-full px-3 py-2 text-xs font-semibold bg-[#EFF4FF] dark:bg-[#1E293B] border border-[#BFDBFE] dark:border-[#334155] text-[#1D4ED8] dark:text-[#93C5FD] rounded-xl text-center"
                    >
                      Importé
                    </div>
                  </div>
                </div>

                {(() => {
                  const isDarkPreview =
                    relativeLuminance(importParsed.config.cardBackgroundColor || '#FFFFFF') < 0.22;
                  const beamColor = getLaserAccentColor(importParsed.config);
                  return (
                    <div
                      data-testid="import-qr-preview"
                      className={`rounded-2xl border p-6 flex flex-col items-center justify-center relative ${
                        isDarkPreview
                          ? 'studio-grid-dark border-[#1F2433]'
                          : 'studio-grid-mat border-[#E4E1D7] dark:border-[#242C3D]'
                      }`}
                    >
                      <div className="relative w-full max-w-[220px]">
                        {importParsed.energyWaveEnabled && (
                          <LegendEnergyWaveOverlay
                            testId="import-energy-wave-overlay"
                            accentColor={beamColor}
                          />
                        )}
                        <div className="relative rounded-2xl overflow-hidden shadow-lg z-10">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer text-xs font-medium text-[#111214] dark:text-[#F1F5F9]">
                    <span>Balayage laser</span>
                    <input
                      type="checkbox"
                      checked={importParsed.laserEnabled}
                      onChange={(e) =>
                        setImportParsed((prev) =>
                          prev ? { ...prev, laserEnabled: e.target.checked } : prev
                        )
                      }
                      className="w-4 h-4 accent-[#2563EB]"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer text-xs font-medium text-[#111214] dark:text-[#F1F5F9]">
                    <span>Ondes d’énergie</span>
                    <input
                      type="checkbox"
                      checked={importParsed.energyWaveEnabled}
                      onChange={(e) =>
                        setImportParsed((prev) =>
                          prev ? { ...prev, energyWaveEnabled: e.target.checked } : prev
                        )
                      }
                      className="w-4 h-4 accent-[#2563EB]"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const previewItem = buildPreviewSavedItemFromImport();
                      if (previewItem) {
                        setImportModalOpen(false);
                        onLoadItem(previewItem);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F3F4F8] dark:bg-[#1E293B] hover:bg-[#E8EAF2] dark:hover:bg-[#334155] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Éditer dans le studio</span>
                  </button>

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
                      <span>Enregistrer dans Importé</span>
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
              Générez un QR code dans le studio puis cliquez sur « Terminer &amp; enregistrer » pour le conserver ici avec sa durée d’accessibilité et ses réglages.
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
          {onRefreshDynamic && (
            <button
              type="button"
              data-testid="refresh-scan-stats-btn"
              disabled={refreshingDynamic}
              onClick={async () => {
                setRefreshingDynamic(true);
                try {
                  await onRefreshDynamic();
                } finally {
                  setRefreshingDynamic(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[42px] text-xs font-semibold text-[#4B4D54] dark:text-[#CBD5E1] bg-white dark:bg-[#131926] hover:bg-[#F3F4F8] dark:hover:bg-[#1E293B] border border-[#E2E6F0] dark:border-[#242C3D] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshingDynamic ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Actualiser</span>
            </button>
          )}
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
          const sourceLabel = getSourceDisplayLabel(item.source);
          const formattedDate = new Date(item.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
          });
          const isDark = relativeLuminance(item.config.cardBackgroundColor || '#FFFFFF') < 0.22;
          const dyn = item.dynamicSlug ? dynamicMap.get(item.dynamicSlug) : undefined;
          const scanSummary = dyn ? summarizeDynamicScanStats(dyn.stats) : null;
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

                {/* Scan Statistics Panel under every QR card */}
                <div
                  data-testid={`qr-scan-stats-${item.id}`}
                  className="pt-3 border-t border-[#EFEFF5] dark:border-[#242C3D] space-y-2 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#111214] dark:text-[#F1F5F9]">
                      <BarChart3
                        className={`w-3.5 h-3.5 shrink-0 ${
                          dyn
                            ? 'text-[#2563EB] dark:text-[#60A5FA]'
                            : 'text-[#6E7078] dark:text-[#94A3B8]'
                        }`}
                        aria-hidden="true"
                      />
                      <span>Statistiques de scan</span>
                    </span>
                    {dyn && scanSummary ? (
                      <span
                        data-testid={`qr-scan-total-${item.id}`}
                        className="font-bold text-[#111214] dark:text-[#F8FAFC] tabular-nums"
                      >
                        {scanSummary.totalScans} scan{scanSummary.totalScans > 1 ? 's' : ''}
                        {dyn.maxScans ? ` / ${dyn.maxScans}` : ''}
                      </span>
                    ) : (
                      <span className="font-medium text-[#6E7078] dark:text-[#94A3B8]">
                        Mode statique
                      </span>
                    )}
                  </div>

                  {dyn && scanSummary ? (
                    <div className="space-y-1.5 text-[#4B4D54] dark:text-[#CBD5E1] tabular-nums">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[#5C5E66] dark:text-[#94A3B8]">
                          <Smartphone className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0" aria-hidden="true" />
                          <Monitor className="w-3.5 h-3.5 text-[#4F46E5] dark:text-[#A5B4FC] shrink-0 -ml-0.5" aria-hidden="true" />
                          <span>Appareils</span>
                        </span>
                        <span
                          data-testid={`qr-scan-devices-${item.id}`}
                          className="font-semibold text-[#111214] dark:text-[#F1F5F9]"
                        >
                          {scanSummary.totalScans === 0
                            ? 'Aucun scan'
                            : `Mobile : ${scanSummary.mobileScans} · Ordinateur : ${scanSummary.desktopScans}${
                                scanSummary.otherScans > 0 ? ` · Autre : ${scanSummary.otherScans}` : ''
                              }`}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[#5C5E66] dark:text-[#94A3B8]">
                          <MapPin className="w-3.5 h-3.5 text-[#059669] dark:text-[#34D399] shrink-0" aria-hidden="true" />
                          <span>Localisation</span>
                        </span>
                        <span
                          data-testid={`qr-scan-location-${item.id}`}
                          title={
                            scanSummary.topLocations.length > 0
                              ? scanSummary.topLocations
                                  .slice(0, 5)
                                  .map((l) => `${l.label} (${l.count})`)
                                  .join(' · ')
                              : undefined
                          }
                          className="font-semibold text-[#111214] dark:text-[#F1F5F9] truncate max-w-[200px]"
                        >
                          {scanSummary.primaryLocation}
                          {scanSummary.topLocations.length > 1
                            ? ` (+${scanSummary.topLocations.length - 1})`
                            : ''}
                        </span>
                      </div>

                      {scanSummary.lastScannedAt && (
                        <p className="text-[10px] text-[#6E7078] dark:text-[#94A3B8] text-right">
                          Dernier scan ·{' '}
                          {new Date(scanSummary.lastScannedAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#6E7078] dark:text-[#94A3B8] leading-snug">
                      Total des scans, localisation approximative et type d’appareil (mobile/ordinateur) suivis en mode QR dynamique.
                    </p>
                  )}
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
                  <div className="max-h-32 overflow-y-auto space-y-1 text-[11px] text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                    {managedRecord.stats.recentEvents.map((ev, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {ev.device}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </span>
                        <span className="shrink-0">
                          {new Date(ev.at).toLocaleString('fr-FR')}
                        </span>
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
