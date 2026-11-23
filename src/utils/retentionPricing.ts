export const FREE_RETENTION_DAYS = 7;
export const MIN_PAID_MONTHS = 1;
export const MAX_PAID_MONTHS = 12;
export const PAID_PLAN_MONTHS = [1, 3, 6, 12] as const;
export type PaidPlanMonths = (typeof PAID_PLAN_MONTHS)[number];

const LEGACY_UNHALVED_PRICES_CENTS: Record<number, number> = {
  1: 290,
  3: 690,
  6: 1190,
  12: 1990,
};

export const DEFAULT_MONTHLY_PRICES_CENTS: Record<number, number> = {
  1: 145, // 1,45 € (anciennement 2,90 €)
  3: 345, // 3,45 € (anciennement 6,90 €)
  6: 595, // 5,95 € (anciennement 11,90 €)
  12: 995, // 9,95 € (anciennement 19,90 €)
};

export interface PricingConfig {
  currency: 'EUR';
  pricingVersion?: number;
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

function isLegacyDefaultGrid(raw?: Partial<PricingConfig> | null): boolean {
  if (!raw || !raw.monthsCents || (typeof raw.pricingVersion === 'number' && raw.pricingVersion >= 2)) {
    return false;
  }
  const entries = PAID_PLAN_MONTHS.map((m) => {
    const val =
      raw.monthsCents?.[m] ??
      (raw.monthsCents as Record<string, number> | undefined)?.[String(m)];
    return { m, val };
  });
  const hasAnyLegacyMatch = entries.some(({ m, val }) => val === LEGACY_UNHALVED_PRICES_CENTS[m]);
  const allMatchLegacyOrEmpty = entries.every(
    ({ m, val }) => val === undefined || val === LEGACY_UNHALVED_PRICES_CENTS[m]
  );
  return hasAnyLegacyMatch && allMatchLegacyOrEmpty;
}

export function normalizePricingConfig(raw?: Partial<PricingConfig> | null): PricingConfig {
  const migrateLegacyDefaults = isLegacyDefaultGrid(raw);
  const monthsCents: Record<number, number> = {};
  for (const m of PAID_PLAN_MONTHS) {
    const candidate =
      raw?.monthsCents?.[m] ??
      (raw?.monthsCents as Record<string, number> | undefined)?.[String(m)];
    const valid =
      !migrateLegacyDefaults &&
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate >= 50
        ? Math.round(candidate)
        : DEFAULT_MONTHLY_PRICES_CENTS[m];
    monthsCents[m] = valid;
  }
  return {
    currency: 'EUR',
    pricingVersion: 2,
    monthsCents,
    updatedAt:
      typeof raw?.updatedAt === 'string' && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

export function isValidPaidMonths(months: unknown): months is PaidPlanMonths {
  return (
    typeof months === 'number' &&
    Number.isInteger(months) &&
    (PAID_PLAN_MONTHS as readonly number[]).includes(months)
  );
}

export function formatPaidDurationLabel(months: number): string {
  return months === 12 ? '1 an' : `${months} mois`;
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
