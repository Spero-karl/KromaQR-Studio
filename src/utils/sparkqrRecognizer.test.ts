import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, DEFAULT_EXPERIENCE, DEFAULT_SOURCE, THEME_PRESETS } from '../data/presets';
import { createSparkQrAuthenticBundle } from './sparkqrMark';
import { tryExtractSvgMetadata } from './qrImageDecoder';
import {
  extractSparkQrCharacteristics,
  recognizeAndBuildSparkQrImport,
} from './sparkqrRecognizer';

test('recognizeAndBuildSparkQrImport recognizes genuine SparkQR bundle and restores every characteristic into Importé', async () => {
  const prestigePreset = THEME_PRESETS.find((t) => t.id === 'los-santos-prestige');
  assert.ok(prestigePreset);

  const customConfig = {
    ...DEFAULT_CONFIG,
    ...prestigePreset.patch,
    moduleShape: 'mosaic' as const,
    eyeShape: 'shield' as const,
    frameStyle: 'vip-gold' as const,
    titleText: 'Pass Privé 2026',
    subtitleText: 'Accès VIP',
    logoId: 'crown',
    cornerStickerPlacement: 'all-4' as const,
    laserEnabled: true,
    energyWaveEnabled: true,
  };
  const customSource = {
    ...DEFAULT_SOURCE,
    type: 'text' as const,
    textMode: 'wifi' as const,
    wifiSsid: 'Atelier_VIP',
    wifiPassword: 'GoldPass2026',
    wifiSecurity: 'WPA' as const,
  };
  const customExperience = {
    ...DEFAULT_EXPERIENCE,
    template: 'event-invite' as const,
    headline: 'Soirée Privée Atelier',
    eventLocation: 'Paris 8e',
    readerThemeMode: 'dark' as const,
  };

  const payload = 'WIFI:T:WPA;S:Atelier_VIP;P:GoldPass2026;;';
  const bundle = await createSparkQrAuthenticBundle({
    name: 'Pass Privé VIP',
    payload,
    source: customSource,
    config: customConfig,
    experience: customExperience,
    hmac: 'a'.repeat(64),
  });

  const result = await recognizeAndBuildSparkQrImport({
    decodedPayload: payload,
    rawMetadata: bundle as unknown as Record<string, unknown>,
    sourceFileKind: 'png',
    decodeStrategy: 'adaptive-laser',
    verifyViaServer: async () => ({ authentic: true, bundle }),
  });

  assert.equal(result.recognized, true);
  if (!result.recognized) return;

  assert.equal(result.verificationChannel, 'png-chunk-hmac');
  assert.equal(result.item.category, 'Importé');
  assert.equal(result.item.name, 'Pass Privé VIP');
  assert.equal(result.item.payload, payload);
  assert.equal(result.item.config.themeId, prestigePreset.id);
  assert.equal(result.item.config.moduleShape, 'mosaic');
  assert.equal(result.item.config.eyeShape, 'shield');
  assert.equal(result.item.config.frameStyle, 'vip-gold');
  assert.equal(result.item.config.titleText, 'Pass Privé 2026');
  assert.equal(result.item.config.laserEnabled, true);
  assert.equal(result.item.config.energyWaveEnabled, true);
  assert.equal(result.item.config.logoId, 'crown');
  assert.equal(result.item.config.cornerStickerPlacement, 'all-4');
  assert.equal(result.item.source.textMode, 'wifi');
  assert.equal(result.item.source.wifiSsid, 'Atelier_VIP');
  assert.equal(result.item.experience?.template, 'event-invite');
  assert.equal(result.item.experience?.headline, 'Soirée Privée Atelier');
  assert.equal(result.item.experience?.readerThemeMode, 'dark');

  assert.equal(result.characteristics.presetName, prestigePreset.name);
  assert.equal(result.characteristics.formatLabel, 'Wi-Fi');
  assert.equal(result.characteristics.hasCenterLogo, true);
  assert.equal(result.characteristics.hasCornerStickers, true);
  assert.equal(result.characteristics.laserEnabled, true);
  assert.equal(result.characteristics.energyWaveEnabled, true);
});

test('recognizeAndBuildSparkQrImport rejects external non-SparkQR QR codes strictly', async () => {
  const externalQr = await recognizeAndBuildSparkQrImport({
    decodedPayload: 'https://external-generator.example/menu',
    rawMetadata: null,
    sourceFileKind: 'png',
    verifyViaServer: async () => ({ authentic: false, reason: 'not-found' }),
  });

  assert.equal(externalQr.recognized, false);
  if (externalQr.recognized) return;
  assert.equal(externalQr.code, 'not-sparkqr');
});

test('recognizeAndBuildSparkQrImport rejects tampered visual characteristics, forged HMAC, payload swaps, and XSS payloads', async () => {
  const payload = 'https://sparkqr.example/original';
  const bundle = await createSparkQrAuthenticBundle({
    name: 'Carte Originale',
    payload,
    source: { ...DEFAULT_SOURCE, textMode: 'url', urlValue: payload },
    config: { ...DEFAULT_CONFIG, moduleShape: 'capsule', eyeShape: 'orbite' },
    experience: { ...DEFAULT_EXPERIENCE, headline: 'Original' },
    hmac: 'b'.repeat(64),
  });

  // 1. Visual characteristic tampering breaks localSeal even if themeId unchanged
  const tamperedVisual = await recognizeAndBuildSparkQrImport({
    decodedPayload: payload,
    rawMetadata: {
      ...bundle,
      config: { ...bundle.config, moduleShape: 'square' },
    } as unknown as Record<string, unknown>,
  });
  assert.equal(tamperedVisual.recognized, false);
  if (!tamperedVisual.recognized) {
    assert.equal(tamperedVisual.code, 'tampered-signature');
  }

  // 2. Payload swap between QR matrix and signed bundle is rejected
  const payloadMismatch = await recognizeAndBuildSparkQrImport({
    decodedPayload: 'https://evil-phishing.example/steal',
    rawMetadata: bundle as unknown as Record<string, unknown>,
  });
  assert.equal(payloadMismatch.recognized, false);
  if (!payloadMismatch.recognized) {
    assert.equal(payloadMismatch.code, 'payload-mismatch');
  }

  // 3. Server rejecting forged HMAC rejects even when localSeal passed
  const forgedHmac = await recognizeAndBuildSparkQrImport({
    decodedPayload: payload,
    rawMetadata: bundle as unknown as Record<string, unknown>,
    verifyViaServer: async () => ({
      authentic: false,
      reason: 'invalid-hmac',
      networkError: false,
    }),
  });
  assert.equal(forgedHmac.recognized, false);
  if (!forgedHmac.recognized) {
    assert.equal(forgedHmac.code, 'tampered-signature');
  }

  // 4. Unsafe XSS scheme is blocked
  const unsafe = await recognizeAndBuildSparkQrImport({
    decodedPayload: 'javascript:alert(1)',
    rawMetadata: null,
  });
  assert.equal(unsafe.recognized, false);
  if (!unsafe.recognized) {
    assert.equal(unsafe.code, 'unsafe-payload');
  }
});

test('recognizeAndBuildSparkQrImport recovers full characteristics via optical watermark fingerprint registry', async () => {
  const payload = 'https://sparkqr.example/compressed-whatsapp';
  const bundle = await createSparkQrAuthenticBundle({
    name: 'Carte Compressée',
    payload,
    source: { ...DEFAULT_SOURCE, textMode: 'url', urlValue: payload },
    config: { ...DEFAULT_CONFIG, energyWaveEnabled: true, frameStyle: 'ticket' },
    experience: DEFAULT_EXPERIENCE,
  });

  const recovered = await recognizeAndBuildSparkQrImport({
    decodedPayload: payload,
    rawMetadata: null,
    opticalFingerprint: bundle.fingerprint,
    sourceFileKind: 'raster',
    verifyViaServer: async ({ fingerprint }) =>
      fingerprint === bundle.fingerprint
        ? { authentic: true, bundle }
        : { authentic: false },
  });

  assert.equal(recovered.recognized, true);
  if (!recovered.recognized) return;
  assert.equal(recovered.verificationChannel, 'optical-watermark-registry');
  assert.equal(recovered.item.category, 'Importé');
  assert.equal(recovered.item.config.energyWaveEnabled, true);
  assert.equal(recovered.item.config.frameStyle, 'ticket');
});

test('tryExtractSvgMetadata accurately unescapes XML entities including &apos; and &amp; from exported SVGs', async () => {
  const payload = "https://sparkqr.example/atelier?a=1&b=L'Or";
  const bundle = await createSparkQrAuthenticBundle({
    name: "Atelier d'Or & Lumière",
    payload,
    source: { ...DEFAULT_SOURCE, textMode: 'url', urlValue: payload },
    config: DEFAULT_CONFIG,
  });

  const escapedJson = JSON.stringify(bundle)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><metadata data-sparkqr-meta="1">${escapedJson}</metadata><rect width="10" height="10"/></svg>`;
  const extracted = tryExtractSvgMetadata(svg);
  assert.ok(extracted);
  assert.equal(extracted.payload, payload);
  assert.equal(extracted.name, "Atelier d'Or & Lumière");

  const svgAuth = await recognizeAndBuildSparkQrImport({
    decodedPayload: payload,
    rawMetadata: extracted,
    sourceFileKind: 'svg',
  });
  assert.equal(svgAuth.recognized, true);
  if (svgAuth.recognized) {
    assert.equal(svgAuth.verificationChannel, 'svg-metadata-seal');
    assert.equal(svgAuth.item.name, "Atelier d'Or & Lumière");
    const chars = extractSparkQrCharacteristics(svgAuth.item, svgAuth.verificationChannel);
    assert.equal(chars.formatLabel, 'Lien web');
  }
});
