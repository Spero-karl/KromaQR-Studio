import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendKeyFragmentToUrl,
  decryptBufferChunked,
  decryptJsonWithKey,
  encryptBufferChunked,
  encryptJsonWithKey,
  extractKeyFromHash,
  generateE2eeKeyBase64Url,
  isEncryptedSpk1Buffer,
  stripHashFromUrl,
} from './e2eeCrypto';

test('generateE2eeKeyBase64Url generates 256-bit base64url keys and fragment helpers isolate key', () => {
  const key = generateE2eeKeyBase64Url();
  assert.ok(key.length >= 42);
  assert.ok(!key.includes('='));
  assert.ok(!key.includes('+'));
  assert.ok(!key.includes('/'));

  const qrUrl = appendKeyFragmentToUrl('https://sparkqr.app/m/abc123', key);
  assert.equal(qrUrl, `https://sparkqr.app/m/abc123#k=${key}`);
  assert.equal(stripHashFromUrl(qrUrl), 'https://sparkqr.app/m/abc123');
  assert.equal(extractKeyFromHash(qrUrl), key);
  assert.equal(extractKeyFromHash(`#k=${key}`), key);
  assert.equal(extractKeyFromHash('#k=invalid'), null);
});

test('encryptJsonWithKey and decryptJsonWithKey roundtrip sensitive payloads and fail on wrong key', async () => {
  const key1 = generateE2eeKeyBase64Url();
  const key2 = generateE2eeKeyBase64Url();
  const secret = {
    textValue: 'Message confidentiel SparkQR',
    headline: 'Accès VIP Paris',
    galleryCaptions: ['Photo 1', 'Vidéo 2'],
  };

  const envelope = await encryptJsonWithKey(secret, key1);
  assert.equal(envelope.v, 1);
  assert.equal(envelope.alg, 'AES-256-GCM');
  assert.ok(!envelope.ct.includes('confidentiel'));

  const decrypted = await decryptJsonWithKey<typeof secret>(envelope, key1);
  assert.deepEqual(decrypted, secret);

  await assert.rejects(() => decryptJsonWithKey(envelope, key2));
});

test('chunked SPK1 binary encryption roundtrips multi-chunk files and detects tampering', async () => {
  const key = generateE2eeKeyBase64Url();
  const wrongKey = generateE2eeKeyBase64Url();
  // 4,500 bytes across 1,024-byte chunks -> 5 distinct chunks
  const plain = new Uint8Array(4500);
  for (let i = 0; i < plain.length; i++) {
    plain[i] = (i * 37 + 13) % 256;
  }

  const encrypted = await encryptBufferChunked(plain, key, 1024);
  assert.equal(isEncryptedSpk1Buffer(encrypted), true);
  assert.ok(encrypted.length > plain.length);

  const progressSteps: number[] = [];
  const decrypted = await decryptBufferChunked(encrypted, key, (frac) => {
    progressSteps.push(frac);
  });
  assert.deepEqual(decrypted, plain);
  assert.equal(progressSteps.length, 5);
  assert.equal(progressSteps[progressSteps.length - 1], 1);

  await assert.rejects(() => decryptBufferChunked(encrypted, wrongKey));

  // Tamper one byte inside ciphertext
  const tampered = new Uint8Array(encrypted);
  tampered[tampered.length - 5] ^= 0xff;
  await assert.rejects(() => decryptBufferChunked(tampered, key));
});
