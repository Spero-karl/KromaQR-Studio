import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { DEFAULT_CONFIG, DEFAULT_EXPERIENCE, DEFAULT_SOURCE } from '../data/presets';
import type { PostScanExperience, QrConfig, QrSourceState } from '../types/qr';
import { normalizeConfigWithDefaults } from '../utils/historyReducer';
import { KromaMediaReader } from './KromaMediaReader';

interface StandaloneReaderPageProps {
  routeKind: 'media' | 'dynamic';
  routeId: string;
  onNavigateStudio: () => void;
}

interface ReaderApiPayload {
  payload: string;
  source: QrSourceState;
  experience: PostScanExperience;
  config: QrConfig;
  dynamicSlug?: string | null;
  dynamicHasPin?: boolean;
}

export const StandaloneReaderPage: React.FC<StandaloneReaderPageProps> = ({
  routeKind,
  routeId,
  onNavigateStudio,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReaderApiPayload | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const endpoint =
      routeKind === 'media'
        ? `/api/reader/media/${encodeURIComponent(routeId)}`
        : `/api/reader/dynamic/${encodeURIComponent(routeId)}`;

    fetch(endpoint)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error || 'Contenu KromaQR indisponible.');
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        const rawConfig = body.config
          ? normalizeConfigWithDefaults(body.config, DEFAULT_CONFIG)
          : body.cardTheme
          ? normalizeConfigWithDefaults(body.cardTheme, DEFAULT_CONFIG)
          : DEFAULT_CONFIG;

        const rawSource: QrSourceState = body.source
          ? { ...DEFAULT_SOURCE, ...body.source }
          : DEFAULT_SOURCE;

        const rawExperience: PostScanExperience = body.experience
          ? { ...DEFAULT_EXPERIENCE, ...body.experience }
          : DEFAULT_EXPERIENCE;

        setData({
          payload: body.payload || window.location.href,
          source: rawSource,
          experience: rawExperience,
          config: rawConfig,
          dynamicSlug: body.dynamicSlug ?? (routeKind === 'dynamic' ? routeId : null),
          dynamicHasPin: Boolean(body.locked),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erreur de chargement du lecteur.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routeKind, routeId, refreshNonce]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090B10] text-white flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="w-7 h-7 animate-spin text-[#60A5FA]" aria-hidden="true" />
        <p className="text-sm font-medium text-[#CBD5E1]">
          Ouverture du lecteur KromaQR Studio...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#090B10] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#111521] border border-white/15 p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h1 className="text-base font-bold text-white">Contenu inaccessible</h1>
          </div>
          <p className="text-sm text-[#94A3B8]">
            {error || 'Ce code QR a expiré ou n’existe plus.'}
          </p>
          <button
            type="button"
            onClick={onNavigateStudio}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Retour à KromaQR Studio</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <KromaMediaReader
      source={data.source}
      config={data.config}
      payload={data.payload}
      experience={data.experience}
      dynamicSlug={data.dynamicSlug}
      dynamicHasPin={data.dynamicHasPin}
      standalone
      onPinUnlocked={() => setRefreshNonce((n) => n + 1)}
      onBackToStudio={onNavigateStudio}
    />
  );
};
