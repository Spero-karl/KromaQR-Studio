import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsToIso,
  classifyRetentionStatus,
  computeFreeRetentionExpiry,
  DEFAULT_MONTHLY_PRICES_CENTS,
  FREE_RETENTION_DAYS,
  formatPaidDurationLabel,
  formatPriceEur,
  getDueNotificationMilestones,
  isValidPaidMonths,
  normalizePricingConfig,
  PAID_PLAN_MONTHS,
} from './retentionPricing';

test('free tier defaults to exact 7 days retention', () => {
  assert.equal(FREE_RETENTION_DAYS, 7);
  const created = '2026-11-01T10:00:00.000Z';
  const exp = computeFreeRetentionExpiry(created);
  assert.equal(exp, '2026-11-08T10:00:00.000Z');
});

test('addMonthsToIso extends cumulatively without shortening already paid time', () => {
  const now = Date.parse('2026-11-01T10:00:00.000Z');
  const existingFuture = '2026-12-15T10:00:00.000Z';
  const extended = addMonthsToIso(existingFuture, 3, now);
  assert.equal(extended, '2027-03-15T10:00:00.000Z');

  // If already expired, extension starts from now
  const expired = '2026-10-01T10:00:00.000Z';
  const renewed = addMonthsToIso(expired, 6, now);
  assert.equal(renewed, '2027-05-01T10:00:00.000Z');

  // Month-end clamping (Jan 31 + 1 month -> Feb 28)
  const jan31 = '2026-01-31T12:00:00.000Z';
  const febClamped = addMonthsToIso(jan31, 1, Date.parse('2026-01-01T00:00:00.000Z'));
  assert.equal(febClamped.startsWith('2026-02-28'), true);
});

test('pricing validation covers only 1 mois, 3 mois, 6 mois, 1 an with 50% halved defaults', () => {
  assert.deepEqual([...PAID_PLAN_MONTHS], [1, 3, 6, 12]);
  assert.deepEqual(DEFAULT_MONTHLY_PRICES_CENTS, {
    1: 145,
    3: 345,
    6: 595,
    12: 995,
  });

  for (const m of [1, 3, 6, 12]) {
    assert.equal(isValidPaidMonths(m), true);
  }
  for (const invalid of [0, 2, 4, 5, 7, 8, 9, 10, 11, 13, 1.5]) {
    assert.equal(isValidPaidMonths(invalid), false);
  }

  assert.equal(formatPaidDurationLabel(1), '1 mois');
  assert.equal(formatPaidDurationLabel(3), '3 mois');
  assert.equal(formatPaidDurationLabel(6), '6 mois');
  assert.equal(formatPaidDurationLabel(12), '1 an');

  // Legacy un-halved pricing files migrate cleanly to halved defaults
  const migrated = normalizePricingConfig({
    monthsCents: { 1: 290, 2: 490, 3: 690, 6: 1190, 12: 1990 },
  });
  assert.deepEqual(migrated.monthsCents, DEFAULT_MONTHLY_PRICES_CENTS);
  assert.equal(migrated.pricingVersion, 2);

  // Genuine custom admin overrides remain intact and exclude intermediate months
  const cfg = normalizePricingConfig({
    monthsCents: { 1: 350, 2: 500, 12: 2400 },
  });
  assert.equal(cfg.monthsCents[1], 350);
  assert.equal(cfg.monthsCents[3], DEFAULT_MONTHLY_PRICES_CENTS[3]);
  assert.equal(cfg.monthsCents[6], DEFAULT_MONTHLY_PRICES_CENTS[6]);
  assert.equal(cfg.monthsCents[12], 2400);
  assert.equal(cfg.monthsCents[2], undefined);
  assert.ok(formatPriceEur(145).includes('1,45'));
});

test('retention classification and 48h/24h/expired notification milestones work accurately', () => {
  const now = Date.parse('2026-11-10T12:00:00.000Z');
  assert.equal(classifyRetentionStatus('2026-11-15T12:00:00.000Z', false, now), 'active');
  assert.equal(classifyRetentionStatus('2026-11-12T10:00:00.000Z', false, now), 'expiring');
  assert.equal(classifyRetentionStatus('2026-11-09T12:00:00.000Z', false, now), 'expired');
  assert.equal(classifyRetentionStatus('2026-11-15T12:00:00.000Z', true, now), 'deleted');

  // 40 hours left -> triggers 48h once
  const exp40h = new Date(now + 40 * 3600 * 1000).toISOString();
  assert.deepEqual(getDueNotificationMilestones(exp40h, [], now), ['48h']);
  assert.deepEqual(getDueNotificationMilestones(exp40h, ['48h'], now), []);

  // 12 hours left -> triggers 24h once
  const exp12h = new Date(now + 12 * 3600 * 1000).toISOString();
  assert.deepEqual(getDueNotificationMilestones(exp12h, ['48h'], now), ['24h']);
  assert.deepEqual(getDueNotificationMilestones(exp12h, ['48h', '24h'], now), []);

  // Expired -> triggers expired once
  const expPast = new Date(now - 1000).toISOString();
  assert.deepEqual(getDueNotificationMilestones(expPast, ['48h', '24h'], now), ['expired']);
  assert.deepEqual(getDueNotificationMilestones(expPast, ['48h', '24h', 'expired'], now), []);
});
