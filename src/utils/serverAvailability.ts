import type { DynamicQrRecord, SavedQrItem } from '../types/qr';
import { FREE_RETENTION_DAYS, formatExactFrenchDateTime } from './retentionPricing';

export const HOSTED_RETENTION_DAYS = FREE_RETENTION_DAYS;

export interface ServerAccessibilitySummary {
  kind: 'permanent' | 'hosted' | 'dynamic';
  status: 'permanent' | 'active' | 'expiring' | 'expired' | 'paused';
  headline: string;
  detail: string;
}

export function computeDefaultServerExpiry(
  createdAtIso: string,
  retentionDays = HOSTED_RETENTION_DAYS
): string {
  const baseMs = Date.parse(createdAtIso);
  const startMs = Number.isFinite(baseMs) ? baseMs : Date.now();
  return new Date(startMs + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

export function formatShortFrenchDate(isoString: string): string {
  const ms = Date.parse(isoString);
  if (!Number.isFinite(ms)) return '';
  return formatExactFrenchDateTime(isoString);
}

export function formatRemainingDuration(
  expiresAtIso: string,
  nowMs = Date.now()
): {
  expired: boolean;
  daysLeft: number;
  headline: string;
  detail: string;
} {
  const targetMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(targetMs)) {
    return {
      expired: false,
      daysLeft: HOSTED_RETENTION_DAYS,
      headline: `Conservation serveur : ${HOSTED_RETENTION_DAYS} jours`,
      detail: 'Hébergement actif sur votre espace SparkQR.',
    };
  }

  const diffMs = targetMs - nowMs;
  const dateLabel = formatShortFrenchDate(expiresAtIso);

  if (diffMs <= 0) {
    return {
      expired: true,
      daysLeft: 0,
      headline: 'Accessibilité serveur : Expiré',
      detail: dateLabel ? `Expiré depuis le ${dateLabel}.` : 'Durée serveur arrivée à échéance.',
    };
  }

  const totalMinutes = Math.floor(diffMs / 60_000);
  const totalHours = Math.floor(diffMs / 3_600_000);
  const daysLeft = Math.floor(diffMs / 86_400_000);

  if (daysLeft >= 2) {
    return {
      expired: false,
      daysLeft,
      headline: `Accessibilité serveur : ${daysLeft} jours restants`,
      detail: dateLabel ? `Suppression prévue le ${dateLabel}.` : 'Disponible en ligne.',
    };
  }

  if (daysLeft === 1) {
    const extraHours = totalHours % 24;
    return {
      expired: false,
      daysLeft: 1,
      headline: `Accessibilité serveur : 1 jour ${extraHours > 0 ? `${extraHours} h` : ''}`.trim(),
      detail: dateLabel ? `Suppression prévue le ${dateLabel}.` : 'Expire demain.',
    };
  }

  if (totalHours >= 1) {
    const mins = totalMinutes % 60;
    return {
      expired: false,
      daysLeft: 0,
      headline: `Accessibilité serveur : ${totalHours} h ${mins > 0 ? `${mins} min` : ''} restantes`.trim(),
      detail: dateLabel ? `Suppression prévue le ${dateLabel}.` : 'Expire prochainement.',
    };
  }

  return {
    expired: false,
    daysLeft: 0,
    headline: `Accessibilité serveur : ${Math.max(1, totalMinutes)} min restantes`,
    detail: dateLabel ? `Suppression prévue le ${dateLabel}.` : 'Expire dans quelques instants.',
  };
}

export function isHostedReaderPayload(payload: string): boolean {
  return /\/m\/[a-zA-Z0-9_-]+/.test(payload || '');
}

export function describeSavedQrAccessibility(
  item: Pick<
    SavedQrItem,
    'createdAt' | 'payload' | 'dynamicSlug' | 'serverExpiresAt' | 'accessibilityKind'
  >,
  dynRecord?: DynamicQrRecord,
  nowMs = Date.now()
): ServerAccessibilitySummary {
  if (dynRecord || item.dynamicSlug || item.accessibilityKind === 'dynamic') {
    if (dynRecord && !dynRecord.active) {
      return {
        kind: 'dynamic',
        status: 'paused',
        headline: 'Accessibilité serveur : Suspendu',
        detail: 'QR dynamique en pause · Réactivable à tout moment.',
      };
    }

    const exp = dynRecord?.expiresAt || item.serverExpiresAt;
    if (exp) {
      const rem = formatRemainingDuration(exp, nowMs);
      return {
        kind: 'dynamic',
        status: rem.expired ? 'expired' : rem.daysLeft <= 2 ? 'expiring' : 'active',
        headline: rem.headline,
        detail: rem.detail,
      };
    }

    return {
      kind: 'dynamic',
      status: 'active',
      headline: 'Accessibilité serveur : Illimitée',
      detail: 'QR dynamique actif tant que vous le conservez.',
    };
  }

  if (
    item.accessibilityKind === 'hosted' ||
    Boolean(item.serverExpiresAt) ||
    isHostedReaderPayload(item.payload)
  ) {
    const exp = item.serverExpiresAt || computeDefaultServerExpiry(item.createdAt, HOSTED_RETENTION_DAYS);
    const rem = formatRemainingDuration(exp, nowMs);
    return {
      kind: 'hosted',
      status: rem.expired ? 'expired' : rem.daysLeft <= 2 ? 'expiring' : 'active',
      headline: rem.headline,
      detail: rem.detail,
    };
  }

  return {
    kind: 'permanent',
    status: 'permanent',
    headline: 'Accessibilité serveur : Permanente',
    detail: 'Contenu autonome encodé dans le QR · Toujours lisible sans limite de durée.',
  };
}
