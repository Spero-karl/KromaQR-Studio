import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, DEFAULT_EXPERIENCE, DEFAULT_SOURCE } from '../data/presets';
import {
  buildReaderMediaBuckets,
  buildReaderThemeTokens,
  computeReadingMetrics,
  formatMediaTimestamp,
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

  const longText = Array(60).fill('KromaQR').join(' ');
  const longMetrics = computeReadingMetrics(longText);
  assert.equal(longMetrics.words, 60);
  assert.equal(longMetrics.isLongText, true);
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

