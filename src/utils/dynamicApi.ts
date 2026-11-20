import type {
  DynamicQrRecord,
  PostScanExperience,
  QrConfig,
  QrIntent,
  QrSourceState,
  SavedQrItem,
} from '../types/qr';

export async function listDynamicQrs(): Promise<DynamicQrRecord[]> {
  const res = await fetch('/api/dynamic');
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
}): Promise<DynamicQrRecord> {
  const res = await fetch('/api/dynamic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: input.slug || undefined,
      active: input.active,
      pinCode: input.pinCode || undefined,
      expiresAt: input.expiresAt || null,
      maxScans: input.maxScans || null,
      destination: {
        intent: input.intent,
        payload: input.payload,
        title: input.title,
        sourceSnapshot: input.sourceSnapshot,
        experience: input.experience,
        cardTheme: {
          cardBackgroundColor: input.config.cardBackgroundColor,
          foregroundColor: input.config.foregroundColor,
          eyeColor: input.config.eyeColor,
          fontId: input.config.fontId,
        },
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
    headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch('/api/projects');
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
      headers: { 'Content-Type': 'application/json' },
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
}): Promise<{ id: string; pageUrl: string; publicUrl?: string }> {
  const res = await fetch('/api/media-collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Impossible d’héberger le lecteur multimédia.');
  }
  return data as { id: string; pageUrl: string; publicUrl?: string };
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
    throw new Error('Impossible de lire la configuration PUBLIC_APP_URL.');
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
    throw new Error(data.error || 'Adresse PUBLIC_APP_URL invalide.');
  }
  return data as PublicAppConfigResponse;
}

export async function fetchStorageStatus(): Promise<import('../types/qr').StorageStatusInfo> {
  const res = await fetch('/api/storage/status');
  if (!res.ok) {
    throw new Error('Impossible de vérifier le statut du stockage Dosya.dev.');
  }
  return (await res.json()) as import('../types/qr').StorageStatusInfo;
}

export async function listHostedMedia(): Promise<import('../types/qr').UploadedMediaInfo[]> {
  const res = await fetch('/api/media');
  if (!res.ok) {
    throw new Error('Impossible de charger la médiathèque serveur.');
  }
  const data = (await res.json()) as {
    items?: import('../types/qr').UploadedMediaInfo[];
  };
  return Array.isArray(data.items) ? data.items : [];
}

export async function deleteHostedMedia(
  id: string
): Promise<{ deleted: boolean; removedFromS3?: boolean }> {
  const res = await fetch(`/api/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Impossible de supprimer ce média.');
  }
  return data as { deleted: boolean; removedFromS3?: boolean };
}

