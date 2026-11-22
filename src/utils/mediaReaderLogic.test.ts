import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, DEFAULT_EXPERIENCE, DEFAULT_SOURCE } from '../data/presets';
import {
  buildReaderMediaBuckets,
  buildReaderThemeTokens,
  computeReadingMetrics,
  formatMediaTimestamp,
  getDefaultReaderColorMode,
  inspectVideoSourceCompatibility,
  needsHostedMediaCollection,
  resolveReaderCategory,
} from './mediaReaderLogic';

test('resolveReaderCategory detects all 6 multimedia categories cleanly', () => {
  assert.equal(
    resolveReaderCategory(
      { ...DEFAULT_SOURCE, type: 'image', imageUrl: '/uploads/a.jpg' },
      DEFAULT_EXPERIENCE
    ),
    'image-single'
  );

  assert.equal(
    resolveReaderCategory(
      { ...DEFAULT_SOURCE, type: 'text', textMode: 'text', textValue: 'Bonjour ✨' },
      DEFAULT_EXPERIENCE
    ),
    'text-free'
  );

  assert.equal(
    resolveReaderCategory(
      { ...DEFAULT_SOURCE, type: 'video', videoUrl: '/demo-atelier.mp4' },
      DEFAULT_EXPERIENCE
    ),
    'video-single'
  );

  assert.equal(
    resolveReaderCategory(DEFAULT_SOURCE, {
      ...DEFAULT_EXPERIENCE,
      template: 'photo-gallery',
    }),
    'image-gallery'
  );

  assert.equal(
    resolveReaderCategory(DEFAULT_SOURCE, {
      ...DEFAULT_EXPERIENCE,
      template: 'video-gallery',
    }),
    'video-gallery'
  );

  assert.equal(
    resolveReaderCategory(DEFAULT_SOURCE, {
      ...DEFAULT_EXPERIENCE,
      template: 'mixed-collection',
      mixedTextBlock: 'Notes d’exposition 🎨',
    }),
    'mixed-collection'
  );
});

test('buildReaderMediaBuckets merges source and gallery without duplicates and preserves mixed text', () => {
  const buckets = buildReaderMediaBuckets(
    {
      ...DEFAULT_SOURCE,
      type: 'video',
      videoUrl: '/demo-atelier.mp4',
      videoPosterUrl: '/poster.jpg',
    },
    {
      ...DEFAULT_EXPERIENCE,
      template: 'mixed-collection',
      mixedTextBlock: 'Ligne 1\nLigne 2 🚀',
      galleryItems: [
        { id: '1', type: 'image', url: '/img1.jpg', caption: 'Photo 1' },
        { id: '2', type: 'video', url: '/demo-atelier.mp4', caption: 'Dup' },
        { id: '3', type: 'video', url: '/clip2.webm', caption: 'Clip 2', posterUrl: '/p2.jpg' },
      ],
    }
  );

  assert.equal(buckets.images.length, 1);
  assert.equal(buckets.videos.length, 2);
  assert.equal(buckets.videos[0].posterUrl, '/poster.jpg');
  assert.equal(buckets.videos[1].posterUrl, '/p2.jpg');
  assert.equal(buckets.textBody, 'Ligne 1\nLigne 2 🚀');
});

test('inspectVideoSourceCompatibility flags YouTube/local paths without redirect and allows HTML5 streams', () => {
  const yt = inspectVideoSourceCompatibility('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(yt.playableInHtml5, false);
  assert.equal(yt.reason, 'external-platform');
  assert.equal(yt.platformName, 'YouTube');

  const localWin = inspectVideoSourceCompatibility('C:\\Users\\alice\\video.mp4');
  assert.equal(localWin.playableInHtml5, false);
  assert.equal(localWin.reason, 'local-only-path');

  const mkv = inspectVideoSourceCompatibility('https://cdn.example.com/movie.mkv');
  assert.equal(mkv.playableInHtml5, false);
  assert.equal(mkv.reason, 'unsupported-extension');

  const mp4 = inspectVideoSourceCompatibility('/uploads/clip-123.mp4');
  assert.equal(mp4.playableInHtml5, true);
  assert.equal(mp4.reason, 'ok');
});

test('formatMediaTimestamp formats mm:ss and h:mm:ss reliably', () => {
  assert.equal(formatMediaTimestamp(0), '0:00');
  assert.equal(formatMediaTimestamp(65), '1:05');
  assert.equal(formatMediaTimestamp(3661), '1:01:01');
  assert.equal(formatMediaTimestamp(-4), '0:00');
});

test('computeReadingMetrics handles UTF-8 emojis, line breaks, and long texts accurately', () => {
  const emojiMetrics = computeReadingMetrics('Salut 🌟🔥\nLigne 2');
  assert.equal(emojiMetrics.lines, 2);
  assert.equal(emojiMetrics.words, 4);
  assert.equal(emojiMetrics.characters, 16);
  assert.equal(emojiMetrics.isLongText, false);

  const longText = Array(60).fill('SparkQR').join(' ');
  const longMetrics = computeReadingMetrics(longText);
  assert.equal(longMetrics.words, 60);
  assert.equal(longMetrics.isLongText, true);
});

test('getDefaultReaderColorMode defaults to light and respects explicit dark setting', () => {
  assert.equal(getDefaultReaderColorMode(DEFAULT_CONFIG, 'auto'), 'light');
  assert.equal(getDefaultReaderColorMode(DEFAULT_CONFIG, 'midnight-neon'), 'light');
  assert.equal(
    getDefaultReaderColorMode({ ...DEFAULT_CONFIG, cardBackgroundColor: '#090A0D' }, 'gold-velvet', 'light'),
    'light'
  );
  assert.equal(getDefaultReaderColorMode(DEFAULT_CONFIG, 'auto', 'dark'), 'dark');
});

test('buildReaderThemeTokens supports dark and light modes cleanly', () => {
  const darkTokens = buildReaderThemeTokens(DEFAULT_CONFIG, 'auto', 'dark');
  const lightTokens = buildReaderThemeTokens(DEFAULT_CONFIG, 'auto', 'light');
  assert.equal(darkTokens.mode, 'dark');
  assert.equal(lightTokens.mode, 'light');
  assert.notEqual(darkTokens.surfaceBackground, lightTokens.surfaceBackground);
  assert.notEqual(darkTokens.textPrimary, lightTokens.textPrimary);
});

test('needsHostedMediaCollection hosts text-free, media & galleries while keeping wifi/url direct', () => {
  assert.equal(
    needsHostedMediaCollection(
      { ...DEFAULT_SOURCE, type: 'text', textMode: 'text', textValue: 'Coucou' },
      DEFAULT_EXPERIENCE
    ),
    true
  );
  assert.equal(
    needsHostedMediaCollection(
      { ...DEFAULT_SOURCE, type: 'text', textMode: 'url', urlValue: 'https://exemple.fr' },
      DEFAULT_EXPERIENCE
    ),
    false
  );
  assert.equal(
    needsHostedMediaCollection(
      { ...DEFAULT_SOURCE, type: 'text', textMode: 'text', textValue: 'A'.repeat(950) },
      DEFAULT_EXPERIENCE
    ),
    true
  );
  assert.equal(
    needsHostedMediaCollection(
      { ...DEFAULT_SOURCE, type: 'text', textMode: 'wifi', wifiSsid: 'Home' },
      DEFAULT_EXPERIENCE
    ),
    false
  );
  assert.equal(
    needsHostedMediaCollection(
      { ...DEFAULT_SOURCE, type: 'image', imageUrl: '/uploads/a.png' },
      DEFAULT_EXPERIENCE
    ),
    true
  );
  assert.equal(
    needsHostedMediaCollection(DEFAULT_SOURCE, {
      ...DEFAULT_EXPERIENCE,
      template: 'mixed-collection',
    }),
    true
  );
});

test('resolveMediaDownloadUrl converts /api/media/:id/file URLs to download endpoint cleanly', async () => {
  const { resolveMediaDownloadUrl } = await import('./mediaReaderLogic');
  const { normalizeMediaAssetUrl } = await import('./publicUrl');

  assert.equal(
    normalizeMediaAssetUrl('http://localhost:3000/api/media/m123/file'),
    '/api/media/m123/file'
  );
  assert.equal(
    normalizeMediaAssetUrl('https://qr.exemple.fr/api/media/m123/file'),
    'https://qr.exemple.fr/api/media/m123/file'
  );
  assert.equal(resolveMediaDownloadUrl('/api/media/m123/file'), '/api/media/m123/download');
  assert.equal(
    resolveMediaDownloadUrl('https://qr.exemple.fr/api/media/m123/file'),
    'https://qr.exemple.fr/api/media/m123/download'
  );
  assert.equal(resolveMediaDownloadUrl('/demo-atelier-1.jpg'), '/demo-atelier-1.jpg');
});

test('looksLikeFilename & sanitizePublicCaption strip uploaded filenames while keeping custom titles', async () => {
  const {
    looksLikeFilename,
    sanitizePublicCaption,
    resolvePublicReaderTitle,
    resolveGenericCategoryTitle,
  } = await import('./mediaReaderLogic');

  assert.equal(looksLikeFilename('IMG_4821.jpg'), true);
  assert.equal(looksLikeFilename('passeport_scan_final.pdf'), true);
  assert.equal(looksLikeFilename('Vacances_Ete.MP4'), true);
  assert.equal(looksLikeFilename('/uploads/media-123.png'), true);
  assert.equal(looksLikeFilename('contenu-chiffre.spk1'), true);
  assert.equal(looksLikeFilename('Exposition Atelier Travers 2026'), false);
  assert.equal(looksLikeFilename('Contrat client signé'), false);

  assert.equal(sanitizePublicCaption('photo_vacances.webp', ''), '');
  assert.equal(sanitizePublicCaption('Image externe', ''), '');
  assert.equal(sanitizePublicCaption('Mon album privé', ''), 'Mon album privé');

  // Custom headline or custom titleText wins; raw filename never appears
  assert.equal(
    resolvePublicReaderTitle({
      customHeadline: 'mon_fichier_secret.pdf',
      customTitleText: 'Mon Code QR',
    }),
    ''
  );
  assert.equal(
    resolvePublicReaderTitle({
      customHeadline: '',
      customTitleText: 'Invitation Vernissage',
    }),
    'Invitation Vernissage'
  );
  assert.equal(
    resolvePublicReaderTitle({
      customHeadline: 'Catalogue Automne',
      customTitleText: 'Mon Code QR',
      uppercase: true,
    }),
    'CATALOGUE AUTOMNE'
  );

  assert.equal(resolveGenericCategoryTitle('image-single'), 'Image');
  assert.equal(resolveGenericCategoryTitle('video-single'), 'Vidéo');
  assert.equal(resolveGenericCategoryTitle('document-single'), 'Document');
  assert.equal(resolveGenericCategoryTitle('audio-single'), 'Audio');

  // buildReaderMediaBuckets ignores imageName/videoName filenames completely
  const buckets = buildReaderMediaBuckets(
    {
      ...DEFAULT_SOURCE,
      type: 'image',
      imageUrl: '/api/media/abc/file',
      imageName: 'IMG_20261122_secret.png',
    },
    {
      ...DEFAULT_EXPERIENCE,
      headline: '',
      template: 'media-gallery',
      galleryItems: [
        { id: 'd1', type: 'document', url: '/api/media/doc1/file', caption: 'devis_client_2026.pdf' },
        { id: 'a1', type: 'audio', url: '/api/media/aud1/file', caption: 'Note vocale privée' },
      ],
    }
  );
  assert.equal(buckets.images[0].caption, '');
  assert.equal(buckets.documents[0].caption, '');
  assert.equal(buckets.audios[0].caption, 'Note vocale privée');

  // Redacted E2EE headline falls back to custom config.titleText (Titre), never legend
  assert.equal(
    resolvePublicReaderTitle({
      customHeadline: 'Contenu chiffré',
      customTitleText: 'Menu Printemps',
    }),
    'Menu Printemps'
  );
  assert.equal(sanitizePublicCaption('Scannez pour découvrir', ''), '');
});


