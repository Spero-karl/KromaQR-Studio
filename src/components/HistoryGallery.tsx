import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Clock,
  CopyPlus,
  Download,
  ExternalLink,
  Film,
  FolderHeart,
  Image as ImageIcon,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { PROJECT_CATEGORIES } from '../data/presets';
import type {
  DynamicQrRecord,
  ProjectCategory,
  SavedQrItem,
  UploadedMediaInfo,
  WorkspaceInfo,
} from '../types/qr';
import { updateDynamicQr } from '../utils/dynamicApi';
import { resolveMediaDownloadUrl } from '../utils/mediaReaderLogic';
import { relativeLuminance } from '../utils/qrLogic';
import {
  describeSavedQrAccessibility,
  formatRemainingDuration,
} from '../utils/serverAvailability';
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
        container: 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]',
        headline: 'text-[#047857]',
        icon: 'text-[#059669]',
      };
    case 'expiring':
      return {
        container: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]',
        headline: 'text-[#B45309]',
        icon: 'text-[#D97706]',
      };
    case 'paused':
      return {
        container: 'bg-[#F5F3FF] border-[#DDD6FE] text-[#5B21B6]',
        headline: 'text-[#6D28D9]',
        icon: 'text-[#7C3AED]',
      };
    case 'expired':
      return {
        container: 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]',
        headline: 'text-[#B91C1C]',
        icon: 'text-[#DC2626]',
      };
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
  onDeleteItem: (id: string) => void;
  onRefreshDynamic: () => Promise<void>;
  onDeleteMedia?: (id: string) => Promise<void>;
  onRefreshMedia?: () => Promise<void>;
  onOpenExtend?: (target: {
    targetKind: 'media' | 'collection' | 'dynamic' | 'workspace';
    targetId: string;
    targetTitle: string;
    currentExpiresAt?: string | null;
  }) => void;
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
  onRefreshDynamic,
  onDeleteMedia,
  onRefreshMedia,
  onOpenExtend,
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

  if (items.length === 0 && dynamicRecords.length === 0 && hostedMedia.length === 0) {
    return (
      <section className="space-y-5 max-w-2xl mx-auto">
        <div className="bg-white/95 border border-[#E2E6F0] rounded-3xl overflow-hidden shadow-[0_12px_36px_rgba(37,99,235,0.08)] text-center">
          <div
            aria-hidden="true"
            className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#EC4899]"
          />
          <div className="p-8 sm:p-12 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white flex items-center justify-center mx-auto shadow-[0_10px_24px_rgba(79,70,229,0.28)]">
              <QrCode className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#111214]">
              Votre espace Mes QR codes est prêt
            </h2>
            <p className="text-sm text-[#5C5E66] max-w-md mx-auto leading-relaxed">
              Chaque QR code généré dans le studio apparaît automatiquement ici avec sa durée d’accessibilité, ses réglages et vos médias associés.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onBackToStudio}
                className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] shadow-[0_8px_20px_rgba(37,99,235,0.25)] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Créer mon premier QR code</span>
              </button>
              {workspace && onOpenWorkspaceModal && (
                <button
                  type="button"
                  onClick={onOpenWorkspaceModal}
                  className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] text-xs sm:text-sm font-semibold text-[#4F46E5] bg-[#EEF2FF] hover:bg-[#E0E7FF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" aria-hidden="true" />
                  <span>{workspace.name}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="gallery-heading" className="space-y-6">
      {/* Header + Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4F46E5]">
            Espace personnel SparkQR
          </span>
          <h2 id="gallery-heading" className="font-display text-2xl sm:text-3xl font-bold text-[#111214] mt-0.5">
            Mes QR codes
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {workspace && onOpenWorkspaceModal && (
            <button
              type="button"
              data-testid="gallery-workspace-btn"
              onClick={onOpenWorkspaceModal}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[42px] text-xs font-semibold text-[#4F46E5] bg-[#EEF2FF] hover:bg-[#E0E7FF] border border-[#C7D2FE] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>{workspace.name}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onBackToStudio}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] shadow-[0_6px_18px_rgba(37,99,235,0.22)] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Nouveau QR code</span>
          </button>
        </div>
      </div>

      {/* Vibrant Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-[#DCE6FF] bg-gradient-to-br from-[#F0F5FF] to-white p-4 flex items-center gap-3.5 shadow-[0_4px_14px_rgba(37,99,235,0.06)]">
          <div className="w-11 h-11 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-[0_6px_14px_rgba(37,99,235,0.25)]">
            <QrCode className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2563EB]">
              Créations
            </span>
            <span className="font-display text-xl font-bold text-[#111214] tabular-nums">
              {items.length} code{items.length > 1 ? 's' : ''} QR
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] to-white p-4 flex items-center gap-3.5 shadow-[0_4px_14px_rgba(124,58,237,0.06)]">
          <div className="w-11 h-11 rounded-xl bg-[#7C3AED] text-white flex items-center justify-center shrink-0 shadow-[0_6px_14px_rgba(124,58,237,0.25)]">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#7C3AED]">
              QR dynamiques
            </span>
            <span className="font-display text-xl font-bold text-[#111214] tabular-nums">
              {activeDynamicCount} actif{activeDynamicCount > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#CCF3E3] bg-gradient-to-br from-[#ECFDF5] to-white p-4 flex items-center gap-3.5 shadow-[0_4px_14px_rgba(5,150,105,0.06)]">
          <div className="w-11 h-11 rounded-xl bg-[#059669] text-white flex items-center justify-center shrink-0 shadow-[0_6px_14px_rgba(5,150,105,0.25)]">
            <Activity className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#059669]">
              Consultations
            </span>
            <span className="font-display text-xl font-bold text-[#111214] tabular-nums">
              {totalScans} scan{totalScans > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white/95 border border-[#E2E6F0] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
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
            placeholder="Rechercher par titre ou contenu..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] border border-[#DCE2EE] rounded-xl focus:outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 min-h-[34px] text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
              categoryFilter === 'all'
                ? 'border-[#2563EB] bg-[#EFF4FF] text-[#1D4ED8]'
                : 'border-[#E2E6F0] bg-[#F8FAFC] text-[#4B4D54]'
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
                  ? 'border-[#2563EB] bg-[#EFF4FF] text-[#1D4ED8]'
                  : 'border-[#E2E6F0] bg-[#F8FAFC] text-[#4B4D54]'
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
          className="px-3 py-2 text-xs bg-[#F8FAFC] border border-[#DCE2EE] rounded-xl"
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
              : item.source.textMode === 'wifi'
              ? 'Wi-Fi'
              : item.source.textMode === 'url'
              ? 'Lien web'
              : 'Texte';
          const formattedDate = new Date(item.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
          });
          const isDark = relativeLuminance(item.config.cardBackgroundColor || '#FFFFFF') < 0.22;
          const dyn = item.dynamicSlug ? dynamicMap.get(item.dynamicSlug) : undefined;
          const availability = describeSavedQrAccessibility(item, dyn);
          const availStyles = getAccessibilityStyles(availability.status);

          return (
            <article
              key={item.id}
              data-testid={`dashboard-card-${item.id}`}
              className="bg-white/95 border border-[#E2E6F0] rounded-2xl overflow-hidden flex flex-col justify-between shadow-[0_6px_22px_rgba(17,18,20,0.04)] hover:shadow-[0_12px_28px_rgba(37,99,235,0.08)] transition-shadow"
            >
              <div
                aria-hidden="true"
                className="h-1 w-full bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#EC4899]"
              />
              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-[#111214] truncate">
                      {item.name || item.config.titleText || 'Code QR sans titre'}
                    </h3>
                    {dyn && (
                      <span
                        className={`text-[10px] font-semibold shrink-0 ${
                          dyn.active ? 'text-[#059669]' : 'text-[#B91C1C]'
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
                      : 'studio-grid-mat border-[#E2E6F0]'
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

                {/* Server Accessibility Duration Box (always visible on every generated QR) */}
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

                <div className="flex items-center justify-between gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onLoadItem(item)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[40px] text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
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
                      title="Prolonger la durée de conservation (1 à 12 mois)"
                      className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] text-xs font-semibold text-[#1D4ED8] bg-[#EFF4FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                      className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] text-xs font-semibold text-[#111214] bg-[#F8FAFC] border border-[#DCE2EE] hover:bg-[#EFF4FF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                    className="p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#5C5E66] hover:text-[#111214] hover:bg-[#EFF4FF] rounded-xl transition-colors cursor-pointer"
                  >
                    <CopyPlus className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    aria-label={`Supprimer ${item.name || 'ce code QR'}`}
                    onClick={() => onDeleteItem(item.id)}
                    className="p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6E7078] hover:text-[#B91C1C] hover:bg-[#FEF2F2] rounded-xl transition-colors cursor-pointer"
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
        <div className="bg-white/95 border border-[#E2E6F0] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#7C3AED]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[#111214]">
              Mes QR dynamiques ({dynamicRecords.length})
            </h3>
          </div>
          <div className="divide-y divide-[#EFEFF5]">
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
                    <span className="block font-semibold text-[#111214] truncate">
                      {rec.destination.title || 'Code QR dynamique'}
                    </span>
                    <span className="block text-[11px] text-[#5C5E66]">
                      {rec.active ? durationText : 'Accessibilité serveur : Suspendu'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 tabular-nums">
                    <span className="text-[#5C5E66]">
                      {rec.stats.totalScans} scan{rec.stats.totalScans > 1 ? 's' : ''}
                      {rec.maxScans ? ` / ${rec.maxScans}` : ''}
                    </span>
                    <span
                      className={
                        rec.active
                          ? 'text-[#059669] font-semibold'
                          : 'text-[#B91C1C] font-semibold'
                      }
                    >
                      {rec.active ? 'Actif' : 'Suspendu'}
                    </span>
                    {rec.hasPin && <Lock className="w-3.5 h-3.5 text-[#7C3AED]" aria-hidden="true" />}
                    <button
                      type="button"
                      onClick={() => openManageDrawer(rec)}
                      className="px-3 py-1.5 min-h-[34px] text-[11px] font-semibold text-[#111214] bg-[#F8FAFC] border border-[#DCE2EE] hover:bg-[#EFF4FF] rounded-lg cursor-pointer"
                    >
                      Gérer &amp; Stats
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Personal Media Library (clean, zero technical storage or server links) */}
      <div
        data-testid="hosted-media-library"
        className="bg-white/95 border border-[#E2E6F0] rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderHeart className="w-4 h-4 text-[#D97706]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[#111214]">
              Mes photos et vidéos ({hostedMedia.length})
            </h3>
          </div>
          {onRefreshMedia && (
            <button
              type="button"
              onClick={() => void handleRefreshMedia()}
              disabled={refreshingMedia}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-[11px] font-semibold text-[#4B4D54] bg-[#F8FAFC] hover:bg-[#EFF4FF] border border-[#DCE2EE] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
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
          <p role="alert" className="text-xs font-medium text-[#B91C1C]">
            {mediaActionError}
          </p>
        )}

        {hostedMedia.length === 0 ? (
          <p className="text-xs text-[#6E7078]">
            Aucune photo ou vidéo importée dans cet espace pour le moment. Importez un média dans le studio pour l’associer à un QR code.
          </p>
        ) : (
          <div className="divide-y divide-[#EFEFF5]">
            {hostedMedia.map((media) => {
              const downloadHref =
                media.downloadUrl || resolveMediaDownloadUrl(media.fileUrl || media.url);
              const isDeleting = deletingMediaId === media.id;
              const mediaExpiryIso = media.serverExpiresAt;
              const mediaDuration = mediaExpiryIso
                ? formatRemainingDuration(mediaExpiryIso).headline
                : 'Accessibilité serveur : 7 jours gratuits';

              return (
                <div
                  key={media.id}
                  data-testid={`hosted-media-row-${media.id}`}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F8FAFC] border border-[#E2E6F0] flex items-center justify-center shrink-0">
                      {media.isEncrypted ? (
                        <Lock className="w-5 h-5 text-[#2563EB]" aria-hidden="true" />
                      ) : media.type === 'image' ? (
                        <img
                          src={media.fileUrl || media.url}
                          alt={media.originalName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Film className="w-5 h-5 text-[#E11D48]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        {media.type === 'image' ? (
                          <ImageIcon className="w-3.5 h-3.5 text-[#D97706] shrink-0" aria-hidden="true" />
                        ) : (
                          <Film className="w-3.5 h-3.5 text-[#E11D48] shrink-0" aria-hidden="true" />
                        )}
                        <span className="text-xs font-semibold text-[#111214] truncate">
                          {media.originalName}
                        </span>
                        {media.isEncrypted && (
                          <span className="text-[10px] font-semibold text-[#2563EB] shrink-0">
                            · E2EE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#6E7078] tabular-nums truncate">
                        {formatBytes(media.size)} · {mediaDuration}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={media.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-[11px] font-semibold text-[#111214] bg-[#F8FAFC] border border-[#DCE2EE] hover:bg-[#EFF4FF] rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Voir</span>
                    </a>
                    <a
                      href={downloadHref}
                      download={media.originalName}
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-[11px] font-semibold text-[#1D4ED8] bg-[#EFF4FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] rounded-lg transition-colors"
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-[11px] font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
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
            className="w-full max-w-lg bg-white border border-[#E2E6F0] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#111214]">
                  Réglages du QR dynamique
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
                aria-label="Fermer"
                className="p-2 text-[#5C5E66] hover:text-[#111214] rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveDynamicChanges(e)} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                  Titre affiché
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#DCE2EE] rounded-xl"
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
                  className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#DCE2EE] rounded-xl"
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
                    placeholder={managedRecord.hasPin ? 'PIN actif' : 'Aucun PIN'}
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#DCE2EE] rounded-xl"
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
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#DCE2EE] rounded-xl tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                    Durée d’accessibilité (expiration)
                  </label>
                  <input
                    type="datetime-local"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#DCE2EE] rounded-xl"
                  />
                </div>

                <div className="space-y-1.5 pt-2 sm:pt-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#111214] cursor-pointer">
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
                    <label className="flex items-center gap-2 text-[11px] text-[#5C5E66] cursor-pointer">
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
                <div className="pt-2 border-t border-[#EFEFF5] space-y-1.5">
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EFEFF5]">
                <button
                  type="button"
                  onClick={() => setManagedSlug(null)}
                  className="px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-[#5C5E66] rounded-xl cursor-pointer"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  data-testid="save-dynamic-manage-btn"
                  disabled={savingDynamic}
                  className="px-4 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] rounded-xl cursor-pointer"
                >
                  {savingDynamic ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
