import type { PostScanExperience, QrConfig, QrSourceState } from '../types/qr';

export interface SparkQrAuthenticBundle {
  format: 'sparkqr-card-v1';
  issuer: 'SparkQR';
  fingerprint: string;
  localSeal: string;
  hmac?: string;
  issuedAt: string;
  name: string;
  payload: string;
  source: QrSourceState;
  config: QrConfig;
  experience?: PostScanExperience;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CHUNK_KEYWORD = 'SparkQR-Bundle';
const SEAL_DOMAIN = 'SparkQR-Authentic-Card-Seal-v1::k9x4m2p8';
const OPTICAL_MAGIC = 0x53515231; // "SQR1"

// Standard IEEE 802.3 CRC-32 table for PNG chunks
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writeUint32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) |
      (buf[offset + 1] << 16) |
      (buf[offset + 2] << 8) |
      buf[offset + 3]) >>>
    0
  );
}

function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const hashBuffer = await subtle.digest('SHA-256', data);
    const hashBytes = new Uint8Array(hashBuffer);
    return Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback pure-JS deterministic 64-hex digest if SubtleCrypto unavailable in non-HTTPS test context
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    h1 ^= data[i];
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= data[i] + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, '0') +
    h2.toString(16).padStart(8, '0') +
    ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0') +
    ((h1 + h2) >>> 0).toString(16).padStart(8, '0')
  ).repeat(2);
}

function canonicalizeForHash(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForHash(item));
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    out[key] = canonicalizeForHash(obj[key]);
  }
  return out;
}

function buildCanonicalSealInput(bundle: {
  payload: string;
  name: string;
  issuedAt: string;
  fingerprint: string;
  config: QrConfig;
  source: QrSourceState;
  experience?: PostScanExperience;
}): string {
  const cleanSource: QrSourceState = {
    ...bundle.source,
    useSourceImageAsLogo: false,
  };
  const cleanConfig: QrConfig = {
    ...bundle.config,
    laserEnabled: Boolean(bundle.config.laserEnabled),
    energyWaveEnabled: Boolean(bundle.config.energyWaveEnabled),
    customLogoDataUrl:
      bundle.config.customLogoDataUrl && bundle.config.customLogoDataUrl.length <= 90_000
        ? bundle.config.customLogoDataUrl
        : null,
  };
  return JSON.stringify(
    canonicalizeForHash({
      domain: SEAL_DOMAIN,
      payload: bundle.payload,
      name: bundle.name,
      issuedAt: bundle.issuedAt,
      fingerprint: bundle.fingerprint,
      config: cleanConfig,
      source: cleanSource,
      experience: bundle.experience ?? null,
    })
  );
}

export async function createSparkQrAuthenticBundle(input: {
  name?: string;
  payload: string;
  source: QrSourceState;
  config: QrConfig;
  experience?: PostScanExperience;
  hmac?: string;
  issuedAt?: string;
}): Promise<SparkQrAuthenticBundle> {
  const issuedAt = input.issuedAt || new Date().toISOString();
  const safeName = (input.name || input.config.titleText || 'Code QR SparkQR').trim().slice(0, 60);
  const safeConfig: QrConfig = {
    ...input.config,
    customLogoDataUrl:
      input.config.customLogoDataUrl && input.config.customLogoDataUrl.length <= 90_000
        ? input.config.customLogoDataUrl
        : null,
  };
  const safeSource: QrSourceState = {
    ...input.source,
    useSourceImageAsLogo: false,
  };

  const fpSeed = JSON.stringify({
    payload: input.payload,
    themeId: safeConfig.themeId,
    fg: safeConfig.foregroundColor,
    bg: safeConfig.qrBackgroundColor,
    font: safeConfig.fontId,
    laser: Boolean(safeConfig.laserEnabled),
    wave: Boolean(safeConfig.energyWaveEnabled),
    issuedAt,
  });
  const fullHash = await sha256Hex(fpSeed);
  const fingerprint = fullHash.slice(0, 16);

  const localSeal = (
    await sha256Hex(
      buildCanonicalSealInput({
        payload: input.payload,
        name: safeName,
        issuedAt,
        fingerprint,
        config: safeConfig,
        source: safeSource,
        experience: input.experience,
      })
    )
  ).slice(0, 32);

  return {
    format: 'sparkqr-card-v1',
    issuer: 'SparkQR',
    fingerprint,
    localSeal,
    hmac: input.hmac,
    issuedAt,
    name: safeName,
    payload: input.payload,
    source: safeSource,
    config: safeConfig,
    experience: input.experience,
  };
}

export async function verifyLocalSparkQrBundle(
  candidate: unknown
): Promise<{ valid: boolean; bundle?: SparkQrAuthenticBundle; reason?: string }> {
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, reason: 'Métadonnées SparkQR absentes.' };
  }
  const obj = candidate as Partial<SparkQrAuthenticBundle>;
  if (obj.format !== 'sparkqr-card-v1' || obj.issuer !== 'SparkQR') {
    return { valid: false, reason: 'Signature SparkQR non reconnue.' };
  }
  if (
    typeof obj.payload !== 'string' ||
    !obj.payload.trim() ||
    typeof obj.fingerprint !== 'string' ||
    !/^[0-9a-f]{16}$/i.test(obj.fingerprint) ||
    typeof obj.localSeal !== 'string' ||
    !obj.config ||
    !obj.source
  ) {
    return { valid: false, reason: 'Structure SparkQR incomplète ou altérée.' };
  }

  const expectedSeal = (
    await sha256Hex(
      buildCanonicalSealInput({
        payload: obj.payload,
        name: obj.name || '',
        issuedAt: obj.issuedAt || '',
        fingerprint: obj.fingerprint,
        config: obj.config,
        source: obj.source,
        experience: obj.experience,
      })
    )
  ).slice(0, 32);

  if (expectedSeal.toLowerCase() !== obj.localSeal.toLowerCase()) {
    return { valid: false, reason: 'Intégrité du code QR SparkQR invalide.' };
  }

  return { valid: true, bundle: obj as SparkQrAuthenticBundle };
}

export function isPngBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

export function injectSparkQrChunkIntoPngBytes(
  pngBytes: Uint8Array,
  bundle: SparkQrAuthenticBundle
): Uint8Array {
  if (!isPngBytes(pngBytes)) return pngBytes;

  const encodedPayload = utf8ToBase64(JSON.stringify(bundle));
  const keyBytes = new TextEncoder().encode(PNG_CHUNK_KEYWORD);
  const valBytes = new TextEncoder().encode(encodedPayload);
  const chunkData = new Uint8Array(keyBytes.length + 1 + valBytes.length);
  chunkData.set(keyBytes, 0);
  chunkData[keyBytes.length] = 0; // NULL separator for PNG tEXt
  chunkData.set(valBytes, keyBytes.length + 1);

  const typeBytes = new TextEncoder().encode('tEXt');
  const typeAndData = new Uint8Array(4 + chunkData.length);
  typeAndData.set(typeBytes, 0);
  typeAndData.set(chunkData, 4);
  const chunkCrc = crc32(typeAndData);

  const fullChunk = new Uint8Array(4 + 4 + chunkData.length + 4);
  writeUint32BE(fullChunk, 0, chunkData.length);
  fullChunk.set(typeAndData, 4);
  writeUint32BE(fullChunk, 8 + chunkData.length, chunkCrc);

  // Locate IEND chunk and insert right before it
  let offset = 8;
  while (offset + 12 <= pngBytes.length) {
    const length = readUint32BE(pngBytes, offset);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7]
    );
    const nextOffset = offset + 12 + length;
    if (type === 'IEND') {
      const out = new Uint8Array(pngBytes.length + fullChunk.length);
      out.set(pngBytes.subarray(0, offset), 0);
      out.set(fullChunk, offset);
      out.set(pngBytes.subarray(offset), offset + fullChunk.length);
      return out;
    }
    if (nextOffset <= offset || nextOffset > pngBytes.length) break;
    offset = nextOffset;
  }
  return pngBytes;
}

export function extractSparkQrChunkFromPngBytes(
  pngBytes: Uint8Array
): Record<string, unknown> | null {
  if (!isPngBytes(pngBytes)) return null;
  let offset = 8;
  while (offset + 12 <= pngBytes.length) {
    const length = readUint32BE(pngBytes, offset);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7]
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > pngBytes.length) break;

    if (type === 'tEXt') {
      const data = pngBytes.subarray(dataStart, dataEnd);
      const nullIdx = data.indexOf(0);
      if (nullIdx > 0) {
        const keyword = new TextDecoder('latin1').decode(data.subarray(0, nullIdx));
        if (keyword === PNG_CHUNK_KEYWORD) {
          const valB64 = new TextDecoder('latin1').decode(data.subarray(nullIdx + 1));
          try {
            const jsonText = base64ToUtf8(valB64);
            const parsed = JSON.parse(jsonText);
            if (parsed && typeof parsed === 'object') {
              return parsed as Record<string, unknown>;
            }
          } catch {
            return null;
          }
        }
      }
    }
    if (type === 'IEND') break;
    offset = dataEnd + 4;
  }
  return null;
}

function fingerprintToBits(fingerprintHex: string): number[] {
  const clean = fingerprintHex.replace(/[^0-9a-f]/gi, '').padEnd(16, '0').slice(0, 16);
  const bits: number[] = [];
  for (let i = 31; i >= 0; i--) {
    bits.push((OPTICAL_MAGIC >>> i) & 1);
  }
  for (let i = 0; i < clean.length; i++) {
    const nibble = parseInt(clean[i], 16) || 0;
    for (let b = 3; b >= 0; b--) {
      bits.push((nibble >> b) & 1);
    }
  }
  return bits; // 96 bits total
}

function bitsToOpticalResult(bits: number[]): { detected: true; fingerprint: string } | null {
  if (bits.length < 96) return null;
  let magic = 0;
  for (let i = 0; i < 32; i++) {
    magic = ((magic << 1) | bits[i]) >>> 0;
  }
  // Allow up to 1 bit flip from lossy JPEG compression
  const xorMagic = (magic ^ OPTICAL_MAGIC) >>> 0;
  let diffBits = 0;
  for (let i = 0; i < 32; i++) {
    if ((xorMagic >>> i) & 1) diffBits++;
  }
  if (diffBits > 1) return null;

  let hex = '';
  for (let n = 0; n < 16; n++) {
    const base = 32 + n * 4;
    const nibble =
      (bits[base] << 3) | (bits[base + 1] << 2) | (bits[base + 2] << 1) | bits[base + 3];
    hex += nibble.toString(16);
  }
  return { detected: true, fingerprint: hex };
}

/**
 * Embeds a subtle differential luminance optical watermark (96 bits: SQR1 + 64-bit fingerprint)
 * along outer quiet edge strips so exported SparkQR images survive JPG/WEBP re-encoding.
 */
export function embedOpticalSparkQrWatermark(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  fingerprintHex: string
): void {
  const bits = fingerprintToBits(fingerprintHex); // 96 bits
  if (width < 420 || height < 420) return;

  const blockW = Math.max(2, Math.floor((width - 32) / (bits.length * 2)));
  const startX = Math.floor((width - bits.length * blockW * 2) / 2);
  const stripsY = [3, 6, Math.max(10, height - 7)];
  const delta = 8;

  for (const rowY of stripsY) {
    if (rowY + 2 >= height) continue;
    for (let i = 0; i < bits.length; i++) {
      const bit = bits[i];
      const ax = startX + i * blockW * 2;
      const bx = ax + blockW;
      const dA = bit === 1 ? delta : -delta;
      const dB = -dA;

      for (let dy = 0; dy < 2; dy++) {
        const y = rowY + dy;
        for (let dx = 0; dx < blockW; dx++) {
          const idxA = (y * width + (ax + dx)) * 4;
          const idxB = (y * width + (bx + dx)) * 4;
          if (rgba[idxA + 3] > 200) {
            for (let c = 0; c < 3; c++) {
              rgba[idxA + c] = Math.max(0, Math.min(255, rgba[idxA + c] + dA));
            }
          }
          if (rgba[idxB + 3] > 200) {
            for (let c = 0; c < 3; c++) {
              rgba[idxB + c] = Math.max(0, Math.min(255, rgba[idxB + c] + dB));
            }
          }
        }
      }
    }
  }
}

export function extractOpticalSparkQrWatermark(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): { detected: boolean; fingerprint?: string } {
  const totalBits = 96;
  if (width < 420 || height < 420) return { detected: false };

  const blockW = Math.max(2, Math.floor((width - 32) / (totalBits * 2)));
  const startX = Math.floor((width - totalBits * blockW * 2) / 2);
  const stripsY = [3, 6, Math.max(10, height - 7)];

  const readStrip = (rowY: number): number[] | null => {
    if (rowY + 2 >= height) return null;
    const out: number[] = [];
    for (let i = 0; i < totalBits; i++) {
      const ax = startX + i * blockW * 2;
      const bx = ax + blockW;
      let sumA = 0;
      let sumB = 0;
      let count = 0;
      for (let dy = 0; dy < 2; dy++) {
        const y = rowY + dy;
        for (let dx = 0; dx < blockW; dx++) {
          const idxA = (y * width + (ax + dx)) * 4;
          const idxB = (y * width + (bx + dx)) * 4;
          const lumA = rgba[idxA] * 0.299 + rgba[idxA + 1] * 0.587 + rgba[idxA + 2] * 0.114;
          const lumB = rgba[idxB] * 0.299 + rgba[idxB + 1] * 0.587 + rgba[idxB + 2] * 0.114;
          sumA += lumA;
          sumB += lumB;
          count++;
        }
      }
      if (count === 0) return null;
      out.push(sumA >= sumB ? 1 : 0);
    }
    return out;
  };

  const stripBits: number[][] = [];
  for (const rowY of stripsY) {
    const bits = readStrip(rowY);
    if (!bits) continue;
    const directHit = bitsToOpticalResult(bits);
    if (directHit) return directHit;
    stripBits.push(bits);
  }

  if (stripBits.length >= 2) {
    const voted: number[] = [];
    for (let i = 0; i < totalBits; i++) {
      const ones = stripBits.reduce((acc, s) => acc + s[i], 0);
      voted.push(ones * 2 >= stripBits.length ? 1 : 0);
    }
    const votedHit = bitsToOpticalResult(voted);
    if (votedHit) return votedHit;
  }

  return { detected: false };
}

const LOCAL_SPARKQR_MARKS_KEY = 'sparkqr_local_marks_v1';

export function rememberLocalSparkQrBundle(bundle: SparkQrAuthenticBundle): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LOCAL_SPARKQR_MARKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, SparkQrAuthenticBundle>) : {};
    const map: Record<string, SparkQrAuthenticBundle> =
      parsed && typeof parsed === 'object' ? parsed : {};
    map[bundle.fingerprint.toLowerCase()] = bundle;

    const entries = Object.entries(map);
    if (entries.length > 40) {
      entries.sort(
        (a, b) => Date.parse(b[1]?.issuedAt || '') - Date.parse(a[1]?.issuedAt || '')
      );
      const trimmed: Record<string, SparkQrAuthenticBundle> = {};
      for (const [k, v] of entries.slice(0, 40)) {
        trimmed[k] = v;
      }
      localStorage.setItem(LOCAL_SPARKQR_MARKS_KEY, JSON.stringify(trimmed));
      return;
    }

    localStorage.setItem(LOCAL_SPARKQR_MARKS_KEY, JSON.stringify(map));
  } catch {
    // Ignore localStorage quota/availability errors
  }
}

export function lookupLocalSparkQrBundleByFingerprint(
  fingerprint: string
): SparkQrAuthenticBundle | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const fp = (fingerprint || '').trim().toLowerCase();
    if (!/^[0-9a-f]{16}$/.test(fp)) return null;
    const raw = localStorage.getItem(LOCAL_SPARKQR_MARKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, SparkQrAuthenticBundle>;
    const candidate = parsed?.[fp];
    return candidate && typeof candidate === 'object' ? candidate : null;
  } catch {
    return null;
  }
}

export async function signSparkQrBundleViaServer(
  bundle: SparkQrAuthenticBundle
): Promise<SparkQrAuthenticBundle> {
  try {
    const res = await fetch('/api/sparkqr/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle }),
    });
    if (!res.ok) return bundle;
    const data = (await res.json()) as { hmac?: string };
    if (typeof data.hmac === 'string' && data.hmac) {
      return { ...bundle, hmac: data.hmac };
    }
    return bundle;
  } catch {
    return bundle;
  }
}

export async function verifySparkQrViaServer(params: {
  bundle?: SparkQrAuthenticBundle | Record<string, unknown> | null;
  fingerprint?: string;
}): Promise<{
  authentic: boolean;
  bundle?: SparkQrAuthenticBundle;
  reason?: string;
  networkError?: boolean;
}> {
  try {
    const res = await fetch('/api/sparkqr/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      return { authentic: false, networkError: res.status >= 500 };
    }
    return (await res.json()) as {
      authentic: boolean;
      bundle?: SparkQrAuthenticBundle;
      reason?: string;
    };
  } catch {
    return { authentic: false, networkError: true };
  }
}
