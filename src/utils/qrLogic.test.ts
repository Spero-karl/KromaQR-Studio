import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayload,
  buildShowcaseBackdrop,
  computeCornerStickerPositions,
  contrastRatio,
  evaluateScannability,
  extractHostname,
  generateQrMatrix,
  hasActiveLogo,
  isFinderCell,
  isInLogoKnockoutZone,
  verifyMatrixRoundTrip,
} from './qrLogic';
import { DEFAULT_CONFIG } from '../data/presets';
import type { QrConfig, QrSourceState } from '../types/qr';

const baseSource: QrSourceState = {
  type: 'text',
  textMode: 'url',
  urlValue: 'atelier-kroma.fr',
  textValue: 'Bonjour',
  wifiSsid: 'Atelier_Guest',
  wifiPassword: 'secret',
  wifiSecurity: 'WPA',
  imageUrl: '',
  imageName: '',
  imagePageUrl: '',
  useSourceImageAsLogo: false,
  videoUrl: '',
  videoName: '',
  videoPageUrl: '',
};

const baseConfig: QrConfig = {
  ...DEFAULT_CONFIG,
  themeId: 'atelier',
  foregroundColor: '#111214',
  foregroundSecondaryColor: '#1D4ED8',
  gradientType: 'solid',
  gradientAngle: 135,
  useCustomEyeColor: false,
  eyeColor: '#1D4ED8',
  qrBackgroundColor: '#FFFFFF',
  cardBackgroundColor: '#FFFFFF',
  cardTextColor: '#111214',
  moduleShape: 'rounded',
  eyeShape: 'rounded',
  filter: 'none',
  filterIntensity: 50,
  frameStyle: 'signature',
  fontId: 'bricolage',
  subtitleFontId: 'jakarta',
  titleSize: 21,
  subtitleSize: 13,
  messageFontSize: 18,
  titleWeight: 700,
  titleItalic: false,
  titleUppercase: false,
  textAlign: 'center',
  titleText: 'Atelier Kroma',
  subtitleText: 'Scannez pour découvrir',
  logoId: null,
  centerEmoji: null,
  monogramText: 'KQ',
  customLogoDataUrl: null,
  logoSize: 0.22,
  logoKnockout: 'squircle',
  logoColor: '#111214',
  cornerStickerPlacement: 'none',
  cornerStickerKind: 'vector',
  cornerStickerVectorId: 'star',
  cornerStickerEmoji: '✨',
  cornerStickerColor: '#1D4ED8',
  cornerStickerScale: 1,
  errorCorrection: 'M',
  margin: 2,
  cornerRadius: 20,
};

test('buildPayload normalizes URLs, preserves mailto/tel schemes, and validates Wi-Fi passwords', () => {
  const urlRes = buildPayload(baseSource);
  assert.equal(urlRes.valid, true);
  assert.equal(urlRes.payload, 'https://atelier-kroma.fr');

  const mailRes = buildPayload({ ...baseSource, urlValue: 'mailto:bonjour@kroma.fr' });
  assert.equal(mailRes.valid, true);
  assert.equal(mailRes.payload, 'mailto:bonjour@kroma.fr');

  const badUrlRes = buildPayload({ ...baseSource, urlValue: 'incomplet' });
  assert.equal(badUrlRes.valid, false);

  const wifiRes = buildPayload({ ...baseSource, textMode: 'wifi' });
  assert.equal(wifiRes.valid, true);
  assert.equal(wifiRes.payload, 'WIFI:T:WPA;S:Atelier_Guest;P:secret;;');

  const wifiMissingPass = buildPayload({ ...baseSource, textMode: 'wifi', wifiPassword: '' });
  assert.equal(wifiMissingPass.valid, false);

  const wifiOpen = buildPayload({
    ...baseSource,
    textMode: 'wifi',
    wifiPassword: '',
    wifiSecurity: 'nopass',
  });
  assert.equal(wifiOpen.valid, true);
  assert.equal(wifiOpen.payload, 'WIFI:T:nopass;S:Atelier_Guest;;');

  const emptyUrlRes = buildPayload({ ...baseSource, urlValue: '   ' });
  assert.equal(emptyUrlRes.valid, false);
});

test('buildPayload resolves relative image/video hosted page URLs only with valid PUBLIC_APP_URL and blocks local/AI Studio URLs', () => {
  const imgRes = buildPayload(
    {
      ...baseSource,
      type: 'image',
      imageUrl: '/uploads/a.jpg',
      imagePageUrl: '/m/abc123',
    },
    'https://demo.example.com/'
  );
  assert.equal(imgRes.valid, true);
  assert.equal(imgRes.payload, 'https://demo.example.com/m/abc123');

  const missingOrigin = buildPayload(
    {
      ...baseSource,
      type: 'image',
      imageUrl: '/uploads/a.jpg',
      imagePageUrl: '/m/abc123',
    },
    ''
  );
  assert.equal(missingOrigin.valid, false);

  const aiStudioOrigin = buildPayload(
    {
      ...baseSource,
      type: 'image',
      imageUrl: '/uploads/a.jpg',
      imagePageUrl: '/m/abc123',
    },
    'https://ais-dev-abc123.europe-west3.run.app'
  );
  assert.equal(aiStudioOrigin.valid, false);

  const localDiskMedia = buildPayload(
    {
      ...baseSource,
      type: 'image',
      imageUrl: 'C:\\Users\\demo\\photo.jpg',
      imagePageUrl: '',
    },
    'https://demo.example.com'
  );
  assert.equal(localDiskMedia.valid, false);

  const aiStudioUrlTarget = buildPayload({
    ...baseSource,
    urlValue: 'https://ais-dev-abc123.europe-west3.run.app/test',
  });
  assert.equal(aiStudioUrlTarget.valid, false);
});

test('contrastRatio computes expected WCAG contrast ratios', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.ok(contrastRatio('#111214', '#FFFFFF') > 18);
});

test('evaluateScannability flags low contrast and upgrades error correction for logos and center emojis', () => {
  const optimal = evaluateScannability(baseConfig, baseSource);
  assert.equal(optimal.status, 'optimal');
  assert.equal(optimal.effectiveErrorCorrection, 'M');

  const withLogo = evaluateScannability({ ...baseConfig, logoId: 'star' }, baseSource);
  assert.equal(withLogo.hasLogo, true);
  assert.equal(withLogo.effectiveErrorCorrection, 'H');

  assert.equal(hasActiveLogo({ ...baseConfig, centerEmoji: '🚀' }, baseSource), true);
  const withEmoji = evaluateScannability({ ...baseConfig, centerEmoji: '🚀' }, baseSource);
  assert.equal(withEmoji.hasLogo, true);
  assert.equal(withEmoji.effectiveErrorCorrection, 'H');

  const risky = evaluateScannability(
    { ...baseConfig, foregroundColor: '#EAEAEA', qrBackgroundColor: '#FFFFFF' },
    baseSource
  );
  assert.equal(risky.status, 'risky');
});

test('isFinderCell and isInLogoKnockoutZone accurately partition QR matrix', () => {
  const size = 25;
  assert.equal(isFinderCell(0, 0, size), true);
  assert.equal(isFinderCell(6, 6, size), true);
  assert.equal(isFinderCell(0, size - 1, size), true);
  assert.equal(isFinderCell(size - 1, 0, size), true);
  assert.equal(isFinderCell(12, 12, size), false);

  assert.equal(isInLogoKnockoutZone(12, 12, size, 0.22, true), true);
  assert.equal(isInLogoKnockoutZone(0, 0, size, 0.22, true), false);
  assert.equal(isInLogoKnockoutZone(12, 12, size, 0.22, false), false);
});

test('computeCornerStickerPositions computes corner coordinates and backing flags safely', () => {
  const layout = {
    width: 400,
    height: 500,
    qrX: 40,
    qrY: 50,
    qrSize: 320,
  };

  assert.equal(computeCornerStickerPositions('none', 'signature', layout).length, 0);

  const all4Sig = computeCornerStickerPositions('all-4', 'signature', layout);
  assert.equal(all4Sig.length, 4);
  assert.deepEqual(
    all4Sig.map((p) => p.corner),
    ['tl', 'tr', 'bl', 'br']
  );
  assert.equal(all4Sig.every((p) => p.needsBacking === false), true);

  const diagPur = computeCornerStickerPositions('diagonal', 'none', layout);
  assert.equal(diagPur.length, 2);
  assert.deepEqual(
    diagPur.map((p) => p.corner),
    ['tl', 'br']
  );
  assert.equal(diagPur.every((p) => p.needsBacking === true), true);

  assert.deepEqual(
    computeCornerStickerPositions('top-2', 'glass', layout).map((p) => p.corner),
    ['tl', 'tr']
  );
  assert.deepEqual(
    computeCornerStickerPositions('bottom-2', 'ticket', layout).map((p) => p.corner),
    ['bl', 'br']
  );
  assert.deepEqual(
    computeCornerStickerPositions('bottom-right', 'polaroid', layout).map((p) => p.corner),
    ['br']
  );
});

test('generateQrMatrix and verifyMatrixRoundTrip decode exact payloads across URL, UTF-8 text, and Wi-Fi', () => {
  const samples = [
    'https://galerie-travers.fr/formes-geometriques',
    'Invitation privée — Exposition Paris 2026 ✨',
    'WIFI:T:WPA;S:Galerie_Travers_5G;P:sculpture2026;;',
    'https://studio.exemple-qr.fr/m/abc1234',
  ];

  for (const sample of samples) {
    const matrix = generateQrMatrix(sample, 'H');
    assert.ok(matrix.size >= 21);
    assert.equal(matrix.modules.length, matrix.size);
    assert.equal(matrix.modules[0][0], true);
    assert.equal(verifyMatrixRoundTrip(matrix, sample), true);
  }

  assert.throws(() => generateQrMatrix('   ', 'M'));
});

test('buildShowcaseBackdrop adapts light and dark card themes and extractHostname cleans URLs', () => {
  const lightBackdrop = buildShowcaseBackdrop(baseConfig);
  assert.equal(lightBackdrop.textPrimary, '#111214');
  assert.ok(lightBackdrop.outerBackground.includes('radial-gradient'));

  const darkBackdrop = buildShowcaseBackdrop({
    ...baseConfig,
    cardBackgroundColor: '#0B0F19',
    useCustomEyeColor: true,
    eyeColor: '#22D3EE',
  });
  assert.equal(darkBackdrop.textPrimary, '#F8FAFC');
  assert.equal(darkBackdrop.accentColor, '#22D3EE');

  assert.equal(extractHostname('https://www.galerie-travers.fr/expo'), 'galerie-travers.fr');
});


