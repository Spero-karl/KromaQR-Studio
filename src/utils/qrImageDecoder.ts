import { verifyQrDecodeFromImageData } from './qrLogic';
import {
  extractOpticalSparkQrWatermark,
  extractSparkQrChunkFromPngBytes,
  verifyLocalSparkQrBundle,
  verifySparkQrViaServer,
} from './sparkqrMark';

export interface QrDecodeAttemptOptions {
  allowAdaptive?: boolean;
  allowColorDistance?: boolean;
  allowChannels?: boolean;
}

export interface DecodedQrImageResult {
  payload: string;
  strategy:
    | 'direct'
    | 'adaptive-laser'
    | 'color-distance'
    | 'channel-split'
    | 'global-threshold'
    | 'dark-backdrop'
    | 'card-crop'
    | 'svg-metadata';
  sparkQrMetadata?: Record<string, unknown> | null;
  sparkQrAuthentic?: boolean;
  sparkQrFingerprint?: string;
  sparkQrRejectReason?: string;
}

/**
 * Global luminance binarization helper.
 */
export function thresholdImageData(
  src: Uint8ClampedArray,
  cutoff: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const luma = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
    const val = luma < cutoff ? 0 : 255;
    out[i] = val;
    out[i + 1] = val;
    out[i + 2] = val;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Bradley-Roth fast 2D integral-image adaptive threshold.
 * Neutralizes bright horizontal laser beams, glowing halos, gradients, and uneven shadows.
 */
export function adaptiveThresholdImageData(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  sensitivity = 0.11
): Uint8ClampedArray {
  const len = width * height;
  const gray = new Float64Array(len);
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const yOff = y * width;
    const intYOff = (y + 1) * (width + 1);
    const prevIntYOff = y * (width + 1);
    for (let x = 0; x < width; x++) {
      const idx = (yOff + x) * 4;
      const lum = src[idx] * 0.299 + src[idx + 1] * 0.587 + src[idx + 2] * 0.114;
      gray[yOff + x] = lum;
      rowSum += lum;
      integral[intYOff + x + 1] = integral[prevIntYOff + x + 1] + rowSum;
    }
  }

  const radius = Math.max(8, Math.round(Math.min(width, height) / 22));
  const factor = 1 - sensitivity;
  const out = new Uint8ClampedArray(src.length);

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(height - 1, y + radius);
    const r1 = y1 * (width + 1);
    const r2 = (y2 + 1) * (width + 1);

    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(width - 1, x + radius);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[r2 + x2 + 1] -
        integral[r2 + x1] -
        integral[r1 + x2 + 1] +
        integral[r1 + x1];
      const mean = sum / count;
      const val = gray[y * width + x] < mean * factor ? 0 : 255;
      const pIdx = (y * width + x) * 4;
      out[pIdx] = val;
      out[pIdx + 1] = val;
      out[pIdx + 2] = val;
      out[pIdx + 3] = 255;
    }
  }

  return out;
}

/**
 * Estimates dominant quiet-zone / background RGB from outer perimeter pixels
 * and separates colored or gradient QR modules by Euclidean color distance.
 */
export function colorDistanceThresholdData(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  minDistance = 44
): Uint8ClampedArray {
  const samplePoints: Array<[number, number]> = [
    [2, 2],
    [Math.max(0, width - 3), 2],
    [2, Math.max(0, height - 3)],
    [Math.max(0, width - 3), Math.max(0, height - 3)],
    [Math.floor(width / 2), 2],
    [Math.floor(width / 2), Math.max(0, height - 3)],
    [2, Math.floor(height / 2)],
    [Math.max(0, width - 3), Math.floor(height / 2)],
  ];

  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const [sx, sy] of samplePoints) {
    const idx = (sy * width + sx) * 4;
    bgR += src[idx];
    bgG += src[idx + 1];
    bgB += src[idx + 2];
  }
  bgR /= samplePoints.length;
  bgG /= samplePoints.length;
  bgB /= samplePoints.length;

  const distSqLimit = minDistance * minDistance;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const dr = src[i] - bgR;
    const dg = src[i + 1] - bgG;
    const db = src[i + 2] - bgB;
    const distSq = dr * dr + dg * dg + db * db;
    // Modules differ strongly from background -> render black modules on white quiet zone
    const val = distSq >= distSqLimit ? 0 : 255;
    out[i] = val;
    out[i + 1] = val;
    out[i + 2] = val;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Extracts a single RGB color channel as monochrome RGBA buffer for saturated color modules.
 */
export function extractChannelBuffer(
  src: Uint8ClampedArray,
  channelIndex: 0 | 1 | 2
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const v = src[i + channelIndex];
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Pure RGBA buffer multi-strategy QR decoder usable in both browser and unit tests.
 */
export function decodeQrFromRgbaBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: QrDecodeAttemptOptions
): { payload: string; strategy: DecodedQrImageResult['strategy'] } | null {
  const direct = verifyQrDecodeFromImageData(data, width, height);
  if (direct) return { payload: direct, strategy: 'direct' };

  if (options?.allowAdaptive !== false) {
    for (const sensitivity of [0.1, 0.05, 0.16]) {
      const adaptive = adaptiveThresholdImageData(data, width, height, sensitivity);
      const decoded = verifyQrDecodeFromImageData(adaptive, width, height);
      if (decoded) return { payload: decoded, strategy: 'adaptive-laser' };
    }
  }

  if (options?.allowColorDistance !== false) {
    for (const dist of [42, 68, 26]) {
      const distBuf = colorDistanceThresholdData(data, width, height, dist);
      const decoded = verifyQrDecodeFromImageData(distBuf, width, height);
      if (decoded) return { payload: decoded, strategy: 'color-distance' };
    }
  }

  for (const cutoff of [125, 165, 85, 200]) {
    const bin = thresholdImageData(data, cutoff);
    const decoded = verifyQrDecodeFromImageData(bin, width, height);
    if (decoded) return { payload: decoded, strategy: 'global-threshold' };
  }

  if (options?.allowChannels !== false) {
    for (const ch of [0, 1, 2] as const) {
      const chBuf = extractChannelBuffer(data, ch);
      const directCh = verifyQrDecodeFromImageData(chBuf, width, height);
      if (directCh) return { payload: directCh, strategy: 'channel-split' };
      const adaptCh = adaptiveThresholdImageData(chBuf, width, height, 0.1);
      const adaptDecoded = verifyQrDecodeFromImageData(adaptCh, width, height);
      if (adaptDecoded) return { payload: adaptDecoded, strategy: 'channel-split' };
    }
  }

  return null;
}

function bufferHasTransparency(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 64) {
    if (data[i] < 245) return true;
  }
  return false;
}

function tryExtractSvgMetadata(svgText: string): Record<string, unknown> | null {
  try {
    const match = svgText.match(
      /<metadata[^>]*data-sparkqr-meta=["']1["'][^>]*>([\s\S]*?)<\/metadata>/i
    );
    if (!match?.[1]) return null;
    const raw = match[1]
      .trim()
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/i, '$1')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function drawRegionAndDecode(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  pad: number,
  backdrop: string,
  opts?: QrDecodeAttemptOptions
): { payload: string; strategy: DecodedQrImageResult['strategy'] } | null {
  canvas.width = dw + pad * 2;
  canvas.height = dh + pad * 2;
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, pad, pad, dw, dh);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return decodeQrFromRgbaBuffer(imgData.data, canvas.width, canvas.height, opts);
}

async function verifyExtractedSparkQrAuthenticity(params: {
  decodedPayload: string;
  rawMetadata: Record<string, unknown> | null;
  opticalFingerprint?: string;
}): Promise<{
  authentic: boolean;
  bundle: Record<string, unknown> | null;
  fingerprint?: string;
  rejectReason?: string;
}> {
  if (params.rawMetadata) {
    const localCheck = await verifyLocalSparkQrBundle(params.rawMetadata);
    if (!localCheck.valid || !localCheck.bundle) {
      return {
        authentic: false,
        bundle: null,
        rejectReason:
          localCheck.reason ||
          'Cette image ne comporte pas une signature SparkQR valide.',
      };
    }
    if (
      localCheck.bundle.payload.trim() !== params.decodedPayload.trim()
    ) {
      return {
        authentic: false,
        bundle: null,
        rejectReason:
          'Le contenu du QR code ne correspond pas aux attributs signés SparkQR.',
      };
    }
    if (localCheck.bundle.hmac) {
      const serverCheck = await verifySparkQrViaServer({ bundle: localCheck.bundle });
      if (serverCheck && serverCheck.reason === 'invalid-hmac') {
        return {
          authentic: false,
          bundle: null,
          rejectReason: 'Signature SparkQR invalide ou modifiée.',
        };
      }
    }
    return {
      authentic: true,
      bundle: localCheck.bundle as unknown as Record<string, unknown>,
      fingerprint: localCheck.bundle.fingerprint,
    };
  }

  if (params.opticalFingerprint) {
    const recovered = await verifySparkQrViaServer({
      fingerprint: params.opticalFingerprint,
    });
    if (recovered.authentic && recovered.bundle) {
      if (recovered.bundle.payload.trim() === params.decodedPayload.trim()) {
        return {
          authentic: true,
          bundle: recovered.bundle as unknown as Record<string, unknown>,
          fingerprint: recovered.bundle.fingerprint,
        };
      }
    }
  }

  return {
    authentic: false,
    bundle: null,
    fingerprint: params.opticalFingerprint,
    rejectReason:
      'Seules les images de codes QR générées par SparkQR sont acceptées dans l’importateur.',
  };
}

/**
 * Browser intelligent QR image decoder for SparkQR customized cards (laser beams,
 * energy waves, gradients, colors, logos, decorations, transparent SVGs/PNGs).
 */
export async function decodeQrImageFile(file: File): Promise<DecodedQrImageResult> {
  const lowerName = file.name.toLowerCase();
  const isSvg = file.type === 'image/svg+xml' || lowerName.endsWith('.svg');
  const isPng = file.type === 'image/png' || lowerName.endsWith('.png');
  const isAllowedImage =
    isSvg ||
    isPng ||
    file.type === 'image/jpeg' ||
    file.type === 'image/webp' ||
    /\.(png|jpe?g|webp|svg)$/i.test(lowerName);

  if (!isAllowedImage) {
    throw new Error(
      'Format refusé. Importez uniquement une image de code QR générée par SparkQR (PNG, JPG, WEBP ou SVG).'
    );
  }

  let sparkQrMetadata: Record<string, unknown> | null = null;
  let svgQrCropAttrs: { x: number; y: number; size: number; vbW: number; vbH: number } | null = null;

  if (isSvg) {
    try {
      const svgText = await file.text();
      sparkQrMetadata = tryExtractSvgMetadata(svgText);
      const vbMatch = svgText.match(/viewBox=["']\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*["']/i);
      const qx = svgText.match(/data-qr-x=["']([\d.\-]+)["']/i);
      const qy = svgText.match(/data-qr-y=["']([\d.\-]+)["']/i);
      const qs = svgText.match(/data-qr-size=["']([\d.\-]+)["']/i);
      if (vbMatch && qx && qy && qs) {
        svgQrCropAttrs = {
          vbW: Number(vbMatch[3]) || 400,
          vbH: Number(vbMatch[4]) || 504,
          x: Number(qx[1]),
          y: Number(qy[1]),
          size: Number(qs[1]),
        };
      }
    } catch {
      // Ignore SVG pre-inspection error
    }
  } else if (isPng) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      sparkQrMetadata = extractSparkQrChunkFromPngBytes(bytes);
    } catch {
      // Ignore PNG chunk read error
    }
  }

  const decoded = await new Promise<{
    payload: string;
    strategy: DecodedQrImageResult['strategy'];
    opticalFingerprint?: string;
  }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width || 960;
        const natH = img.naturalHeight || img.height || 960;
        let opticalFingerprint: string | undefined;

        if (!sparkQrMetadata && natW >= 420 && natH >= 420 && natW <= 3000 && natH <= 3000) {
          try {
            const natCanvas = document.createElement('canvas');
            natCanvas.width = natW;
            natCanvas.height = natH;
            const natCtx = natCanvas.getContext('2d', { willReadFrequently: true });
            if (natCtx) {
              natCtx.drawImage(img, 0, 0, natW, natH);
              const natPixels = natCtx.getImageData(0, 0, natW, natH);
              const optical = extractOpticalSparkQrWatermark(natPixels.data, natW, natH);
              if (optical.detected && optical.fingerprint) {
                opticalFingerprint = optical.fingerprint;
              }
            }
          } catch {
            // Non-blocking optical watermark check
          }
        }

        const maxSide = 1280;
        const minSide = 480;
        const rawMax = Math.max(natW, natH, 1);
        const scale =
          rawMax > maxSide
            ? maxSide / rawMax
            : rawMax < minSide
            ? minSide / rawMax
            : 1;
        const width = Math.max(240, Math.round(natW * scale));
        const height = Math.max(240, Math.round(natH * scale));

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas indisponible pour analyser cette image.'));
          return;
        }

        // Check whether image contains transparent regions first
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const rawAlphaProbe = ctx.getImageData(0, 0, width, height);
        const hasAlpha = bufferHasTransparency(rawAlphaProbe.data);

        // Pass 1: Full image on white backdrop (with direct + adaptive laser + color distance)
        const pass1 = drawRegionAndDecode(
          canvas,
          ctx,
          img,
          0,
          0,
          natW,
          natH,
          width,
          height,
          0,
          '#FFFFFF'
        );
        if (pass1) {
          URL.revokeObjectURL(objectUrl);
          resolve({ ...pass1, opticalFingerprint });
          return;
        }

        // Pass 2: Full image with +56px quiet-zone white padding
        const pass2 = drawRegionAndDecode(
          canvas,
          ctx,
          img,
          0,
          0,
          natW,
          natH,
          width,
          height,
          56,
          '#FFFFFF',
          { allowChannels: false }
        );
        if (pass2) {
          URL.revokeObjectURL(objectUrl);
          resolve({ ...pass2, opticalFingerprint });
          return;
        }

        // Pass 3: Dark backdrop for transparent light/gold/pastel SVG or PNG exports
        if (hasAlpha) {
          const passDark = drawRegionAndDecode(
            canvas,
            ctx,
            img,
            0,
            0,
            natW,
            natH,
            width,
            height,
            56,
            '#0B0F1A'
          );
          if (passDark) {
            URL.revokeObjectURL(objectUrl);
            resolve({
              payload: passDark.payload,
              strategy: 'dark-backdrop',
              opticalFingerprint,
            });
            return;
          }
        }

        // Pass 4: Exact SVG QR box if annotated by SparkQR
        if (svgQrCropAttrs && svgQrCropAttrs.size > 0) {
          const rx = (svgQrCropAttrs.x / svgQrCropAttrs.vbW) * natW;
          const ry = (svgQrCropAttrs.y / svgQrCropAttrs.vbH) * natH;
          const rw = (svgQrCropAttrs.size / svgQrCropAttrs.vbW) * natW;
          const rh = (svgQrCropAttrs.size / svgQrCropAttrs.vbH) * natH;
          for (const bg of hasAlpha ? ['#FFFFFF', '#0B0F1A'] : ['#FFFFFF']) {
            const svgBoxHit = drawRegionAndDecode(
              canvas,
              ctx,
              img,
              rx,
              ry,
              rw,
              rh,
              760,
              760,
              56,
              bg
            );
            if (svgBoxHit) {
              URL.revokeObjectURL(objectUrl);
              resolve({
                payload: svgBoxHit.payload,
                strategy: 'card-crop',
                opticalFingerprint,
              });
              return;
            }
          }
        }

        // Pass 5: SparkQR card & screenshot crops (top-title, bottom-title, center-tight)
        const minDim = Math.min(natW, natH);
        const cropRegions: Array<[number, number, number, number]> = [
          [
            Math.round((natW - natW * 0.84) / 2),
            Math.round((natH - natH * 0.78) / 2),
            Math.max(120, Math.round(natW * 0.84)),
            Math.max(120, Math.round(natH * 0.78)),
          ],
          [
            Math.round((natW - minDim * 0.82) / 2),
            Math.round(natH * 0.18),
            Math.max(120, Math.round(minDim * 0.82)),
            Math.min(natH - Math.round(natH * 0.18), Math.max(120, Math.round(minDim * 0.82))),
          ],
          [
            Math.round((natW - minDim * 0.82) / 2),
            Math.round(natH * 0.04),
            Math.max(120, Math.round(minDim * 0.82)),
            Math.min(natH - Math.round(natH * 0.04), Math.max(120, Math.round(minDim * 0.82))),
          ],
          [
            Math.round((natW - minDim * 0.62) / 2),
            Math.round((natH - minDim * 0.62) / 2),
            Math.max(120, Math.round(minDim * 0.62)),
            Math.max(120, Math.round(minDim * 0.62)),
          ],
        ];

        for (const [cx, cy, cw, ch] of cropRegions) {
          for (const bg of hasAlpha ? ['#FFFFFF', '#0B0F1A'] : ['#FFFFFF']) {
            const cropHit = drawRegionAndDecode(
              canvas,
              ctx,
              img,
              Math.max(0, cx),
              Math.max(0, cy),
              cw,
              ch,
              560,
              560,
              48,
              bg,
              { allowChannels: false }
            );
            if (cropHit) {
              URL.revokeObjectURL(objectUrl);
              resolve({
                payload: cropHit.payload,
                strategy: 'card-crop',
                opticalFingerprint,
              });
              return;
            }
          }
        }

        URL.revokeObjectURL(objectUrl);
        reject(
          new Error(
            'Aucun QR code décodable détecté dans cette image. Vérifiez que les modules et les trois coins de repérage restent visibles.'
          )
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(
          err instanceof Error
            ? err
            : new Error('Impossible d’analyser l’image importée.')
        );
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Format d’image non reconnu ou fichier corrompu.'));
    };

    img.src = objectUrl;
  });

  const auth = await verifyExtractedSparkQrAuthenticity({
    decodedPayload: decoded.payload,
    rawMetadata: sparkQrMetadata,
    opticalFingerprint: decoded.opticalFingerprint,
  });

  return {
    payload: decoded.payload,
    strategy: decoded.strategy,
    sparkQrMetadata: auth.bundle,
    sparkQrAuthentic: auth.authentic,
    sparkQrFingerprint: auth.fingerprint,
    sparkQrRejectReason: auth.rejectReason,
  };
}
