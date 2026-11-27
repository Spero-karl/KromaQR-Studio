import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Crown, Monitor, Moon, Sun, UserCheck } from 'lucide-react';
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
type UiThemeMode = 'system' | 'light' | 'dark';
const UI_THEME_STORAGE_KEY = 'sparkqr_ui_theme';
const BLACK_FRIDAY_STORAGE_KEY = 'sparkqr_black_friday_mode';

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
    documentName: '',
    audioName: '',
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
    vcardFirstName: '',
    vcardLastName: '',
    vcardOrg: '',
    vcardTitle: '',
    vcardPhone: '',
    vcardEmail: '',
    vcardWebsite: '',
    vcardAddress: '',
    eventTitle: '',
    eventStart: '',
    eventEnd: '',
    eventLocation: '',
    eventDescription: '',
    emailAddress: '',
    emailSubject: '',
    emailBody: '',
    phoneNumber: '',
    smsPhone: '',
    smsMessage: '',
    whatsappPhone: '',
    whatsappMessage: '',
    tiktokHandle: '',
    instagramHandle: '',
    facebookHandle: '',
    telegramHandle: '',
    twitterHandle: '',
    geoLat: '',
    geoLng: '',
    geoLabel: '',
    paymentName: '',
    paymentIban: '',
    paymentBic: '',
    paymentAmount: '',
    paymentReference: '',
    paymentUrl: '',
    imagePageUrl: '',
    videoPageUrl: '',
    documentPageUrl: '',
    audioPageUrl: '',
    imageName: '',
    videoName: '',
    documentName: '',
    audioName: '',
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

const LEGACY_THEME_ID_MAP: Record<string, string> = {
  'gta-vice-city': 'vice-city-neon',
  'gta-los-santos': 'los-santos-prestige',
  'enterprise-executive': 'meridien-ardoise',
  'enterprise-banque-privee': 'foret-laiton',
  'enterprise-corporate-cobalt': 'atelier-alpin',
  'enterprise-summit': 'verre-glassmorph',
};

function normalizeSavedItem(item: SavedQrItem): SavedQrItem {
  const rawConfig = item.config
    ? {
        ...item.config,
        themeId:
          item.config.themeId && LEGACY_THEME_ID_MAP[item.config.themeId]
            ? LEGACY_THEME_ID_MAP[item.config.themeId]
            : item.config.themeId,
      }
    : DEFAULT_CONFIG;
  return {
    ...item,
    category: item.category || 'Personnel',
    config: normalizeConfigWithDefaults(rawConfig, DEFAULT_CONFIG),
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
  if (src.type === 'image') return 'Code QR · Image';
  if (src.type === 'video') return 'Code QR · Vidéo';
  if (src.type === 'document') return 'Code QR · Document';
  if (src.type === 'audio') return 'Code QR · Audio';
  switch (src.textMode) {
    case 'wifi':
      return 'Code QR · Wi-Fi';
    case 'vcard':
      return 'Code QR · Contact vCard';
    case 'event':
      return 'Code QR · Événement';
    case 'email':
      return 'Code QR · E-mail';
    case 'phone':
      return 'Code QR · Téléphone';
    case 'sms':
      return 'Code QR · SMS';
    case 'whatsapp':
      return 'Code QR · WhatsApp';
    case 'tiktok':
      return 'Code QR · TikTok';
    case 'instagram':
      return 'Code QR · Instagram';
    case 'facebook':
      return 'Code QR · Facebook';
    case 'telegram':
      return 'Code QR · Telegram';
    case 'twitter':
      return 'Code QR · Twitter (X)';
    case 'geo':
      return 'Code QR · Position GPS';
    case 'payment':
      return 'Code QR · Paiement';
    case 'url':
      return 'Code QR · Lien web';
    default:
      return 'Code QR · Message';
  }
}

function intentToSourcePatch(intent: QrIntent, current: QrSourceState): QrSourceState {
  if (
    intent === 'image' ||
    intent === 'video' ||
    intent === 'document' ||
    intent === 'audio'
  ) {
    return { ...current, type: intent };
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
  const [uiThemeMode, setUiThemeMode] = useState<UiThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      const saved = localStorage.getItem(UI_THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'system';
  });

  const [blackFridayMode, setBlackFridayMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(BLACK_FRIDAY_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const isDark =
        blackFridayMode ||
        uiThemeMode === 'dark' ||
        (uiThemeMode === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('theme-black-friday', blackFridayMode);
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute(
          'content',
          blackFridayMode ? '#070709' : isDark ? '#0B0F1A' : '#F6F7FB'
        );
      }
    };
    applyTheme();
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, uiThemeMode);
      localStorage.setItem(BLACK_FRIDAY_STORAGE_KEY, blackFridayMode ? 'true' : 'false');
    } catch {
      // Ignore storage errors
    }
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [uiThemeMode, blackFridayMode]);

  const cycleUiThemeMode = () => {
    setUiThemeMode((prev) =>
      prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system'
    );
  };

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
    accessibilityKind?: 'permanent' | 'hosted' | 'dynamic';
    serverCollectionId?: string | null;
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
        setJustSaved(false);
        setGeneratedSnapshot({
          source: snapshotSource,
          payload: finalPayload,
          experience: { ...experience },
          dynamicSlug: rec.slug,
          dynamicHasPin: rec.hasPin,
          accessibilityKind: 'dynamic',
          serverCollectionId: null,
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

        setJustSaved(false);
        setGeneratedSnapshot({
          source: snapshotSource,
          payload: finalPayload,
          experience: { ...experience },
          dynamicSlug: null,
          dynamicHasPin: false,
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

    setJustSaved(false);
    setGeneratedSnapshot({
      source: { ...source },
      payload: effectivePayload,
      experience: { ...experience },
      dynamicSlug: null,
      dynamicHasPin: false,
      accessibilityKind: 'permanent',
      serverCollectionId: null,
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

  const buildExportMetadata = () => ({
    name: config.titleText || 'Code QR SparkQR',
    payload: activePayload,
    source: activeSource,
    config,
    experience: activeExperience,
  });

  const handleDownloadPng = async () => {
    if (!isGenerated || !qrSvgRef.current) return;
    await downloadQrPng(qrSvgRef.current, `${makeFileSlug()}.png`, {
      sparkQrMetadata: buildExportMetadata(),
    });
  };

  const handleDownloadSvg = async () => {
    if (!isGenerated || !qrSvgRef.current) return;
    await downloadQrSvg(qrSvgRef.current, `${makeFileSlug()}.svg`, {
      sparkQrMetadata: buildExportMetadata(),
    });
  };

  const handleCopyPng = async () => {
    if (!isGenerated || !qrSvgRef.current) return;
    await copyQrPngToClipboard(qrSvgRef.current, buildExportMetadata());
  };

  const handleProExport = async (options: ExportOptions) => {
    if (!isGenerated || !qrSvgRef.current) return;
    await executeProExport(
      qrSvgRef.current,
      makeFileSlug(),
      options,
      config.titleText,
      buildExportMetadata()
    );
  };

  const handleSaveToHistory = () => {
    if (!generatedSnapshot) return;
    const isHosted = /\/m\/[a-zA-Z0-9_-]+/.test(generatedSnapshot.payload);
    const nowIso = new Date().toISOString();
    const accessibilityKind =
      generatedSnapshot.accessibilityKind ||
      (generatedSnapshot.dynamicSlug ? 'dynamic' : isHosted ? 'hosted' : 'permanent');
    const serverExpiresAt =
      generatedSnapshot.serverExpiresAt !== undefined
        ? generatedSnapshot.serverExpiresAt
        : generatedSnapshot.dynamicSlug
        ? dynamicSecurity.expiresAt || null
        : isHosted
        ? computeDefaultServerExpiry(nowIso)
        : null;

    recordGeneratedQrInLibrary({
      snapshotSource: generatedSnapshot.source,
      snapshotExperience: generatedSnapshot.experience,
      finalPayload: generatedSnapshot.payload,
      dynamicSlug: generatedSnapshot.dynamicSlug,
      accessibilityKind,
      serverCollectionId: generatedSnapshot.serverCollectionId ?? null,
      serverExpiresAt,
    });
    setJustSaved(true);
  };

  const handleLoadSavedItem = (item: SavedQrItem) => {
    const normalized = normalizeSavedItem(item);
    const nextIntent: QrIntent =
      normalized.source.type === 'image' ||
      normalized.source.type === 'video' ||
      normalized.source.type === 'document' ||
      normalized.source.type === 'audio'
        ? normalized.source.type
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
    const cleanBase = item.name?.trim() || deriveAutoTitle(item.source, item.config, item.experience ?? DEFAULT_EXPERIENCE);
    const copy: SavedQrItem = {
      ...normalizeSavedItem(item),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${cleanBase} (copie)`,
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
    <div
      className={`min-h-[100dvh] flex flex-col spark-canvas-bg text-[#111214] dark:text-[#F1F5F9] pb-safe ${
        blackFridayMode ? 'theme-black-friday' : ''
      }`}
    >
      {/* Top Bar: strict 3-zone contract */}
      <header className="sticky top-0 z-30 pt-safe bg-white/92 dark:bg-[#0F1522]/92 backdrop-blur-md border-b border-[#E2E6F0] dark:border-[#242C3D]">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-14 sm:h-15 flex items-center justify-between gap-2 sm:gap-6">
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              setView('studio');
            }}
            className="group inline-flex items-center gap-2.5 font-display text-base sm:text-xl font-bold tracking-tight text-[#111214] dark:text-[#F8FAFC] whitespace-nowrap shrink-0"
          >
            <span
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center animate-spark-emblem ${
                blackFridayMode
                  ? 'bg-gradient-to-br from-[#FACC15] to-[#D97706] text-[#090806]'
                  : 'bg-[#2563EB] text-white'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-4.5 sm:h-4.5" aria-hidden="true">
                <rect x="3" y="3" width="6.5" height="6.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <rect x="14.5" y="3" width="6.5" height="6.5" rx="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <rect x="3" y="14.5" width="6.5" height="6.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <path d="M17.5 13 L18.6 16.4 L22 17.5 L18.6 18.6 L17.5 22 L16.4 18.6 L13 17.5 L16.4 16.4 Z" fill="currentColor" />
              </svg>
            </span>
            <span>SparkQR</span>
          </a>

          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#5C5E66] dark:text-[#94A3B8]"
          >
            <button
              type="button"
              onClick={() => setView('studio')}
              className={`py-1.5 hover:text-[#111214] dark:hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'studio'
                  ? 'bf-nav-active text-[#111214] dark:text-[#F8FAFC] font-semibold underline underline-offset-8 decoration-2 decoration-[#2563EB]'
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
              className={`py-1.5 hover:text-[#111214] dark:hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                view === 'gallery'
                  ? 'bf-nav-active text-[#111214] dark:text-[#F8FAFC] font-semibold underline underline-offset-8 decoration-2 decoration-[#2563EB]'
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
              className={`py-1.5 hover:text-[#111214] dark:hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                view === 'conservation'
                  ? 'bf-nav-active text-[#111214] dark:text-[#F8FAFC] font-semibold underline underline-offset-8 decoration-2 decoration-[#2563EB]'
                  : ''
              }`}
            >
              <span>
                Conservation
                {unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount})` : ''}
              </span>
            </button>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              data-testid="nav-workspace-btn"
              onClick={() => setWorkspaceModalOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl border border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] hover:bg-[#F5F7FA] dark:hover:bg-[#1E293B] text-[#111214] dark:text-[#E2E8F0] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0" aria-hidden="true" />
              <span className="max-w-[130px] truncate">
                {workspace?.name || 'Mon espace'}
              </span>
            </button>
            <button
              type="button"
              data-testid="black-friday-toggle"
              aria-pressed={blackFridayMode}
              onClick={() => setBlackFridayMode((prev) => !prev)}
              aria-label={
                blackFridayMode
                  ? 'Désactiver le thème Black Friday'
                  : 'Activer le thème Black Friday'
              }
              title={
                blackFridayMode
                  ? 'Thème Black Friday activé'
                  : 'Activer l’ambiance Black Friday'
              }
              className={`inline-flex items-center justify-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                blackFridayMode
                  ? 'border-[#FACC15]/70 bg-gradient-to-r from-[#1A150B] to-[#0E0C08] text-[#FACC15] shadow-[0_0_16px_rgba(250,204,21,0.25)]'
                  : 'border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#B45309] dark:hover:text-[#FACC15] hover:border-[#F59E0B]/50'
              }`}
            >
              <Crown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">Black Friday</span>
            </button>
            <button
              type="button"
              data-testid="ui-theme-toggle"
              onClick={cycleUiThemeMode}
              aria-label={
                uiThemeMode === 'system'
                  ? 'Thème : Automatique (système)'
                  : uiThemeMode === 'dark'
                  ? 'Thème : Sombre'
                  : 'Thème : Clair'
              }
              title={
                uiThemeMode === 'system'
                  ? 'Thème automatique (système)'
                  : uiThemeMode === 'dark'
                  ? 'Thème sombre'
                  : 'Thème clair'
              }
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F8FAFC] hover:bg-[#F5F7FA] dark:hover:bg-[#1E293B] transition-colors shrink-0 cursor-pointer"
            >
              {uiThemeMode === 'dark' ? (
                <Moon className="w-4 h-4" aria-hidden="true" />
              ) : uiThemeMode === 'light' ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Monitor className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setWorkspaceModalOpen(true)}
              className="md:hidden inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-xl border border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] text-[#111214] dark:text-[#E2E8F0] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0" aria-hidden="true" />
              <span>Espace</span>
            </button>
            <button
              type="button"
              disabled={!isGenerated}
              onClick={() => isGenerated && setExportModalOpen(true)}
              aria-label="Exporter Pro"
              className="lux-cta px-3 sm:px-4 py-1.5 sm:py-2 min-h-[36px] sm:min-h-[38px] text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] dark:bg-[#3B82F6] dark:hover:bg-[#2563EB] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Exporter Pro</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="Navigation mobile"
          className="md:hidden border-t border-[#E2E6F0] dark:border-[#242C3D] px-3 py-1 flex items-center justify-around gap-1 text-xs font-medium text-[#5C5E66] dark:text-[#94A3B8]"
        >
          <button
            type="button"
            onClick={() => setView('studio')}
            className={`px-2.5 py-2 min-h-[38px] rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              view === 'studio'
                ? 'text-[#111214] dark:text-[#F8FAFC] font-semibold bg-[#F1F5FF] dark:bg-[#1E293B]'
                : 'hover:text-[#111214] dark:hover:text-[#F8FAFC]'
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
                ? 'text-[#111214] dark:text-[#F8FAFC] font-semibold bg-[#F1F5FF] dark:bg-[#1E293B]'
                : 'hover:text-[#111214] dark:hover:text-[#F8FAFC]'
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
                ? 'text-[#111214] dark:text-[#F8FAFC] font-semibold bg-[#F1F5FF] dark:bg-[#1E293B]'
                : 'hover:text-[#111214] dark:hover:text-[#F8FAFC]'
            }`}
          >
            Conservation{unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount})` : ''}
          </button>
        </nav>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-3.5 sm:px-6 pt-10 sm:pt-12 pb-8 sm:pb-10">
        <h1 className="sr-only">
          SparkQR — Studio créatif de codes QR graphiques et dynamiques
        </h1>

        {paymentBanner && (
          <div
            role={paymentBanner.type === 'error' ? 'alert' : 'status'}
            data-testid="payment-status-banner"
            className={`mb-5 rounded-2xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 ${
              paymentBanner.type === 'success'
                ? 'border-[#A7F3D0] dark:border-[#065F46] bg-[#ECFDF5] dark:bg-[#052E16]/60 text-[#065F46] dark:text-[#6EE7B7]'
                : 'border-[#FECACA] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#450A0A]/60 text-[#B91C1C] dark:text-[#FCA5A5]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {paymentBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#059669] dark:text-[#34D399]" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626] dark:text-[#F87171]" aria-hidden="true" />
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
            <section
              data-testid="welcome-intro-card"
              aria-label="Bienvenue sur SparkQR"
              className={`lux-surface lux-rise-in rounded-2xl border border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] px-4 py-3.5 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-2 ${
                blackFridayMode ? 'bf-welcome-card' : ''
              }`}
            >
              <p className="font-display text-base sm:text-xl font-bold tracking-tight text-[#111214] dark:text-[#F8FAFC] leading-snug">
                {blackFridayMode
                  ? 'Édition Black Friday · Créez des codes QR d’exception.'
                  : 'Transformez vos idées en codes QR.'}
              </p>
              <p className="hidden sm:flex items-center gap-2 text-xs font-medium text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                {blackFridayMode ? (
                  <>
                    <span className="bf-accent-text font-semibold">Ambiance Or &amp; Obsidienne</span>
                    <span aria-hidden="true">·</span>
                    <span>1. Contenu</span>
                    <span aria-hidden="true">·</span>
                    <span>2. Modèle &amp; Style</span>
                    <span aria-hidden="true">·</span>
                    <span>3. Aperçu &amp; Export</span>
                  </>
                ) : (
                  <>
                    <span>1. Contenu</span>
                    <span aria-hidden="true">·</span>
                    <span>2. Modèle &amp; Style</span>
                    <span aria-hidden="true">·</span>
                    <span>3. Aperçu &amp; Export</span>
                  </>
                )}
              </p>
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

      <footer className="border-t border-[#E2E6F0] dark:border-[#242C3D] bg-white/85 dark:bg-[#0F1522]/85 backdrop-blur-xs">
        <div className="max-w-[1400px] mx-auto px-3.5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5C5E66] dark:text-[#94A3B8]">
          <span>SparkQR Studio · Confidentialité &amp; conservation maîtrisée</span>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              data-testid="footer-privacy-btn"
              onClick={() => setPrivacyModalOpen(true)}
              className="font-medium hover:text-[#111214] dark:hover:text-[#F8FAFC] hover:underline cursor-pointer"
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
          galleryPreviewItem
            ? Boolean(
                galleryPreviewItem.dynamicSlug &&
                  dynamicRecords.find((d) => d.slug === galleryPreviewItem.dynamicSlug)?.hasPin
              )
            : generatedSnapshot?.dynamicHasPin ?? false
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
