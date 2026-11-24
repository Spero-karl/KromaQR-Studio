import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, UserCheck } from 'lucide-react';
import { AdminPricingModal } from './components/AdminPricingModal';
import { CustomizePanel, type CustomizeCategoryTab } from './components/CustomizePanel';
import { ExperienceSecurityPanel } from './components/ExperienceSecurityPanel';
import { ExportModal } from './components/ExportModal';
import { HistoryGallery } from './components/HistoryGallery';
import { PreviewStage } from './components/PreviewStage';
import { PrivacyTermsModal } from './components/PrivacyTermsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { RetentionExtendModal } from './components/RetentionExtendModal';
import { SourcePanel } from './components/SourcePanel';
import { StandaloneReaderPage } from './components/StandaloneReaderPage';
import { StorageConservationView } from './components/StorageConservationView';
import { TargetPreviewModal } from './components/TargetPreviewModal';
import { WorkspaceModal } from './components/WorkspaceModal';
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
  UploadedMediaInfo,
  WorkspaceInfo,
} from './types/qr';
import {
  createNewWorkspace,
  deleteHostedMedia,
  deleteStorageItem,
  fetchPublicAppConfig,
  fetchServerProjects,
  fetchStorageDashboard,
  initOrFetchWorkspace,
  joinWorkspaceByCode,
  listDynamicQrs,
  listHostedMedia,
  registerHostedMediaCollection,
  renameWorkspace,
  saveDynamicQr,
  syncServerProjects,
  type PublicAppConfigResponse,
} from './utils/dynamicApi';
import { resolveUnsharedServerDeletionTarget } from './utils/savedQrDeletion';
import {
  appendKeyFragmentToUrl,
  encryptJsonWithKey,
  generateE2eeKeyBase64Url,
} from './utils/e2eeCrypto';
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
  cleanEnvUrlInput,
  isAiStudioOrPreviewHost,
  isLocalOrPrivateHost,
  validateGalleryUrls,
  validatePublicAppUrl,
} from './utils/publicUrl';
import { buildPayload, evaluateScannability, relativeLuminance } from './utils/qrLogic';
import { formatPaidDurationLabel } from './utils/retentionPricing';
import { computeDefaultServerExpiry } from './utils/serverAvailability';
import { parseReceivedQrInput } from './utils/sharedQrPackage';

function parseViewerRoute(
  pathname: string
): { kind: 'media' | 'dynamic'; id: string } | null {
  const mediaMatch = pathname.match(/^\/m\/([a-zA-Z0-9_-]+)\/?$/);
  if (mediaMatch) return { kind: 'media', id: mediaMatch[1] };
  const dynMatch = pathname.match(/^\/d\/([a-zA-Z0-9_-]+)\/?$/);
  if (dynMatch) return { kind: 'dynamic', id: dynMatch[1] };
  return null;
}

type ActiveView = 'studio' | 'gallery' | 'conservation';

async function buildE2eeTransmissionBundle(params: {
  src: QrSourceState;
  exp: PostScanExperience;
  title: string;
  payload: string;
  key: string;
}) {
  const { src, exp, title, payload, key } = params;
  const cleanSrc: QrSourceState = {
    ...src,
    imageName: '',
    videoName: '',
    e2eeKeyFragment: undefined,
  };
  const encryptedMeta = await encryptJsonWithKey(
    {
      source: cleanSrc,
      experience: exp,
      title,
      payload,
    },
    key
  );

  const redactedSource: QrSourceState = {
    ...cleanSrc,
    textValue: '',
    urlValue: '',
    wifiSsid: '',
    wifiPassword: '',
    imagePageUrl: '',
    videoPageUrl: '',
    imageName: '',
    videoName: '',
    e2eeEnabled: true,
  };

  const redactedExperience: PostScanExperience = {
    ...DEFAULT_EXPERIENCE,
    template: exp.template,
    accentMood: exp.accentMood,
    readerThemeMode: exp.readerThemeMode,
    headline: 'Contenu chiffré',
    galleryItems: (exp.galleryItems || []).map((g) => ({
      id: g.id,
      type: g.type,
      url: g.url,
      posterUrl: g.posterUrl,
      caption: '',
      isEncrypted: g.isEncrypted,
      originalSize: g.originalSize,
    })),
  };

  return {
    encryptedMeta,
    redactedSource,
    redactedExperience,
    redactedTitle: 'Contenu chiffré',
  };
}

const WORKSPACE_STORAGE_PREFIX = 'sparkqr_saved_items_ws_';
const LEGACY_STORAGE_KEYS = ['sparkqr_saved_items_v1', 'kromaqr_saved_items_v1'];

function getWorkspaceStorageKey(workspaceId: string): string {
  return `${WORKSPACE_STORAGE_PREFIX}${workspaceId}`;
}

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

function loadSavedItemsForWorkspace(workspaceId: string): SavedQrItem[] {
  try {
    const scopedKey = getWorkspaceStorageKey(workspaceId);
    const scopedRaw = localStorage.getItem(scopedKey);
    if (scopedRaw) {
      const parsed = JSON.parse(scopedRaw);
      return Array.isArray(parsed)
        ? (parsed as SavedQrItem[]).map(normalizeSavedItem)
        : [];
    }

    // One-time migration if no workspace-scoped key exists anywhere yet
    const hasAnyWorkspaceCache = Object.keys(localStorage).some((k) =>
      k.startsWith(WORKSPACE_STORAGE_PREFIX)
    );
    if (!hasAnyWorkspaceCache) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyRaw = localStorage.getItem(legacyKey);
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return (parsed as SavedQrItem[])
              .map(normalizeSavedItem)
              .map((item) => ({ ...item, workspaceId }));
          }
        }
      }
    }
    return [];
  } catch {
    return [];
  }
}

function deriveAutoTitle(
  src: QrSourceState,
  cfg: QrConfig,
  exp: PostScanExperience
): string {
  if (exp.headline.trim()) return exp.headline.trim();
  const customCardTitle = cfg.titleText.trim();
  if (customCardTitle && customCardTitle !== 'Mon Code QR') return customCardTitle;
  if (src.type === 'image') return 'Image';
  if (src.type === 'video') return 'Vidéo';
  if (src.textMode === 'wifi') return src.wifiSsid.trim() || 'Accès Wi-Fi';
  if (src.textMode === 'url') {
    const cleaned = src.urlValue
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '');
    return cleaned ? cleaned.slice(0, 40) : 'Lien web';
  }
  const textSnippet = src.textValue.trim().replace(/\s+/g, ' ');
  return textSnippet ? textSnippet.slice(0, 40) : 'Message SparkQR';
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
    serverExpiresAt?: string | null;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);

  const [savedItems, setSavedItems] = useState<SavedQrItem[]>([]);
  const [activeSavedItemId, setActiveSavedItemId] = useState<string | null>(null);
  const [loadedForEditId, setLoadedForEditId] = useState<string | null>(null);
  const [dynamicRecords, setDynamicRecords] = useState<DynamicQrRecord[]>([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [galleryPreviewItem, setGalleryPreviewItem] = useState<SavedQrItem | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<CustomizeCategoryTab>('models');

  const [publicConfig, setPublicConfig] = useState<PublicAppConfigResponse | null>(null);
  const [hostedMedia, setHostedMedia] = useState<UploadedMediaInfo[]>([]);

  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [extendTarget, setExtendTarget] = useState<{
    targetKind: 'media' | 'collection' | 'dynamic' | 'workspace';
    targetId: string;
    targetTitle: string;
    currentExpiresAt?: string | null;
  } | null>(null);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(() =>
    typeof window !== 'undefined' &&
    (window.location.search.includes('admin=1') || window.location.hash === '#admin')
  );
  const [paymentBanner, setPaymentBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [dashboardNonce, setDashboardNonce] = useState(0);

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

  const refreshHostedMedia = useCallback(async () => {
    try {
      const items = await listHostedMedia();
      setHostedMedia(items);
    } catch {
      // Non-blocking
    }
  }, []);

  const refreshUnreadNotifications = useCallback(async () => {
    try {
      const dash = await fetchStorageDashboard();
      setUnreadNotificationsCount(dash.notifications.filter((n) => !n.read).length);
    } catch {
      // Non-blocking
    }
  }, []);

  const hydrateWorkspaceData = useCallback(
    async (ws: WorkspaceInfo) => {
      setWorkspaceReady(false);
      setWorkspace(ws);
      const localItems = loadSavedItemsForWorkspace(ws.id);
      setSavedItems(localItems);

      const [serverItems, dynItems, mediaItems] = await Promise.all([
        fetchServerProjects().catch(() => [] as SavedQrItem[]),
        listDynamicQrs().catch(() => [] as DynamicQrRecord[]),
        listHostedMedia().catch(() => [] as UploadedMediaInfo[]),
      ]);

      setDynamicRecords(dynItems);
      setHostedMedia(mediaItems);

      if (serverItems.length > 0) {
        const seen = new Set(localItems.map((i) => i.id));
        const merged = [...localItems];
        for (const s of serverItems) {
          if (!seen.has(s.id)) {
            merged.push({ ...normalizeSavedItem(s), workspaceId: ws.id });
          }
        }
        setSavedItems(merged);
      }
      setWorkspaceReady(true);
      void refreshUnreadNotifications();
    },
    [refreshUnreadNotifications]
  );

  const handleDeleteHostedMedia = useCallback(
    async (id: string) => {
      await deleteHostedMedia(id);
      await refreshHostedMedia();
    },
    [refreshHostedMedia]
  );

  useEffect(() => {
    void refreshPublicConfig();
    void initOrFetchWorkspace()
      .then(({ workspace: ws }) => hydrateWorkspaceData(ws))
      .catch(() => {
        setWorkspaceReady(true);
      });
  }, [refreshPublicConfig, hydrateWorkspaceData]);

  useEffect(() => {
    if (!workspace || !workspaceReady) return;
    try {
      localStorage.setItem(
        getWorkspaceStorageKey(workspace.id),
        JSON.stringify(savedItems)
      );
    } catch {
      // Ignore quota errors
    }
    void syncServerProjects(savedItems);
  }, [savedItems, workspace, workspaceReady]);

  const ensureE2eeKey = useCallback((): string => {
    if (source.e2eeKeyFragment && source.e2eeKeyFragment.trim().length > 0) {
      return source.e2eeKeyFragment.trim();
    }
    const nextKey = generateE2eeKeyBase64Url();
    setSource((prev) => ({
      ...prev,
      e2eeEnabled: true,
      e2eeKeyFragment: prev.e2eeKeyFragment || nextKey,
    }));
    return nextKey;
  }, [source.e2eeKeyFragment]);

  const handleRenameWorkspace = async (name: string) => {
    const updated = await renameWorkspace(name);
    setWorkspace(updated);
  };

  const handleCreateNewWorkspace = async (name?: string) => {
    const created = await createNewWorkspace(name);
    setGeneratedSnapshot(null);
    setValidationError(undefined);
    setActiveSavedItemId(null);
    setLoadedForEditId(null);
    setSelectedIntent(null);
    setSource(DEFAULT_SOURCE);
    setExperience(DEFAULT_EXPERIENCE);
    setDynamicSecurity(DEFAULT_DYNAMIC_SECURITY);
    await hydrateWorkspaceData(created);
  };

  const handleJoinWorkspace = async (accessCode: string) => {
    const joined = await joinWorkspaceByCode(accessCode);
    setGeneratedSnapshot(null);
    setValidationError(undefined);
    setActiveSavedItemId(null);
    setLoadedForEditId(null);
    await hydrateWorkspaceData(joined);
  };

  const setConfig = useCallback(
    (nextConfig: QrConfig) => {
      setConfigHistory((prev) => {
        if (nextConfig.themeId !== prev.present.themeId && nextConfig.themeId !== 'custom') {
          const isDarkTheme = relativeLuminance(nextConfig.cardBackgroundColor || '#FFFFFF') < 0.22;
          setExperience((expPrev) => ({
            ...expPrev,
            readerThemeMode: isDarkTheme ? 'dark' : 'light',
          }));
        }
        return pushHistoryState(prev, nextConfig);
      });
    },
    []
  );

  const handleToggleLaser = useCallback(() => {
    setConfigHistory((prev) =>
      pushHistoryState(prev, {
        ...prev.present,
        laserEnabled: prev.present.laserEnabled === false ? true : false,
      })
    );
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
    setActiveSavedItemId(null);
    setLoadedForEditId(null);
  };

  const handleSourceChange = (nextSource: QrSourceState) => {
    setSource(nextSource);
    setValidationError(undefined);
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

  const recordGeneratedQrInLibrary = useCallback(
    (params: {
      snapshotSource: QrSourceState;
      snapshotExperience: PostScanExperience;
      finalPayload: string;
      dynamicSlug: string | null;
      accessibilityKind: 'permanent' | 'hosted' | 'dynamic';
      serverCollectionId?: string | null;
      serverExpiresAt?: string | null;
    }) => {
      const nowIso = new Date().toISOString();
      const autoName = deriveAutoTitle(
        params.snapshotSource,
        config,
        params.snapshotExperience
      );

      setSavedItems((prev) => {
        const existingTargetId =
          loadedForEditId ||
          (activeSavedItemId
            ? prev.find(
                (it) =>
                  it.id === activeSavedItemId &&
                  (it.payload === params.finalPayload ||
                    (params.dynamicSlug && it.dynamicSlug === params.dynamicSlug))
              )?.id ?? null
            : null);

        if (existingTargetId) {
          return prev.map((it) =>
            it.id === existingTargetId
              ? {
                  ...it,
                  name: autoName,
                  category: projectCategory,
                  workspaceId: workspace?.id,
                  source: { ...params.snapshotSource },
                  config: { ...config },
                  experience: { ...params.snapshotExperience },
                  dynamicSlug: params.dynamicSlug,
                  payload: params.finalPayload,
                  accessibilityKind: params.accessibilityKind,
                  serverCollectionId: params.serverCollectionId ?? it.serverCollectionId ?? null,
                  serverExpiresAt:
                    params.serverExpiresAt !== undefined
                      ? params.serverExpiresAt
                      : it.serverExpiresAt ?? null,
                }
              : it
          );
        }

        const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const created: SavedQrItem = {
          id: newId,
          workspaceId: workspace?.id,
          name: autoName,
          category: projectCategory,
          createdAt: nowIso,
          source: { ...params.snapshotSource },
          config: { ...config },
          experience: { ...params.snapshotExperience },
          dynamicSlug: params.dynamicSlug,
          payload: params.finalPayload,
          accessibilityKind: params.accessibilityKind,
          serverCollectionId: params.serverCollectionId ?? null,
          serverExpiresAt: params.serverExpiresAt ?? null,
        };
        setActiveSavedItemId(newId);
        return [created, ...prev];
      });
    },
    [activeSavedItemId, config, loadedForEditId, projectCategory, workspace?.id]
  );

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

    let latestPublicConfig = publicConfig;
    if (hostedRequired && !latestPublicConfig?.valid) {
      try {
        latestPublicConfig = await fetchPublicAppConfig();
        setPublicConfig(latestPublicConfig);
      } catch {
        // Non-blocking fallback handled below
      }
    }

    const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const viteEnvUrl = cleanEnvUrlInput(
      (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_APP_URL
    );

    const candidateOrigins = [
      latestPublicConfig?.configuredUrl || '',
      viteEnvUrl,
      browserOrigin,
    ];
    let publicCheck = validatePublicAppUrl(candidateOrigins[0]);
    if (!publicCheck.valid) {
      for (const candidate of candidateOrigins.slice(1)) {
        if (!candidate) continue;
        const candidateCheck = validatePublicAppUrl(candidate);
        if (candidateCheck.valid) {
          publicCheck = candidateCheck;
          break;
        }
      }
    }

    if (hostedRequired && !publicCheck.valid) {
      setValidationError(
        latestPublicConfig?.error ||
          publicCheck.error ||
          'Ce QR code nécessite un domaine public actif pour être scanné à distance.'
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

    const useE2ee = source.e2eeEnabled !== false;

    if (dynamicSecurity.enabled) {
      setIsGenerating(true);
      try {
        const autoTitle = deriveAutoTitle(source, config, experience);
        const e2eeKey = useE2ee ? ensureE2eeKey() : '';
        const bundle = useE2ee
          ? await buildE2eeTransmissionBundle({
              src: source,
              exp: experience,
              title: autoTitle,
              payload: effectivePayload,
              key: e2eeKey,
            })
          : null;

        const rec = await saveDynamicQr({
          slug: dynamicSecurity.slug,
          active: dynamicSecurity.active,
          pinCode: dynamicSecurity.pinCode,
          expiresAt: dynamicSecurity.expiresAt,
          maxScans: dynamicSecurity.maxScans,
          intent: selectedIntent,
          payload: bundle ? 'e2ee://protected' : effectivePayload,
          title: bundle ? bundle.redactedTitle : autoTitle,
          sourceSnapshot: bundle ? bundle.redactedSource : { ...source },
          experience: bundle ? bundle.redactedExperience : { ...experience },
          config,
          isEncrypted: Boolean(bundle),
          encryptedMeta: bundle?.encryptedMeta,
        });
        const baseReaderUrl = buildPublicReaderUrl(validPublicOrigin, `/d/${rec.slug}`);
        const finalPayload = bundle
          ? appendKeyFragmentToUrl(baseReaderUrl, e2eeKey)
          : baseReaderUrl;
        const snapshotSource: QrSourceState = bundle
          ? { ...source, e2eeEnabled: true, e2eeKeyFragment: e2eeKey }
          : { ...source };
        const serverExpiry = rec.expiresAt || computeDefaultServerExpiry(new Date().toISOString());

        setDynamicSecurity((prev) => ({
          ...prev,
          slug: rec.slug,
          hasPin: rec.hasPin,
        }));
        setGeneratedSnapshot({
          source: snapshotSource,
          payload: finalPayload,
          experience: { ...experience },
          dynamicSlug: rec.slug,
          dynamicHasPin: rec.hasPin,
          serverExpiresAt: serverExpiry,
        });
        recordGeneratedQrInLibrary({
          snapshotSource,
          snapshotExperience: experience,
          finalPayload,
          dynamicSlug: rec.slug,
          accessibilityKind: 'dynamic',
          serverExpiresAt: serverExpiry,
        });
        void refreshDynamicRecords();
        void refreshUnreadNotifications();
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
        const autoTitle = deriveAutoTitle(source, config, experience);
        const e2eeKey = useE2ee ? ensureE2eeKey() : '';
        const bundle = useE2ee
          ? await buildE2eeTransmissionBundle({
              src: source,
              exp: experience,
              title: autoTitle,
              payload: effectivePayload,
              key: e2eeKey,
            })
          : null;

        const hosted = await registerHostedMediaCollection({
          source: bundle ? bundle.redactedSource : { ...source },
          experience: bundle ? bundle.redactedExperience : { ...experience },
          config,
          title: bundle ? bundle.redactedTitle : autoTitle,
          isEncrypted: Boolean(bundle),
          encryptedMeta: bundle?.encryptedMeta,
        });
        const baseReaderUrl = buildPublicReaderUrl(validPublicOrigin, hosted.pageUrl);
        const finalPayload = bundle
          ? appendKeyFragmentToUrl(baseReaderUrl, e2eeKey)
          : baseReaderUrl;
        const snapshotSource: QrSourceState = bundle
          ? { ...source, e2eeEnabled: true, e2eeKeyFragment: e2eeKey }
          : { ...source };
        const serverExpiry =
          hosted.serverExpiresAt || computeDefaultServerExpiry(new Date().toISOString());

        setGeneratedSnapshot({
          source: snapshotSource,
          payload: finalPayload,
          experience: { ...experience },
          dynamicSlug: null,
          dynamicHasPin: false,
          serverExpiresAt: serverExpiry,
        });
        recordGeneratedQrInLibrary({
          snapshotSource,
          snapshotExperience: experience,
          finalPayload,
          dynamicSlug: null,
          accessibilityKind: 'hosted',
          serverCollectionId: hosted.id,
          serverExpiresAt: serverExpiry,
        });
        void refreshUnreadNotifications();
      } catch (err) {
        setValidationError(
          err instanceof Error
            ? err.message
            : 'Erreur lors de la préparation du lecteur SparkQR.'
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
    recordGeneratedQrInLibrary({
      snapshotSource: source,
      snapshotExperience: experience,
      finalPayload: effectivePayload,
      dynamicSlug: null,
      accessibilityKind: 'permanent',
      serverExpiresAt: null,
    });
  };

  const isGenerated = generatedSnapshot !== null;
  const activePayload = generatedSnapshot?.payload ?? '';
  const activeSource = generatedSnapshot?.source ?? source;
  const activeExperience = generatedSnapshot?.experience ?? experience;

  const makeFileSlug = () =>
    (config.titleText || 'sparkqr')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sparkqr';

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
    const isHosted = /\/m\/[a-zA-Z0-9_-]+/.test(generatedSnapshot.payload);
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    const newItem: SavedQrItem = {
      id: newId,
      workspaceId: workspace?.id,
      name: deriveAutoTitle(generatedSnapshot.source, config, generatedSnapshot.experience),
      category: projectCategory,
      createdAt: nowIso,
      source: { ...generatedSnapshot.source },
      config: { ...config },
      experience: { ...generatedSnapshot.experience },
      dynamicSlug: generatedSnapshot.dynamicSlug,
      payload: generatedSnapshot.payload,
      accessibilityKind: generatedSnapshot.dynamicSlug
        ? 'dynamic'
        : isHosted
        ? 'hosted'
        : 'permanent',
      serverExpiresAt: generatedSnapshot.dynamicSlug
        ? dynamicSecurity.expiresAt || null
        : isHosted
        ? computeDefaultServerExpiry(nowIso)
        : null,
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
    setActiveSavedItemId(normalized.id);
    setLoadedForEditId(normalized.id);

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
        'Ce projet utilise un ancien lien privé. Cliquez sur « Générer mon QR code » pour le mettre à jour.'
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
      accessibilityKind: item.accessibilityKind === 'dynamic' ? 'permanent' : item.accessibilityKind,
    };
    setSavedItems((prev) => [copy, ...prev]);
  };

  const handleImportQrItem = (item: SavedQrItem) => {
    const normalized = normalizeSavedItem({
      ...item,
      workspaceId: workspace?.id,
    });
    setSavedItems((prev) => [normalized, ...prev]);
  };

  const handleDeleteSavedItem = async (id: string) => {
    const targetItem = savedItems.find((item) => item.id === id);
    if (!targetItem) return;

    const serverTarget = resolveUnsharedServerDeletionTarget(targetItem, savedItems);
    if (serverTarget) {
      try {
        await deleteStorageItem(serverTarget.kind, serverTarget.id);
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        if (status !== 404) {
          throw err;
        }
      }
    }

    setSavedItems((prev) => prev.filter((item) => item.id !== id));
    if (activeSavedItemId === id) setActiveSavedItemId(null);
    if (loadedForEditId === id) setLoadedForEditId(null);

    if (serverTarget) {
      await Promise.all([
        refreshDynamicRecords(),
        refreshHostedMedia(),
        refreshUnreadNotifications(),
      ]);
      setDashboardNonce((n) => n + 1);
    }
  };

  const handleDeleteDynamicRecord = async (slug: string) => {
    try {
      await deleteStorageItem('dynamic', slug);
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status !== 404) {
        throw err;
      }
    }
    setSavedItems((prev) => prev.filter((item) => item.dynamicSlug !== slug));
    await Promise.all([
      refreshDynamicRecords(),
      refreshHostedMedia(),
      refreshUnreadNotifications(),
    ]);
    setDashboardNonce((n) => n + 1);
  };

  const handleResetStyle = () => {
    setConfig(DEFAULT_CONFIG);
  };

  const handleJumpToTypography = () => {
    setCustomizeTab('typography');
    customizeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Auto-detect shared SparkQR link (?sq=... or #sq=...) and import/display cleanly
  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceReady) return;
    const rawHref = window.location.href;
    if (!/[?#]sq=/.test(rawHref)) return;
    const parsed = parseReceivedQrInput(rawHref);
    if (!parsed.ok) return;
    const imported: SavedQrItem = normalizeSavedItem({
      ...parsed.item,
      id: `shared-${Date.now()}`,
      workspaceId: workspace?.id,
      category: parsed.item.category || 'Personnel',
      createdAt: new Date().toISOString(),
    });
    setSavedItems((prev) => {
      if (prev.some((it) => it.payload === imported.payload && it.name === imported.name)) {
        return prev;
      }
      return [imported, ...prev];
    });
    setView('gallery');
    window.history.replaceState({}, '', window.location.pathname);
  }, [workspaceReady, workspace?.id]);

  if (viewerRoute) {
    return (
      <StandaloneReaderPage
        routeKind={viewerRoute.kind}
        routeId={viewerRoute.id}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col spark-canvas-bg text-[#111214] pb-safe">
      {/* Top Bar: strict 3-zone contract */}
      <header className="sticky top-0 z-30 pt-safe bg-white/90 backdrop-blur-md border-b border-[#E2E6F0]">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-14 sm:h-15 flex items-center justify-between gap-2 sm:gap-6">
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              setView('studio');
            }}
            className="group inline-flex items-center gap-2 font-display text-base sm:text-xl font-bold tracking-tight text-[#111214] whitespace-nowrap shrink-0"
          >
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#2563EB] via-[#4F46E5] to-[#EC4899] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(79,70,229,0.3)] animate-spark-emblem">
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-4.5 sm:h-4.5" aria-hidden="true">
                <rect x="3" y="3" width="6.5" height="6.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <rect x="14.5" y="3" width="6.5" height="6.5" rx="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <rect x="3" y="14.5" width="6.5" height="6.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <path d="M17.5 13 L18.6 16.4 L22 17.5 L18.6 18.6 L17.5 22 L16.4 18.6 L13 17.5 L16.4 16.4 Z" fill="currentColor" />
              </svg>
            </span>
            <span className="bg-gradient-to-r from-[#111214] via-[#4F46E5] to-[#2563EB] bg-clip-text text-transparent">
              SparkQR
            </span>
          </a>

          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-5 text-sm font-medium text-[#5C5E66]"
          >
            <button
              type="button"
              onClick={() => setView('studio')}
              className={`py-1.5 hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'studio'
                  ? 'text-[#111214] font-semibold underline underline-offset-8 decoration-2 decoration-[#2563EB]'
                  : ''
              }`}
            >
              Créer
            </button>

            <button
              type="button"
              data-testid="nav-dashboard-btn"
              onClick={() => {
                void refreshDynamicRecords();
                void refreshHostedMedia();
                setView('gallery');
              }}
              className={`py-1.5 hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                view === 'gallery'
                  ? 'text-[#111214] font-semibold underline underline-offset-8 decoration-2 decoration-[#2563EB]'
                  : ''
              }`}
            >
              Mes QR codes ({savedItems.length})
            </button>

            <button
              type="button"
              data-testid="nav-conservation-btn"
              onClick={() => {
                void refreshDynamicRecords();
                void refreshHostedMedia();
                setView('conservation');
              }}
              className={`py-1.5 hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                view === 'conservation'
                  ? 'text-[#111214] font-semibold underline underline-offset-8 decoration-2 decoration-[#2563EB]'
                  : ''
              }`}
            >
              <span>
                Conservation
                {unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount})` : ''}
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-workspace-btn"
              onClick={() => setWorkspaceModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#4F46E5] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[130px] truncate">
                {workspace?.name || 'Mon espace'}
              </span>
            </button>

            <button
              type="button"
              disabled={!isGenerated}
              onClick={() => isGenerated && setPreviewModalOpen(true)}
              className="hidden lg:inline-block py-1.5 hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Aperçu scan
            </button>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setWorkspaceModalOpen(true)}
              className="md:hidden inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#4F46E5] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Espace</span>
            </button>
            <button
              type="button"
              disabled={!isGenerated}
              onClick={() => isGenerated && setExportModalOpen(true)}
              aria-label="Exporter Pro"
              className="px-3 sm:px-4 py-1.5 sm:py-2 min-h-[36px] sm:min-h-[38px] text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] shadow-[0_4px_12px_rgba(37,99,235,0.22)] rounded-xl transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <span className="hidden sm:inline">Exporter Pro</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="Navigation mobile"
          className="md:hidden border-t border-[#EEF2F7] px-3 py-1 flex items-center justify-around gap-1 text-xs font-medium text-[#5C5E66]"
        >
          <button
            type="button"
            onClick={() => setView('studio')}
            className={`px-2.5 py-2 min-h-[38px] rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              view === 'studio'
                ? 'text-[#111214] font-semibold bg-[#F1F5FF]'
                : 'hover:text-[#111214]'
            }`}
          >
            Créer
          </button>

          <button
            type="button"
            onClick={() => {
              void refreshDynamicRecords();
              void refreshHostedMedia();
              setView('gallery');
            }}
            className={`px-2.5 py-2 min-h-[38px] rounded-lg transition-colors whitespace-nowrap cursor-pointer tabular-nums ${
              view === 'gallery'
                ? 'text-[#111214] font-semibold bg-[#F1F5FF]'
                : 'hover:text-[#111214]'
            }`}
          >
            Mes QR ({savedItems.length})
          </button>

          <button
            type="button"
            onClick={() => {
              void refreshDynamicRecords();
              void refreshHostedMedia();
              setView('conservation');
            }}
            className={`px-2.5 py-2 min-h-[38px] rounded-lg transition-colors whitespace-nowrap cursor-pointer tabular-nums ${
              view === 'conservation'
                ? 'text-[#111214] font-semibold bg-[#F1F5FF]'
                : 'hover:text-[#111214]'
            }`}
          >
            Conservation{unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount})` : ''}
          </button>
        </nav>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-6">
        <h1 className="sr-only">
          SparkQR — Studio créatif de codes QR graphiques et dynamiques
        </h1>

        {paymentBanner && (
          <div
            role={paymentBanner.type === 'error' ? 'alert' : 'status'}
            data-testid="payment-status-banner"
            className={`mb-5 rounded-2xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 ${
              paymentBanner.type === 'success'
                ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                : 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {paymentBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#059669]" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" aria-hidden="true" />
              )}
              <span>{paymentBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setPaymentBanner(null)}
              className="text-xs font-semibold underline shrink-0 cursor-pointer"
            >
              Fermer
            </button>
          </div>
        )}

        {view === 'studio' ? (
          <div className="space-y-5 animate-spark-enter">
            {/* Concise Welcome Banner (<= 9 words, clean typographic focus) */}
            <section
              data-testid="welcome-intro-card"
              aria-label="Bienvenue sur SparkQR"
              className="rounded-2xl border border-[#DCE6FF] bg-gradient-to-r from-[#EFF5FF] via-[#F5F3FF] to-[#FFF2F7] px-4 py-3.5 sm:px-6 sm:py-4 shadow-[0_6px_22px_rgba(79,70,229,0.06)] flex items-center justify-between gap-3"
            >
              <p className="font-display text-base sm:text-xl font-bold tracking-tight text-[#111214] leading-snug">
                Transformez vos idées en codes QR.
              </p>

              <button
                type="button"
                onClick={() => setWorkspaceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold text-[#4F46E5] bg-white/90 hover:bg-white border border-[#C7D2FE] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{workspace?.name || 'Mon espace'}</span>
              </button>
            </section>

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
                  onMediaUploaded={() => {
                    void refreshHostedMedia();
                    void refreshUnreadNotifications();
                  }}
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
                  e2eeEnabled={source.e2eeEnabled !== false}
                  e2eeKey={source.e2eeKeyFragment}
                  onEnsureE2eeKey={ensureE2eeKey}
                  onMediaUploaded={() => {
                    void refreshHostedMedia();
                    void refreshUnreadNotifications();
                  }}
                />
              </div>

              <PreviewStage
                isGenerated={isGenerated}
                canGenerate={selectedIntent !== null}
                isGenerating={isGenerating}
                payload={activePayload}
                config={config}
                source={activeSource}
                experience={activeExperience}
                report={scannabilityReport}
                svgRef={qrSvgRef}
                onGenerate={() => void handleGenerate()}
                onDownloadPng={handleDownloadPng}
                onDownloadSvg={handleDownloadSvg}
                onCopyPng={handleCopyPng}
                onOpenTargetPreview={() => isGenerated && setPreviewModalOpen(true)}
                onSaveToHistory={handleSaveToHistory}
                onClearGenerated={() => setGeneratedSnapshot(null)}
                onToggleLaser={handleToggleLaser}
                justSaved={justSaved}
                dynamicSlug={generatedSnapshot?.dynamicSlug ?? null}
                dynamicHasPin={generatedSnapshot?.dynamicHasPin ?? false}
                onOpenProExport={() => isGenerated && setExportModalOpen(true)}
              />
            </div>
          </div>
        ) : view === 'gallery' ? (
          <HistoryGallery
            items={savedItems}
            dynamicRecords={dynamicRecords}
            hostedMedia={hostedMedia}
            workspace={workspace}
            onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
            onLoadItem={handleLoadSavedItem}
            onDuplicateItem={handleDuplicateItem}
            onDeleteItem={handleDeleteSavedItem}
            onDeleteDynamic={handleDeleteDynamicRecord}
            onRefreshDynamic={refreshDynamicRecords}
            onDeleteMedia={handleDeleteHostedMedia}
            onRefreshMedia={refreshHostedMedia}
            onOpenExtend={(target) => setExtendTarget(target)}
            onImportQrItem={handleImportQrItem}
            onOpenTargetPreview={(item) => setGalleryPreviewItem(item)}
            onBackToStudio={() => setView('studio')}
          />
        ) : (
          <StorageConservationView
            key={dashboardNonce}
            onOpenExtend={(target) => setExtendTarget(target)}
            onOpenPrivacy={() => setPrivacyModalOpen(true)}
            onResourceDeleted={() => {
              void Promise.all([
                refreshDynamicRecords(),
                refreshHostedMedia(),
                refreshUnreadNotifications(),
              ]);
            }}
            onNotificationsChanged={setUnreadNotificationsCount}
          />
        )}
      </main>

      <footer className="border-t border-[#E2E6F0] bg-white/75 backdrop-blur-xs">
        <div className="max-w-[1400px] mx-auto px-3.5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5C5E66]">
          <span>SparkQR Studio · Confidentialité &amp; conservation maîtrisée</span>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              data-testid="footer-privacy-btn"
              onClick={() => setPrivacyModalOpen(true)}
              className="font-medium hover:text-[#111214] hover:underline cursor-pointer"
            >
              Confidentialité &amp; Conditions
            </button>
          </div>
        </div>
      </footer>

      <TargetPreviewModal
        open={(previewModalOpen && isGenerated) || galleryPreviewItem !== null}
        onClose={() => {
          setPreviewModalOpen(false);
          setGalleryPreviewItem(null);
        }}
        source={galleryPreviewItem ? galleryPreviewItem.source : activeSource}
        config={galleryPreviewItem ? galleryPreviewItem.config : config}
        payload={galleryPreviewItem ? galleryPreviewItem.payload : activePayload}
        experience={
          galleryPreviewItem
            ? galleryPreviewItem.experience ?? DEFAULT_EXPERIENCE
            : activeExperience
        }
        dynamicSlug={
          galleryPreviewItem
            ? galleryPreviewItem.dynamicSlug ?? null
            : generatedSnapshot?.dynamicSlug ?? null
        }
        dynamicHasPin={
          galleryPreviewItem ? false : generatedSnapshot?.dynamicHasPin ?? false
        }
      />

      <ExportModal
        open={exportModalOpen && isGenerated}
        onClose={() => setExportModalOpen(false)}
        title={config.titleText || 'SparkQR'}
        onExport={handleProExport}
      />

      <WorkspaceModal
        open={workspaceModalOpen}
        onClose={() => setWorkspaceModalOpen(false)}
        workspace={workspace}
        onRename={handleRenameWorkspace}
        onCreateNew={handleCreateNewWorkspace}
        onJoinByCode={handleJoinWorkspace}
      />

      <RetentionExtendModal
        open={extendTarget !== null}
        onClose={() => setExtendTarget(null)}
        targetKind={extendTarget?.targetKind || 'workspace'}
        targetId={extendTarget?.targetId || workspace?.id || ''}
        targetTitle={extendTarget?.targetTitle || 'Mon espace SparkQR'}
        currentExpiresAt={extendTarget?.currentExpiresAt}
        onExtended={(res) => {
          setPaymentBanner({
            type: res.updatedCount > 0 ? 'success' : 'error',
            text:
              res.updatedCount > 0
                ? `Conservation prolongée de ${formatPaidDurationLabel(res.months)} (${res.updatedCount} ressource${res.updatedCount > 1 ? 's' : ''} mise${res.updatedCount > 1 ? 's' : ''} à jour).`
                : 'Aucune ressource hébergée ou dynamique active à prolonger pour cette sélection.',
          });
          void Promise.all([
            refreshDynamicRecords(),
            refreshHostedMedia(),
            refreshUnreadNotifications(),
          ]);
          setDashboardNonce((n) => n + 1);
        }}
      />

      <PrivacyTermsModal
        open={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
      />

      <AdminPricingModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onPricingSaved={() => setDashboardNonce((n) => n + 1)}
      />
    </div>
  );
}
