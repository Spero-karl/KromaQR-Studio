export const E2EE_CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB chunks for mobile-safe video E2EE
const SPK1_MAGIC = [0x53, 0x50, 0x4b, 0x31] as const; // "SPK1"
const SPK1_HEADER_BYTES = 4 + 4 + 4 + 12; // magic + chunkSize + chunkCount + baseIv

export interface E2eeJsonEnvelope {
  v: 1;
  alg: 'AES-256-GCM';
  iv: string;
  ct: string;
}

export interface E2eeEncryptedFileMeta {
  originalName: string;
  originalMimeType: string;
  originalSize: number;
  chunkSize: number;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (AES-GCM) indisponible dans cet environnement.');
  }
  return subtle;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(input: string): Uint8Array {
  const clean = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (clean.length % 4)) % 4;
  const padded = clean + '='.repeat(padLen);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function generateE2eeKeyBase64Url(): string {
  const raw = new Uint8Array(32);
  globalThis.crypto.getRandomValues(raw);
  return bytesToBase64Url(raw);
}

export async function importAesGcmKey(keyBase64Url: string): Promise<CryptoKey> {
  const rawBytes = base64UrlToBytes(keyBase64Url);
  if (rawBytes.length !== 32) {
    throw new Error('Clé de chiffrement invalide (256 bits requis).');
  }
  return getSubtle().importKey(
    'raw',
    toArrayBuffer(rawBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function appendKeyFragmentToUrl(rawUrl: string, keyBase64Url: string): string {
  const base = stripHashFromUrl(rawUrl);
  if (!keyBase64Url.trim()) return base;
  return `${base}#k=${encodeURIComponent(keyBase64Url.trim())}`;
}

export function stripHashFromUrl(rawUrl: string): string {
  const idx = (rawUrl || '').indexOf('#');
  return idx === -1 ? rawUrl : rawUrl.slice(0, idx);
}

export function extractKeyFromHash(hashOrUrl: string): string | null {
  const raw = (hashOrUrl || '').trim();
  if (!raw) return null;
  const hashPart = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw;
  if (!hashPart) return null;

  // Support "#k=<key>" or "#key=<key>"
  const params = new URLSearchParams(hashPart);
  const key = params.get('k') || params.get('key');
  if (!key) return null;
  try {
    const decoded = decodeURIComponent(key).trim();
    const bytes = base64UrlToBytes(decoded);
    return bytes.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

export function isValidE2eeEnvelope(value: unknown): value is E2eeJsonEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 &&
    v.alg === 'AES-256-GCM' &&
    typeof v.iv === 'string' &&
    v.iv.length > 0 &&
    typeof v.ct === 'string' &&
    v.ct.length > 0
  );
}

export async function encryptJsonWithKey(
  payload: unknown,
  keyBase64Url: string
): Promise<E2eeJsonEnvelope> {
  const key = await importAesGcmKey(keyBase64Url);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await getSubtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    v: 1,
    alg: 'AES-256-GCM',
    iv: bytesToBase64Url(iv),
    ct: bytesToBase64Url(new Uint8Array(cipherBuffer)),
  };
}

export async function decryptJsonWithKey<T = unknown>(
  envelope: E2eeJsonEnvelope,
  keyBase64Url: string
): Promise<T> {
  if (!isValidE2eeEnvelope(envelope)) {
    throw new Error('Enveloppe chiffrée invalide.');
  }
  const key = await importAesGcmKey(keyBase64Url);
  const iv = base64UrlToBytes(envelope.iv);
  const cipherBytes = base64UrlToBytes(envelope.ct);
  const plainBuffer = await getSubtle().decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(cipherBytes)
  );
  const text = new TextDecoder().decode(plainBuffer);
  return JSON.parse(text) as T;
}

function deriveChunkIv(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
  const iv = new Uint8Array(12);
  iv.set(baseIv);
  // XOR last 4 bytes with chunk index big-endian so every chunk has a strictly unique IV
  const view = new DataView(iv.buffer);
  const tail = view.getUint32(8, false);
  view.setUint32(8, (tail ^ (chunkIndex >>> 0)) >>> 0, false);
  return iv;
}

export function isEncryptedSpk1Buffer(bytes: Uint8Array): boolean {
  if (bytes.length < SPK1_HEADER_BYTES) return false;
  return (
    bytes[0] === SPK1_MAGIC[0] &&
    bytes[1] === SPK1_MAGIC[1] &&
    bytes[2] === SPK1_MAGIC[2] &&
    bytes[3] === SPK1_MAGIC[3]
  );
}

export async function encryptBufferChunked(
  plainBytes: Uint8Array,
  keyBase64Url: string,
  chunkSize = E2EE_CHUNK_SIZE_BYTES
): Promise<Uint8Array> {
  const safeChunkSize = Math.max(1024, Math.floor(chunkSize));
  const key = await importAesGcmKey(keyBase64Url);
  const baseIv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(baseIv);

  const chunkCount = Math.max(1, Math.ceil(plainBytes.length / safeChunkSize));
  const encryptedChunks: Uint8Array[] = [];
  let totalPayloadBytes = 0;

  for (let i = 0; i < chunkCount; i++) {
    const start = i * safeChunkSize;
    const end = Math.min(plainBytes.length, start + safeChunkSize);
    const slice = plainBytes.subarray(start, end);
    const iv = deriveChunkIv(baseIv, i);
    const cipherBuffer = await getSubtle().encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
      },
      key,
      toArrayBuffer(slice)
    );
    const cipherBytes = new Uint8Array(cipherBuffer);
    encryptedChunks.push(cipherBytes);
    totalPayloadBytes += 4 + cipherBytes.length;
  }

  const out = new Uint8Array(SPK1_HEADER_BYTES + totalPayloadBytes);
  out.set(SPK1_MAGIC, 0);
  const headerView = new DataView(out.buffer);
  headerView.setUint32(4, safeChunkSize, false);
  headerView.setUint32(8, chunkCount, false);
  out.set(baseIv, 12);

  let offset = SPK1_HEADER_BYTES;
  for (const chunk of encryptedChunks) {
    headerView.setUint32(offset, chunk.length, false);
    offset += 4;
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

export async function decryptBufferChunked(
  encryptedBytes: Uint8Array,
  keyBase64Url: string,
  onProgress?: (fraction: number) => void
): Promise<Uint8Array> {
  if (!isEncryptedSpk1Buffer(encryptedBytes)) {
    throw new Error('Format de fichier chiffré SparkQR (SPK1) invalide.');
  }

  const key = await importAesGcmKey(keyBase64Url);
  const view = new DataView(
    encryptedBytes.buffer,
    encryptedBytes.byteOffset,
    encryptedBytes.byteLength
  );
  const chunkCount = view.getUint32(8, false);
  if (chunkCount === 0 || chunkCount > 100000) {
    throw new Error('Nombre de blocs chiffrés invalide.');
  }
  const baseIv = encryptedBytes.subarray(12, 24);

  const plainChunks: Uint8Array[] = [];
  let totalPlainSize = 0;
  let offset = SPK1_HEADER_BYTES;

  for (let i = 0; i < chunkCount; i++) {
    if (offset + 4 > encryptedBytes.length) {
      throw new Error('Fichier chiffré tronqué.');
    }
    const cipherLen = view.getUint32(offset, false);
    offset += 4;
    if (cipherLen < 16 || offset + cipherLen > encryptedBytes.length) {
      throw new Error('Bloc chiffré corrompu ou incomplet.');
    }
    const cipherSlice = encryptedBytes.subarray(offset, offset + cipherLen);
    offset += cipherLen;

    const iv = deriveChunkIv(baseIv, i);
    const plainBuffer = await getSubtle().decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
      },
      key,
      toArrayBuffer(cipherSlice)
    );
    const plainSlice = new Uint8Array(plainBuffer);
    plainChunks.push(plainSlice);
    totalPlainSize += plainSlice.length;
    onProgress?.((i + 1) / chunkCount);
  }

  const output = new Uint8Array(totalPlainSize);
  let writeOffset = 0;
  for (const chunk of plainChunks) {
    output.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return output;
}

export async function encryptFileForUpload(
  file: File,
  keyBase64Url: string
): Promise<{
  encryptedFile: File;
  meta: E2eeEncryptedFileMeta;
}> {
  const buffer = await file.arrayBuffer();
  const encryptedBytes = await encryptBufferChunked(
    new Uint8Array(buffer),
    keyBase64Url,
    E2EE_CHUNK_SIZE_BYTES
  );
  const encryptedFile = new File([toArrayBuffer(encryptedBytes)], 'encrypted-media.spk1', {
    type: 'application/octet-stream',
  });
  return {
    encryptedFile,
    meta: {
      originalName: file.name || 'fichier',
      originalMimeType: file.type || 'application/octet-stream',
      originalSize: file.size,
      chunkSize: E2EE_CHUNK_SIZE_BYTES,
    },
  };
}
