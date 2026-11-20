import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CustomizePanel, type CustomizeCategoryTab } from './components/CustomizePanel';
import { ExperienceSecurityPanel } from './components/ExperienceSecurityPanel';
import { ExportModal } from './components/ExportModal';
import { HistoryGallery } from './components/HistoryGallery';
import { PreviewStage } from './components/PreviewStage';
import { SourcePanel } from './components/SourcePanel';
import { StandaloneReaderPage } from './components/StandaloneReaderPage';
import { TargetPreviewModal } from './components/TargetPreviewModal';
import {
  DEFAULT_CONFIG,
  DEFAULT_DYNAMIC_SECURITY,
  DEFAULT_EXPERIENCE,
  DEFAULT_SOURCE,
} from './data/presets';
import type {
  DynamicQrRecord,
  DynamicSecurityConfig,
  ExportOptions,
  PostScanExperience,
  ProjectCategory,
  QrConfig,
  QrIntent,
  QrSourceState,
  SavedQrItem,
  StorageStatusInfo,
  UploadedMediaInfo,
} from './types/qr';
import {
  deleteHostedMedia,
  fetchPublicAppConfig,
  fetchServerProjects,
  fetchStorageStatus,
  listDynamicQrs,
  listHostedMedia,
  registerHostedMediaCollection,
  saveDynamicQr,
  savePublicAppConfig,
  syncServerProjects,
  type PublicAppConfigResponse,
} from './utils/dynamicApi';
import {
  copyQrPngToClipboard,
  downloadQrPng,
  downloadQrSvg,
  executeProExport,
} from './utils/exportQr';
import {
  createHistoryState,
  normalizeConfigWithDefaults,
  pushHistoryState,
  redoHistoryState,
  undoHistoryState,
} from './utils/historyReducer';
import { needsHostedMediaCollection } from './utils/mediaReaderLogic';
import {
  buildPublicReaderUrl,
  isAiStudioOrPreviewHost,
  isLocalOrPrivateHost,
  validateGalleryUrls,
  validatePublicAppUrl,
} from './utils/publicUrl';
import { buildPayload, evaluateScannability } from './utils/qrLogic';

function parseViewerRoute(
  pathname: string
): { kind: 'media' | 'dynamic'; id: string } | null {
  const mediaMatch = pathname.match(/^\/m\/([a-zA-Z0-9_-]+)\/?$/);
  if (mediaMatch) return { kind: 'media', id: mediaMatch[1] };
  const dynMatch = pathname.match(/^\/d\/([a-zA-Z0-9_-]+)\/?$/);
  if (dynMatch) return { kind: 'dynamic', id: dynMatch[1] };
  return null;
}

type ActiveView = 'studio' | 'gallery';

const STORAGE_KEY = 'kromaqr_saved_items_v1';

function normalizeSavedItem(item: SavedQrItem): SavedQrItem {
  return {
    ...item,
    category: item.category || 'Personnel',
    config: normalizeConfigWithDefaults(item.config, DEFAULT_CONFIG),
    experience: item.experience
      ? { ...DEFAULT_EXPERIENCE, ...item.experience }
      : DEFAULT_EXPERIENCE,
  };
}

function loadSavedItems(): SavedQrItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as SavedQrItem[]).map(normalizeSavedItem)
      : [];
  } catch {
    return [];
  }
}

function intentToSourcePatch(intent: QrIntent, current: QrSourceState): QrSourceState {
  if (intent === 'image') {
    return { ...current, type: 'image' };
  }
  if (intent === 'video') {
    return { ...current, type: 'video' };
  }
  return { ...current, type: 'text', textMode: intent };
}

export default function App() {
  const [viewerRoute, setViewerRoute] = useState<{
    kind: 'media' | 'dynamic';
    id: string;
  } | null>(() =>
    typeof window !== 'undefined' ? parseViewerRoute(window.location.pathname) : null
  );
  const [view, setView] = useState<ActiveView>('studio');
  const [selectedIntent, setSelectedIntent] = useState<QrIntent | null>(null);
  const [source, setSource] = useState<QrSourceState>(DEFAULT_SOURCE);
  const [configHistory, setConfigHistory] = useState(() =>
    createHistoryState(DEFAULT_CONFIG)
  );
  const config = configHistory.present;

  const [experience, setExperience] = useState<PostScanExperience>(DEFAULT_EXPERIENCE);
  const [dynamicSecurity, setDynamicSecurity] = useState<DynamicSecurityConfig>(
    DEFAULT_DYNAMIC_SECURITY
  );
  const [projectCategory, setProjectCategory] = useState<ProjectCategory>('Personnel');

  useEffect(() => {
    const onPopState = () => {
      setViewerRoute(parseViewerRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [generatedSnapshot, setGeneratedSnapshot] = useState<{
    source: QrSourceState;
    payload: string;
    experience: PostScanExperience;
    dynamicSlug: string | null;
    dynamicHasPin: boolean;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);

  const [savedItems, setSavedItems] = useState<SavedQrItem[]>(() => loadSavedItems());
  const [dynamicRecords, setDynamicRecords] = useState<DynamicQrRecord[]>([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<CustomizeCategoryTab>('models');

  const [publicConfig, setPublicConfig] = useState<PublicAppConfigResponse | null>(null);
  const [publicUrlDraft, setPublicUrlDraft] = useState('');
  const [publicUrlSaving, setPublicUrlSaving] = useState(false);
  const [publicUrlFeedback, setPublicUrlFeedback] = useState<string | null>(null);
  const [showPublicUrlEditor, setShowPublicUrlEditor] = useState(false);

  const [storageStatus, setStorageStatus] = useState<StorageStatusInfo | null>(null);
  const [hostedMedia, setHostedMedia] = useState<UploadedMediaInfo[]>([]);

  const qrSvgRef = useRef<SVGSVGElement | null>(null);
  const customizeSectionRef = useRef<HTMLDivElement | null>(null);

  const scannabilityReport = useMemo(
    () => evaluateScannability(config, generatedSnapshot?.source ?? source),
    [config, generatedSnapshot, source]
  );

  const refreshPublicConfig = useCallback(async () => {
    try {
      const cfg = await fetchPublicAppConfig();
      setPublicConfig(cfg);
      if (cfg.configuredUrl) {
        setPublicUrlDraft(cfg.configuredUrl);
      }
      if (!cfg.valid) {
        setShowPublicUrlEditor(true);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  const refreshDynamicRecords = useCallback(async () => {
    try {
      const items = await listDynamicQrs();
      setDynamicRecords(items);
    } catch {
      // Non-blocking
    }
  }, []);

  const refreshStorageAndMedia = useCallback(async () => {
    try {
      const [status, items] = await Promise.all([
        fetchStorageStatus(),
        listHostedMedia(),
      ]);
      setStorageStatus(status);
      setHostedMedia(items);
    } catch {
      // Non-blocking
    }
  }, []);

  const handleDeleteHostedMedia = useCallback(
    async (id: string) => {
      await deleteHostedMedia(id);
      await refreshStorageAndMedia();
    },
    [refreshStorageAndMedia]
  );

  useEffect(() => {
    void refreshPublicConfig();
    void refreshDynamicRecords();
    void refreshStorageAndMedia();
    void fetchServerProjects().then((serverItems) => {
      if (serverItems.length > 0) {
        setSavedItems((localItems) => {
          const seen = new Set(localItems.map((i) => i.id));
          const merged = [...localItems];
          for (const s of serverItems) {
            if (!seen.has(s.id)) merged.push(normalizeSavedItem(s));
          }
          return merged;
        });
      }
    });
  }, [refreshPublicConfig, refreshDynamicRecords, refreshStorageAndMedia]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
    } catch {
      // Ignore quota errors
    }
    void syncServerProjects(savedItems);
  }, [savedItems]);

  const setConfig = useCallback((nextConfig: QrConfig) => {
    setConfigHistory((prev) => pushHistoryState(prev, nextConfig));
  }, []);

  const handleUndo = useCallback(() => {
    setConfigHistory((prev) => undoHistoryState(prev));
  }, []);

  const handleRedo = useCallback(() => {
    setConfigHistory((prev) => redoHistoryState(prev));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isTextInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleSelectIntent = (intent: QrIntent) => {
    setSelectedIntent(intent);
    setSource((prev) => intentToSourcePatch(intent, prev));
    setValidationError(undefined);
    setGeneratedSnapshot(null);
  };

  const handleSourceChange = (nextSource: QrSourceState) => {
    setSource(nextSource);
    setValidationError(undefined);
    // Strict privacy/security: clear exposed QR whenever input content changes until Générer is clicked
    setGeneratedSnapshot(null);
  };

  const handleExperienceChange = (nextExp: PostScanExperience) => {
    setExperience(nextExp);
    setGeneratedSnapshot(null);
  };

  const handleSecurityChange = (nextSec: DynamicSecurityConfig) => {
    setDynamicSecurity(nextSec);
    setGeneratedSnapshot(null);
  };

  const handleSavePublicAppUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublicUrlFeedback(null);
    setPublicUrlSaving(true);
    try {
      const updated = await savePublicAppConfig(publicUrlDraft);
      setPublicConfig(updated);
      setPublicUrlDraft(updated.configuredUrl);
      setShowPublicUrlEditor(false);
      setValidationError(undefined);
      setGeneratedSnapshot(null);
      void refreshDynamicRecords();
    } catch (err) {
      setPublicUrlFeedback(
        err instanceof Error ? err.message : 'Adresse PUBLIC_APP_URL invalide.'
      );
    } finally {
      setPublicUrlSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedIntent) {
      setValidationError('Sélectionnez d’abord un type de contenu à encoder.');
      return;
    }

    const tpl = experience.template || 'standard';
    const isRichCollectionTemplate =
      tpl === 'photo-gallery' ||
      tpl === 'video-gallery' ||
      tpl === 'media-gallery' ||
      tpl === 'mixed-collection';
    const hasCollectionData =
      (experience.galleryItems && experience.galleryItems.length > 0) ||
      Boolean(experience.mixedTextBlock?.trim());

    if (isRichCollectionTemplate && experience.galleryItems.length > 0) {
      const galleryCheck = validateGalleryUrls(
        experience.galleryItems.map((item) => item.url)
      );
      if (!galleryCheck.safe) {
        setValidationError(galleryCheck.error);
        setGeneratedSnapshot(null);
        return;
      }
    }

    const hostedRequired =
      dynamicSecurity.enabled || needsHostedMediaCollection(source, experience);
    const configuredOrigin = publicConfig?.configuredUrl || '';
    const publicCheck = validatePublicAppUrl(configuredOrigin);

    if (hostedRequired && !publicCheck.valid) {
      setShowPublicUrlEditor(true);
      setValidationError(
        publicCheck.error ||
          'Configurez PUBLIC_APP_URL (domaine public HTTPS) avant de générer un QR hébergé.'
      );
      setGeneratedSnapshot(null);
      return;
    }

    const validPublicOrigin = publicCheck.valid ? publicCheck.normalizedUrl : '';
    const result = buildPayload(source, validPublicOrigin);
    if (!result.valid && !(isRichCollectionTemplate && hasCollectionData)) {
      setValidationError(result.error);
      setGeneratedSnapshot(null);
      return;
    }
    setValidationError(undefined);

    const effectivePayload = result.valid
      ? result.payload
      : validPublicOrigin;

    if (dynamicSecurity.enabled) {
      setIsGenerating(true);
      try {
        const rec = await saveDynamicQr({
          slug: dynamicSecurity.slug,
          active: dynamicSecurity.active,
          pinCode: dynamicSecurity.pinCode,
          expiresAt: dynamicSecurity.expiresAt,
          maxScans: dynamicSecurity.maxScans,
          intent: selectedIntent,
          payload: effectivePayload,
          title:
            experience.headline.trim() ||
            config.titleText.trim() ||
            'Code QR dynamique',
          sourceSnapshot: { ...source },
          experience: { ...experience },
          config,
        });
        setDynamicSecurity((prev) => ({
          ...prev,
          slug: rec.slug,
          hasPin: rec.hasPin,
        }));
        setGeneratedSnapshot({
          source: { ...source },
          payload: buildPublicReaderUrl(validPublicOrigin, `/d/${rec.slug}`),
          experience: { ...experience },
          dynamicSlug: rec.slug,
          dynamicHasPin: rec.hasPin,
        });
        void refreshDynamicRecords();
      } catch (err) {
        setValidationError(
          err instanceof Error
            ? err.message
            : 'Erreur lors de la création du QR dynamique.'
        );
        setGeneratedSnapshot(null);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    if (needsHostedMediaCollection(source, experience)) {
      setIsGenerating(true);
      try {
        const hosted = await registerHostedMediaCollection({
          source: { ...source },
          experience: { ...experience },
          config,
          title:
            experience.headline.trim() ||
            config.titleText.trim() ||
            source.imageName ||
            source.videoName ||
            'Collection KromaQR Studio',
        });
        setGeneratedSnapshot({
          source: { ...source },
          payload: buildPublicReaderUrl(validPublicOrigin, hosted.pageUrl),
          experience: { ...experience },
          dynamicSlug: null,
          dynamicHasPin: false,
        });
      } catch (err) {
        setValidationError(
          err instanceof Error
            ? err.message
            : 'Erreur lors de la préparation du lecteur KromaQR.'
        );
        setGeneratedSnapshot(null);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    setGeneratedSnapshot({
      source: { ...source },
      payload: effectivePayload,
      experience: { ...experience },
      dynamicSlug: null,
      dynamicHasPin: false,
    });
  };

  const isGenerated = generatedSnapshot !== null;
  const activePayload = generatedSnapshot?.payload ?? '';
  const activeSource = generatedSnapshot?.source ?? source;
  const activeExperience = generatedSnapshot?.experience ?? experience;

  const makeFileSlug = () =>
    (config.titleText || 'kromaqr')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'kromaqr';

  const handleDownloadPng = async () => {
    if (!isGenerated || !qrSvgRef.current) return;
    await downloadQrPng(qrSvgRef.current, `${makeFileSlug()}.png`);
  };

  const handleDownloadSvg = async () => {
    if (!isGenerated || !qrSvgRef.current) return;
    await downloadQrSvg(qrSvgRef.current, `${makeFileSlug()}.svg`);
  };

  const handleCopyPng = async () => {
    if (!isGenerated || !qrSvgRef.current) return;
    await copyQrPngToClipboard(qrSvgRef.current);
  };

  const handleProExport = async (options: ExportOptions) => {
    if (!isGenerated || !qrSvgRef.current) return;
    await executeProExport(qrSvgRef.current, makeFileSlug(), options, config.titleText);
  };

  const handleSaveToHistory = () => {
    if (!generatedSnapshot) return;
    const newItem: SavedQrItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: config.titleText.trim() || 'Code QR sans titre',
      category: projectCategory,
      createdAt: new Date().toISOString(),
      source: { ...generatedSnapshot.source },
      config: { ...config },
      experience: { ...generatedSnapshot.experience },
      dynamicSlug: generatedSnapshot.dynamicSlug,
      payload: generatedSnapshot.payload,
    };
    setSavedItems((prev) => [newItem, ...prev]);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  const handleLoadSavedItem = (item: SavedQrItem) => {
    const normalized = normalizeSavedItem(item);
    const nextIntent: QrIntent =
      normalized.source.type === 'image'
        ? 'image'
        : normalized.source.type === 'video'
        ? 'video'
        : normalized.source.textMode;
    setSelectedIntent(nextIntent);
    setSource(normalized.source);
    setConfig(normalized.config);
    setExperience(normalized.experience ?? DEFAULT_EXPERIENCE);
    setProjectCategory(normalized.category || 'Personnel');
    const dynMatch = normalized.dynamicSlug
      ? dynamicRecords.find((d) => d.slug === normalized.dynamicSlug)
      : undefined;
    setDynamicSecurity({
      ...DEFAULT_DYNAMIC_SECURITY,
      enabled: Boolean(normalized.dynamicSlug),
      slug: normalized.dynamicSlug ?? null,
      hasPin: Boolean(dynMatch?.hasPin),
      active: dynMatch?.active ?? true,
      maxScans: dynMatch?.maxScans ?? null,
      expiresAt: dynMatch?.expiresAt ?? '',
    });
    let hasLegacyUnsafePayload = false;
    if (/^https?:\/\//i.test(normalized.payload || '')) {
      try {
        const p = new URL(normalized.payload);
        hasLegacyUnsafePayload =
          isAiStudioOrPreviewHost(p.hostname) || isLocalOrPrivateHost(p.hostname);
      } catch {
        hasLegacyUnsafePayload = false;
      }
    }

    if (hasLegacyUnsafePayload) {
      setValidationError(
        'Ce projet enregistré utilisait une ancienne URL privée. Cliquez sur « Générer mon QR code » pour actualiser le lien avec PUBLIC_APP_URL.'
      );
      setGeneratedSnapshot(null);
    } else {
      setValidationError(undefined);
      setGeneratedSnapshot({
        source: normalized.source,
        payload: normalized.payload,
        experience: normalized.experience ?? DEFAULT_EXPERIENCE,
        dynamicSlug: normalized.dynamicSlug ?? null,
        dynamicHasPin: Boolean(dynMatch?.hasPin),
      });
    }
    setView('studio');
  };

  const handleDuplicateItem = (item: SavedQrItem) => {
    const copy: SavedQrItem = {
      ...normalizeSavedItem(item),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${item.name || 'Projet'} (copie)`,
      createdAt: new Date().toISOString(),
      dynamicSlug: null,
    };
    setSavedItems((prev) => [copy, ...prev]);
  };

  const handleDeleteSavedItem = (id: string) => {
    setSavedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleResetStyle = () => {
    setConfig(DEFAULT_CONFIG);
  };

  const handleJumpToTypography = () => {
    setCustomizeTab('typography');
    customizeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (viewerRoute) {
    return (
      <StandaloneReaderPage
        routeKind={viewerRoute.kind}
        routeId={viewerRoute.id}
        onNavigateStudio={() => {
          window.history.pushState({}, '', '/');
          setViewerRoute(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F5] text-[#111214]">
      {/* Top Bar: strict 3-zone contract */}
      <header className="bg-white/95 backdrop-blur-xs border-b border-[#E6E4DC]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-3 sm:gap-8">
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              setView('studio');
            }}
            className="inline-flex items-center gap-2 font-display text-lg sm:text-xl font-bold tracking-tight text-[#111214] whitespace-nowrap shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#1D4ED8]" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" rx="2.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <rect x="14" y="2" width="8" height="8" rx="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <rect x="2" y="14" width="8" height="8" rx="2.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <rect x="14.5" y="14.5" width="3.5" height="3.5" rx="1" fill="currentColor" />
              <rect x="19" y="19" width="3.5" height="3.5" rx="1" fill="currentColor" />
            </svg>
            <span>KromaQR</span>
          </a>

          <nav
            aria-label="Navigation principale"
            className="flex items-center gap-3.5 sm:gap-6 text-xs sm:text-sm font-medium text-[#5C5E66]"
          >
            <button
              type="button"
              onClick={() => setView('studio')}
              className={`hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'studio'
                  ? 'text-[#111214] underline underline-offset-8 decoration-2 decoration-[#1D4ED8]'
                  : ''
              }`}
            >
              Studio
            </button>

            <button
              type="button"
              data-testid="nav-dashboard-btn"
              onClick={() => {
                void refreshDynamicRecords();
                void refreshStorageAndMedia();
                setView('gallery');
              }}
              className={`hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                view === 'gallery'
                  ? 'text-[#111214] underline underline-offset-8 decoration-2 decoration-[#1D4ED8]'
                  : ''
              }`}
            >
              Tableau de bord ({savedItems.length})
            </button>

            <button
              type="button"
              disabled={!isGenerated}
              onClick={() => isGenerated && setPreviewModalOpen(true)}
              className="hidden sm:inline-block hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Aperçu scan
            </button>

            <button
              type="button"
              onClick={handleResetStyle}
              className="hidden md:inline-block hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Réinitialiser
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              disabled={!isGenerated}
              onClick={() => isGenerated && setExportModalOpen(true)}
              aria-label="Exporter Pro"
              className="px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Exporter Pro</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-5 sm:py-7">
        <h1 className="sr-only">
          KromaQR Studio — Studio professionnel de codes QR graphiques et dynamiques
        </h1>

        {view === 'studio' ? (
          <div className="space-y-5">
            {/* PUBLIC_APP_URL Quiet Configuration Bar */}
            {publicConfig && (
              <section
                aria-label="Configuration du domaine public des QR codes"
                data-testid="public-url-config-bar"
                className={`rounded-2xl border px-4 py-2.5 transition-colors ${
                  publicConfig.valid
                    ? 'bg-white border-[#E6E4DC]'
                    : 'bg-[#FFFBEB] border-[#FDE68A]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#111214]">
                      <span>Domaine public (PUBLIC_APP_URL)</span>
                      <span
                        className={`text-[11px] font-mono ${
                          publicConfig.valid ? 'text-[#15803D]' : 'text-[#B45309]'
                        }`}
                      >
                        {publicConfig.valid
                          ? publicConfig.configuredUrl
                          : 'Non configuré — génération hébergée bloquée'}
                      </span>
                    </div>
                    {!publicConfig.valid && (
                      <p className="text-[11px] text-[#92400E] mt-0.5">
                        {publicConfig.diagnostics.summary}
                      </p>
                    )}
                  </div>

                  {publicConfig.source !== 'env' && (
                    <button
                      type="button"
                      data-testid="toggle-public-url-editor-btn"
                      onClick={() => {
                        setPublicUrlFeedback(null);
                        setShowPublicUrlEditor((v) => !v);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-[#111214] bg-[#FAF9F5] hover:bg-[#F2F1EB] border border-[#E6E4DC] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {showPublicUrlEditor
                        ? 'Fermer'
                        : publicConfig.valid
                        ? 'Modifier'
                        : 'Configurer HTTPS'}
                    </button>
                  )}
                </div>

                {showPublicUrlEditor && publicConfig.source !== 'env' && (
                  <form
                    onSubmit={(e) => void handleSavePublicAppUrl(e)}
                    className="mt-3 pt-3 border-t border-black/10 flex flex-col sm:flex-row sm:items-center gap-2.5"
                  >
                    <label htmlFor="public-app-url-input" className="sr-only">
                      Adresse publique HTTPS (PUBLIC_APP_URL)
                    </label>
                    <input
                      id="public-app-url-input"
                      data-testid="public-app-url-input"
                      type="url"
                      value={publicUrlDraft}
                      onChange={(e) => {
                        setPublicUrlFeedback(null);
                        setPublicUrlDraft(e.target.value);
                      }}
                      placeholder="https://qr.votre-domaine.com"
                      className="flex-1 px-3 py-2 text-xs bg-[#FAF9F5] border border-[#DFDDD4] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
                    />
                    <button
                      type="submit"
                      data-testid="save-public-url-btn"
                      disabled={publicUrlSaving}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      {publicUrlSaving ? 'Validation...' : 'Enregistrer le domaine'}
                    </button>
                    {publicConfig.source === 'saved' && (
                      <button
                        type="button"
                        data-testid="clear-public-url-btn"
                        disabled={publicUrlSaving}
                        onClick={() => {
                          setPublicUrlFeedback(null);
                          setPublicUrlDraft('');
                          void savePublicAppConfig('')
                            .then((updated) => {
                              setPublicConfig(updated);
                              setShowPublicUrlEditor(true);
                              setGeneratedSnapshot(null);
                            })
                            .catch(() => {});
                        }}
                        className="px-3 py-2 text-xs font-semibold text-[#5C5E66] bg-[#FAF9F5] border border-[#DFDDD4] hover:text-[#111214] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Effacer
                      </button>
                    )}
                  </form>
                )}

                {publicUrlFeedback && (
                  <p role="alert" className="mt-2 text-xs font-medium text-[#B91C1C]">
                    {publicUrlFeedback}
                  </p>
                )}
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_480px] xl:grid-cols-[minmax(0,1fr)_520px] gap-6 xl:gap-8 items-start">
              <div className="space-y-5 min-w-0">
                <SourcePanel
                  selectedIntent={selectedIntent}
                  onSelectIntent={handleSelectIntent}
                  source={source}
                  onChange={handleSourceChange}
                  onGenerate={() => void handleGenerate()}
                  isGenerated={isGenerated}
                  isGenerating={isGenerating}
                  config={config}
                  validationError={validationError}
                  onMediaUploaded={() => void refreshStorageAndMedia()}
                  onJumpToTypography={handleJumpToTypography}
                />

                <div ref={customizeSectionRef}>
                  <CustomizePanel
                    config={config}
                    onChange={setConfig}
                    onReset={handleResetStyle}
                    canUndo={configHistory.past.length > 0}
                    canRedo={configHistory.future.length > 0}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    activeTab={customizeTab}
                    onTabChange={setCustomizeTab}
                  />
                </div>

                <ExperienceSecurityPanel
                  experience={experience}
                  onChangeExperience={handleExperienceChange}
                  dynamicSecurity={dynamicSecurity}
                  onChangeSecurity={handleSecurityChange}
                  projectCategory={projectCategory}
                  onChangeCategory={setProjectCategory}
                  onMediaUploaded={() => void refreshStorageAndMedia()}
                />
              </div>

              <PreviewStage
                isGenerated={isGenerated}
                canGenerate={selectedIntent !== null}
                isGenerating={isGenerating}
                payload={activePayload}
                config={config}
                source={activeSource}
                report={scannabilityReport}
                svgRef={qrSvgRef}
                onGenerate={() => void handleGenerate()}
                onDownloadPng={handleDownloadPng}
                onDownloadSvg={handleDownloadSvg}
                onCopyPng={handleCopyPng}
                onOpenTargetPreview={() => isGenerated && setPreviewModalOpen(true)}
                onSaveToHistory={handleSaveToHistory}
                onClearGenerated={() => setGeneratedSnapshot(null)}
                justSaved={justSaved}
                dynamicSlug={generatedSnapshot?.dynamicSlug ?? null}
                dynamicHasPin={generatedSnapshot?.dynamicHasPin ?? false}
                onOpenProExport={() => isGenerated && setExportModalOpen(true)}
              />
            </div>
          </div>
        ) : (
          <HistoryGallery
            items={savedItems}
            dynamicRecords={dynamicRecords}
            storageStatus={storageStatus}
            hostedMedia={hostedMedia}
            onLoadItem={handleLoadSavedItem}
            onDuplicateItem={handleDuplicateItem}
            onDeleteItem={handleDeleteSavedItem}
            onRefreshDynamic={refreshDynamicRecords}
            onDeleteMedia={handleDeleteHostedMedia}
            onRefreshMedia={refreshStorageAndMedia}
            onBackToStudio={() => setView('studio')}
          />
        )}
      </main>

      <footer className="border-t border-[#E6E4DC] bg-white mt-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-[#6E7078]">
          <span>KromaQR Studio · Studio vectoriel SVG, PNG HD, PDF A4 &amp; QR dynamiques</span>
          <span>Collections Studio &amp; Atelier Prestige</span>
        </div>
      </footer>

      <TargetPreviewModal
        open={previewModalOpen && isGenerated}
        onClose={() => setPreviewModalOpen(false)}
        source={activeSource}
        config={config}
        payload={activePayload}
        experience={activeExperience}
        dynamicSlug={generatedSnapshot?.dynamicSlug ?? null}
        dynamicHasPin={generatedSnapshot?.dynamicHasPin ?? false}
      />

      <ExportModal
        open={exportModalOpen && isGenerated}
        onClose={() => setExportModalOpen(false)}
        title={config.titleText || 'KromaQR Studio'}
        onExport={handleProExport}
      />
    </div>
  );
}
