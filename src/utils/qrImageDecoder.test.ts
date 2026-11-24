import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQrMatrix } from './qrLogic';
import { decodeQrFromRgbaBuffer } from './qrImageDecoder';

function renderTestQrBuffer(params: {
  payload: string;
  ecc?: 'L' | 'M' | 'Q' | 'H';
  scale?: number;
  margin?: number;
  bgRgb: [number, number, number];
  fgGradient: (rNorm: number, cNorm: number) => [number, number, number];
  laserRowRatio?: number;
  centerLogoKnockout?: boolean;
}): { data: Uint8ClampedArray; width: number; height: number } {
  const matrix = generateQrMatrix(params.payload, params.ecc ?? 'H');
  const margin = params.margin ?? 4;
  const scale = params.scale ?? 8;
  const dim = (matrix.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4);

  // Fill background
  for (let i = 0; i < dim * dim; i++) {
    data[i * 4] = params.bgRgb[0];
    data[i * 4 + 1] = params.bgRgb[1];
    data[i * 4 + 2] = params.bgRgb[2];
    data[i * 4 + 3] = 255;
  }

  const center = (matrix.size - 1) / 2;
  const halfLogo = (matrix.size * 0.2) / 2;

  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.modules[r][c]) continue;
      if (
        params.centerLogoKnockout &&
        Math.abs(r - center) <= halfLogo &&
        Math.abs(c - center) <= halfLogo
      ) {
        continue;
      }
      const [fgR, fgG, fgB] = params.fgGradient(r / matrix.size, c / matrix.size);
      const sx = (c + margin) * scale;
      const sy = (r + margin) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const idx = ((sy + dy) * dim + (sx + dx)) * 4;
          data[idx] = fgR;
          data[idx + 1] = fgG;
          data[idx + 2] = fgB;
          data[idx + 3] = 255;
        }
      }
    }
  }

  // Simulate glowing horizontal laser beam + halo across the QR code
  if (typeof params.laserRowRatio === 'number') {
    const beamY = Math.round(dim * params.laserRowRatio);
    for (let y = Math.max(0, beamY - 20); y < Math.min(dim, beamY + 20); y++) {
      const dist = Math.abs(y - beamY);
      const strength = dist <= 2 ? 0.88 : Math.max(0, (1 - dist / 20) * 0.55);
      for (let x = 0; x < dim; x++) {
        const idx = (y * dim + x) * 4;
        data[idx] = Math.round(data[idx] + (255 - data[idx]) * strength);
        data[idx + 1] = Math.round(data[idx + 1] + (255 - data[idx + 1]) * strength);
        data[idx + 2] = Math.round(data[idx + 2] + (255 - data[idx + 2]) * strength);
      }
    }
  }

  return { data, width: dim, height: dim };
}

test('decodeQrFromRgbaBuffer decodes classic black-on-white QR code', () => {
  const payload = 'https://kromaqr-studio.onrender.com/promo';
  const buf = renderTestQrBuffer({
    payload,
    ecc: 'M',
    bgRgb: [255, 255, 255],
    fgGradient: () => [17, 18, 20],
  });
  const res = decodeQrFromRgbaBuffer(buf.data, buf.width, buf.height);
  assert.ok(res);
  assert.equal(res.payload, payload);
});

test('decodeQrFromRgbaBuffer decodes dark obsidian + 24K gold SparkQR with horizontal laser beam and center logo', () => {
  const payload = 'https://kromaqr-studio.onrender.com/m/vip24k#k=SecretKey123';
  const buf = renderTestQrBuffer({
    payload,
    ecc: 'H',
    bgRgb: [12, 11, 9],
    fgGradient: (r, c) => {
      const t = (r + c) / 2;
      return [
        Math.round(245 - t * 35),
        Math.round(208 - t * 50),
        Math.round(97 - t * 40),
      ];
    },
    laserRowRatio: 0.48,
    centerLogoKnockout: true,
  });
  const res = decodeQrFromRgbaBuffer(buf.data, buf.width, buf.height);
  assert.ok(res, 'Expected laser + logo + gold-on-obsidian QR to decode cleanly');
  assert.equal(res.payload, payload);
});

test('decodeQrFromRgbaBuffer decodes neon cyan-to-lime gradient SparkQR on dark navy with laser', () => {
  const payload = 'WIFI:T:WPA;S:SparkStudio5G;P:MotDePasse2026;;';
  const buf = renderTestQrBuffer({
    payload,
    ecc: 'H',
    bgRgb: [4, 11, 20],
    fgGradient: (_r, c) => [
      Math.round(34 + c * (163 - 34)),
      Math.round(211 + c * (230 - 211)),
      Math.round(238 + c * (53 - 238)),
    ],
    laserRowRatio: 0.62,
  });
  const res = decodeQrFromRgbaBuffer(buf.data, buf.width, buf.height);
  assert.ok(res, 'Expected gradient neon QR with laser to decode cleanly');
  assert.equal(res.payload, payload);
});

test('decodeQrFromRgbaBuffer rejects non-QR graphic patterns strictly', () => {
  const width = 260;
  const height = 260;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = (x * 255) / width;
      data[idx + 1] = (y * 255) / height;
      data[idx + 2] = 180;
      data[idx + 3] = 255;
    }
  }
  const res = decodeQrFromRgbaBuffer(data, width, height);
  assert.equal(res, null);
});
