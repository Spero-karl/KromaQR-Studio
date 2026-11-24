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

  const [bootProgress, setBootProgress] = useState(18);

  useEffect(() => {
    if (!loading) {
      setBootProgress(100);
      return;
    }
    setBootProgress(18);
    const id = window.setInterval(() => {
      setBootProgress((p) => (p >= 90 ? 90 : p + 12));
    }, 140);
    return () => window.clearInterval(id);
  }, [loading]);

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
          ? { ...DEFAULT_SOURCE, ...body.source, imageName: '', videoName: '' }
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
                caption: '',
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
              rawSource = {
                ...rawSource,
                ...decrypted.source,
                imageName: '',
                videoName: '',
              };
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
        });
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Erreur de chargement du lecteur.';
        setError(
          isMissingOrCryptoError(err)
            ? 'Impossible d’ouvrir ce contenu protégé. Vérifiez que le lien d’origine n’a pas été tronqué.'
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
      <div className="min-h-[100dvh] pb-safe pt-safe spark-canvas-bg text-[#0F172A] dark:text-[#F1F5F9] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-[#141926] border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
              <span>Chargement</span>
            </span>
            <span className="font-mono tabular-nums text-[#2563EB] dark:text-[#60A5FA]">
              {bootProgress}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#2563EB] dark:bg-[#60A5FA] transition-all duration-150"
              style={{ width: `${bootProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (missingKeyError) {
    return (
      <div className="min-h-[100dvh] pb-safe pt-safe spark-canvas-bg text-[#0F172A] dark:text-[#F1F5F9] flex items-center justify-center p-4 sm:p-6">
        <div
          data-testid="e2ee-missing-key"
          className="max-w-md w-full rounded-2xl bg-white dark:bg-[#141926] border border-slate-200 dark:border-slate-800 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] space-y-3"
        >
          <div className="flex items-center gap-2.5 text-[#2563EB] dark:text-[#60A5FA]">
            <KeyRound className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F1F5F9]">
              Clé d’accès manquante
            </h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Ce contenu est protégé. Utilisez le lien complet d’origine ou scannez directement le QR code.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] pb-safe pt-safe spark-canvas-bg text-[#0F172A] dark:text-[#F1F5F9] flex items-center justify-center p-4 sm:p-6">
        <div
          data-testid="standalone-error-card"
          className="max-w-md w-full rounded-2xl bg-white dark:bg-[#141926] border border-slate-200 dark:border-slate-800 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] space-y-3"
        >
          <div className="flex items-center gap-2.5 text-[#DC2626] dark:text-[#F87171]">
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F1F5F9]">
              Contenu inaccessible
            </h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {error || 'Ce code QR n’est plus disponible.'}
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
