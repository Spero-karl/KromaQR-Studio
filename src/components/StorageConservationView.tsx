import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarClock,
  Check,
  Clock,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  Trash2,
} from 'lucide-react';
import type { StorageDashboardItem, StorageDashboardResponse } from '../types/qr';
import {
  deleteStorageItem,
  fetchStorageDashboard,
  markNotificationsRead,
  removeEmailAlerts,
  requestEmailAlertsCode,
  verifyEmailAlertsCode,
} from '../utils/dynamicApi';
import { formatExactFrenchDateTime } from '../utils/retentionPricing';
import { formatRemainingDuration } from '../utils/serverAvailability';

type FilterTab = 'all' | 'active' | 'expiring' | 'expired' | 'deleted';

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 Ko';
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} Mo`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function getKindLabel(mediaType: StorageDashboardItem['mediaType']): string {
  switch (mediaType) {
    case 'image':
      return 'Image';
    case 'video':
      return 'Vidéo';
    case 'document':
      return 'Document';
    case 'audio':
      return 'Audio';
    case 'collection':
      return 'Collection';
    case 'dynamic':
      return 'QR dynamique';
  }
}

interface StorageConservationViewProps {
  onOpenExtend: (target: {
    targetKind: 'media' | 'collection' | 'dynamic' | 'workspace';
    targetId: string;
    targetTitle: string;
    currentExpiresAt?: string | null;
  }) => void;
  onOpenPrivacy: () => void;
  onResourceDeleted?: () => void;
  onNotificationsChanged?: (unreadCount: number) => void;
}

export const StorageConservationView: React.FC<StorageConservationViewProps> = ({
  onOpenExtend,
  onOpenPrivacy,
  onResourceDeleted,
  onNotificationsChanged,
}) => {
  const [dashboard, setDashboard] = useState<StorageDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Email alert state
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStorageDashboard();
      setDashboard(data);
      const unread = data.notifications.filter((n) => !n.read).length;
      onNotificationsChanged?.(unread);
      if (data.emailAlerts.email && !emailInput) {
        setEmailInput(data.emailAlerts.email);
      }
      setAwaitingCode(data.emailAlerts.pendingVerification);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de charger le suivi de conservation.'
      );
    } finally {
      setLoading(false);
    }
  }, [emailInput, onNotificationsChanged]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const filteredItems = useMemo(() => {
    if (!dashboard) return [];
    if (filter === 'deleted') return [];
    if (filter === 'all') return dashboard.items;
    return dashboard.items.filter((item) => item.status === filter);
  }, [dashboard, filter]);

  const handleConfirmDelete = async (item: StorageDashboardItem) => {
    const key = `${item.kind}:${item.id}`;
    setDeletingKey(key);
    setError(null);
    try {
      await deleteStorageItem(item.kind, item.id);
      setConfirmDeleteKey(null);
      await loadDashboard();
      onResourceDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleMarkAllRead = async () => {
    await markNotificationsRead();
    await loadDashboard();
  };

  const handleSendEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailFeedback(null);
    setEmailBusy(true);
    try {
      const res = await requestEmailAlertsCode(emailInput);
      setAwaitingCode(true);
      setEmailFeedback(`Code à 6 chiffres envoyé à ${res.email}.`);
      await loadDashboard();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailFeedback(null);
    setEmailBusy(true);
    try {
      const res = await verifyEmailAlertsCode(codeInput);
      setCodeInput('');
      setAwaitingCode(false);
      setEmailFeedback(`Alertes e-mail activées pour ${res.email}.`);
      await loadDashboard();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Code invalide.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleDisableEmailAlerts = async () => {
    setEmailBusy(true);
    setEmailError(null);
    try {
      await removeEmailAlerts();
      setEmailInput('');
      setCodeInput('');
      setAwaitingCode(false);
      setEmailFeedback('Alertes e-mail désactivées.');
      await loadDashboard();
    } finally {
      setEmailBusy(false);
    }
  };

  const summary = dashboard?.summary;
  const unreadCount = dashboard?.notifications.filter((n) => !n.read).length || 0;

  return (
    <section
      data-testid="storage-conservation-view"
      aria-labelledby="conservation-heading"
      className="space-y-6 animate-spark-enter"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563EB] dark:text-[#60A5FA]">
            Conservation &amp; sécurité
          </span>
          <h2
            id="conservation-heading"
            className="font-display text-2xl sm:text-3xl font-bold text-[#111214] dark:text-[#F1F5F9] mt-0.5"
          >
            Stockage et conservation
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-white dark:bg-[#131926] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] border border-[#DCE2EE] dark:border-[#242C3D] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
          >
            <Shield className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
            <span>Confidentialité &amp; Conditions</span>
          </button>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-[#4B4D54] dark:text-[#CBD5E1] bg-white dark:bg-[#131926] hover:bg-[#EFF4FF] dark:hover:bg-[#1E293B] border border-[#DCE2EE] dark:border-[#242C3D] rounded-xl cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Actualiser</span>
          </button>

          {dashboard && (
            <button
              type="button"
              data-testid="extend-workspace-btn"
              onClick={() =>
                onOpenExtend({
                  targetKind: 'workspace',
                  targetId: dashboard.workspace.id,
                  targetTitle: `Espace ${dashboard.workspace.name}`,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
            >
              <CalendarClock className="w-4 h-4" aria-hidden="true" />
              <span>Prolonger (1 mois – 1 an)</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#FECACA] dark:border-[#991B1B] bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 px-4 py-3 text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5]"
        >
          {error}
        </div>
      )}

      {/* 5 Crisp Metric Cards (tabular-nums) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="rounded-2xl border border-[#DCE6FF] dark:border-[#243047] bg-white dark:bg-[#131926] p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2563EB] dark:text-[#60A5FA]">
            QR actifs
          </span>
          <span className="block font-display text-2xl font-bold text-[#111214] dark:text-[#F1F5F9] tabular-nums">
            {summary?.activeCount ?? 0}
          </span>
        </div>

        <div className="rounded-2xl border border-[#E2E6F0] dark:border-[#242C3D] bg-white dark:bg-[#131926] p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C5E66] dark:text-[#94A3B8]">
            Espace utilisé
          </span>
          <span className="block font-display text-2xl font-bold text-[#111214] dark:text-[#F1F5F9] tabular-nums">
            {formatBytes(summary?.totalStorageBytes ?? 0)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#CCF3E3] dark:border-[#1E3A34] bg-white dark:bg-[#131926] p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
            Espace libéré
          </span>
          <span
            data-testid="summary-freed-bytes"
            className="block font-display text-2xl font-bold text-[#059669] dark:text-[#34D399] tabular-nums"
          >
            {formatBytes(summary?.freedStorageBytes ?? 0)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#FDE68A] dark:border-[#78350F] bg-white dark:bg-[#131926] p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#B45309] dark:text-[#FBBF24]">
            Expirent &lt; 48h
          </span>
          <span className="block font-display text-2xl font-bold text-[#B45309] dark:text-[#FBBF24] tabular-nums">
            {summary?.expiringSoonCount ?? 0}
          </span>
        </div>

        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-[#DDD6FE] dark:border-[#3730A3] bg-white dark:bg-[#131926] p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#A78BFA]">
            Offre active
          </span>
          <span className="block font-display text-lg sm:text-xl font-bold text-[#111214] dark:text-[#F1F5F9] truncate">
            {summary?.currentPlanLabel || 'Gratuit (7 jours)'}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
        {(
          [
            { id: 'all', label: `Tous (${dashboard?.items.length ?? 0})` },
            {
              id: 'active',
              label: `Actifs (${dashboard?.items.filter((i) => i.status === 'active').length ?? 0})`,
            },
            {
              id: 'expiring',
              label: `Expirant bientôt (${summary?.expiringSoonCount ?? 0})`,
            },
            {
              id: 'expired',
              label: `Expirés (${summary?.expiredCount ?? 0})`,
            },
            {
              id: 'deleted',
              label: `Supprimés (${dashboard?.auditLog.length ?? 0})`,
            },
          ] as Array<{ id: FilterTab; label: string }>
        ).map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`conservation-filter-${tab.id}`}
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-2 min-h-[38px] text-xs font-semibold rounded-xl transition-colors cursor-pointer tabular-nums whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#EFF4FF] dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#93C5FD] border border-[#BFDBFE] dark:border-[#334155]'
                  : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Content List OR Audit Log */}
      {filter === 'deleted' ? (
        <div
          data-testid="deletion-audit-list"
          className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[#EFEFF5] dark:border-[#242C3D] flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold text-[#111214] dark:text-[#F1F5F9]">
                Historique des suppressions
              </h3>
              <p className="text-[11px] text-[#6E7078] dark:text-[#94A3B8]">
                Aucun contenu ni fichier privé n’est conservé après suppression définitive.
              </p>
            </div>
          </div>
          {!dashboard?.auditLog.length ? (
            <p className="p-6 text-xs text-[#6E7078] dark:text-[#94A3B8]">
              Aucune suppression enregistrée pour cet espace.
            </p>
          ) : (
            <div className="divide-y divide-[#EFEFF5] dark:divide-[#242C3D]">
              {dashboard.auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-semibold text-[#111214] dark:text-[#F1F5F9]">
                      {entry.resourceKind === 'dynamic'
                        ? 'QR dynamique'
                        : entry.resourceKind === 'collection'
                        ? 'Collection média'
                        : 'Fichier média'}
                    </span>
                    <span className="block text-[11px] text-[#5C5E66] dark:text-[#94A3B8]">
                      {entry.reason === 'expired'
                        ? 'Suppression automatique (échéance atteinte)'
                        : 'Suppression manuelle définitive'}
                      {' · '}
                      {entry.s3ObjectsDeleted} élément(s) supprimé(s)
                    </span>
                  </div>
                  <div className="text-right tabular-nums space-y-0.5">
                    <span className="block font-semibold text-[#059669] dark:text-[#34D399]">
                      +{formatBytes(entry.freedBytes)} libérés
                    </span>
                    <span className="block text-[11px] text-[#6E7078] dark:text-[#94A3B8]">
                      {formatExactFrenchDateTime(entry.deletedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          data-testid="conservation-items-list"
          className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl overflow-hidden"
        >
          {loading && !dashboard ? (
            <p className="p-6 text-xs text-[#5C5E66] dark:text-[#94A3B8]">Chargement…</p>
          ) : filteredItems.length === 0 ? (
            <p className="p-6 text-xs text-[#6E7078] dark:text-[#94A3B8]">
              Aucune ressource dans cette catégorie. Créez un QR code avec texte ou média pour suivre sa conservation ici.
            </p>
          ) : (
            <div className="divide-y divide-[#EFEFF5] dark:divide-[#242C3D]">
              {filteredItems.map((item) => {
                const key = `${item.kind}:${item.id}`;
                const rem = item.expiresAt ? formatRemainingDuration(item.expiresAt) : null;
                const isConfirming = confirmDeleteKey === key;
                const isDeleting = deletingKey === key;

                return (
                  <div
                    key={key}
                    data-testid={`conservation-row-${item.id}`}
                    className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-bold text-[#111214] dark:text-[#F1F5F9] truncate max-w-[320px]">
                          {item.title}
                        </span>
                        <span className="text-[11px] font-medium text-[#5C5E66] dark:text-[#94A3B8]">
                          · {getKindLabel(item.mediaType)}
                        </span>
                        {item.isEncrypted && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                            <Lock className="w-3 h-3" aria-hidden="true" />
                            <span>Protégé</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                        <span>{formatBytes(item.sizeBytes)}</span>
                        <span>
                          Plan :{' '}
                          <strong className="text-[#111214] dark:text-[#F1F5F9]">
                            {item.retentionPlanMonths
                              ? item.retentionPlanMonths === 12
                                ? '1 an'
                                : `${item.retentionPlanMonths} mois`
                              : 'Gratuit (7 j)'}
                          </strong>
                        </span>
                        {item.expiresAt ? (
                          <span
                            className={
                              item.status === 'expired'
                                ? 'text-[#B91C1C] dark:text-[#F87171] font-semibold'
                                : item.status === 'expiring'
                                ? 'text-[#B45309] dark:text-[#FBBF24] font-semibold'
                                : 'text-[#059669] dark:text-[#34D399] font-medium'
                            }
                          >
                            Suppression prévue le {formatExactFrenchDateTime(item.expiresAt)}
                            {rem ? ` (${rem.expired ? 'Expiré' : `${rem.daysLeft} j restants`})` : ''}
                          </span>
                        ) : (
                          <span>Sans échéance fixe</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid={`extend-item-${item.id}`}
                        onClick={() =>
                          onOpenExtend({
                            targetKind: item.kind,
                            targetId: item.id,
                            targetTitle: item.title,
                            currentExpiresAt: item.expiresAt,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] hover:bg-[#DBEAFE] dark:hover:bg-[#334155] border border-[#BFDBFE] dark:border-[#334155] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Prolonger</span>
                      </button>

                      {!isConfirming ? (
                        <button
                          type="button"
                          data-testid={`delete-item-trigger-${item.id}`}
                          onClick={() => setConfirmDeleteKey(key)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-semibold text-[#B91C1C] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 hover:bg-[#FEE2E2] dark:hover:bg-[#7F1D1D]/50 border border-[#FECACA] dark:border-[#991B1B] rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Supprimer définitivement</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            data-testid={`delete-item-confirm-${item.id}`}
                            disabled={isDeleting}
                            onClick={() => void handleConfirmDelete(item)}
                            className="px-3 py-2 min-h-[36px] text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-xl cursor-pointer disabled:opacity-60"
                          >
                            {isDeleting ? 'Suppression…' : 'Confirmer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(null)}
                            className="px-2.5 py-2 min-h-[36px] text-xs font-semibold text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white rounded-xl cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Two-Column Bottom: Notifications & Email Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Notifications Center */}
        <div
          data-testid="notifications-center"
          className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-[#111214] dark:text-[#F1F5F9]">
                Alertes d’expiration ({unreadCount} non lue{unreadCount > 1 ? 's' : ''})
              </h3>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tout marquer comme lu</span>
              </button>
            )}
          </div>

          {!dashboard?.notifications.length ? (
            <p className="text-xs text-[#6E7078] dark:text-[#94A3B8] leading-relaxed">
              Vous recevrez ici des rappels automatiques 48h avant, 24h avant et lors de l’expiration d’un QR code.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {dashboard.notifications.slice(0, 12).map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-3 text-xs space-y-1 ${
                    n.read
                      ? 'border-[#EFEFF5] dark:border-[#242C3D] bg-[#F8FAFC] dark:bg-[#0F172A] text-[#5C5E66] dark:text-[#94A3B8]'
                      : 'border-[#BFDBFE] dark:border-[#334155] bg-[#EFF4FF] dark:bg-[#1E293B] text-[#111214] dark:text-[#F1F5F9]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate">{n.targetTitle}</strong>
                    <span className="text-[10px] tabular-nums opacity-75 shrink-0">
                      {formatExactFrenchDateTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="leading-relaxed">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optional Email Opt-In */}
        <div
          data-testid="email-alerts-box"
          className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[#111214] dark:text-[#F1F5F9]">
              Rappels par e-mail (optionnel)
            </h3>
          </div>

          {dashboard?.emailAlerts.configuredTransport === 'none' ? (
            <div className="rounded-xl border border-[#E2E6F0] dark:border-[#242C3D] bg-[#F8FAFC] dark:bg-[#0F172A] p-3.5 text-xs text-[#5C5E66] dark:text-[#94A3B8] space-y-1">
              <p className="font-semibold text-[#111214] dark:text-[#F1F5F9]">
                Alertes par e-mail temporairement indisponibles.
              </p>
              <p className="leading-relaxed">
                Vos rappels et notifications d’expiration restent consultables en direct dans votre espace ci-contre.
              </p>
            </div>
          ) : dashboard?.emailAlerts.verified ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#A7F3D0] dark:border-[#065F46] bg-[#ECFDF5] dark:bg-[#064E3B]/40 p-3.5 text-xs text-[#065F46] dark:text-[#6EE7B7] space-y-1">
                <p className="font-bold">Alertes e-mail actives</p>
                <p>Adresse vérifiée : {dashboard.emailAlerts.email}</p>
              </div>
              <button
                type="button"
                disabled={emailBusy}
                onClick={() => void handleDisableEmailAlerts()}
                className="text-xs font-semibold text-[#B91C1C] dark:text-[#F87171] hover:underline cursor-pointer"
              >
                Désactiver les alertes e-mail
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#5C5E66] dark:text-[#94A3B8] leading-relaxed">
                Recevez les alertes 48h et 24h avant suppression sans créer de compte : seul votre e-mail vérifié par code est utilisé.
              </p>
              <form onSubmit={(e) => void handleSendEmailCode(e)} className="flex flex-wrap gap-2">
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="vous@exemple.fr"
                  className="flex-1 min-w-[180px] px-3.5 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
                <button
                  type="submit"
                  disabled={emailBusy}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-xl cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {emailBusy ? 'Envoi…' : awaitingCode ? 'Renvoyer' : 'Recevoir un code'}
                </button>
              </form>

              {awaitingCode && (
                <form onSubmit={(e) => void handleVerifyEmailCode(e)} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    required
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="Code à 6 chiffres"
                    className="flex-1 min-w-[140px] px-3.5 py-2 text-xs font-mono bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
                  />
                  <button
                    type="submit"
                    disabled={emailBusy}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#059669] hover:bg-[#047857] rounded-xl cursor-pointer"
                  >
                    Vérifier
                  </button>
                </form>
              )}
            </div>
          )}

          {emailFeedback && (
            <p className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">{emailFeedback}</p>
          )}
          {emailError && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C] dark:text-[#F87171]">
              {emailError}
            </p>
          )}
        </div>
      </div>

    </section>
  );
};
