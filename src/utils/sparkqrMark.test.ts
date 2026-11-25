import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, DEFAULT_EXPERIENCE, DEFAULT_SOURCE, THEME_PRESETS } from '../data/presets';
import {
  createSparkQrAuthenticBundle,
  embedOpticalSparkQrWatermark,
  extractOpticalSparkQrWatermark,
  extractSparkQrChunkFromPngBytes,
  injectSparkQrChunkIntoPngBytes,
  verifyLocalSparkQrBundle,
} from './sparkqrMark';

function buildMinimalValidPngBytes(): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  // Minimal 1x1 IHDR chunk (length 13 + 4 type + 4 crc = 25 bytes)
  const ihdr = new Uint8Array([
    0, 0, 0, 13,
    73, 72, 68, 82, // IHDR
    0, 0, 0, 1,
    0, 0, 0, 1,
    8, 2, 0, 0, 0,
    0x90, 0x77, 0x53, 0xde,
  ]);
  const iend = new Uint8Array([
    0, 0, 0, 0,
    73, 69, 78, 68, // IEND
    0xae, 0x42, 0x60, 0x82,
  ]);
  const combined = new Uint8Array(signature.length + ihdr.length + iend.length);
  combined.set(signature, 0);
  combined.set(ihdr, signature.length);
  combined.set(iend, signature.length + ihdr.length);
  return combined;
}

test('createSparkQrAuthenticBundle & verifyLocalSparkQrBundle validate authentic metadata and reject tampering', async () => {
  const prestigePreset = THEME_PRESETS.find((t) => t.id === 'los-santos-prestige');
  assert.ok(prestigePreset);

  const bundle = await createSparkQrAuthenticBundle({
    name: 'Los Santos Pass',
    payload: 'https://sparkqr.example/los-santos',
    source: {
      ...DEFAULT_SOURCE,
      textMode: 'url',
      urlValue: 'https://sparkqr.example/los-santos',
    },
    config: {
      ...DEFAULT_CONFIG,
      ...prestigePreset.patch,
      laserEnabled: false,
      energyWaveEnabled: true,
    },
    experience: DEFAULT_EXPERIENCE,
  });

  assert.equal(bundle.format, 'sparkqr-card-v1');
  assert.equal(bundle.issuer, 'SparkQR');
  assert.match(bundle.fingerprint, /^[0-9a-f]{16}$/);

  const ok = await verifyLocalSparkQrBundle(bundle);
  assert.equal(ok.valid, true);

  const tamperedPayload = await verifyLocalSparkQrBundle({
    ...bundle,
    payload: 'https://evil.example.com',
  });
  assert.equal(tamperedPayload.valid, false);

  const tamperedConfig = await verifyLocalSparkQrBundle({
    ...bundle,
    config: { ...bundle.config, themeId: 'custom' },
  });
  assert.equal(tamperedConfig.valid, false);

  const tamperedFingerprint = await verifyLocalSparkQrBundle({
    ...bundle,
    fingerprint: '0000000000000000',
  });
  assert.equal(tamperedFingerprint.valid, false);
});

test('injectSparkQrChunkIntoPngBytes & extractSparkQrChunkFromPngBytes preserve bundle inside PNG tEXt chunk', async () => {
  const bundle = await createSparkQrAuthenticBundle({
    name: 'Carte PNG Signée',
    payload: 'WIFI:T:WPA;S:SparkStudio;P:secret;;',
    source: { ...DEFAULT_SOURCE, textMode: 'wifi', wifiSsid: 'SparkStudio', wifiPassword: 'secret' },
    config: { ...DEFAULT_CONFIG, energyWaveEnabled: true },
  });

  const rawPng = buildMinimalValidPngBytes();
  assert.equal(extractSparkQrChunkFromPngBytes(rawPng), null);

  const signedPng = injectSparkQrChunkIntoPngBytes(rawPng, bundle);
  assert.ok(signedPng.length > rawPng.length);

  const extracted = extractSparkQrChunkFromPngBytes(signedPng);
  assert.ok(extracted);
  const verified = await verifyLocalSparkQrBundle(extracted);
  assert.equal(verified.valid, true);
  assert.equal(verified.bundle?.fingerprint, bundle.fingerprint);
  assert.equal(verified.bundle?.config.energyWaveEnabled, true);
});

test('embedOpticalSparkQrWatermark & extractOpticalSparkQrWatermark roundtrip 96-bit fingerprint on 480x580 RGBA', () => {
  const width = 480;
  const height = 580;
  const rgba = new Uint8ClampedArray(width * height * 4);
  // Neutral mid-light card canvas (220, 224, 232, 255)
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 220;
    rgba[i + 1] = 224;
    rgba[i + 2] = 232;
    rgba[i + 3] = 255;
  }

  assert.equal(extractOpticalSparkQrWatermark(rgba, width, height).detected, false);

  const fingerprint = 'a4f9c2108e3b77d1';
  embedOpticalSparkQrWatermark(rgba, width, height, fingerprint);

  const extracted = extractOpticalSparkQrWatermark(rgba, width, height);
  assert.equal(extracted.detected, true);
  assert.equal(extracted.fingerprint, fingerprint);
});
