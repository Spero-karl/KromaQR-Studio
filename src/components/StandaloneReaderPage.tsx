import React, { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { DEFAULT_CONFIG, DEFAULT_EXPERIENCE, DEFAULT_SOURCE } from '../data/presets';
import type { PostScanExperience, QrConfig, QrSourceState } from '../types/qr';
import {
  decryptJsonWithKey,
  extractKeyFromHash,
  isValidE2eeEnvelope,
} from '../utils/e2eeCrypto';
import { normalizeConfigWithDefaults } from '../utils/historyReducer';
import { SparkMediaReader } from './SparkMediaReader';

interface StandaloneReaderPageProps {
  routeKind: 'media' | 'dynamic';
  routeId: string;
}

interface ReaderApiPayload {
  payload: string;
  source: QrSourceState;
  experience: PostScanExperience;
  config: QrConfig;
  dynamicSlug?: string | null;
  dynamicHasPin?: boolean;
  isEncrypted?: boolean;
  e2eeKey?: string | null;
  serverExpiresAt?: string | null;
}

interface DecryptedEnvelopePayload {
  source?: Partial<QrSourceState>;
  experience?: Partial<PostScanExperience>;
  title?: string;
  payload?: string;
}

export const StandaloneReaderPage: React.FC<StandaloneReaderPageProps> = ({
  routeKind,
  routeId,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingKeyError, setMissingKeyError] = useState(false);
  const [data, setData] = useState<ReaderApiPayload | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const onHashChange = () => setRefreshNonce((n) => n + 1);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMissingKeyError(false);

    const endpoint =
      routeKind === 'media'
        ? `/api/reader/media/${encodeURIComponent(routeId)}`
        : `/api/reader/dynamic/${encodeURIComponent(routeId)}`;

    void (async () => {
      try {
        const res = await fetch(endpoint);
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error || 'Contenu SparkQR indisponible.');
        }

        const rawConfig = body.config
          ? normalizeConfigWithDefaults(body.config, DEFAULT_CONFIG)
          : body.cardTheme
          ? normalizeConfigWithDefaults(body.cardTheme, DEFAULT_CONFIG)
          : DEFAULT_CONFIG;

        let rawSource: QrSourceState = body.source
          ? { ...DEFAULT_SOURCE, ...body.source }
          : { ...DEFAULT_SOURCE };

        let rawExperience: PostScanExperience = body.experience
          ? { ...DEFAULT_EXPERIENCE, ...body.experience }
          : { ...DEFAULT_EXPERIENCE };

        let decryptedPayload: string | undefined;

        // Map single document/audio media record into galleryItems for seamless playback/preview
        if (
          (body.mediaType === 'document' || body.mediaType === 'audio') &&
          rawExperience.galleryItems.every((g) => !g.url.includes(`/api/media/${routeId}/file`))
        ) {
          rawExperience = {
            ...rawExperience,
            template: 'media-gallery',
            galleryItems: [
              {
                id: `media-${routeId}`,
                type: body.mediaType,
                url: `/api/media/${routeId}/file`,
                caption: rawExperience.headline || (body.mediaType === 'document' ? 'Document' : 'Audio'),
                isEncrypted: Boolean(body.isEncrypted),
              },
            ],
          };
        }

        const isEncrypted = Boolean(body.isEncrypted);
        const fragmentKey = extractKeyFromHash(window.location.hash);

        if (!body.locked && isEncrypted) {
          if (!fragmentKey) {
            if (!cancelled) {
              setMissingKeyError(true);
              setData(null);
            }
            return;
          }
          if (isValidE2eeEnvelope(body.encryptedMeta)) {
            const decrypted = await decryptJsonWithKey<DecryptedEnvelopePayload>(
              body.encryptedMeta,
              fragmentKey
            );
            if (decrypted.source) {
              rawSource = { ...rawSource, ...decrypted.source };
            }
            if (decrypted.experience) {
              rawExperience = { ...rawExperience, ...decrypted.experience };
            }
            if (typeof decrypted.payload === 'string' && decrypted.payload) {
              decryptedPayload = decrypted.payload;
            }
          }
        }

        if (cancelled) return;
        setData({
          payload: decryptedPayload || body.payload || window.location.href,
          source: rawSource,
          experience: rawExperience,
          config: rawConfig,
          dynamicSlug: body.dynamicSlug ?? (routeKind === 'dynamic' ? routeId : null),
          dynamicHasPin: Boolean(body.locked),
          isEncrypted,
          e2eeKey: fragmentKey,
          serverExpiresAt: body.serverExpiresAt || null,
        });
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Erreur de chargement du lecteur.';
        setError(
          isMissingOrCryptoError(err)
            ? 'Impossible de déchiffrer ce contenu. Vérifiez que la clé secrète (#k=...) du lien n’a pas été tronquée.'
            : msg
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeKind, routeId, refreshNonce]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] pb-safe pt-safe spark-canvas-bg text-[#111214] flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="w-7 h-7 animate-spin text-[#2563EB]" aria-hidden="true" />
        <p className="text-sm font-medium text-[#5C5E66]">
          Ouverture du lecteur SparkQR...
        </p>
      </div>
    );
  }

  if (missingKeyError) {
    return (
      <div className="min-h-[100dvh] pb-safe pt-safe spark-canvas-bg text-[#111214] flex items-center justify-center p-6">
        <div
          data-testid="e2ee-missing-key"
          className="max-w-md w-full rounded-3xl bg-white border border-[#DCE6FF] p-7 shadow-[0_18px_48px_rgba(37,99,235,0.08)] space-y-4"
        >
          <div className="flex items-center gap-2.5 text-[#1D4ED8]">
            <KeyRound className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-base font-bold text-[#111214]">
              Clé de déchiffrement manquante
            </h1>
          </div>
          <p className="text-sm text-[#4B4D54] leading-relaxed">
            Ce contenu est chiffré de bout en bout (AES-256-GCM) avant son envoi. La clé privée doit figurer dans le fragment de l’adresse (<code className="font-mono text-xs bg-[#F1F5F9] px-1.5 py-0.5 rounded">#k=...</code>).
          </p>
          <p className="text-xs text-[#6E7078] leading-relaxed">
            SparkQR ne reçoit et ne stocke jamais cette clé sur le serveur : scannez le QR code original ou utilisez le lien complet reçu de son auteur.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] pb-safe pt-safe spark-canvas-bg text-[#111214] flex items-center justify-center p-6">
        <div
          data-testid="standalone-error-card"
          className="max-w-md w-full rounded-3xl bg-white border border-[#E2E6F0] p-7 shadow-[0_18px_48px_rgba(37,99,235,0.08)] space-y-4"
        >
          <div className="flex items-center gap-2.5 text-[#B91C1C]">
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-base font-bold text-[#111214]">
              Contenu inaccessible
            </h1>
          </div>
          <p className="text-sm text-[#5C5E66] leading-relaxed">
            {error || 'Ce code QR a expiré ou n’existe plus.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <SparkMediaReader
      source={data.source}
      config={data.config}
      payload={data.payload}
      experience={data.experience}
      dynamicSlug={data.dynamicSlug}
      dynamicHasPin={data.dynamicHasPin}
      isEncrypted={data.isEncrypted}
      e2eeKey={data.e2eeKey}
      serverExpiresAt={data.serverExpiresAt}
      standalone
      onPinUnlocked={() => setRefreshNonce((n) => n + 1)}
    />
  );
};

function isMissingOrCryptoError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'OperationError') return true;
  if (err instanceof Error && /déchiffr|AES-GCM|256 bits/i.test(err.message)) return true;
  return false;
}
