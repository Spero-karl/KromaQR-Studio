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
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563EB]">
            Conservation &amp; sécurité
          </span>
          <h2
            id="conservation-heading"
            className="font-display text-2xl sm:text-3xl font-bold text-[#111214] mt-0.5"
          >
            Stockage et conservation
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-[#111214] bg-white hover:bg-[#F8FAFC] border border-[#DCE2EE] rounded-xl cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
            <span>Confidentialité &amp; Conditions</span>
          </button>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-[#4B4D54] bg-white hover:bg-[#EFF4FF] border border-[#DCE2EE] rounded-xl cursor-pointer disabled:opacity-60"
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
              className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] rounded-xl shadow-[0_6px_16px_rgba(37,99,235,0.22)] cursor-pointer"
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
          className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#B91C1C]"
        >
          {error}
        </div>
      )}

      {/* 5 Crisp Metric Cards (tabular-nums) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="rounded-2xl border border-[#DCE6FF] bg-white p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2563EB]">
            QR actifs
          </span>
          <span className="block font-display text-2xl font-bold text-[#111214] tabular-nums">
            {summary?.activeCount ?? 0}
          </span>
        </div>

        <div className="rounded-2xl border border-[#E2E6F0] bg-white p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C5E66]">
            Espace utilisé
          </span>
          <span className="block font-display text-2xl font-bold text-[#111214] tabular-nums">
            {formatBytes(summary?.totalStorageBytes ?? 0)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#CCF3E3] bg-white p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#059669]">
            Espace libéré
          </span>
          <span
            data-testid="summary-freed-bytes"
            className="block font-display text-2xl font-bold text-[#059669] tabular-nums"
          >
            {formatBytes(summary?.freedStorageBytes ?? 0)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#FDE68A] bg-white p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#B45309]">
            Expirent &lt; 48h
          </span>
          <span className="block font-display text-2xl font-bold text-[#B45309] tabular-nums">
            {summary?.expiringSoonCount ?? 0}
          </span>
        </div>

        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-[#DDD6FE] bg-white p-4 space-y-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9]">
            Offre active
          </span>
          <span className="block font-display text-lg sm:text-xl font-bold text-[#111214] truncate">
            {summary?.currentPlanLabel || 'Gratuit (7 jours)'}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E2E6F0] rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
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
              className={`px-3.5 py-2 min-h-[38px] text-xs font-semibold rounded-xl transition-colors cursor-pointer tabular-nums ${
                active
                  ? 'bg-[#EFF4FF] text-[#1D4ED8] border border-[#BFDBFE]'
                  : 'text-[#5C5E66] hover:text-[#111214] hover:bg-[#FAF9F5] border border-transparent'
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
          className="bg-white border border-[#E2E6F0] rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[#EFEFF5] flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold text-[#111214]">
                Historique des suppressions
              </h3>
              <p className="text-[11px] text-[#6E7078]">
                Aucun contenu ni fichier privé n’est conservé après suppression définitive.
              </p>
            </div>
          </div>
          {!dashboard?.auditLog.length ? (
            <p className="p-6 text-xs text-[#6E7078]">
              Aucune suppression enregistrée pour cet espace.
            </p>
          ) : (
            <div className="divide-y divide-[#EFEFF5]">
              {dashboard.auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-semibold text-[#111214]">
                      {entry.resourceKind === 'dynamic'
                        ? 'QR dynamique'
                        : entry.resourceKind === 'collection'
                        ? 'Collection média'
                        : 'Fichier média'}
                    </span>
                    <span className="block text-[11px] text-[#5C5E66]">
                      {entry.reason === 'expired'
                        ? 'Suppression automatique (échéance atteinte)'
                        : 'Suppression manuelle définitive'}
                      {' · '}
                      {entry.s3ObjectsDeleted} élément(s) supprimé(s)
                    </span>
                  </div>
                  <div className="text-right tabular-nums space-y-0.5">
                    <span className="block font-semibold text-[#059669]">
                      +{formatBytes(entry.freedBytes)} libérés
                    </span>
                    <span className="block text-[11px] text-[#6E7078]">
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
          className="bg-white border border-[#E2E6F0] rounded-2xl overflow-hidden"
        >
          {loading && !dashboard ? (
            <p className="p-6 text-xs text-[#5C5E66]">Chargement…</p>
          ) : filteredItems.length === 0 ? (
            <p className="p-6 text-xs text-[#6E7078]">
              Aucune ressource dans cette catégorie. Créez un QR code avec texte ou média pour suivre sa conservation ici.
            </p>
          ) : (
            <div className="divide-y divide-[#EFEFF5]">
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
                        <span className="font-display text-sm font-bold text-[#111214] truncate max-w-[320px]">
                          {item.title}
                        </span>
                        <span className="text-[11px] font-medium text-[#5C5E66]">
                          · {getKindLabel(item.mediaType)}
                        </span>
                        {item.isEncrypted && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563EB]">
                            <Lock className="w-3 h-3" aria-hidden="true" />
                            <span>E2EE</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5C5E66] tabular-nums">
                        <span>{formatBytes(item.sizeBytes)}</span>
                        <span>
                          Plan :{' '}
                          <strong className="text-[#111214]">
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
                                ? 'text-[#B91C1C] font-semibold'
                                : item.status === 'expiring'
                                ? 'text-[#B45309] font-semibold'
                                : 'text-[#059669] font-medium'
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
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] rounded-xl cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Prolonger</span>
                      </button>

                      {!isConfirming ? (
                        <button
                          type="button"
                          data-testid={`delete-item-trigger-${item.id}`}
                          onClick={() => setConfirmDeleteKey(key)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-semibold text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] rounded-xl cursor-pointer"
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
                            className="px-2.5 py-2 min-h-[36px] text-xs font-semibold text-[#5C5E66] hover:text-[#111214] rounded-xl cursor-pointer"
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
          className="bg-white border border-[#E2E6F0] rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-[#111214]">
                Alertes d’expiration ({unreadCount} non lue{unreadCount > 1 ? 's' : ''})
              </h3>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tout marquer comme lu</span>
              </button>
            )}
          </div>

          {!dashboard?.notifications.length ? (
            <p className="text-xs text-[#6E7078] leading-relaxed">
              Vous recevrez ici des rappels automatiques 48h avant, 24h avant et lors de l’expiration d’un QR code.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {dashboard.notifications.slice(0, 12).map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-3 text-xs space-y-1 ${
                    n.read
                      ? 'border-[#EFEFF5] bg-[#FAF9F5] text-[#5C5E66]'
                      : 'border-[#BFDBFE] bg-[#EFF4FF] text-[#111214]'
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
          className="bg-white border border-[#E2E6F0] rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[#111214]">
              Rappels par e-mail (optionnel)
            </h3>
          </div>

          {dashboard?.emailAlerts.configuredTransport === 'none' ? (
            <div className="rounded-xl border border-[#E2E6F0] bg-[#FAF9F5] p-3.5 text-xs text-[#5C5E66] space-y-1">
              <p className="font-semibold text-[#111214]">
                Alertes par e-mail temporairement indisponibles.
              </p>
              <p className="leading-relaxed">
                Vos rappels et notifications d’expiration restent consultables en direct dans votre espace ci-contre.
              </p>
            </div>
          ) : dashboard?.emailAlerts.verified ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-3.5 text-xs text-[#065F46] space-y-1">
                <p className="font-bold">Alertes e-mail actives</p>
                <p>Adresse vérifiée : {dashboard.emailAlerts.email}</p>
              </div>
              <button
                type="button"
                disabled={emailBusy}
                onClick={() => void handleDisableEmailAlerts()}
                className="text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer"
              >
                Désactiver les alertes e-mail
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#5C5E66] leading-relaxed">
                Recevez les alertes 48h et 24h avant suppression sans créer de compte : seul votre e-mail vérifié par code est utilisé.
              </p>
              <form onSubmit={(e) => void handleSendEmailCode(e)} className="flex flex-wrap gap-2">
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="vous@exemple.fr"
                  className="flex-1 min-w-[180px] px-3.5 py-2 text-xs bg-[#FAF9F5] border border-[#DCE2EE] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
                <button
                  type="submit"
                  disabled={emailBusy}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-xl cursor-pointer disabled:opacity-60"
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
                    className="flex-1 min-w-[140px] px-3.5 py-2 text-xs font-mono bg-[#FAF9F5] border border-[#DCE2EE] rounded-xl"
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
            <p className="text-xs font-semibold text-[#059669]">{emailFeedback}</p>
          )}
          {emailError && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C]">
              {emailError}
            </p>
          )}
        </div>
      </div>

    </section>
  );
};
