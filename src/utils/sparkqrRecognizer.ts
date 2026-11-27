import {
  DEFAULT_CONFIG,
  DEFAULT_EXPERIENCE,
  DEFAULT_SOURCE,
  FONT_CATALOG,
  THEME_PRESETS,
} from '../data/presets';
import type {
  PostScanExperience,
  QrConfig,
  QrEyeShape,
  QrFrameStyle,
  QrModuleShape,
  QrSourceState,
  SavedQrItem,
} from '../types/qr';
import { decryptJsonWithKey, isValidE2eeEnvelope } from './e2eeCrypto';
import { normalizeConfigWithDefaults } from './historyReducer';
import {
  decodeQrImageFile,
  verifyExtractedSparkQrAuthenticity,
  type DecodedQrImageResult,
  type SparkQrRejectCode,
  type SparkQrVerificationChannel,
} from './qrImageDecoder';
import {
  buildImportedSparkQrItem,
  describeQrPayloadFormat,
  extractSparkQrReaderEndpoint,
} from './sharedQrPackage';
import type { SparkQrAuthenticBundle } from './sparkqrMark';

export interface SparkQrRecognizedCharacteristics {
  presetName: string;
  formatLabel: string;
  moduleShapeLabel: string;
  eyeShapeLabel: string;
  frameStyleLabel: string;
  fontName: string;
  laserEnabled: boolean;
  energyWaveEnabled: boolean;
  hasCenterLogo: boolean;
  hasCornerStickers: boolean;
  experienceTemplate: PostScanExperience['template'];
  experienceHeadline: string;
  isEncrypted: boolean;
  foregroundColor: string;
  cardBackgroundColor: string;
  titleText: string;
  subtitleText: string;
  verificationLabel: string;
}

export type SparkQrRecognitionResult =
  | {
      recognized: true;
      item: SavedQrItem;
      fingerprint: string;
      verificationChannel: SparkQrVerificationChannel;
      decodeStrategy: DecodedQrImageResult['strategy'] | 'verified-bundle';
      characteristics: SparkQrRecognizedCharacteristics;
    }
  | {
      recognized: false;
      code: SparkQrRejectCode | 'unreadable-qr' | 'invalid-file';
      reason: string;
      decodedPayloadPreview?: string;
    };

const MODULE_SHAPE_LABELS: Record<QrModuleShape, string> = {
  capsule: 'Capsules fluides',
  liquid: 'Organique liquide',
  dots: 'Points ronds',
  mosaic: 'Mosaïque biseautée',
  starburst: 'Éclats géométriques',
  rounded: 'Modules arrondis',
  square: 'Carrés classiques',
};

const EYE_SHAPE_LABELS: Record<QrEyeShape, string> = {
  orbite: 'Orbite',
  frame: 'Viseur technique',
  shield: 'Écusson',
  leaf: 'Feuille asymétrique',
  circle: 'Anneau circulaire',
  rounded: 'Cadre arrondi',
  square: 'Carré classique',
};

const FRAME_STYLE_LABELS: Record<QrFrameStyle, string> = {
  signature: 'Carte Signature',
  ticket: 'Ticket découpe',
  glass: 'Verre studio',
  polaroid: 'Cadre Polaroid',
  'smoked-glass': 'Verre fumé',
  'vip-gold': 'Liseré Or VIP',
  limited: 'Édition Limitée',
  none: 'Épuré sans cadre',
};

export function describeVerificationChannel(channel: SparkQrVerificationChannel): string {
  switch (channel) {
    case 'png-chunk-hmac':
      return 'PNG signé · Sceau cryptographique + HMAC serveur';
    case 'png-chunk-seal':
      return 'PNG signé · Sceau d’intégrité SparkQR';
    case 'svg-metadata-hmac':
      return 'SVG signé · Métadonnées vectorielles + HMAC serveur';
    case 'svg-metadata-seal':
      return 'SVG signé · Sceau d’intégrité SparkQR';
    case 'optical-watermark-registry':
      return 'Tatouage optique SparkQR · Registre authentifié';
  }
}

export function extractSparkQrCharacteristics(
  item: SavedQrItem,
  verificationChannel: SparkQrVerificationChannel = 'png-chunk-seal'
): SparkQrRecognizedCharacteristics {
  const cfg = item.config;
  const preset = THEME_PRESETS.find((p) => p.id === cfg.themeId);
  const font = FONT_CATALOG[cfg.fontId];
  const hasCenterLogo = Boolean(
    cfg.logoId || cfg.centerEmoji || cfg.monogramText?.trim() || cfg.customLogoDataUrl
  );
  const hasCornerStickers =
    cfg.cornerStickerPlacement && cfg.cornerStickerPlacement !== 'none';

  const endpointInfo = extractSparkQrReaderEndpoint(item.payload);
  const isActuallyEncrypted = Boolean(
    item.isEncrypted ||
      (item.source.e2eeEnabled &&
        Boolean(
          endpointInfo?.keyFragment ||
            item.source.e2eeKeyFragment ||
            item.source.imageEncrypted ||
            item.source.videoEncrypted ||
            item.source.documentEncrypted ||
            item.source.audioEncrypted
        ))
  );

  return {
    presetName: preset?.name || (cfg.themeId && cfg.themeId !== 'custom' ? cfg.themeId : 'Style personnalisé'),
    formatLabel: describeQrPayloadFormat(item.payload),
    moduleShapeLabel: MODULE_SHAPE_LABELS[cfg.moduleShape] || cfg.moduleShape,
    eyeShapeLabel: EYE_SHAPE_LABELS[cfg.eyeShape] || cfg.eyeShape,
    frameStyleLabel: FRAME_STYLE_LABELS[cfg.frameStyle] || cfg.frameStyle,
    fontName: font?.label || cfg.fontId,
    laserEnabled: cfg.laserEnabled !== false,
    energyWaveEnabled: Boolean(cfg.energyWaveEnabled),
    hasCenterLogo,
    hasCornerStickers,
    experienceTemplate: item.experience?.template ?? 'standard',
    experienceHeadline: (item.experience?.headline || '').trim(),
    isEncrypted: isActuallyEncrypted,
    foregroundColor: cfg.foregroundColor,
    cardBackgroundColor: cfg.cardBackgroundColor,
    titleText: cfg.titleText,
    subtitleText: cfg.subtitleText,
    verificationLabel: describeVerificationChannel(verificationChannel),
  };
}

/**
 * Verifies an extracted QR payload + candidate SparkQR metadata or optical fingerprint,
 * rejecting any third-party/external QR code, tampered seal/HMAC, or mismatched payload,
 * and reconstructing the complete SavedQrItem in category 'Importé' with all characteristics.
 */
export async function recognizeAndBuildSparkQrImport(params: {
  decodedPayload: string;
  rawMetadata: Record<string, unknown> | null;
  opticalFingerprint?: string;
  sourceFileKind?: 'png' | 'svg' | 'raster';
  decodeStrategy?: DecodedQrImageResult['strategy'] | 'verified-bundle';
  verifyViaServer?: (req: {
    bundle?: SparkQrAuthenticBundle | Record<string, unknown> | null;
    fingerprint?: string;
  }) => Promise<{
    authentic: boolean;
    bundle?: SparkQrAuthenticBundle;
    reason?: string;
    networkError?: boolean;
  }>;
  lookupLocalByFingerprint?: (fp: string) => SparkQrAuthenticBundle | null;
}): Promise<SparkQrRecognitionResult> {
  const auth = await verifyExtractedSparkQrAuthenticity({
    decodedPayload: params.decodedPayload,
    rawMetadata: params.rawMetadata,
    opticalFingerprint: params.opticalFingerprint,
    sourceFileKind: params.sourceFileKind,
    verifyViaServer: params.verifyViaServer,
    lookupLocalByFingerprint: params.lookupLocalByFingerprint,
  });

  if (!auth.authentic || !auth.bundle) {
    return {
      recognized: false,
      code: auth.rejectCode ?? 'not-sparkqr',
      reason:
        auth.rejectReason ||
        'Code QR non reconnu : seules les images de codes QR générées par SparkQR sont acceptées.',
      decodedPayloadPreview: params.decodedPayload.slice(0, 120),
    };
  }

  const built = buildImportedSparkQrItem({
    decodedPayload: params.decodedPayload,
    sparkQrAuthentic: true,
    sparkQrMetadata: auth.bundle,
  });

  if (!built.ok) {
    return {
      recognized: false,
      code: 'tampered-signature',
      reason: built.error,
      decodedPayloadPreview: params.decodedPayload.slice(0, 120),
    };
  }

  const channel = auth.verificationChannel ?? 'png-chunk-seal';
  return {
    recognized: true,
    item: built.item,
    fingerprint: auth.fingerprint || String(auth.bundle.fingerprint || ''),
    verificationChannel: channel,
    decodeStrategy: params.decodeStrategy ?? 'verified-bundle',
    characteristics: extractSparkQrCharacteristics(built.item, channel),
  };
}

/**
 * Enriches an already-verified SparkQR imported item with hosted media / dynamic QR / E2EE
 * data from the SparkQR reader endpoint without overwriting signed visual characteristics.
 */
export async function enrichSparkQrItemFromReaderApi(
  item: SavedQrItem,
  hasSignedConfig: boolean,
  fetchFn: typeof fetch = fetch
): Promise<SavedQrItem> {
  const endpointInfo = extractSparkQrReaderEndpoint(item.payload);
  if (!endpointInfo) return item;

  try {
    const apiUrl =
      endpointInfo.kind === 'media'
        ? `/api/reader/media/${encodeURIComponent(endpointInfo.id)}`
        : `/api/reader/dynamic/${encodeURIComponent(endpointInfo.id)}`;
    const res = await fetchFn(apiUrl);
    if (!res.ok) return item;

    const body = (await res.json()) as {
      config?: Partial<QrConfig>;
      cardTheme?: Partial<QrConfig>;
      source?: Partial<QrSourceState>;
      experience?: Partial<PostScanExperience>;
      mediaType?: string;
      title?: string;
      isEncrypted?: boolean;
      encryptedMeta?: unknown;
      locked?: boolean;
    };

    let nextName = item.name;
    let nextConfig = item.config;
    let nextSource: QrSourceState = item.source;
    let nextExperience: PostScanExperience = item.experience ?? { ...DEFAULT_EXPERIENCE };

    if (!hasSignedConfig) {
      if (body.config) {
        nextConfig = normalizeConfigWithDefaults(body.config, DEFAULT_CONFIG);
      } else if (body.cardTheme) {
        nextConfig = normalizeConfigWithDefaults(body.cardTheme, DEFAULT_CONFIG);
      }
    }

    if (body.source) {
      nextSource = {
        ...DEFAULT_SOURCE,
        ...body.source,
        ...nextSource,
        imageName: '',
        videoName: '',
        documentName: '',
        audioName: '',
        useSourceImageAsLogo: false,
      };
    }

    if (body.experience) {
      const mergedGallery =
        nextExperience.galleryItems && nextExperience.galleryItems.length > 0
          ? nextExperience.galleryItems
          : body.experience.galleryItems ?? [];
      nextExperience = {
        ...DEFAULT_EXPERIENCE,
        ...body.experience,
        ...nextExperience,
        galleryItems: mergedGallery,
      };
    }

    if (
      (body.mediaType === 'document' || body.mediaType === 'audio') &&
      nextExperience.galleryItems.every(
        (g) => !g.url.includes(`/api/media/${endpointInfo.id}/file`)
      )
    ) {
      nextExperience = {
        ...nextExperience,
        template: 'media-gallery',
        galleryItems: [
          {
            id: `media-${endpointInfo.id}`,
            type: body.mediaType,
            url: `/api/media/${endpointInfo.id}/file`,
            caption: '',
            isEncrypted: Boolean(body.isEncrypted),
          },
        ],
      };
    }

    if (
      !body.locked &&
      body.isEncrypted &&
      endpointInfo.keyFragment &&
      isValidE2eeEnvelope(body.encryptedMeta)
    ) {
      const decrypted = await decryptJsonWithKey<{
        source?: Partial<QrSourceState>;
        experience?: Partial<PostScanExperience>;
        title?: string;
      }>(body.encryptedMeta, endpointInfo.keyFragment);

      if (decrypted.source) {
        nextSource = {
          ...nextSource,
          ...decrypted.source,
          imageName: '',
          videoName: '',
          documentName: '',
          audioName: '',
          useSourceImageAsLogo: false,
          e2eeEnabled: true,
          e2eeKeyFragment: endpointInfo.keyFragment,
        };
      } else {
        nextSource = {
          ...nextSource,
          e2eeEnabled: true,
          e2eeKeyFragment: endpointInfo.keyFragment,
        };
      }
      if (decrypted.experience) {
        nextExperience = { ...nextExperience, ...decrypted.experience };
      }
      if (decrypted.title && decrypted.title !== 'Contenu chiffré') {
        nextName = decrypted.title;
      }
    } else if (body.title && body.title !== 'Contenu chiffré' && !nextName) {
      nextName = body.title;
    }

    return {
      ...item,
      name: nextName,
      source: nextSource,
      config: nextConfig,
      experience: nextExperience,
      isEncrypted: Boolean(body.isEncrypted || (nextSource.e2eeEnabled && endpointInfo.keyFragment)),
    };
  } catch {
    return item;
  }
}

/**
 * Exclusive SparkQR image recognizer & importer for browser file inputs / drag-and-drop.
 * Accepts ONLY authenticated QR code images generated by SparkQR and imports them with
 * all their generated attributes into category 'Importé'.
 */
export async function recognizeAndImportSparkQrFile(
  file: File
): Promise<SparkQrRecognitionResult> {
  let decoded: DecodedQrImageResult;
  try {
    decoded = await decodeQrImageFile(file);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Impossible d’analyser l’image importée.';
    const isFileError =
      message.includes('Format refusé') || message.includes('corrompu');
    return {
      recognized: false,
      code: isFileError ? 'invalid-file' : 'unreadable-qr',
      reason: message,
    };
  }

  if (!decoded.sparkQrAuthentic || !decoded.sparkQrMetadata) {
    return {
      recognized: false,
      code: decoded.sparkQrRejectCode ?? 'not-sparkqr',
      reason:
        decoded.sparkQrRejectReason ||
        'Code QR externe refusé : seules les images de codes QR générées par SparkQR peuvent être importées.',
      decodedPayloadPreview: decoded.payload.slice(0, 120),
    };
  }

  const built = buildImportedSparkQrItem({
    decodedPayload: decoded.payload,
    sparkQrAuthentic: true,
    sparkQrMetadata: decoded.sparkQrMetadata,
    sparkQrRejectReason: decoded.sparkQrRejectReason,
  });

  if (!built.ok) {
    return {
      recognized: false,
      code: 'tampered-signature',
      reason: built.error,
      decodedPayloadPreview: decoded.payload.slice(0, 120),
    };
  }

  const enrichedItem = await enrichSparkQrItemFromReaderApi(
    built.item,
    Boolean(decoded.sparkQrMetadata?.config)
  );
  const channel = decoded.verificationChannel ?? 'png-chunk-seal';

  return {
    recognized: true,
    item: {
      ...enrichedItem,
      category: 'Importé',
    },
    fingerprint: decoded.sparkQrFingerprint || String(decoded.sparkQrMetadata.fingerprint || ''),
    verificationChannel: channel,
    decodeStrategy: decoded.strategy,
    characteristics: extractSparkQrCharacteristics(enrichedItem, channel),
  };
}
