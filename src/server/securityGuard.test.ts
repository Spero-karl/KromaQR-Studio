import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SlidingWindowRateLimiter,
  SparkQrMarkRegistry,
  inspectUploadedFileBuffer,
  isValidResourceId,
  sanitizeJsonObject,
} from './securityGuard';

test('SlidingWindowRateLimiter allows up to maxRequests and blocks excess until window slides', () => {
  const limiter = new SlidingWindowRateLimiter();
  const base = 1_000_000;

  assert.equal(limiter.check('upload:1.2.3.4', 2, 10_000, base).allowed, true);
  assert.equal(limiter.check('upload:1.2.3.4', 2, 10_000, base + 100).allowed, true);

  const blocked = limiter.check('upload:1.2.3.4', 2, 10_000, base + 500);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);

  const recovered = limiter.check('upload:1.2.3.4', 2, 10_000, base + 10_001);
  assert.equal(recovered.allowed, true);
});

test('sanitizeJsonObject strips __proto__, constructor, and prototype recursively', () => {
  const parsed = JSON.parse(
    '{"name":"ok","__proto__":{"polluted":true},"nested":{"constructor":{"bad":1},"prototype":"x","safe":42}}'
  ) as Record<string, unknown>;

  const clean = sanitizeJsonObject(parsed) as Record<string, unknown>;
  assert.equal(clean.name, 'ok');
  assert.equal(Object.prototype.hasOwnProperty.call(clean, '__proto__'), false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  const nested = clean.nested as Record<string, unknown>;
  assert.equal(nested.safe, 42);
  assert.equal(Object.prototype.hasOwnProperty.call(nested, 'constructor'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(nested, 'prototype'), false);
});

test('isValidResourceId accepts clean resource IDs and rejects path traversal / control sequences', () => {
  assert.equal(isValidResourceId('abc123_XYZ-9'), true);
  assert.equal(isValidResourceId('../etc/passwd'), false);
  assert.equal(isValidResourceId('a/b'), false);
  assert.equal(isValidResourceId('ab'), false);
  assert.equal(isValidResourceId(''), false);
});

test('inspectUploadedFileBuffer validates magic bytes and blocks XSS SVG/HTML polyglot payloads', () => {
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  assert.equal(inspectUploadedFileBuffer(validPng, 'image/png', false).safe, true);

  const htmlAsPng = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>');
  assert.equal(inspectUploadedFileBuffer(htmlAsPng, 'image/png', false).safe, false);

  const badPngMagic = Buffer.from('NOT_A_PNG_FILE');
  assert.equal(inspectUploadedFileBuffer(badPngMagic, 'image/png', false).safe, false);

  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(inspectUploadedFileBuffer(validJpeg, 'image/jpeg', false).safe, true);

  const validWebp = Buffer.from('RIFF1234WEBPdata');
  assert.equal(inspectUploadedFileBuffer(validWebp, 'image/webp', false).safe, true);

  const validPdf = Buffer.from('%PDF-1.7\n...');
  assert.equal(inspectUploadedFileBuffer(validPdf, 'application/pdf', false).safe, true);

  const cleanSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/></svg>');
  assert.equal(inspectUploadedFileBuffer(cleanSvg, 'image/svg+xml', false).safe, true);

  const xssSvgScript = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(inspectUploadedFileBuffer(xssSvgScript, 'image/svg+xml', false).safe, false);

  const xssSvgOnload = Buffer.from('<svg onload="alert(1)"></svg>');
  assert.equal(inspectUploadedFileBuffer(xssSvgOnload, 'image/svg+xml', false).safe, false);

  const xssSvgForeignObj = Buffer.from('<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"/></foreignObject></svg>');
  assert.equal(inspectUploadedFileBuffer(xssSvgForeignObj, 'image/svg+xml', false).safe, false);
});

test('SparkQrMarkRegistry signs, persists, verifies valid HMAC bundles, and rejects tampered HMAC', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkqr-mark-test-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const registry = new SparkQrMarkRegistry(tmpDir, 'test-hmac-secret-key-2026');
  const sampleBundle = {
    format: 'sparkqr-card-v1',
    issuer: 'SparkQR',
    fingerprint: '0123456789abcdef',
    localSeal: 'fedcba98765432100123456789abcdef',
    issuedAt: '2026-11-25T10:00:00.000Z',
    name: 'Carte Officielle',
    payload: 'https://sparkqr.example/officiel',
    config: { themeId: 'gta-vice-city', laserEnabled: true, energyWaveEnabled: true },
    source: { type: 'text', textMode: 'url' },
  };

  const signed = registry.signAndRegister(sampleBundle);
  assert.equal(signed.ok, true);
  if (!signed.ok) return;

  assert.match(signed.hmac, /^[0-9a-f]{64}$/);
  assert.equal(registry.existsOnDisk(), true);

  const verifiedWithHmac = registry.verify({
    bundle: { ...sampleBundle, hmac: signed.hmac },
  });
  assert.equal(verifiedWithHmac.authentic, true);

  const verifiedByFingerprint = registry.verify({ fingerprint: '0123456789abcdef' });
  assert.equal(verifiedByFingerprint.authentic, true);

  // Tampering with payload breaks HMAC when unknown fingerprint is presented
  const tamperedUnknown = registry.verify({
    bundle: {
      ...sampleBundle,
      fingerprint: 'ffffffffffffffff',
      payload: 'https://tampered.example.com',
      hmac: signed.hmac,
    },
  });
  assert.equal(tamperedUnknown.authentic, false);

  // Tampering with HMAC even when using an existing registered fingerprint MUST be rejected
  const tamperedKnownFp = registry.verify({
    bundle: {
      ...sampleBundle,
      hmac: 'f'.repeat(64),
    },
  });
  assert.equal(tamperedKnownFp.authentic, false);
  assert.equal(tamperedKnownFp.reason, 'invalid-hmac');

  const unknownFp = registry.verify({ fingerprint: 'aaaaaaaaaaaaaaaa' });
  assert.equal(unknownFp.authentic, false);
});
