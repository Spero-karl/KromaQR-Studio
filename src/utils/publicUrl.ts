export interface PublicUrlValidationResult {
  valid: boolean;
  normalizedUrl: string;
  reason?:
    | 'empty'
    | 'invalid-format'
    | 'not-https'
    | 'local-host'
    | 'private-ip'
    | 'aistudio-preview'
    | 'invalid-domain';
  error?: string;
}

export interface EnvironmentDiagnostic {
  isLocal: boolean;
  isAiStudioPreview: boolean;
  isNonHttps: boolean;
  hostname: string;
  summary: string;
}

export interface MediaUrlSafetyResult {
  safe: boolean;
  reason?: 'empty' | 'local-filesystem' | 'local-host' | 'aistudio-preview' | 'not-public';
  error?: string;
}

const AISTUDIO_HOST_PATTERNS: RegExp[] = [
  /^ais-dev-/i,
  /^ais-pre-/i,
  /(^|\.)aistudio\.google\.com$/i,
  /(^|\.)makersuite\.google\.com$/i,
  /(^|\.)idx\.google\.com$/i,
  /(^|\.)cloudshell\.dev$/i,
  /(^|\.)googleusercontent\.com$/i,
];

const LOCAL_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /\.local$/i,
  /\.localhost$/i,
  /\.internal$/i,
];

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isAiStudioOrPreviewHost(hostname: string): boolean {
  const host = (hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (AISTUDIO_HOST_PATTERNS.some((re) => re.test(host))) {
    return true;
  }
  // Cloud Run dev preview proxy used by Google AI Studio (*.europe-west*.run.app with ais-* prefix)
  if (/^ais-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i.test(host)) {
    return true;
  }
  return false;
}

export function isLocalOrPrivateHost(hostname: string): boolean {
  const host = (hostname || '').trim().toLowerCase();
  if (!host) return true;
  if (LOCAL_HOST_PATTERNS.some((re) => re.test(host))) {
    return true;
  }
  if (isPrivateIpv4(host)) {
    return true;
  }
  return false;
}

export function validatePublicAppUrl(raw: string): PublicUrlValidationResult {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'empty',
      error:
        'Configurez PUBLIC_APP_URL avec votre adresse publique HTTPS (ex. : https://mon-domaine.com) avant de générer un QR hébergé.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'invalid-format',
      error:
        'Format d’adresse invalide. Saisissez une URL complète commençant par https:// (ex. : https://mon-domaine.com).',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'not-https',
      error:
        'PUBLIC_APP_URL doit obligatoirement utiliser le protocole HTTPS (ex. : https://mon-domaine.com).',
    };
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'invalid-format',
      error:
        'PUBLIC_APP_URL doit être une base de domaine propre sans paramètres ni identifiants (ex. : https://mon-domaine.com).',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (isAiStudioOrPreviewHost(host)) {
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'aistudio-preview',
      error:
        'Adresse Google AI Studio interdite dans les QR codes : elle provoque une erreur HTTP 403 sur téléphone. Indiquez votre domaine public HTTPS.',
    };
  }

  if (isLocalOrPrivateHost(host)) {
    if (!LOCAL_HOST_PATTERNS.some((re) => re.test(host)) && isPrivateIpv4(host)) {
      return {
        valid: false,
        normalizedUrl: '',
        reason: 'private-ip',
        error:
          'Adresse IP privée refusée : un smartphone externe ne peut pas joindre une IP locale. Indiquez un domaine public HTTPS.',
      };
    }
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'local-host',
      error:
        'Adresse locale (localhost / 127.0.0.1) interdite dans les QR codes publics. Indiquez votre domaine public HTTPS.',
    };
  }

  if (!host.includes('.') || host.endsWith('.')) {
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'invalid-domain',
      error: 'Nom de domaine public incomplet (ex. : https://mon-domaine.com).',
    };
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const normalizedUrl = `${parsed.origin}${cleanPath === '/' ? '' : cleanPath}`;

  return {
    valid: true,
    normalizedUrl,
  };
}

export function detectEnvironmentIssue(browserOrigin: string): EnvironmentDiagnostic {
  const trimmed = (browserOrigin || '').trim();
  if (!trimmed) {
    return {
      isLocal: true,
      isAiStudioPreview: false,
      isNonHttps: true,
      hostname: '',
      summary:
        'Environnement local sans domaine public détecté. Configurez PUBLIC_APP_URL en HTTPS.',
    };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isAiStudioPreview = isAiStudioOrPreviewHost(host);
    const isLocal = isLocalOrPrivateHost(host);
    const isNonHttps = parsed.protocol !== 'https:';

    if (isAiStudioPreview) {
      return {
        isLocal,
        isAiStudioPreview: true,
        isNonHttps,
        hostname: host,
        summary: `Prévisualisation Google AI Studio (${host}) détectée : cette adresse est privée et renvoie HTTP 403 lors d’un scan externe. Définissez PUBLIC_APP_URL avec votre domaine public HTTPS.`,
      };
    }

    if (isLocal) {
      return {
        isLocal: true,
        isAiStudioPreview: false,
        isNonHttps,
        hostname: host,
        summary: `Serveur local (${parsed.host}) détecté : injoignable depuis un smartphone externe. Définissez PUBLIC_APP_URL avec votre domaine public HTTPS.`,
      };
    }

    if (isNonHttps) {
      return {
        isLocal: false,
        isAiStudioPreview: false,
        isNonHttps: true,
        hostname: host,
        summary: `Origine HTTP non sécurisée (${parsed.origin}). Utilisez une URL publique HTTPS dans PUBLIC_APP_URL.`,
      };
    }

    return {
      isLocal: false,
      isAiStudioPreview: false,
      isNonHttps: false,
      hostname: host,
      summary: `Origine courante détectée : ${parsed.origin}`,
    };
  } catch {
    return {
      isLocal: true,
      isAiStudioPreview: false,
      isNonHttps: true,
      hostname: '',
      summary: 'Origine actuelle non publique. Définissez PUBLIC_APP_URL en HTTPS.',
    };
  }
}

export function inspectMediaUrlForQr(rawUrl: string): MediaUrlSafetyResult {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      safe: false,
      reason: 'empty',
      error: 'Aucune source média définie.',
    };
  }

  // Reject local filesystem paths (Windows, macOS, Linux, file://)
  if (
    /^file:\/\//i.test(trimmed) ||
    /^[a-zA-Z]:\\/.test(trimmed) ||
    /^\/(Users|home|var\/folders|mnt|Volumes|tmp)\//i.test(trimmed)
  ) {
    return {
      safe: false,
      reason: 'local-filesystem',
      error:
        'Chemin de disque local refusé : un téléphone externe ne peut pas lire votre disque dur. Utilisez le bouton « Importer » pour héberger le fichier sur le serveur.',
    };
  }

  // Relative paths managed by SparkQR server (/uploads/* or built-in /demo-*)
  if (trimmed.startsWith('/')) {
    return { safe: true };
  }

  // Absolute URL validation
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      safe: false,
      reason: 'not-public',
      error: 'URL média invalide. Importez le fichier ou saisissez une URL publique HTTPS.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      safe: false,
      reason: 'not-public',
      error:
        'Le lien média doit utiliser HTTPS (ou être importé via le bouton « Importer » du studio).',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (isAiStudioOrPreviewHost(host)) {
    return {
      safe: false,
      reason: 'aistudio-preview',
      error:
        'URL Google AI Studio interdite : importez le fichier sur SparkQR ou utilisez une URL publique HTTPS.',
    };
  }

  if (isLocalOrPrivateHost(host)) {
    return {
      safe: false,
      reason: 'local-host',
      error:
        'URL locale (localhost / IP privée) inutilisable sur téléphone : importez le fichier ou utilisez une URL publique HTTPS.',
    };
  }

  return { safe: true };
}

export function buildPublicReaderUrl(publicAppUrl: string, routePath: string): string {
  const check = validatePublicAppUrl(publicAppUrl);
  if (!check.valid) {
    throw new Error(check.error || 'PUBLIC_APP_URL invalide.');
  }
  const cleanRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${check.normalizedUrl}${cleanRoute}`;
}

/**
 * Normalizes stored media URLs by stripping accidental local or AI Studio preview origins
 * for SparkQR-hosted routes (/uploads/..., /demo-..., /m/..., /d/...).
 */
export function normalizeMediaAssetUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isInternalHost = isAiStudioOrPreviewHost(host) || isLocalOrPrivateHost(host);
    const isHostedAssetPath =
      parsed.pathname.startsWith('/uploads/') ||
      parsed.pathname.startsWith('/api/media/') ||
      parsed.pathname.startsWith('/demo-') ||
      parsed.pathname.startsWith('/m/') ||
      parsed.pathname.startsWith('/d/');

    if (isInternalHost && isHostedAssetPath) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

export function validateGalleryUrls(urls: string[]): MediaUrlSafetyResult {
  for (const raw of urls) {
    const res = inspectMediaUrlForQr(raw);
    if (!res.safe) {
      return res;
    }
  }
  return { safe: true };
}

