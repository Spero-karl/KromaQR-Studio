import test from 'node:test';
import assert from 'node:assert/strict';
import { inferEventDeviceType, summarizeDynamicScanStats } from './scanStatsSummary';

test('summarizeDynamicScanStats handles 0 scans cleanly', () => {
  const summary = summarizeDynamicScanStats({
    totalScans: 0,
    lastScannedAt: null,
    recentEvents: [],
  });
  assert.equal(summary.totalScans, 0);
  assert.equal(summary.primaryDeviceLabel, 'Aucun scan enregistré');
  assert.equal(summary.primaryLocation, 'En attente du 1er scan');
});

test('summarizeDynamicScanStats computes breakdowns from full deviceBreakdown and locationCounts', () => {
  const summary = summarizeDynamicScanStats({
    totalScans: 10,
    lastScannedAt: '2026-11-24T12:00:00.000Z',
    deviceBreakdown: { mobile: 7, desktop: 3, other: 0 },
    locationCounts: { 'Paris, FR': 6, 'Lyon, FR': 3, 'Bruxelles, BE': 1 },
    recentEvents: [],
  });
  assert.equal(summary.totalScans, 10);
  assert.equal(summary.mobileScans, 7);
  assert.equal(summary.desktopScans, 3);
  assert.equal(summary.mobilePercent, 70);
  assert.equal(summary.desktopPercent, 30);
  assert.equal(summary.primaryLocation, 'Paris, FR');
  assert.equal(summary.topLocations.length, 3);
  assert.equal(summary.primaryDeviceLabel, 'Mobile 7 · Ordi 3');
});

test('summarizeDynamicScanStats falls back cleanly for legacy records without deviceBreakdown', () => {
  assert.equal(inferEventDeviceType({ device: 'iOS Mobile' }), 'mobile');
  assert.equal(inferEventDeviceType({ device: 'macOS Desktop' }), 'desktop');

  const summary = summarizeDynamicScanStats({
    totalScans: 3,
    lastScannedAt: '2026-11-24T09:00:00.000Z',
    recentEvents: [
      { at: '2026-11-24T09:00:00.000Z', device: 'Android Mobile', unlocked: true },
      { at: '2026-11-24T08:00:00.000Z', device: 'iOS Mobile', unlocked: true },
      { at: '2026-11-24T07:00:00.000Z', device: 'Windows Desktop', unlocked: true },
    ],
  });
  assert.equal(summary.mobileScans, 2);
  assert.equal(summary.desktopScans, 1);
  assert.equal(summary.primaryLocation, 'Non renseignée');
});
