import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDefaultServerExpiry,
  describeSavedQrAccessibility,
  formatRemainingDuration,
} from './serverAvailability';

test('computeDefaultServerExpiry defaults to 7 days and supports custom durations', () => {
  const created = '2026-01-01T12:00:00.000Z';
  const expDefault = computeDefaultServerExpiry(created);
  const diffDefault = Math.round((Date.parse(expDefault) - Date.parse(created)) / 86_400_000);
  assert.equal(diffDefault, 7);

  const exp365 = computeDefaultServerExpiry(created, 365);
  const diffDays = Math.round((Date.parse(exp365) - Date.parse(created)) / 86_400_000);
  assert.equal(diffDays, 365);
});

test('formatRemainingDuration handles future days, hours, and expired states', () => {
  const now = Date.parse('2026-06-01T10:00:00.000Z');
  const in15Days = new Date(now + 15 * 86_400_000).toISOString();
  const res15 = formatRemainingDuration(in15Days, now);
  assert.equal(res15.expired, false);
  assert.equal(res15.daysLeft, 15);
  assert.match(res15.headline, /15 jours restants/);

  const in3Hours = new Date(now + 3 * 3_600_000 + 20 * 60_000).toISOString();
  const res3h = formatRemainingDuration(in3Hours, now);
  assert.equal(res3h.expired, false);
  assert.match(res3h.headline, /3 h 20 min restantes/);

  const past = new Date(now - 3600_000).toISOString();
  const resPast = formatRemainingDuration(past, now);
  assert.equal(resPast.expired, true);
  assert.match(resPast.headline, /Expiré/);
});

test('describeSavedQrAccessibility distinguishes permanent, hosted 365j, and dynamic QRs', () => {
  const now = Date.parse('2026-06-01T10:00:00.000Z');
  const created = '2026-06-01T10:00:00.000Z';

  const direct = describeSavedQrAccessibility(
    {
      createdAt: created,
      payload: 'https://exemple.fr',
      dynamicSlug: null,
    },
    undefined,
    now
  );
  assert.equal(direct.kind, 'permanent');
  assert.equal(direct.status, 'permanent');

  const hosted = describeSavedQrAccessibility(
    {
      createdAt: created,
      payload: 'https://sparkqr.app/m/abc1234',
      serverExpiresAt: computeDefaultServerExpiry(created, 365),
      accessibilityKind: 'hosted',
    },
    undefined,
    now
  );
  assert.equal(hosted.kind, 'hosted');
  assert.equal(hosted.status, 'active');
  assert.match(hosted.headline, /365 jours restants/);

  const dynUnlimited = describeSavedQrAccessibility(
    {
      createdAt: created,
      payload: 'https://sparkqr.app/d/vip99',
      dynamicSlug: 'vip99',
      accessibilityKind: 'dynamic',
    },
    {
      slug: 'vip99',
      shortUrl: '/d/vip99',
      active: true,
      hasPin: false,
      expiresAt: null,
      maxScans: null,
      createdAt: created,
      updatedAt: created,
      destination: {
        intent: 'url',
        payload: 'https://exemple.fr',
        title: 'VIP',
        sourceSnapshot: {
          type: 'text',
          textMode: 'url',
          urlValue: 'https://exemple.fr',
          textValue: '',
          wifiSsid: '',
          wifiPassword: '',
          wifiSecurity: 'WPA',
          imageUrl: '',
          imageName: '',
          imagePageUrl: '',
          useSourceImageAsLogo: false,
          videoUrl: '',
          videoName: '',
          videoPageUrl: '',
        },
        experience: {
          template: 'standard',
          headline: '',
          description: '',
          accentMood: 'auto',
          eventDate: '',
          eventTime: '',
          eventLocation: '',
          eventDressCode: '',
          personName: '',
          personRole: '',
          companyName: '',
          contactEmail: '',
          contactPhone: '',
          websiteUrl: '',
          postcardFrom: '',
          postcardTo: '',
          postcardStampText: '',
          privateBadgeLabel: '',
          privateSecretNote: '',
          galleryItems: [],
          ctaLabel: '',
          ctaUrl: '',
        },
        cardTheme: {
          cardBackgroundColor: '#FFFFFF',
          foregroundColor: '#111214',
          eyeColor: '#2563EB',
          fontId: 'bricolage',
        },
      },
      stats: { totalScans: 0, lastScannedAt: null, recentEvents: [] },
    },
    now
  );
  assert.equal(dynUnlimited.kind, 'dynamic');
  assert.match(dynUnlimited.headline, /Illimitée/);
});
