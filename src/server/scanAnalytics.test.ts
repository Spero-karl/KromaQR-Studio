import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDynamicScanEvent,
  classifyDeviceType,
  isPrivateOrLocalIp,
  normalizeClientIp,
  replaceDynamicScanLocation,
  resolveGeoFromHeaders,
  summarizeDevice,
  type ServerDynamicStats,
} from './scanAnalytics';

test('classifyDeviceType distinguishes mobile, tablet, desktop and unknown user agents', () => {
  assert.equal(
    classifyDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148'),
    'mobile'
  );
  assert.equal(
    classifyDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile'),
    'mobile'
  );
  assert.equal(
    classifyDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36'),
    'desktop'
  );
  assert.equal(
    classifyDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/126.0'),
    'desktop'
  );
  assert.equal(classifyDeviceType('curl/8.4.0'), 'other');

  assert.equal(summarizeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'iOS Mobile');
  assert.equal(summarizeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows Desktop');
});

test('resolveGeoFromHeaders decodes CDN/proxy city and country headers cleanly', () => {
  const cfGeo = resolveGeoFromHeaders((name) => {
    const map: Record<string, string> = {
      'cf-ipcity': 'Montr%C3%A9al',
      'cf-ipcountry': 'ca',
    };
    return map[name.toLowerCase()];
  });
  assert.deepEqual(cfGeo, { location: 'Montréal, CA', exact: true });

  const countryOnly = resolveGeoFromHeaders((name) =>
    name.toLowerCase() === 'x-vercel-ip-country' ? 'fr' : undefined
  );
  assert.deepEqual(countryOnly, { location: 'FR', exact: false });

  const unknownGeo = resolveGeoFromHeaders((name) =>
    name.toLowerCase() === 'cf-ipcountry' ? 'XX' : undefined
  );
  assert.equal(unknownGeo, null);
});

test('normalizeClientIp and isPrivateOrLocalIp identify local vs public IPs reliably', () => {
  assert.equal(normalizeClientIp('::ffff:127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeClientIp('203.0.113.45:54321, 10.0.0.1'), '203.0.113.45');
  assert.equal(isPrivateOrLocalIp('127.0.0.1'), true);
  assert.equal(isPrivateOrLocalIp('192.168.1.40'), true);
  assert.equal(isPrivateOrLocalIp('::1'), true);
  assert.equal(isPrivateOrLocalIp('82.64.120.15'), false);
});

test('applyDynamicScanEvent aggregates totalScans, deviceBreakdown, locationCounts, and updates pending locations', () => {
  let stats: ServerDynamicStats = {
    totalScans: 0,
    lastScannedAt: null,
    recentEvents: [],
  };

  stats = applyDynamicScanEvent(stats, {
    at: '2026-11-24T10:00:00.000Z',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
    location: 'Paris, FR',
  });
  stats = applyDynamicScanEvent(stats, {
    at: '2026-11-24T10:05:00.000Z',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    location: 'Localisation en cours',
  });

  assert.equal(stats.totalScans, 2);
  assert.deepEqual(stats.deviceBreakdown, { mobile: 1, desktop: 1, other: 0 });
  assert.equal(stats.locationCounts?.['Paris, FR'], 1);
  assert.equal(stats.recentEvents[0].deviceType, 'desktop');

  stats = replaceDynamicScanLocation(stats, {
    at: '2026-11-24T10:05:00.000Z',
    oldLocation: 'Localisation en cours',
    newLocation: 'Lyon, FR',
  });
  assert.equal(stats.locationCounts?.['Localisation en cours'], undefined);
  assert.equal(stats.locationCounts?.['Lyon, FR'], 1);
  assert.equal(stats.recentEvents[0].location, 'Lyon, FR');
});
