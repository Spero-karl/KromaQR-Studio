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

test('parseReceivedQrInput supports plain URL/Wi-Fi QR payloads with neutral non-identifying names, rejects arbitrary non-QR text, and blocks XSS schemes', () => {
  const urlParsed = parseReceivedQrInput('https://www.exemple.fr/menu');
  assert.equal(urlParsed.ok, true);
  if (urlParsed.ok) {
    assert.equal(urlParsed.originKind, 'raw-qr');
    assert.equal(urlParsed.item.source.textMode, 'url');
    assert.equal(urlParsed.item.config.laserEnabled, true);
    assert.equal(urlParsed.item.name, 'Code QR · Lien web');
    assert.equal(urlParsed.item.name.includes('exemple.fr'), false);
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

test('buildSourceFromPlainPayload parses vCard, iCal, mailto, tel, sms, whatsapp, geo, and SEPA EPC payloads', () => {
  const vcard = buildSourceFromPlainPayload(
    'BEGIN:VCARD\nVERSION:3.0\nN:Laurent;Camille;;;\nFN:Camille Laurent\nORG:Atelier\nTEL:+33142685510\nEMAIL:a@b.fr\nEND:VCARD'
  );
  assert.equal(vcard.textMode, 'vcard');
  assert.equal(vcard.vcardFirstName, 'Camille');
  assert.equal(vcard.vcardOrg, 'Atelier');

  const event = buildSourceFromPlainPayload(
    'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Gala\nDTSTART:20260618T193000\nLOCATION:Paris\nEND:VEVENT\nEND:VCALENDAR'
  );
  assert.equal(event.textMode, 'event');
  assert.equal(event.eventTitle, 'Gala');
  assert.equal(event.eventLocation, 'Paris');

  assert.equal(buildSourceFromPlainPayload('mailto:test@spark.fr?subject=Sujet').textMode, 'email');
  assert.equal(buildSourceFromPlainPayload('tel:+33123456789').phoneNumber, '+33123456789');
  assert.equal(buildSourceFromPlainPayload('sms:+33612345678?body=Hello').smsMessage, 'Hello');
  assert.equal(buildSourceFromPlainPayload('https://wa.me/33612345678?text=Salut').whatsappPhone, '33612345678');
  assert.equal(buildSourceFromPlainPayload('geo:48.856600,2.352200?q=48.856600,2.352200(Paris)').geoLabel, 'Paris');

  const sepa = buildSourceFromPlainPayload(
    'BCD\n002\n1\nSCT\nAGRIFRPPXXX\nAtelier SAS\nFR7630006000011234567890189\nEUR45.00\n\nINV-1'
  );
  assert.equal(sepa.textMode, 'payment');
  assert.equal(sepa.paymentName, 'Atelier SAS');
  assert.equal(sepa.paymentAmount, '45.00');

  // Social networks
  assert.equal(buildSourceFromPlainPayload('https://www.tiktok.com/@atelier.travers').tiktokHandle, '@atelier.travers');
  assert.equal(buildSourceFromPlainPayload('https://www.instagram.com/atelier.travers').instagramHandle, '@atelier.travers');
  assert.equal(buildSourceFromPlainPayload('https://www.facebook.com/atelier.travers.paris').facebookHandle, 'atelier.travers.paris');
  assert.equal(buildSourceFromPlainPayload('https://t.me/atelier_travers').telegramHandle, '@atelier_travers');
  assert.equal(buildSourceFromPlainPayload('https://x.com/ateliertravers').twitterHandle, '@ateliertravers');
});

test('buildImportedSparkQrItem enforces SparkQR authenticity, migrates legacy theme IDs, preserves attributes, and forces category Importé', async () => {
  const { buildImportedSparkQrItem } = await import('./sharedQrPackage');
  const vicePreset = THEME_PRESETS.find((t) => t.id === 'vice-city-neon');
  assert.ok(vicePreset);

  const rejected = buildImportedSparkQrItem({
    decodedPayload: 'https://external.example.com',
    sparkQrAuthentic: false,
    sparkQrMetadata: null,
  });
  assert.equal(rejected.ok, false);

  const accepted = buildImportedSparkQrItem({
    decodedPayload: 'https://sparkqr.example/vice',
    sparkQrAuthentic: true,
    sparkQrMetadata: {
      name: 'Vice Neon',
      category: 'Professionnel',
      payload: 'https://sparkqr.example/vice',
      config: {
        ...DEFAULT_CONFIG,
        ...vicePreset.patch,
        themeId: 'gta-vice-city',
        laserEnabled: true,
        energyWaveEnabled: true,
      },
      source: {
        ...DEFAULT_SOURCE,
        textMode: 'url',
        urlValue: 'https://sparkqr.example/vice',
      },
      experience: {
        ...DEFAULT_EXPERIENCE,
        readerThemeMode: 'dark',
      },
    },
  });

  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.item.category, 'Importé');
    assert.equal(accepted.item.config.themeId, 'vice-city-neon');
    assert.equal(accepted.item.config.laserEnabled, true);
    assert.equal(accepted.item.config.energyWaveEnabled, true);
    assert.equal(accepted.item.experience?.readerThemeMode, 'dark');
  }
});
