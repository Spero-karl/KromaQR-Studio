export const FREE_RETENTION_DAYS = 7;
export const MIN_PAID_MONTHS = 1;
export const MAX_PAID_MONTHS = 12;

export const DEFAULT_MONTHLY_PRICES_CENTS: Record<number, number> = {
  1: 290,
  2: 490,
  3: 690,
  4: 890,
  5: 1090,
  6: 1190,
  7: 1350,
  8: 1490,
  9: 1650,
  10: 1790,
  11: 1890,
  12: 1990,
};

export interface PricingConfig {
  currency: 'EUR';
  monthsCents: Record<number, number>;
  updatedAt: string;
}

export type NotificationMilestone = '48h' | '24h' | 'expired';

export type RetentionStatus =
  | 'permanent'
  | 'active'
  | 'expiring'
  | 'expired'
  | 'deleted';

export function normalizePricingConfig(raw?: Partial<PricingConfig> | null): PricingConfig {
  const monthsCents: Record<number, number> = {};
  for (let m = MIN_PAID_MONTHS; m <= MAX_PAID_MONTHS; m++) {
    const candidate = raw?.monthsCents?.[m] ?? (raw?.monthsCents as Record<string, number> | undefined)?.[String(m)];
    const valid =
      typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 50
        ? Math.round(candidate)
        : DEFAULT_MONTHLY_PRICES_CENTS[m];
    monthsCents[m] = valid;
  }
  return {
    currency: 'EUR',
    monthsCents,
    updatedAt: typeof raw?.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : new Date().toISOString(),
  };
}

export function isValidPaidMonths(months: unknown): months is number {
  return (
    typeof months === 'number' &&
    Number.isInteger(months) &&
    months >= MIN_PAID_MONTHS &&
    months <= MAX_PAID_MONTHS
  );
}

export function computeFreeRetentionExpiry(
  createdAtIso: string,
  days = FREE_RETENTION_DAYS
): string {
  const parsed = Date.parse(createdAtIso);
  const startMs = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(startMs + days * 24 * 60 * 60 * 1000).toISOString();
}

export function addMonthsToIso(
  currentExpiresAtIso: string | null | undefined,
  months: number,
  nowMs = Date.now()
): string {
  const safeMonths = Math.max(1, Math.min(24, Math.floor(months)));
  const existingMs = currentExpiresAtIso ? Date.parse(currentExpiresAtIso) : NaN;
  const anchorMs = Number.isFinite(existingMs) && existingMs > nowMs ? existingMs : nowMs;
  const date = new Date(anchorMs);
  const originalDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + safeMonths);
  // Clamp month overflow (e.g., Jan 31 + 1 month -> Feb 28/29 instead of March)
  if (date.getUTCDate() !== originalDay) {
    date.setUTCDate(0);
  }
  return date.toISOString();
}

export function formatExactFrenchDateTime(isoString: string): string {
  const ms = Date.parse(isoString);
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const datePart = d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} à ${timePart}`;
}

export function formatPriceEur(cents: number): string {
  const euros = (Number(cents) || 0) / 100;
  return euros.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });
}

export function classifyRetentionStatus(
  expiresAtIso: string | null | undefined,
  isDeleted = false,
  nowMs = Date.now()
): RetentionStatus {
  if (isDeleted) return 'deleted';
  if (!expiresAtIso) return 'permanent';
  const targetMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(targetMs)) return 'permanent';
  const diff = targetMs - nowMs;
  if (diff <= 0) return 'expired';
  if (diff <= 48 * 60 * 60 * 1000) return 'expiring';
  return 'active';
}

export function getDueNotificationMilestones(
  expiresAtIso: string | null | undefined,
  sentMilestones: NotificationMilestone[] = [],
  nowMs = Date.now()
): NotificationMilestone[] {
  if (!expiresAtIso) return [];
  const targetMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(targetMs)) return [];
  const sent = new Set(sentMilestones);
  const diff = targetMs - nowMs;

  if (diff <= 0) {
    return sent.has('expired') ? [] : ['expired'];
  }
  if (diff <= 24 * 60 * 60 * 1000) {
    return sent.has('24h') ? [] : ['24h'];
  }
  if (diff <= 48 * 60 * 60 * 1000) {
    return sent.has('48h') ? [] : ['48h'];
  }
  return [];
}
