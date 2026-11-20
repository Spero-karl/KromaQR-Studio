import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicReaderUrl,
  detectEnvironmentIssue,
  inspectMediaUrlForQr,
  isAiStudioOrPreviewHost,
  normalizeMediaAssetUrl,
  validateGalleryUrls,
  validatePublicAppUrl,
} from './publicUrl';

test('validatePublicAppUrl accepts clean HTTPS domains and strips trailing slashes', () => {
  const res = validatePublicAppUrl('https://studio.exemple-qr.fr/');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedUrl, 'https://studio.exemple-qr.fr');

  const subPath = validatePublicAppUrl('https://qr.entreprise.com/kroma/');
  assert.equal(subPath.valid, true);
  assert.equal(subPath.normalizedUrl, 'https://qr.entreprise.com/kroma');
});

test('validatePublicAppUrl rejects AI Studio preview hosts, localhost, private IPs, and non-HTTPS', () => {
  const aiStudio = validatePublicAppUrl(
    'https://ais-dev-ilm5e4yw54j7f37llj7het-670918435423.europe-west3.run.app'
  );
  assert.equal(aiStudio.valid, false);
  assert.equal(aiStudio.reason, 'aistudio-preview');

  const aiStudioPre = validatePublicAppUrl(
    'https://ais-pre-xyz123.europe-west1.run.app'
  );
  assert.equal(aiStudioPre.valid, false);
  assert.equal(aiStudioPre.reason, 'aistudio-preview');

  const localhost = validatePublicAppUrl('https://localhost:3000');
  assert.equal(localhost.valid, false);
  assert.equal(localhost.reason, 'local-host');

  const loopback = validatePublicAppUrl('https://127.0.0.1:3000');
  assert.equal(loopback.valid, false);
  assert.equal(loopback.reason, 'local-host');

  const privateLan = validatePublicAppUrl('https://192.168.1.42');
  assert.equal(privateLan.valid, false);
  assert.equal(privateLan.reason, 'private-ip');

  const httpOnly = validatePublicAppUrl('http://mon-domaine.com');
  assert.equal(httpOnly.valid, false);
  assert.equal(httpOnly.reason, 'not-https');

  const empty = validatePublicAppUrl('');
  assert.equal(empty.valid, false);
  assert.equal(empty.reason, 'empty');
});

test('detectEnvironmentIssue flags AI Studio and localhost environments clearly', () => {
  const aiDiag = detectEnvironmentIssue(
    'https://ais-dev-ilm5e4yw54j7f37llj7het-670918435423.europe-west3.run.app'
  );
  assert.equal(aiDiag.isAiStudioPreview, true);
  assert.ok(aiDiag.summary.includes('403'));

  const localDiag = detectEnvironmentIssue('http://localhost:3000');
  assert.equal(localDiag.isLocal, true);
  assert.equal(localDiag.isNonHttps, true);

  assert.equal(isAiStudioOrPreviewHost('aistudio.google.com'), true);
  assert.equal(isAiStudioOrPreviewHost('studio.exemple-qr.fr'), false);
});

test('inspectMediaUrlForQr blocks disk paths, localhost, and AI Studio URLs while allowing uploads and public HTTPS', () => {
  assert.equal(inspectMediaUrlForQr('/uploads/1700-abc.png').safe, true);
  assert.equal(inspectMediaUrlForQr('/demo-atelier.jpg').safe, true);
  assert.equal(inspectMediaUrlForQr('https://cdn.exemple.fr/photo.jpg').safe, true);

  assert.equal(inspectMediaUrlForQr('C:\\Users\\demo\\photo.jpg').safe, false);
  assert.equal(inspectMediaUrlForQr('/Users/demo/video.mp4').safe, false);
  assert.equal(inspectMediaUrlForQr('file:///tmp/photo.png').safe, false);
  assert.equal(inspectMediaUrlForQr('http://localhost:3000/uploads/a.png').safe, false);
  assert.equal(
    inspectMediaUrlForQr(
      'https://ais-dev-abc123.europe-west3.run.app/uploads/a.png'
    ).safe,
    false
  );
});

test('buildPublicReaderUrl constructs clean /m/:id and /d/:slug links without fake fallbacks', () => {
  assert.equal(
    buildPublicReaderUrl('https://studio.exemple-qr.fr/', '/m/abc1234'),
    'https://studio.exemple-qr.fr/m/abc1234'
  );
  assert.throws(() => buildPublicReaderUrl('http://localhost:3000', '/m/abc1234'));
  assert.throws(() => buildPublicReaderUrl('', '/d/slug123'));
});

test('normalizeMediaAssetUrl strips stale AI Studio or localhost origin prefixes and validateGalleryUrls checks items', () => {
  assert.equal(
    normalizeMediaAssetUrl(
      'https://ais-dev-xyz123.europe-west3.run.app/uploads/1700-img.png'
    ),
    '/uploads/1700-img.png'
  );
  assert.equal(
    normalizeMediaAssetUrl('http://localhost:3000/demo-atelier-1.jpg'),
    '/demo-atelier-1.jpg'
  );
  assert.equal(
    normalizeMediaAssetUrl('https://cdn.exemple.fr/photo.jpg'),
    'https://cdn.exemple.fr/photo.jpg'
  );

  assert.equal(
    validateGalleryUrls(['/uploads/a.jpg', 'https://cdn.exemple.fr/b.mp4']).safe,
    true
  );
  assert.equal(
    validateGalleryUrls(['/uploads/a.jpg', 'C:\\Users\\test\\b.jpg']).safe,
    false
  );
});
