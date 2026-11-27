import { jsPDF } from 'jspdf';
import type { ExportOptions, PostScanExperience, QrConfig, QrSourceState } from '../types/qr';
import { decodeQrFromRgbaBuffer } from './qrImageDecoder';
import {
  createSparkQrAuthenticBundle,
  embedOpticalSparkQrWatermark,
  injectSparkQrChunkIntoPngBytes,
  rememberLocalSparkQrBundle,
  signSparkQrBundleViaServer,
  type SparkQrAuthenticBundle,
} from './sparkqrMark';

async function inlineSvgImages(svgClone: SVGSVGElement): Promise<void> {
  const images = Array.from(svgClone.querySelectorAll('image'));
  await Promise.all(
    images.map(async (img) => {
      const href =
        img.getAttribute('href') ||
        img.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (!href || href.startsWith('data:')) return;
      try {
        const res = await fetch(href);
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(blob);
        });
        if (dataUrl) {
          img.setAttribute('href', dataUrl);
        }
      } catch {
        // Keep original href if fetch fails
      }
    })
  );
}

function getSvgCropBox(
  svgEl: SVGSVGElement,
  scope: 'card' | 'qr-only'
): { x: number; y: number; width: number; height: number } {
  const viewBox = svgEl.viewBox.baseVal;
  const vbWidth = viewBox && viewBox.width > 0 ? viewBox.width : 400;
  const vbHeight = viewBox && viewBox.height > 0 ? viewBox.height : 504;

  if (scope === 'qr-only') {
    const qx = Number(svgEl.getAttribute('data-qr-x'));
    const qy = Number(svgEl.getAttribute('data-qr-y'));
    const qs = Number(svgEl.getAttribute('data-qr-size'));
    if (Number.isFinite(qx) && Number.isFinite(qy) && Number.isFinite(qs) && qs > 0) {
      return { x: qx, y: qy, width: qs, height: qs };
    }
  }
  return { x: 0, y: 0, width: vbWidth, height: vbHeight };
}

export interface SparkQrSvgMetadata {
  name?: string;
  payload: string;
  source?: unknown;
  config?: unknown;
  experience?: unknown;
}

async function resolveAuthenticBundle(
  meta?: SparkQrSvgMetadata | SparkQrAuthenticBundle
): Promise<SparkQrAuthenticBundle | null> {
  if (!meta || !meta.payload || !meta.source || !meta.config) return null;
  if ('format' in meta && meta.format === 'sparkqr-card-v1' && meta.localSeal) {
    return meta;
  }
  const baseBundle = await createSparkQrAuthenticBundle({
    name: meta.name,
    payload: meta.payload,
    source: meta.source as QrSourceState,
    config: meta.config as QrConfig,
    experience: meta.experience as PostScanExperience | undefined,
  });
  const signed = await signSparkQrBundleViaServer(baseBundle);
  rememberLocalSparkQrBundle(signed);
  return signed;
}

export async function serializeSvgForExport(
  svgEl: SVGSVGElement,
  options?: {
    width?: number;
    height?: number;
    scope?: 'card' | 'qr-only';
    transparentBackground?: boolean;
    sparkQrMetadata?: SparkQrSvgMetadata | SparkQrAuthenticBundle;
  }
): Promise<string> {
  const scope = options?.scope ?? 'card';
  const transparent = Boolean(options?.transparentBackground);
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const box = getSvgCropBox(svgEl, scope);
  clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);

  if (scope === 'qr-only') {
    clone.querySelectorAll('[data-card-chrome="true"]').forEach((el) => el.remove());
  }

  if (transparent) {
    clone.querySelectorAll('[data-card-bg="true"], [data-qr-bg="true"]').forEach((el) => {
      el.setAttribute('fill', 'none');
      el.setAttribute('fill-opacity', '0');
    });
  }

  if (options?.sparkQrMetadata) {
    try {
      const authenticBundle = await resolveAuthenticBundle(options.sparkQrMetadata);
      const metaEl = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
      metaEl.setAttribute('data-sparkqr-meta', '1');
      metaEl.textContent = JSON.stringify(authenticBundle || options.sparkQrMetadata);
      clone.insertBefore(metaEl, clone.firstChild);
    } catch {
      // Non-blocking metadata attachment
    }
  }

  clone.setAttribute('width', String(options?.width ?? box.width));
  clone.setAttribute('height', String(options?.height ?? box.height));
  await inlineSvgImages(clone);
  const serializer = new XMLSerializer();
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clone);
}

export async function downloadQrSvg(
  svgEl: SVGSVGElement,
  filename = 'sparkqr-code.svg',
  options?: {
    scope?: 'card' | 'qr-only';
    transparentBackground?: boolean;
    sparkQrMetadata?: SparkQrSvgMetadata;
  }
): Promise<void> {
  const svgString = await serializeSvgForExport(svgEl, options);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function renderSvgToPngData(
  svgEl: SVGSVGElement,
  targetWidth = 1200,
  options?: {
    scope?: 'card' | 'qr-only';
    transparentBackground?: boolean;
    sparkQrMetadata?: SparkQrSvgMetadata;
  }
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const scope = options?.scope ?? 'card';
  const box = getSvgCropBox(svgEl, scope);
  const scale = targetWidth / box.width;
  const width = Math.round(box.width * scale);
  const height = Math.round(box.height * scale);

  const authenticBundle = options?.sparkQrMetadata
    ? await resolveAuthenticBundle(options.sparkQrMetadata)
    : null;

  const svgString = await serializeSvgForExport(svgEl, {
    width,
    height,
    scope,
    transparentBackground: options?.transparentBackground,
  });
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Impossible de convertir le SVG en image.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexte Canvas indisponible.');
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    if (authenticBundle && !options?.transparentBackground) {
      try {
        const imgData = ctx.getImageData(0, 0, width, height);
        embedOpticalSparkQrWatermark(imgData.data, width, height, authenticBundle.fingerprint);
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Non-blocking optical watermark fallback
      }
    }

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const rawPngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Échec de génération PNG.'));
        },
        'image/png',
        1.0
      );
    });

    let finalBlob = rawPngBlob;
    if (authenticBundle) {
      try {
        const bytes = new Uint8Array(await rawPngBlob.arrayBuffer());
        const markedBytes = injectSparkQrChunkIntoPngBytes(bytes, authenticBundle);
        finalBlob = new Blob([markedBytes.slice()], { type: 'image/png' });
      } catch {
        finalBlob = rawPngBlob;
      }
    }

    return { blob: finalBlob, dataUrl, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderSvgToPngBlob(
  svgEl: SVGSVGElement,
  targetWidth = 1200,
  options?: {
    scope?: 'card' | 'qr-only';
    transparentBackground?: boolean;
    sparkQrMetadata?: SparkQrSvgMetadata;
  }
): Promise<Blob> {
  const res = await renderSvgToPngData(svgEl, targetWidth, options);
  return res.blob;
}

export async function downloadQrPng(
  svgEl: SVGSVGElement,
  filename = 'sparkqr-code.png',
  options?: {
    width?: number;
    scope?: 'card' | 'qr-only';
    transparentBackground?: boolean;
    sparkQrMetadata?: SparkQrSvgMetadata;
  }
): Promise<void> {
  const blob = await renderSvgToPngBlob(svgEl, options?.width ?? 1200, {
    scope: options?.scope,
    transparentBackground: options?.transparentBackground,
    sparkQrMetadata: options?.sparkQrMetadata,
  });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadQrPdf(
  svgEl: SVGSVGElement,
  filename = 'sparkqr-code.pdf',
  options?: {
    width?: number;
    scope?: 'card' | 'qr-only';
    transparentBackground?: boolean;
    title?: string;
  }
): Promise<void> {
  const renderWidth = Math.max(1200, options?.width ?? 1800);
  const { dataUrl, width, height } = await renderSvgToPngData(svgEl, renderWidth, {
    scope: options?.scope,
    transparentBackground: options?.transparentBackground,
  });

  // A4 printable layout (210mm x 297mm) with centered high-DPI artwork + subtle cut marks
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageW = 210;
  const pageH = 297;
  const maxArtW = options?.scope === 'qr-only' ? 115 : 130;
  const aspect = height / width;
  const artW = maxArtW;
  const artH = artW * aspect;
  const x = (pageW - artW) / 2;
  const y = Math.max(24, (pageH - artH) / 2 - 6);

  doc.addImage(dataUrl, 'PNG', x, y, artW, artH, undefined, 'FAST');

  // Subtle print registration footer
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 128);
  const caption = options?.title ? `${options.title} — SparkQR` : 'SparkQR';
  doc.text(caption, pageW / 2, y + artH + 14, { align: 'center' });

  doc.save(filename);
}

export async function executeProExport(
  svgEl: SVGSVGElement,
  baseSlug: string,
  options: ExportOptions,
  title?: string,
  sparkQrMetadata?: SparkQrSvgMetadata
): Promise<void> {
  const suffix = options.scope === 'qr-only' ? '-qr' : '';
  const safeBase = baseSlug || 'sparkqr';

  if (options.format === 'svg') {
    await downloadQrSvg(svgEl, `${safeBase}${suffix}.svg`, {
      scope: options.scope,
      transparentBackground: options.transparentBackground,
      sparkQrMetadata,
    });
    return;
  }
  if (options.format === 'pdf') {
    await downloadQrPdf(svgEl, `${safeBase}${suffix}.pdf`, {
      width: options.width,
      scope: options.scope,
      transparentBackground: options.transparentBackground,
      title,
    });
    return;
  }
  await downloadQrPng(svgEl, `${safeBase}${suffix}-${options.width}px.png`, {
    width: options.width,
    scope: options.scope,
    transparentBackground: options.transparentBackground,
    sparkQrMetadata,
  });
}

async function rasterizeAndDecodeSvg(
  svgEl: SVGSVGElement,
  scope: 'card' | 'qr-only',
  scale = 2.2
): Promise<string | null> {
  const box = getSvgCropBox(svgEl, scope);
  const drawW = Math.round(box.width * scale);
  const drawH = Math.round(box.height * scale);
  const pad = Math.round(28 * scale);
  const width = drawW + pad * 2;
  const height = drawH + pad * 2;

  const svgString = await serializeSvgForExport(svgEl, {
    width: drawW,
    height: drawH,
    scope,
  });
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('SVG rasterization failed'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, pad, pad, drawW, drawH);
    const imgData = ctx.getImageData(0, 0, width, height);
    return decodeQrFromRgbaBuffer(imgData.data, width, height)?.payload ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function verifySvgQrScannable(
  svgEl: SVGSVGElement,
  expectedPayload: string
): Promise<{ decoded: string | null; matches: boolean }> {
  const cardDecoded = await rasterizeAndDecodeSvg(svgEl, 'card', 2.2);
  if (cardDecoded === expectedPayload) {
    return { decoded: cardDecoded, matches: true };
  }
  const qrOnlyDecoded = await rasterizeAndDecodeSvg(svgEl, 'qr-only', 2.2);
  if (qrOnlyDecoded === expectedPayload) {
    return { decoded: qrOnlyDecoded, matches: true };
  }
  const crispDecoded = await rasterizeAndDecodeSvg(svgEl, 'qr-only', 3.5);
  if (crispDecoded === expectedPayload) {
    return { decoded: crispDecoded, matches: true };
  }
  return { decoded: crispDecoded ?? qrOnlyDecoded ?? cardDecoded, matches: false };
}

export async function copyQrPngToClipboard(
  svgEl: SVGSVGElement,
  sparkQrMetadata?: SparkQrSvgMetadata
): Promise<void> {
  const blob = await renderSvgToPngBlob(svgEl, 1000, { sparkQrMetadata });
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('La copie d’image dans le presse-papier n’est pas supportée par ce navigateur.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
