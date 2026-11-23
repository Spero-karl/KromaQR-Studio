import type {
  DynamicQrRecord,
  PostScanExperience,
  QrConfig,
  QrIntent,
  QrSourceState,
  SavedQrItem,
  StorageDashboardResponse,
  StorageStatusInfo,
  UploadedMediaInfo,
  WorkspaceInfo,
} from '../types/qr';
import type { PricingConfig } from './retentionPricing';

const ACTIVE_WORKSPACE_KEY = 'sparkqr_active_workspace_id_v1';

export function getStoredWorkspaceId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function setStoredWorkspaceId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function workspaceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const wsId = getStoredWorkspaceId();
  return wsId ? { ...extra, 'X-Workspace-Id': wsId } : { ...extra };
}

export async function initOrFetchWorkspace(): Promise<{
  workspace: WorkspaceInfo;
  isNew: boolean;
}> {
  const res = await fetch('/api/workspace', {
    headers: workspaceHeaders(),
  });
  const data = (await res.json()) as { workspace?: WorkspaceInfo; isNew?: boolean; error?: string };
  if (!res.ok || !data.workspace) {
    throw new Error(data.error || 'Impossible d’ouvrir votre espace personnel.');
  }
  setStoredWorkspaceId(data.workspace.id);
  return { workspace: data.workspace, isNew: Boolean(data.isNew) };
}

export async function createNewWorkspace(name?: string): Promise<WorkspaceInfo> {
  const res = await fetch('/api/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = (await res.json()) as { workspace?: WorkspaceInfo; error?: string };
  if (!res.ok || !data.workspace) {
    throw new Error(data.error || 'Impossible de créer un nouvel espace.');
  }
  setStoredWorkspaceId(data.workspace.id);
  return data.workspace;
}

export async function renameWorkspace(name: string): Promise<WorkspaceInfo> {
  const res = await fetch('/api/workspace', {
    method: 'PATCH',
    headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  });
  const data = (await res.json()) as { workspace?: WorkspaceInfo; error?: string };
  if (!res.ok || !data.workspace) {
    throw new Error(data.error || 'Impossible de renommer votre espace.');
  }
  return data.workspace;
}

export async function joinWorkspaceByCode(accessCode: string): Promise<WorkspaceInfo> {
  const res = await fetch('/api/workspace/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode }),
  });
  const data = (await res.json()) as { workspace?: WorkspaceInfo; error?: string };
  if (!res.ok || !data.workspace) {
    throw new Error(data.error || 'Code espace introuvable.');
  }
  setStoredWorkspaceId(data.workspace.id);
  return data.workspace;
}

export async function listDynamicQrs(): Promise<DynamicQrRecord[]> {
  const res = await fetch('/api/dynamic', { headers: workspaceHeaders() });
  if (!res.ok) throw new Error('Impossible de charger les QR dynamiques.');
  const data = (await res.json()) as { items?: DynamicQrRecord[] };
  return data.items ?? [];
}

export async function saveDynamicQr(input: {
  slug?: string | null;
  active: boolean;
  pinCode?: string;
  expiresAt?: string;
  maxScans?: number | null;
  intent: QrIntent;
  payload: string;
  title: string;
  sourceSnapshot: QrSourceState;
  experience: PostScanExperience;
  config: QrConfig;
  isEncrypted?: boolean;
  encryptedMeta?: unknown;
}): Promise<DynamicQrRecord> {
  const res = await fetch('/api/dynamic', {
    method: 'POST',
    headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      slug: input.slug || undefined,
      active: input.active,
      pinCode: input.pinCode || undefined,
      expiresAt: input.expiresAt || null,
      maxScans: input.maxScans || null,
      isEncrypted: Boolean(input.isEncrypted),
      destination: {
        intent: input.intent,
        payload: input.payload,
        title: input.title,
        sourceSnapshot: input.sourceSnapshot,
        experience: input.experience,
        encryptedMeta: input.encryptedMeta,
        cardTheme: {
          cardBackgroundColor: input.config.cardBackgroundColor,
          foregroundColor: input.config.foregroundColor,
          eyeColor: input.config.eyeColor,
          fontId: input.config.fontId,
        },
        config: input.config,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Échec de l’enregistrement du QR dynamique.');
  }
  return data as DynamicQrRecord;
}

export async function updateDynamicQr(
  slug: string,
  patch: {
    active?: boolean;
    pinCode?: string | null;
    clearPin?: boolean;
    expiresAt?: string | null;
    maxScans?: number | null;
    destination?: Partial<DynamicQrRecord['destination']>;
  }
): Promise<DynamicQrRecord> {
  const res = await fetch(`/api/dynamic/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Échec de la mise à jour du QR dynamique.');
  }
  return data as DynamicQrRecord;
}

export async function deleteDynamicQr(slug: string): Promise<void> {
  const res = await fetch(`/api/dynamic/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: workspaceHeaders(),
  });
  if (!res.ok) {
    throw new Error('Impossible de supprimer le QR dynamique.');
  }
}

export async function verifyDynamicPinOnServer(
  slug: string,
  pin: string
): Promise<{
  valid: boolean;
  error?: string;
  destination?: DynamicQrRecord['destination'];
  stats?: DynamicQrRecord['stats'];
}> {
  const res = await fetch(`/api/dynamic/${encodeURIComponent(slug)}/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  return (await res.json()) as {
    valid: boolean;
    error?: string;
    destination?: DynamicQrRecord['destination'];
    stats?: DynamicQrRecord['stats'];
  };
}

export async function fetchServerProjects(): Promise<SavedQrItem[]> {
  try {
    const res = await fetch('/api/projects', { headers: workspaceHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SavedQrItem[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export async function syncServerProjects(items: SavedQrItem[]): Promise<void> {
  try {
    await fetch('/api/projects', {
      method: 'PUT',
      headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ items }),
    });
  } catch {
    // Non-blocking; localStorage remains active fallback
  }
}

export async function registerHostedMediaCollection(input: {
  source: QrSourceState;
  experience: PostScanExperience;
  config: QrConfig;
  title: string;
  isEncrypted?: boolean;
  encryptedMeta?: unknown;
}): Promise<{ id: string; pageUrl: string; publicUrl?: string; serverExpiresAt?: string }> {
  const res = await fetch('/api/media-collection', {
    method: 'POST',
    headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Impossible de préparer la page de lecture SparkQR.');
  }
  return data as { id: string; pageUrl: string; publicUrl?: string; serverExpiresAt?: string };
}

export interface PublicAppConfigResponse {
  configuredUrl: string;
  valid: boolean;
  source: 'env' | 'saved' | 'detected' | 'none';
  error?: string;
  detectedOrigin: string;
  diagnostics: {
    isLocal: boolean;
    isAiStudioPreview: boolean;
    isNonHttps: boolean;
    hostname: string;
    summary: string;
  };
}

export async function fetchPublicAppConfig(): Promise<PublicAppConfigResponse> {
  const res = await fetch('/api/public-config');
  if (!res.ok) {
    throw new Error('Impossible de lire la configuration de publication.');
  }
  return (await res.json()) as PublicAppConfigResponse;
}

export async function savePublicAppConfig(
  publicAppUrl: string
): Promise<PublicAppConfigResponse> {
  const res = await fetch('/api/public-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicAppUrl }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Adresse publique invalide.');
  }
  return data as PublicAppConfigResponse;
}

export async function fetchStorageStatus(): Promise<StorageStatusInfo> {
  const res = await fetch('/api/storage/status');
  if (!res.ok) {
    throw new Error('Statut d’hébergement indisponible.');
  }
  return (await res.json()) as StorageStatusInfo;
}

export async function listHostedMedia(): Promise<UploadedMediaInfo[]> {
  const res = await fetch('/api/media', { headers: workspaceHeaders() });
  if (!res.ok) {
    throw new Error('Impossible de charger vos médias.');
  }
  const data = (await res.json()) as {
    items?: UploadedMediaInfo[];
  };
  return Array.isArray(data.items) ? data.items : [];
}

export async function deleteHostedMedia(
  id: string
): Promise<{ deleted: boolean }> {
  const res = await fetch(`/api/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: workspaceHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Impossible de supprimer ce média.');
  }
  return data as { deleted: boolean };
}

export async function fetchStorageDashboard(): Promise<StorageDashboardResponse> {
  const res = await fetch('/api/storage/dashboard', { headers: workspaceHeaders() });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Impossible de charger le tableau de conservation.');
  }
  return data as StorageDashboardResponse;
}

export async function deleteStorageItem(
  kind: 'media' | 'collection' | 'dynamic',
  id: string
): Promise<{ deleted: boolean; freedBytes: number; s3ObjectsDeleted: number }> {
  const res = await fetch(
    `/api/storage/item/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: workspaceHeaders(),
    }
  );
  let data: { error?: string; deleted?: boolean; freedBytes?: number; s3ObjectsDeleted?: number } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Impossible de supprimer cette ressource.') as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return data as { deleted: boolean; freedBytes: number; s3ObjectsDeleted: number };
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await fetch('/api/notifications/read', {
    method: 'POST',
    headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ids }),
  });
}

export async function requestEmailAlertsCode(email: string): Promise<{ sent: boolean; email: string }> {
  const res = await fetch('/api/notifications/email/request', {
    method: 'POST',
    headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Impossible d’envoyer le code de vérification.');
  }
  return data as { sent: boolean; email: string };
}

export async function verifyEmailAlertsCode(code: string): Promise<{ verified: boolean; email: string }> {
  const res = await fetch('/api/notifications/email/verify', {
    method: 'POST',
    headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Code de vérification invalide.');
  }
  return data as { verified: boolean; email: string };
}

export async function removeEmailAlerts(): Promise<void> {
  await fetch('/api/notifications/email', {
    method: 'DELETE',
    headers: workspaceHeaders(),
  });
}

export interface PricingApiResponse {
  pricing: PricingConfig;
}

export async function fetchPricingInfo(): Promise<PricingApiResponse> {
  const res = await fetch('/api/pricing');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Tarifs indisponibles.');
  }
  return data as PricingApiResponse;
}

export async function extendRetentionPlan(input: {
  months: number;
  targetKind: 'media' | 'collection' | 'dynamic' | 'workspace';
  targetId: string;
}): Promise<{
  ok: boolean;
  months: number;
  updatedCount: number;
  newExpiresAt: string;
  priceCents?: number;
  currency?: 'EUR';
}> {
  const res = await fetch('/api/retention/extend', {
    method: 'POST',
    headers: workspaceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Prolongation impossible.');
  }
  return data as {
    ok: boolean;
    months: number;
    updatedCount: number;
    newExpiresAt: string;
    priceCents?: number;
    currency?: 'EUR';
  };
}

export interface AdminStatusResponse {
  configuredViaEnv?: boolean;
  needsInitialClaim: boolean;
  dosya?: StorageStatusInfo;
  emailTransport?: 'resend' | 'smtp' | 'none';
  cronSecretConfigured?: boolean;
}

export async function fetchAdminStatus(): Promise<AdminStatusResponse> {
  const res = await fetch('/api/admin/status');
  if (!res.ok) throw new Error('Statut admin indisponible.');
  return (await res.json()) as AdminStatusResponse;
}

export async function claimAdminPasscode(passcode: string): Promise<string> {
  const res = await fetch('/api/admin/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(data.error || 'Impossible d’initialiser le code admin.');
  }
  return data.token as string;
}

export async function loginAdminPasscode(passcode: string): Promise<string> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(data.error || 'Code administrateur invalide.');
  }
  return data.token as string;
}

export async function saveAdminPricing(
  token: string,
  monthsCents: Record<number, number>
): Promise<PricingConfig> {
  const res = await fetch('/api/admin/pricing', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ monthsCents }),
  });
  const data = await res.json();
  if (!res.ok || !data.pricing) {
    throw new Error(data.error || 'Impossible d’enregistrer les tarifs.');
  }
  return data.pricing as PricingConfig;
}


