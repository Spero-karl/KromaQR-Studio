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
  wifiPassword: 'secret123',
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
  assert.equal(urlRes.payload, 'https://atelier-kroma.fr/');

  const mailRes = buildPayload({ ...baseSource, urlValue: 'mailto:bonjour@kroma.fr' });
  assert.equal(mailRes.valid, true);
  assert.equal(mailRes.payload, 'mailto:bonjour@kroma.fr');

  const badUrlRes = buildPayload({ ...baseSource, urlValue: 'incomplet' });
  assert.equal(badUrlRes.valid, false);

  const wifiRes = buildPayload({ ...baseSource, textMode: 'wifi' });
  assert.equal(wifiRes.valid, true);
  assert.equal(wifiRes.payload, 'WIFI:T:WPA;S:Atelier_Guest;P:secret123;;');

  const wifiShortPass = buildPayload({ ...baseSource, textMode: 'wifi', wifiPassword: 'short' });
  assert.equal(wifiShortPass.valid, false);

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

test('source image never acts as center QR logo and all 20 redesigned presets + festive stickers remain scannable', async () => {
  const { EMOJI_STICKER_CATALOG, THEME_PRESETS, UNIQUE_LOGOS } = await import('../data/presets');

  // Even if legacy data has useSourceImageAsLogo: true, hasActiveLogo remains false unless explicit center emblem is set
  assert.equal(
    hasActiveLogo(baseConfig, {
      ...baseSource,
      type: 'image',
      imageUrl: '/uploads/photo.jpg',
      useSourceImageAsLogo: true,
    }),
    false
  );

  // Deleted old presets must no longer exist
  for (const removedId of [
    'bauhaus-1923',
    'billet-collector',
    'signal-pure',
    'cuivre-patine',
    'monolithe-cobalt',
    'or-brosse-24k',
  ]) {
    assert.equal(
      THEME_PRESETS.some((t) => t.id === removedId),
      false,
      `${removedId} should be removed`
    );
  }

  // All 26 presets (4 Studio + 11 Ultra Premium + 7 Master + 4 Légendaire) must have >= 4.5 WCAG contrast and zero GTA/Entreprise prefixes
  assert.equal(THEME_PRESETS.length, 26);
  for (const preset of THEME_PRESETS) {
    assert.equal(/\bgta\b/i.test(preset.name), false, `Forbidden GTA in name: ${preset.name}`);
    assert.equal(/\bentreprise\b|\bbanque\b|\bcorporate\b/i.test(preset.name), false, `Forbidden Entreprise/Banque in name: ${preset.name}`);
    assert.equal(preset.editionBadge === 'GTA Edition', false, `Forbidden GTA Edition badge on ${preset.id}`);
  }

  for (const bfId of ['master-black-friday-gold', 'master-black-friday-crimson']) {
    const bf = THEME_PRESETS.find((t) => t.id === bfId);
    assert.ok(bf, `Missing Black Friday Master preset ${bfId}`);
    assert.equal(bf.collection, 'master');
    assert.equal(bf.editionBadge, 'Black Friday');
    assert.equal(bf.patch.metallicSheen, true);
  }

  const vicePreset = THEME_PRESETS.find((t) => t.id === 'vice-city-neon');
  assert.ok(vicePreset, 'Missing Master preset vice-city-neon');
  assert.equal(vicePreset.collection, 'master');
  assert.equal(vicePreset.name, 'Vice City Neon');
  const viceBackdrop = buildShowcaseBackdrop({ ...DEFAULT_CONFIG, ...vicePreset.patch });
  assert.equal(viceBackdrop.textPrimary, '#FFF5FC');
  assert.equal(viceBackdrop.accentColor, '#45F3FF');

  const lsPreset = THEME_PRESETS.find((t) => t.id === 'los-santos-prestige');
  assert.ok(lsPreset, 'Missing Master preset los-santos-prestige');
  assert.equal(lsPreset.collection, 'master');
  assert.equal(lsPreset.name, 'Los Santos Prestige');
  const lsBackdrop = buildShowcaseBackdrop({ ...DEFAULT_CONFIG, ...lsPreset.patch });
  assert.equal(lsBackdrop.textPrimary, '#FAF5E4');
  assert.equal(lsBackdrop.accentColor, '#F5C43D');

  for (const premId of ['meridien-ardoise', 'foret-laiton']) {
    const p = THEME_PRESETS.find((t) => t.id === premId);
    assert.ok(p, `Missing premium preset ${premId}`);
    assert.equal(p.collection, 'premium');
  }

  const legendaryPresets = THEME_PRESETS.filter((t) => t.collection === 'legendary');
  assert.equal(legendaryPresets.length, 4);
  for (const leg of legendaryPresets) {
    assert.equal(leg.patch.energyWaveEnabled, true, `${leg.id} should enable energy waves`);
  }

  for (const preset of THEME_PRESETS) {
    const cfg = { ...DEFAULT_CONFIG, ...preset.patch };
    const report = evaluateScannability(cfg, baseSource);
    assert.ok(
      report.contrastRatio >= 4.5,
      `${preset.id} primary contrast too low: ${report.contrastRatio}`
    );
    const secondaryRatio = contrastRatio(cfg.foregroundSecondaryColor, cfg.qrBackgroundColor);
    assert.ok(
      secondaryRatio >= 4.5,
      `${preset.id} secondary contrast too low: ${secondaryRatio}`
    );
  }

  // Festive & all-purpose vector + emoji stickers exist
  for (const logoId of ['christmas-tree', 'snowflake', 'gift-box', 'confetti', 'champagne', 'trophy']) {
    assert.ok(UNIQUE_LOGOS.some((l) => l.id === logoId), `Missing vector sticker ${logoId}`);
  }
  assert.ok(EMOJI_STICKER_CATALOG.some((e) => e.category === 'noel' && e.emoji === '🎄'));
  assert.ok(EMOJI_STICKER_CATALOG.some((e) => e.category === 'fete' && e.emoji === '🎉'));
  assert.ok(EMOJI_STICKER_CATALOG.some((e) => e.category === 'universel' && e.emoji === '✨'));
});

test('buildPayload generates standards-compliant payloads for all remaining QR capabilities (vCard, Event, Email, Phone, SMS, WhatsApp, Geo, Payment, Document, Audio)', () => {
  const vcard = buildPayload({
    ...baseSource,
    textMode: 'vcard',
    vcardFirstName: 'Camille',
    vcardLastName: 'Laurent',
    vcardOrg: 'Spark Studio',
    vcardPhone: '+33142685510',
    vcardEmail: 'camille@spark.fr',
  });
  assert.equal(vcard.valid, true);
  assert.match(vcard.payload, /^BEGIN:VCARD\nVERSION:3\.0/);
  assert.match(vcard.payload, /FN:Camille Laurent/);
  assert.match(vcard.payload, /ORG:Spark Studio/);

  const eventRes = buildPayload({
    ...baseSource,
    textMode: 'event',
    eventTitle: 'Gala SparkQR',
    eventStart: '2026-06-18T19:30',
    eventEnd: '2026-06-18T22:30',
    eventLocation: 'Paris',
  });
  assert.equal(eventRes.valid, true);
  assert.match(eventRes.payload, /^BEGIN:VCALENDAR/);
  assert.match(eventRes.payload, /SUMMARY:Gala SparkQR/);
  assert.match(eventRes.payload, /DTSTART:20260618T193000/);

  const emailRes = buildPayload({
    ...baseSource,
    textMode: 'email',
    emailAddress: 'bonjour@spark.fr',
    emailSubject: 'Contact',
    emailBody: 'Salut',
  });
  assert.equal(emailRes.valid, true);
  assert.equal(emailRes.payload, 'mailto:bonjour@spark.fr?subject=Contact&body=Salut');

  const phoneRes = buildPayload({ ...baseSource, textMode: 'phone', phoneNumber: '+33 1 42 68 55 10' });
  assert.equal(phoneRes.valid, true);
  assert.equal(phoneRes.payload, 'tel:+33142685510');

  const smsRes = buildPayload({
    ...baseSource,
    textMode: 'sms',
    smsPhone: '+33612345678',
    smsMessage: 'Oui',
  });
  assert.equal(smsRes.valid, true);
  assert.equal(smsRes.payload, 'sms:+33612345678?body=Oui');

  const waRes = buildPayload({
    ...baseSource,
    textMode: 'whatsapp',
    whatsappPhone: '+33 6 12 34 56 78',
    whatsappMessage: 'Info',
  });
  assert.equal(waRes.valid, true);
  assert.equal(waRes.payload, 'https://wa.me/33612345678?text=Info');

  const geoRes = buildPayload({
    ...baseSource,
    textMode: 'geo',
    geoLat: '48.8566',
    geoLng: '2.3522',
    geoLabel: 'Paris',
  });
  assert.equal(geoRes.valid, true);
  assert.match(geoRes.payload, /^geo:48\.856600,2\.352200\?q=/);

  const sepaRes = buildPayload({
    ...baseSource,
    textMode: 'payment',
    paymentMode: 'sepa',
    paymentName: 'Atelier SAS',
    paymentIban: 'FR7630006000011234567890189',
    paymentBic: 'AGRIFRPPXXX',
    paymentAmount: '45.50',
    paymentReference: 'INV-42',
  });
  assert.equal(sepaRes.valid, true);
  assert.match(sepaRes.payload, /^BCD\n002\n1\nSCT\nAGRIFRPPXXX\nAtelier SAS\nFR7630006000011234567890189\nEUR45\.50/);

  const payLinkRes = buildPayload({
    ...baseSource,
    textMode: 'payment',
    paymentMode: 'link',
    paymentUrl: 'https://pay.exemple.fr/123',
  });
  assert.equal(payLinkRes.valid, true);
  assert.equal(payLinkRes.payload, 'https://pay.exemple.fr/123');

  const docRes = buildPayload(
    { ...baseSource, type: 'document', documentUrl: '/uploads/brochure.pdf', documentPageUrl: '/m/doc123' },
    'https://demo.example.com'
  );
  assert.equal(docRes.valid, true);
  assert.equal(docRes.payload, 'https://demo.example.com/m/doc123');

  const audioRes = buildPayload(
    { ...baseSource, type: 'audio', audioUrl: '/uploads/track.mp3', audioPageUrl: '/m/aud123' },
    'https://demo.example.com'
  );
  assert.equal(audioRes.valid, true);
  assert.equal(audioRes.payload, 'https://demo.example.com/m/aud123');
});

test('buildPayload supports and hardens all 5 social formats and blocks phishing/punycode/credential URLs', () => {
  const ttHandle = buildPayload({ ...baseSource, textMode: 'tiktok', tiktokHandle: '@atelier.travers' });
  assert.equal(ttHandle.valid, true);
  assert.equal(ttHandle.payload, 'https://www.tiktok.com/@atelier.travers');

  const igUrl = buildPayload({
    ...baseSource,
    textMode: 'instagram',
    instagramHandle: 'https://instagram.com/atelier.travers/?utm_source=test',
  });
  assert.equal(igUrl.valid, true);
  assert.equal(igUrl.payload, 'https://www.instagram.com/atelier.travers/');

  const fbHandle = buildPayload({ ...baseSource, textMode: 'facebook', facebookHandle: 'atelier.travers.paris' });
  assert.equal(fbHandle.valid, true);
  assert.equal(fbHandle.payload, 'https://www.facebook.com/atelier.travers.paris');

  const tgHandle = buildPayload({ ...baseSource, textMode: 'telegram', telegramHandle: '@atelier_travers' });
  assert.equal(tgHandle.valid, true);
  assert.equal(tgHandle.payload, 'https://t.me/atelier_travers');

  const xUrl = buildPayload({ ...baseSource, textMode: 'twitter', twitterHandle: 'https://twitter.com/ateliertravers' });
  assert.equal(xUrl.valid, true);
  assert.equal(xUrl.payload, 'https://x.com/ateliertravers');

  // Phishing domain, credential injection, traversal, punycode must all fail
  assert.equal(
    buildPayload({ ...baseSource, textMode: 'tiktok', tiktokHandle: 'https://evil-tiktok.com/@user' }).valid,
    false
  );
  assert.equal(
    buildPayload({ ...baseSource, textMode: 'instagram', instagramHandle: 'user..admin' }).valid,
    false
  );
  assert.equal(
    buildPayload({ ...baseSource, textMode: 'url', urlValue: 'https://user:pass@atelier.fr' }).valid,
    false
  );
  assert.equal(
    buildPayload({ ...baseSource, textMode: 'url', urlValue: 'https://xn--pple-43d.com' }).valid,
    false
  );
});



