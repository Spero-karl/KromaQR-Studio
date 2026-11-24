import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, DEFAULT_EXPERIENCE, DEFAULT_SOURCE, THEME_PRESETS } from '../data/presets';
import {
  buildSourceFromPlainPayload,
  encodeSparkQrJsonFile,
  encodeSparkQrSharePackage,
  isUnsafePayloadString,
  parseReceivedQrInput,
} from './sharedQrPackage';

test('encodeSparkQrSharePackage & parseReceivedQrInput roundtrip preserves config, fonts, theme & laser state', () => {
  const frozenPreset = THEME_PRESETS.find((t) => t.id === 'frozen-cristal');
  assert.ok(frozenPreset);

  const customConfig = {
    ...DEFAULT_CONFIG,
    ...frozenPreset.patch,
    titleText: 'Gala Hiver',
    laserEnabled: true,
  };
  const customSource = {
    ...DEFAULT_SOURCE,
    type: 'text' as const,
    textMode: 'url' as const,
    urlValue: 'https://sparkqr.example/hiver',
    useSourceImageAsLogo: true,
  };

  const encoded = encodeSparkQrSharePackage({
    name: 'Invitation Gala Hiver',
    category: 'Événement',
    payload: 'https://sparkqr.example/hiver',
    config: customConfig,
    source: customSource,
    experience: {
      ...DEFAULT_EXPERIENCE,
      readerThemeMode: 'dark',
    },
  });

  assert.equal(encoded.startsWith('SPARKQR1:'), true);

  const decoded = parseReceivedQrInput(encoded);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.equal(decoded.originKind, 'sparkqr-package');
    assert.equal(decoded.item.name, 'Invitation Gala Hiver');
    assert.equal(decoded.item.category, 'Événement');
    assert.equal(decoded.item.payload, 'https://sparkqr.example/hiver');
    assert.equal(decoded.item.config.themeId, 'frozen-cristal');
    assert.equal(decoded.item.config.fontId, 'cormorant');
    assert.equal(decoded.item.config.laserEnabled, true);
    assert.equal(decoded.item.experience?.readerThemeMode, 'dark');
    assert.equal(decoded.item.source.useSourceImageAsLogo, false);
  }
});

test('parseReceivedQrInput supports #sq= and ?sq= URL share wrappers and .sparkqr.json files', () => {
  const encoded = encodeSparkQrSharePackage({
    name: 'Carte Nuit',
    payload: 'https://atelier.example/nuit',
    config: { ...DEFAULT_CONFIG, laserEnabled: false },
    source: DEFAULT_SOURCE,
  });

  const viaHash = parseReceivedQrInput(`https://kromaqr-studio.onrender.com/#sq=${encoded}`);
  assert.equal(viaHash.ok, true);
  if (viaHash.ok) {
    assert.equal(viaHash.item.config.laserEnabled, false);
    assert.equal(viaHash.item.payload, 'https://atelier.example/nuit');
  }

  const viaQuery = parseReceivedQrInput(
    `https://kromaqr-studio.onrender.com/?sq=${encodeURIComponent(encoded)}`
  );
  assert.equal(viaQuery.ok, true);

  const jsonContent = encodeSparkQrJsonFile({
    name: 'Export JSON',
    payload: 'WIFI:T:WPA;S:Studio_5G;P:pass123;;',
    config: { ...DEFAULT_CONFIG, themeId: 'glacial' },
    source: buildSourceFromPlainPayload('WIFI:T:WPA;S:Studio_5G;P:pass123;;'),
  });
  const viaJson = parseReceivedQrInput(jsonContent);
  assert.equal(viaJson.ok, true);
  if (viaJson.ok) {
    assert.equal(viaJson.item.source.textMode, 'wifi');
    assert.equal(viaJson.item.source.wifiSsid, 'Studio_5G');
    assert.equal(viaJson.item.config.themeId, 'glacial');
  }
});

test('parseReceivedQrInput supports plain URL/Wi-Fi QR payloads, rejects arbitrary non-QR text, and blocks XSS schemes', () => {
  const urlParsed = parseReceivedQrInput('https://www.exemple.fr/menu');
  assert.equal(urlParsed.ok, true);
  if (urlParsed.ok) {
    assert.equal(urlParsed.originKind, 'raw-qr');
    assert.equal(urlParsed.item.source.textMode, 'url');
    assert.equal(urlParsed.item.config.laserEnabled, true);
  }

  const wifiParsed = parseReceivedQrInput('WIFI:T:WPA;S:Studio_5G;P:pass123;;');
  assert.equal(wifiParsed.ok, true);

  // Arbitrary plain text pasted into import must be rejected strictly
  const rejectedText = parseReceivedQrInput('bonjour invalide sans qr');
  assert.equal(rejectedText.ok, false);

  // Even plain arbitrary text decoded from an actual QR matrix image works when flagged fromDecodedImage
  const fromImageText = parseReceivedQrInput('Mot de passe porte: 4291', {
    fromDecodedImage: true,
  });
  assert.equal(fromImageText.ok, true);

  assert.equal(isUnsafePayloadString('javascript:alert(1)'), true);
  const blocked = parseReceivedQrInput('javascript:alert(1)');
  assert.equal(blocked.ok, false);

  const blockedHtml = parseReceivedQrInput('data:text/html,<script>alert(1)</script>');
  assert.equal(blockedHtml.ok, false);
});

test('extractSparkQrReaderEndpoint parses /m/:id and /d/:slug links with E2EE hash key', async () => {
  const { extractSparkQrReaderEndpoint } = await import('./sharedQrPackage');
  const media = extractSparkQrReaderEndpoint('https://kromaqr-studio.onrender.com/m/abc12345#k=secretKey');
  assert.deepEqual(media, { kind: 'media', id: 'abc12345', keyFragment: 'secretKey' });

  const dyn = extractSparkQrReaderEndpoint('https://kromaqr-studio.onrender.com/d/mon-lien');
  assert.deepEqual(dyn, { kind: 'dynamic', id: 'mon-lien', keyFragment: null });

  assert.equal(extractSparkQrReaderEndpoint('https://google.com/search?q=qr'), null);
});
