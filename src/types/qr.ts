export type QrSourceType = 'text' | 'image' | 'video';

export type QrTextMode = 'url' | 'text' | 'wifi';

export type QrIntent = 'url' | 'text' | 'wifi' | 'image' | 'video';

export type QrModuleShape =
  | 'capsule'
  | 'liquid'
  | 'dots'
  | 'mosaic'
  | 'starburst'
  | 'rounded'
  | 'square';

export type QrEyeShape =
  | 'orbite'
  | 'frame'
  | 'shield'
  | 'leaf'
  | 'circle'
  | 'rounded'
  | 'square';

export type QrFilterType =
  | 'none'
  | 'grain'
  | 'duotone'
  | 'glow'
  | 'brut'
  | 'halftone'
  | 'sepia'
  | 'inverted';

export type QrFrameStyle =
  | 'signature'
  | 'ticket'
  | 'glass'
  | 'polaroid'
  | 'smoked-glass'
  | 'vip-gold'
  | 'limited'
  | 'none';

export type QrCardTexture =
  | 'none'
  | 'brushed'
  | 'linen'
  | 'grain-stone'
  | 'holographic';

export type QrFontId =
  | 'bricolage'
  | 'syne'
  | 'fraunces'
  | 'playfair'
  | 'oswald'
  | 'jakarta'
  | 'mono'
  | 'dancing'
  | 'greatvibes'
  | 'pacifico'
  | 'caveat';

export type QrTextAlign = 'left' | 'center' | 'right';

export type QrLogoKnockout = 'circle' | 'squircle' | 'diamond' | 'none';

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export type QrGradientType = 'solid' | 'linear' | 'radial';

export type QrCornerPlacement =
  | 'none'
  | 'all-4'
  | 'top-2'
  | 'bottom-2'
  | 'diagonal'
  | 'bottom-right';

export type QrStickerKind = 'vector' | 'emoji';

export type QrLayerId =
  | 'frame'
  | 'modules'
  | 'centerLogo'
  | 'cornerStickers'
  | 'typography';

export interface QrLayerItem {
  id: QrLayerId;
  label: string;
  visible: boolean;
}

export interface QrTextOverlay {
  id: string;
  text: string;
  xPercent: number; // 10..90
  yPercent: number; // 8..92
  fontId: QrFontId;
  fontSize: number; // 10..26
  color: string;
  rotation: number; // -30..30
}

export type PostScanTemplate =
  | 'standard'
  | 'video-page'
  | 'photo-gallery'
  | 'video-gallery'
  | 'media-gallery'
  | 'mixed-collection'
  | 'postcard'
  | 'event-invite'
  | 'business-card'
  | 'private-page';

export interface PostScanMediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  caption: string;
  posterUrl?: string;
}

export interface PostScanExperience {
  template: PostScanTemplate;
  headline: string;
  description: string;
  mixedTextBlock?: string;
  accentMood: 'auto' | 'gold-velvet' | 'midnight-neon' | 'cinema-35' | 'botanical';
  // Event Invite
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventDressCode: string;
  // Business Card
  personName: string;
  personRole: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  // Postcard
  postcardFrom: string;
  postcardTo: string;
  postcardStampText: string;
  // Private Page
  privateBadgeLabel: string;
  privateSecretNote: string;
  // Gallery / Multimedia
  galleryItems: PostScanMediaItem[];
  ctaLabel: string;
  ctaUrl: string;
}

export interface DynamicSecurityConfig {
  enabled: boolean;
  slug: string | null;
  pinCode: string; // Input only when creating/updating; never returned by server
  hasPin?: boolean;
  expiresAt: string; // ISO datetime-local string or ''
  maxScans: number | null;
  active: boolean;
}

export interface DynamicScanEvent {
  at: string;
  device: string;
  unlocked: boolean;
}

export interface DynamicQrStats {
  totalScans: number;
  lastScannedAt: string | null;
  recentEvents: DynamicScanEvent[];
}

export interface DynamicQrRecord {
  slug: string;
  shortUrl: string;
  active: boolean;
  hasPin: boolean;
  expiresAt: string | null;
  maxScans: number | null;
  createdAt: string;
  updatedAt: string;
  destination: {
    intent: QrIntent;
    payload: string;
    title: string;
    sourceSnapshot: QrSourceState;
    experience: PostScanExperience;
    cardTheme: {
      cardBackgroundColor: string;
      foregroundColor: string;
      eyeColor: string;
      fontId: QrFontId;
    };
    config?: QrConfig;
  };
  stats: DynamicQrStats;
}

export type ProjectCategory =
  | 'Personnel'
  | 'Professionnel'
  | 'Événement'
  | 'Média'
  | 'Privé';

export interface StorageStatusInfo {
  provider: 'dosya.dev';
  configured: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  missingVars: string[];
}

export interface MediaAssociationInfo {
  kind: 'collection' | 'dynamic';
  id: string;
  title: string;
}

export interface UploadedMediaInfo {
  id: string;
  type: 'image' | 'video';
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  fileUrl?: string;
  downloadUrl?: string;
  pageUrl: string;
  storage?: {
    provider: 'dosya-s3' | 'demo' | 'collection';
    bucket?: string;
    key?: string;
    etag?: string;
    endpoint?: string;
    region?: string;
  };
  associations?: MediaAssociationInfo[];
  createdAt: string;
}

export interface QrSourceState {
  type: QrSourceType;
  textMode: QrTextMode;
  urlValue: string;
  textValue: string;
  wifiSsid: string;
  wifiPassword: string;
  wifiSecurity: 'WPA' | 'WEP' | 'nopass';
  imageUrl: string;
  imageName: string;
  imagePageUrl: string;
  useSourceImageAsLogo: boolean;
  videoUrl: string;
  videoName: string;
  videoPageUrl: string;
  videoPosterUrl?: string;
}

export interface QrConfig {
  themeId: string;
  foregroundColor: string;
  foregroundSecondaryColor: string;
  gradientType: QrGradientType;
  gradientAngle: number;
  useCustomEyeColor: boolean;
  eyeColor: string;
  qrBackgroundColor: string;
  cardBackgroundColor: string;
  cardTextColor: string;
  moduleShape: QrModuleShape;
  eyeShape: QrEyeShape;
  filter: QrFilterType;
  filterIntensity: number;
  frameStyle: QrFrameStyle;
  cardTexture: QrCardTexture;
  metallicSheen: boolean;
  borderWidth: number;
  borderColor: string;
  editionLabel: string;
  fontId: QrFontId;
  subtitleFontId: QrFontId;
  titleSize: number;
  subtitleSize: number;
  messageFontSize: number;
  titleWeight: 400 | 500 | 600 | 700;
  titleItalic: boolean;
  titleUppercase: boolean;
  textAlign: QrTextAlign;
  messageFontId?: QrFontId;
  messageWeight?: 400 | 500 | 600 | 700;
  messageItalic?: boolean;
  messageAlign?: QrTextAlign;
  messageColor?: string;
  messageLetterSpacing?: number;
  messageTextDecoration?: 'none' | 'underline';
  titleText: string;
  subtitleText: string;
  titleOffsetY: number;
  logoId: string | null;
  centerEmoji: string | null;
  monogramText: string;
  customLogoDataUrl: string | null;
  logoSize: number;
  logoOffsetX: number;
  logoOffsetY: number;
  logoRotation: number;
  logoKnockout: QrLogoKnockout;
  logoColor: string;
  cornerStickerPlacement: QrCornerPlacement;
  cornerStickerKind: QrStickerKind;
  cornerStickerVectorId: string;
  cornerStickerEmoji: string;
  cornerStickerColor: string;
  cornerStickerScale: number;
  cornerStickerRotation: number;
  cornerStickerOffset: number;
  layers: QrLayerItem[];
  extraTexts: QrTextOverlay[];
  errorCorrection: QrErrorCorrection;
  margin: number;
  cornerRadius: number;
}

export interface QrThemePreset {
  id: string;
  name: string;
  tagline: string;
  collection: 'studio' | 'prestige';
  swatches: [string, string, string];
  patch: Partial<QrConfig>;
}

export interface LogoDefinition {
  id: string;
  name: string;
  category: string;
  prestige?: boolean;
  viewBox: string;
  paths: Array<{
    d: string;
    fill?: boolean;
    stroke?: boolean;
    strokeWidth?: number;
    opacity?: number;
  }>;
  circles?: Array<{
    cx: number;
    cy: number;
    r: number;
    fill?: boolean;
    stroke?: boolean;
    strokeWidth?: number;
  }>;
}

export interface SavedQrItem {
  id: string;
  name: string;
  category: ProjectCategory;
  createdAt: string;
  updatedAt?: string;
  source: QrSourceState;
  config: QrConfig;
  experience?: PostScanExperience;
  dynamicSlug?: string | null;
  payload: string;
}

export interface ScannabilityReport {
  contrastRatio: number;
  effectiveErrorCorrection: QrErrorCorrection;
  hasLogo: boolean;
  status: 'optimal' | 'acceptable' | 'risky';
  label: string;
  detail: string;
}

export interface ExportOptions {
  format: 'png' | 'svg' | 'pdf';
  scope: 'card' | 'qr-only';
  width: 600 | 1200 | 2400;
  transparentBackground: boolean;
}
