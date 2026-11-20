import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  CopyPlus,
  Database,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { PROJECT_CATEGORIES } from '../data/presets';
import type {
  DynamicQrRecord,
  ProjectCategory,
  SavedQrItem,
  StorageStatusInfo,
  UploadedMediaInfo,
} from '../types/qr';
import { updateDynamicQr } from '../utils/dynamicApi';
import { resolveMediaDownloadUrl } from '../utils/mediaReaderLogic';
import { relativeLuminance } from '../utils/qrLogic';
import { QrCanvasRenderer } from './QrCanvasRenderer';

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 Ko';
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(2)} Mo`;
}

interface HistoryGalleryProps {
  items: SavedQrItem[];
  dynamicRecords: DynamicQrRecord[];
  storageStatus?: StorageStatusInfo | null;
  hostedMedia?: UploadedMediaInfo[];
  onLoadItem: (item: SavedQrItem) => void;
  onDuplicateItem: (item: SavedQrItem) => void;
  onDeleteItem: (id: string) => void;
  onRefreshDynamic: () => Promise<void>;
  onDeleteMedia?: (id: string) => Promise<void>;
  onRefreshMedia?: () => Promise<void>;
  onBackToStudio: () => void;
}

export const HistoryGallery: React.FC<HistoryGalleryProps> = ({
  items,
  dynamicRecords,
  storageStatus = null,
  hostedMedia = [],
  onLoadItem,
  onDuplicateItem,
  onDeleteItem,
  onRefreshDynamic,
  onDeleteMedia,
  onRefreshMedia,
  onBackToStudio,
}) => {
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
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

  const renderStorageStatusBanner = () => {
    if (!storageStatus) return null;
    return (
      <div
        data-testid="dosya-storage-status-banner"
        className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs ${
          storageStatus.configured
            ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#14532D]'
            : 'bg-[#FFFBEB] border-[#FDE68A] text-[#78350F]'
        }`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <Database className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2.5 font-semibold">
              <span>Stockage objet Dosya.dev S3</span>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                  storageStatus.configured ? 'text-[#15803D]' : 'text-[#B45309]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full ${
                    storageStatus.configured ? 'bg-[#15803D]' : 'bg-[#B45309]'
                  }`}
                />
                <span>
                  {storageStatus.configured
                    ? 'Configuré'
                    : 'Identifiants S3 serveur à définir'}
                </span>
              </span>
            </div>
            <p className="text-[11px] font-mono opacity-85 truncate">
              {storageStatus.endpoint} · {storageStatus.region} · Bucket : {storageStatus.bucket}
            </p>
            {!storageStatus.configured && storageStatus.missingVars.length > 0 && (
              <p className="text-[11px] opacity-90">
                Variables serveur manquantes : {storageStatus.missingVars.join(', ')}
              </p>
            )}
          </div>
        </div>
        {onRefreshMedia && (
          <button
            type="button"
            onClick={() => void handleRefreshMedia()}
            disabled={refreshingMedia}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-white/90 hover:bg-white border border-black/10 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshingMedia ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Actualiser</span>
          </button>
        )}
      </div>
    );
  };

  if (items.length === 0 && dynamicRecords.length === 0 && hostedMedia.length === 0) {
    return (
      <section className="space-y-4 max-w-2xl mx-auto">
        {renderStorageStatusBanner()}
        <div className="bg-white border border-[#E2E0D8] rounded-2xl p-12 text-center">
          <h2 className="text-xl font-semibold text-[#111214]">
            Votre tableau de bord est vide
          </h2>
          <p className="text-sm text-[#5C5E66] mt-2 max-w-md mx-auto">
            Créez et personnalisez un code QR dans le studio, puis enregistrez-le via « Galerie » pour suivre vos projets et statistiques.
          </p>
          <button
            type="button"
            onClick={onBackToStudio}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Créer un code QR</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="gallery-heading" className="space-y-6">
      {/* Dashboard Header + Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="gallery-heading" className="text-2xl font-bold text-[#111214]">
            Tableau de bord des créations
          </h2>
          <p className="text-xs sm:text-sm text-[#5C5E66] mt-1 tabular-nums">
            <span>{items.length} projets</span>
            <span aria-hidden="true"> · </span>
            <span>{activeDynamicCount} QR dynamiques actifs</span>
            <span aria-hidden="true"> · </span>
            <span>{totalScans} scans enregistrés</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToStudio}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#111214] hover:bg-[#27292E] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Nouveau code QR</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-[#E2E0D8] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            className="w-4 h-4 text-[#6E7078] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Rechercher un projet"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par titre ou destination..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl focus:outline-none focus:border-[#1D4ED8]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
              categoryFilter === 'all'
                ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#4B4D54]'
            }`}
          >
            Tous
          </button>
          {PROJECT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                categoryFilter === cat
                  ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                  : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#4B4D54]'
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
          className="px-2.5 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
        >
          <option value="recent">Plus récents</option>
          <option value="scans">Plus scannés</option>
          <option value="name">Nom A→Z</option>
        </select>
      </div>

      {/* Saved Projects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredItems.map((item) => {
          const sourceLabel =
            item.source.type === 'image'
              ? 'Image'
              : item.source.type === 'video'
              ? 'Vidéo'
              : 'Texte';
          const formattedDate = new Date(item.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
          });
          const isDark = relativeLuminance(item.config.cardBackgroundColor || '#FFFFFF') < 0.22;
          const dyn = item.dynamicSlug ? dynamicMap.get(item.dynamicSlug) : undefined;

          return (
            <article
              key={item.id}
              data-testid={`dashboard-card-${item.id}`}
              className="bg-white border border-[#E2E0D8] rounded-2xl p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-[#111214] truncate">
                    {item.name || item.config.titleText || 'Code QR sans titre'}
                  </h3>
                  {dyn && (
                    <span
                      className={`text-[10px] font-semibold shrink-0 ${
                        dyn.active ? 'text-[#15803D]' : 'text-[#B91C1C]'
                      }`}
                    >
                      {dyn.active ? 'Actif' : 'Suspendu'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6E7078] mt-1 tabular-nums">
                  <span>{item.category || 'Personnel'}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{sourceLabel}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{formattedDate}</span>
                  {dyn && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="font-semibold text-[#111214]">
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
                    : 'studio-grid-mat border-[#E6E4DC]'
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

              {dyn && (
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#5C5E66]">
                  <span className="truncate" title={dyn.shortUrl || `/d/${dyn.slug}`}>
                    {dyn.shortUrl && dyn.shortUrl.startsWith('https://')
                      ? dyn.shortUrl
                      : `/d/${dyn.slug}`}
                  </span>
                  <span className="inline-flex items-center gap-1 shrink-0">
                    {dyn.hasPin && <Lock className="w-3 h-3 text-[#1D4ED8]" aria-hidden="true" />}
                    <a
                      href={`/d/${dyn.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1D4ED8] hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>Ouvrir</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onLoadItem(item)}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Éditer</span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>

                {dyn && (
                  <button
                    type="button"
                    data-testid={`manage-dynamic-${dyn.slug}`}
                    onClick={() => openManageDrawer(dyn)}
                    title="Gérer le QR dynamique et ses statistiques"
                    className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-[#111214] bg-[#FAF9F5] border border-[#DBD8CE] hover:bg-[#F2F1EB] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  className="p-2 text-[#5C5E66] hover:text-[#111214] hover:bg-[#F2F1EB] rounded-xl transition-colors cursor-pointer"
                >
                  <CopyPlus className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  aria-label={`Supprimer ${item.name || 'ce code QR'}`}
                  onClick={() => onDeleteItem(item.id)}
                  className="p-2 text-[#6E7078] hover:text-[#B91C1C] hover:bg-[#FEF2F2] rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Standalone Dynamic QR section if any dynamic links were created directly without saving to gallery */}
      {dynamicRecords.length > 0 && (
        <div className="bg-white border border-[#E2E0D8] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[#111214]">
              Liens dynamiques enregistrés sur le serveur ({dynamicRecords.length})
            </h3>
          </div>
          <div className="divide-y divide-[#EFECE4]">
            {dynamicRecords.map((rec) => (
              <div
                key={rec.slug}
                className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-[#111214]">
                    {rec.destination.title || rec.slug}
                  </span>
                  <span className="ml-2 font-mono text-[#6E7078]">/d/{rec.slug}</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-[#5C5E66]">
                    {rec.stats.totalScans} scan{rec.stats.totalScans > 1 ? 's' : ''}
                    {rec.maxScans ? ` / ${rec.maxScans}` : ''}
                  </span>
                  <span className={rec.active ? 'text-[#15803D] font-semibold' : 'text-[#B91C1C] font-semibold'}>
                    {rec.active ? 'Actif' : 'Désactivé'}
                  </span>
                  {rec.hasPin && <Lock className="w-3.5 h-3.5 text-[#1D4ED8]" />}
                  <button
                    type="button"
                    onClick={() => openManageDrawer(rec)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-[#111214] bg-[#FAF9F5] border border-[#DBD8CE] rounded-lg cursor-pointer"
                  >
                    Gérer &amp; Stats
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dosya.dev S3 Hosted Media Library & Status */}
      <div
        data-testid="hosted-media-library"
        className="bg-white border border-[#E2E0D8] rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[#111214]">
              Médias hébergés · Dosya.dev S3 ({hostedMedia.length})
            </h3>
          </div>
        </div>

        {renderStorageStatusBanner()}

        {mediaActionError && (
          <p role="alert" className="text-xs font-medium text-[#B91C1C]">
            {mediaActionError}
          </p>
        )}

        {hostedMedia.length === 0 ? (
          <p className="text-xs text-[#6E7078]">
            Aucun média téléversé sur Dosya.dev S3 pour le moment. Importez une image ou une vidéo depuis le studio pour l’héberger et l’associer à un code QR.
          </p>
        ) : (
          <div className="divide-y divide-[#EFECE4]">
            {hostedMedia.map((media) => {
              const downloadHref = media.downloadUrl || resolveMediaDownloadUrl(media.fileUrl || media.url);
              const isDeleting = deletingMediaId === media.id;
              return (
                <div
                  key={media.id}
                  data-testid={`hosted-media-row-${media.id}`}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F3F2EE] border border-[#E2E0D8] flex items-center justify-center shrink-0">
                      {media.type === 'image' ? (
                        <img
                          src={media.fileUrl || media.url}
                          alt={media.originalName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Film className="w-5 h-5 text-[#1D4ED8]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        {media.type === 'image' ? (
                          <ImageIcon className="w-3.5 h-3.5 text-[#5C5E66] shrink-0" aria-hidden="true" />
                        ) : (
                          <Film className="w-3.5 h-3.5 text-[#5C5E66] shrink-0" aria-hidden="true" />
                        )}
                        <span className="text-xs font-semibold text-[#111214] truncate">
                          {media.originalName}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6E7078] tabular-nums truncate">
                        {media.mimeType} · {formatBytes(media.size)}
                        {media.storage?.key ? ` · S3: ${media.storage.key}` : ''}
                      </p>
                      {media.associations && media.associations.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {media.associations.map((assoc) => (
                            <a
                              key={`${assoc.kind}-${assoc.id}`}
                              href={assoc.kind === 'dynamic' ? `/d/${assoc.id}` : `/m/${assoc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-[#EFF4FF] text-[#1D4ED8] rounded-md hover:underline"
                            >
                              <span>
                                {assoc.kind === 'dynamic' ? `/d/${assoc.id}` : `/m/${assoc.id}`}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={media.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111214] bg-[#FAF9F5] border border-[#DBD8CE] hover:bg-[#F2F1EB] rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Lire</span>
                    </a>
                    <a
                      href={downloadHref}
                      download={media.originalName}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#1D4ED8] bg-[#EFF4FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] rounded-lg transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Télécharger</span>
                    </a>
                    {onDeleteMedia && (
                      <button
                        type="button"
                        disabled={isDeleting}
                        aria-label={`Supprimer ${media.originalName}`}
                        onClick={() => void handleDeleteMedia(media.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          onClick={() => setManagedSlug(null)}
        >
          <div
            data-testid="dynamic-manage-modal"
            className="w-full max-w-lg bg-white border border-[#E2E0D8] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#111214]">
                  Gestion QR dynamique · /d/{managedRecord.slug}
                </h3>
                <p className="text-xs text-[#6E7078] tabular-nums">
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
                className="p-1.5 text-[#5C5E66] hover:text-[#111214] rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveDynamicChanges(e)} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                  Titre de la page
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                  Destination (URL ou texte, modifiable sans réimprimer le QR)
                </label>
                <input
                  type="text"
                  data-testid="manage-dest-payload-input"
                  value={editDestPayload}
                  onChange={(e) => setEditDestPayload(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                    Nouveau code PIN (laisser vide = inchangé)
                  </label>
                  <input
                    type="text"
                    value={editPin}
                    onChange={(e) => setEditPin(e.target.value)}
                    placeholder={managedRecord.hasPin ? 'PIN actif sur le serveur' : 'Aucun PIN'}
                    className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                    Limite maximale de scans
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editMaxScans}
                    onChange={(e) => setEditMaxScans(e.target.value)}
                    placeholder="Illimité"
                    className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                    Date d’expiration
                  </label>
                  <input
                    type="datetime-local"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                </div>

                <div className="space-y-1.5 pt-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#111214] cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="manage-active-checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#1D4ED8]"
                    />
                    <span>Code QR actif (désactiver pour bloquer)</span>
                  </label>
                  {managedRecord.hasPin && (
                    <label className="flex items-center gap-2 text-[11px] text-[#5C5E66] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clearPin}
                        onChange={(e) => setClearPin(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#1D4ED8]"
                      />
                      <span>Retirer la protection PIN</span>
                    </label>
                  )}
                </div>
              </div>

              {managedRecord.stats.recentEvents.length > 0 && (
                <div className="pt-2 border-t border-[#EFECE4] space-y-1.5">
                  <span className="text-[11px] font-semibold text-[#111214]">
                    Journal des derniers scans
                  </span>
                  <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-[#5C5E66] tabular-nums">
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
                <p role="alert" className="text-xs text-[#B91C1C]">
                  {dynamicError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EFECE4]">
                <button
                  type="button"
                  onClick={() => setManagedSlug(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-[#5C5E66] rounded-xl cursor-pointer"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  data-testid="save-dynamic-manage-btn"
                  disabled={savingDynamic}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl cursor-pointer"
                >
                  {savingDynamic ? 'Enregistrement...' : 'Enregistrer sur le serveur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
