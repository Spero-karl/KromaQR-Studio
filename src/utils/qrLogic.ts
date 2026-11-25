import QRCode from 'qrcode';
import jsQR from 'jsqr';
import type {
  QrConfig,
  QrCornerPlacement,
  QrErrorCorrection,
  QrFrameStyle,
  QrIntent,
  QrSourceState,
  ScannabilityReport,
} from '../types/qr';
import {
  buildPublicReaderUrl,
  inspectMediaUrlForQr,
  isAiStudioOrPreviewHost,
  isLocalOrPrivateHost,
  validatePublicAppUrl,
} from './publicUrl';

export interface QrMatrixData {
  size: number;
  modules: boolean[][];
  version: number;
}

export function resolveSourceIntent(source: QrSourceState): QrIntent {
  if (
    source.type === 'image' ||
    source.type === 'video' ||
    source.type === 'document' ||
    source.type === 'audio'
  ) {
    return source.type;
  }
  return source.textMode;
}

function formatIcalDateTime(raw?: string): string {
  const clean = (raw || '').trim();
  if (!clean) return '';
  const digits = clean.replace(/[-:]/g, '');
  if (/^\d{8}T\d{4}$/.test(digits)) {
    return `${digits}00`;
  }
  if (/^\d{8}T\d{6}Z?$/.test(digits)) {
    return digits;
  }
  if (/^\d{8}$/.test(digits)) {
    return digits;
  }
  const parsed = Date.parse(clean);
  if (Number.isFinite(parsed)) {
    const iso = new Date(parsed).toISOString().replace(/[-:]/g, '');
    return `${iso.slice(0, 15)}Z`;
  }
  return '';
}

function buildHostedMediaTargetPayload(
  rawMedia: string,
  rawTarget: string,
  emptyError: string,
  publicOrigin: string
): { payload: string; valid: boolean; error?: string } {
  if (!rawTarget) {
    return { payload: '', valid: false, error: emptyError };
  }
  if (rawMedia) {
    const mediaSafety = inspectMediaUrlForQr(rawMedia);
    if (!mediaSafety.safe) {
      return { payload: '', valid: false, error: mediaSafety.error };
    }
  }
  if (/^https?:\/\//i.test(rawTarget)) {
    const targetSafety = inspectMediaUrlForQr(rawTarget);
    if (!targetSafety.safe) {
      return { payload: '', valid: false, error: targetSafety.error };
    }
    return { payload: rawTarget, valid: true };
  }
  const originCheck = validatePublicAppUrl(publicOrigin);
  if (!originCheck.valid) {
    return { payload: '', valid: false, error: originCheck.error };
  }
  return { payload: buildPublicReaderUrl(originCheck.normalizedUrl, rawTarget), valid: true };
}

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const MULTILINE_CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function hasAsciiControlChars(value: string, allowNewlines = false): boolean {
  return allowNewlines ? MULTILINE_CONTROL_RE.test(value) : CONTROL_CHARS_RE.test(value);
}

function stripIcalAndVcardInjection(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\b(?:BEGIN|END|VERSION|DTSTART|DTEND|SUMMARY|LOCATION|UID|METHOD)\s*:/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SocialNetworkKey = 'tiktok' | 'instagram' | 'facebook' | 'telegram' | 'twitter';

const SOCIAL_NETWORK_META: Record<
  SocialNetworkKey,
  {
    label: string;
    officialHosts: string[];
    canonicalUrl: (handle: string) => string;
    handleRegex: RegExp;
    formatHint: string;
  }
> = {
  tiktok: {
    label: 'TikTok',
    officialHosts: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
    canonicalUrl: (h) => `https://www.tiktok.com/@${h}`,
    handleRegex: /^[A-Za-z0-9._]{2,24}$/,
    formatHint: '@identifiant (2 à 24 caractères : lettres, chiffres, . ou _)',
  },
  instagram: {
    label: 'Instagram',
    officialHosts: ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
    canonicalUrl: (h) => `https://www.instagram.com/${h}/`,
    handleRegex: /^[A-Za-z0-9._]{1,30}$/,
    formatHint: '@identifiant (1 à 30 caractères : lettres, chiffres, . ou _)',
  },
  facebook: {
    label: 'Facebook',
    officialHosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'],
    canonicalUrl: (h) => `https://www.facebook.com/${h}`,
    handleRegex: /^[A-Za-z0-9.]{5,50}$/,
    formatHint: 'nom de page ou profil (5 à 50 caractères : lettres, chiffres ou .)',
  },
  telegram: {
    label: 'Telegram',
    officialHosts: ['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'],
    canonicalUrl: (h) => `https://t.me/${h}`,
    handleRegex: /^[A-Za-z][A-Za-z0-9_]{3,31}$/,
    formatHint: '@identifiant (4 à 32 caractères, commençant par une lettre)',
  },
  twitter: {
    label: 'Twitter (X)',
    officialHosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'],
    canonicalUrl: (h) => `https://x.com/${h}`,
    handleRegex: /^[A-Za-z0-9_]{1,15}$/,
    formatHint: '@identifiant (1 à 15 caractères : lettres, chiffres ou _)',
  },
};

export function buildSocialPayload(
  rawInput: string,
  network: SocialNetworkKey
): { payload: string; valid: boolean; error?: string; normalizedHandle?: string } {
  const meta = SOCIAL_NETWORK_META[network];
  const raw = (rawInput || '').trim();
  if (!raw) {
    return {
      payload: '',
      valid: false,
      error: `Indiquez votre identifiant ou lien officiel ${meta.label}.`,
    };
  }
  if (hasAsciiControlChars(raw) || /\s/.test(raw) || raw.length > 260) {
    return {
      payload: '',
      valid: false,
      error: `Identifiant ${meta.label} invalide (espaces ou caractères interdits).`,
    };
  }
  if (/[^\x20-\x7E]/.test(raw)) {
    return {
      payload: '',
      valid: false,
      error: `Utilisez uniquement des caractères ASCII standards pour ${meta.label}.`,
    };
  }

  let candidate = raw;
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) || candidate.includes('/');

  if (looksLikeUrl) {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)
      ? candidate
      : `https://${candidate}`;
    let parsed: URL;
    try {
      parsed = new URL(withScheme);
    } catch {
      return {
        payload: '',
        valid: false,
        error: `Lien ${meta.label} mal formé.`,
      };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        payload: '',
        valid: false,
        error: `Protocole non autorisé pour ${meta.label}.`,
      };
    }
    if (parsed.username || parsed.password) {
      return {
        payload: '',
        valid: false,
        error: `Les liens ${meta.label} contenant des identifiants intégrés sont refusés.`,
      };
    }
    const host = parsed.hostname.toLowerCase();
    if (!meta.officialHosts.includes(host)) {
      return {
        payload: '',
        valid: false,
        error: `Seuls les domaines officiels ${meta.label} (${meta.officialHosts[0]}) sont acceptés.`,
      };
    }
    if (parsed.pathname.includes('..')) {
      return {
        payload: '',
        valid: false,
        error: `Chemin ${meta.label} invalide.`,
      };
    }
    const segments = parsed.pathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const blockedSegments = new Set([
      'login',
      'signin',
      'signup',
      'oauth',
      'auth',
      'share',
      'sharer.php',
      'intent',
      'accounts',
      'password',
      'admin',
    ]);
    if (segments.length === 0 || blockedSegments.has(segments[0].toLowerCase())) {
      return {
        payload: '',
        valid: false,
        error: `Indiquez un profil ou compte ${meta.label} valide (et non une page de connexion).`,
      };
    }
    candidate = segments[0];
  }

  const handle = candidate.replace(/^@+/, '');
  if (!handle || handle.includes('..') || handle.endsWith('.')) {
    return {
      payload: '',
      valid: false,
      error: `Format ${meta.label} attendu : ${meta.formatHint}.`,
    };
  }
  if (!meta.handleRegex.test(handle)) {
    return {
      payload: '',
      valid: false,
      error: `Format ${meta.label} invalide (${meta.formatHint}).`,
    };
  }

  return {
    payload: meta.canonicalUrl(handle),
    valid: true,
    normalizedHandle: handle,
  };
}

export function buildPayload(source: QrSourceState, publicOrigin = ''): {
  payload: string;
  valid: boolean;
  error?: string;
} {
  if (source.type === 'text') {
    if (source.textMode === 'url') {
      const trimmed = source.urlValue.trim();
      if (!trimmed) {
        return { payload: '', valid: false, error: 'Saisissez un lien URL valide.' };
      }
      if (hasAsciiControlChars(trimmed) || /\s/.test(trimmed)) {
        return {
          payload: '',
          valid: false,
          error: 'L’URL ne doit contenir ni espaces ni caractères de contrôle.',
        };
      }
      const lower = trimmed.toLowerCase();
      if (
        lower.startsWith('javascript:') ||
        lower.startsWith('vbscript:') ||
        lower.startsWith('data:') ||
        lower.startsWith('file:') ||
        lower.startsWith('ftp:') ||
        lower.startsWith('intent:')
      ) {
        return {
          payload: '',
          valid: false,
          error: 'Schéma de lien refusé : utilisez une URL HTTPS ou HTTP publique.',
        };
      }
      const hasScheme = /^(https?:\/\/|mailto:|tel:|sms:)/i.test(trimmed);
      const normalized = hasScheme ? trimmed : `https://${trimmed}`;
      if (/^https?:\/\//i.test(normalized)) {
        try {
          const parsed = new URL(normalized);
          if (parsed.username || parsed.password) {
            return {
              payload: '',
              valid: false,
              error: 'Les URL intégrant des identifiants (utilisateur@hôte) sont bloquées.',
            };
          }
          if (parsed.hostname.toLowerCase().includes('xn--')) {
            return {
              payload: '',
              valid: false,
              error: 'Les domaines encodés punycode (xn--) sont bloqués par précaution.',
            };
          }
          if (!parsed.hostname || !parsed.hostname.includes('.')) {
            return {
              payload: '',
              valid: false,
              error: 'Adresse URL incomplète (ex. : https://monsite.fr).',
            };
          }
          if (isAiStudioOrPreviewHost(parsed.hostname)) {
            return {
              payload: '',
              valid: false,
              error:
                'Lien Google AI Studio détecté : les URL internes ais-dev / aistudio renvoient HTTP 403 après scan. Saisissez une URL publique.',
            };
          }
          if (isLocalOrPrivateHost(parsed.hostname)) {
            return {
              payload: '',
              valid: false,
              error:
                'Adresse locale (localhost / IP privée) inutilisable depuis un smartphone externe.',
            };
          }
          return { payload: parsed.toString(), valid: true };
        } catch {
          return { payload: '', valid: false, error: 'Format d’adresse URL invalide.' };
        }
      }
      return { payload: normalized, valid: true };
    }

    if (
      source.textMode === 'tiktok' ||
      source.textMode === 'instagram' ||
      source.textMode === 'facebook' ||
      source.textMode === 'telegram' ||
      source.textMode === 'twitter'
    ) {
      const fieldMap: Record<SocialNetworkKey, string | undefined> = {
        tiktok: source.tiktokHandle,
        instagram: source.instagramHandle,
        facebook: source.facebookHandle,
        telegram: source.telegramHandle,
        twitter: source.twitterHandle,
      };
      return buildSocialPayload(fieldMap[source.textMode] || '', source.textMode);
    }

    if (source.textMode === 'wifi') {
      const ssid = source.wifiSsid.trim();
      if (!ssid) {
        return { payload: '', valid: false, error: 'Indiquez le nom du réseau Wi-Fi (SSID).' };
      }
      if (hasAsciiControlChars(ssid) || hasAsciiControlChars(source.wifiPassword)) {
        return {
          payload: '',
          valid: false,
          error: 'Le SSID ou le mot de passe Wi-Fi contient des caractères invalides.',
        };
      }
      if (ssid.length > 32) {
        return {
          payload: '',
          valid: false,
          error: 'Le nom du réseau Wi-Fi (SSID) ne peut pas dépasser 32 caractères.',
        };
      }
      if (source.wifiSecurity !== 'nopass' && !source.wifiPassword.trim()) {
        return {
          payload: '',
          valid: false,
          error: 'Saisissez le mot de passe Wi-Fi ou sélectionnez le mode « Ouvert ».',
        };
      }
      if (source.wifiSecurity === 'WPA' && source.wifiPassword.length < 8) {
        return {
          payload: '',
          valid: false,
          error: 'Un mot de passe Wi-Fi WPA/WPA2 doit contenir au moins 8 caractères.',
        };
      }
      const esc = (v: string) => v.replace(/([\\;,:"])/g, '\\$1');
      const passPart = source.wifiSecurity === 'nopass' ? '' : `P:${esc(source.wifiPassword)};`;
      return {
        payload: `WIFI:T:${source.wifiSecurity};S:${esc(ssid)};${passPart};`,
        valid: true,
      };
    }

    if (source.textMode === 'vcard') {
      const first = stripIcalAndVcardInjection(source.vcardFirstName || '');
      const last = stripIcalAndVcardInjection(source.vcardLastName || '');
      const org = stripIcalAndVcardInjection(source.vcardOrg || '');
      const phone = stripIcalAndVcardInjection(source.vcardPhone || '');
      const email = stripIcalAndVcardInjection(source.vcardEmail || '');
      const title = stripIcalAndVcardInjection(source.vcardTitle || '');
      const website = stripIcalAndVcardInjection(source.vcardWebsite || '');
      const address = stripIcalAndVcardInjection(source.vcardAddress || '');

      if (!first && !last && !org) {
        return {
          payload: '',
          valid: false,
          error: 'Saisissez au moins un nom, prénom ou nom d’entreprise pour la carte contact.',
        };
      }
      if (!phone && !email) {
        return {
          payload: '',
          valid: false,
          error: 'Ajoutez un numéro de téléphone ou un e-mail pour le contact.',
        };
      }
      if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email)) {
        return {
          payload: '',
          valid: false,
          error: 'Adresse e-mail du contact invalide.',
        };
      }
      let safeWebsite = '';
      if (website) {
        const siteUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
        try {
          const parsedSite = new URL(siteUrl);
          if (
            (parsedSite.protocol !== 'https:' && parsedSite.protocol !== 'http:') ||
            parsedSite.username ||
            parsedSite.password ||
            isLocalOrPrivateHost(parsedSite.hostname)
          ) {
            return {
              payload: '',
              valid: false,
              error: 'Le site web du contact doit être une URL publique valide.',
            };
          }
          safeWebsite = parsedSite.toString();
        } catch {
          return {
            payload: '',
            valid: false,
            error: 'Format de site web invalide dans la carte contact.',
          };
        }
      }
      const cleanSemi = (v: string) => v.replace(/[;\\]/g, ' ');
      const fullName = [first, last].filter(Boolean).join(' ') || org;
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${cleanSemi(last)};${cleanSemi(first)};;;`,
        `FN:${fullName}`,
      ];
      if (org) lines.push(`ORG:${org}`);
      if (title) lines.push(`TITLE:${title}`);
      if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
      if (email) lines.push(`EMAIL:${email}`);
      if (safeWebsite) lines.push(`URL:${safeWebsite}`);
      if (address) lines.push(`ADR;TYPE=WORK:;;${cleanSemi(address)};;;;`);
      lines.push('END:VCARD');
      return { payload: lines.join('\n'), valid: true };
    }

    if (source.textMode === 'event') {
      const title = stripIcalAndVcardInjection(source.eventTitle || '');
      const start = formatIcalDateTime(source.eventStart);
      const end = formatIcalDateTime(source.eventEnd) || start;
      const location = stripIcalAndVcardInjection(source.eventLocation || '');
      const description = (source.eventDescription || '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\b(?:BEGIN|END)\s*:/gi, '')
        .trim();
      if (!title) {
        return { payload: '', valid: false, error: 'Indiquez le titre de l’événement.' };
      }
      if (!start) {
        return { payload: '', valid: false, error: 'Sélectionnez la date et l’heure de début.' };
      }
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SparkQR//FR',
        'BEGIN:VEVENT',
        `SUMMARY:${title}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
      ];
      if (location) lines.push(`LOCATION:${location}`);
      if (description) lines.push(`DESCRIPTION:${description.replace(/\r?\n/g, '\\n')}`);
      lines.push('END:VEVENT', 'END:VCALENDAR');
      return { payload: lines.join('\n'), valid: true };
    }

    if (source.textMode === 'email') {
      const addr = (source.emailAddress || '').trim();
      if (
        !addr ||
        hasAsciiControlChars(addr) ||
        !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(addr)
      ) {
        return { payload: '', valid: false, error: 'Saisissez une adresse e-mail valide.' };
      }
      const params = new URLSearchParams();
      if (source.emailSubject?.trim()) {
        params.set('subject', source.emailSubject.replace(/[\r\n]/g, ' ').trim());
      }
      if (source.emailBody?.trim()) {
        params.set('body', source.emailBody.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim());
      }
      const qs = params.toString();
      return { payload: `mailto:${addr}${qs ? `?${qs}` : ''}`, valid: true };
    }

    if (source.textMode === 'phone') {
      const raw = (source.phoneNumber || '').trim();
      const cleaned = raw.replace(/[^\d+]/g, '');
      const digitCount = cleaned.replace(/\D/g, '').length;
      if (!cleaned || digitCount < 6 || digitCount > 15 || cleaned.indexOf('+', 1) !== -1) {
        return { payload: '', valid: false, error: 'Saisissez un numéro de téléphone valide (6 à 15 chiffres).' };
      }
      return { payload: `tel:${cleaned}`, valid: true };
    }

    if (source.textMode === 'sms') {
      const raw = (source.smsPhone || '').trim();
      const cleaned = raw.replace(/[^\d+]/g, '');
      const digitCount = cleaned.replace(/\D/g, '').length;
      if (!cleaned || digitCount < 6 || digitCount > 15 || cleaned.indexOf('+', 1) !== -1) {
        return { payload: '', valid: false, error: 'Saisissez un numéro destinataire valide pour le SMS.' };
      }
      const msg = (source.smsMessage || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      return {
        payload: msg ? `sms:${cleaned}?body=${encodeURIComponent(msg)}` : `sms:${cleaned}`,
        valid: true,
      };
    }

    if (source.textMode === 'whatsapp') {
      const raw = (source.whatsappPhone || '').trim();
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        return {
          payload: '',
          valid: false,
          error: 'Saisissez un numéro WhatsApp valide avec indicatif pays (7 à 15 chiffres, ex. +33612345678).',
        };
      }
      const msg = (source.whatsappMessage || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      return {
        payload: msg
          ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
          : `https://wa.me/${digits}`,
        valid: true,
      };
    }

    if (source.textMode === 'geo') {
      const lat = Number((source.geoLat || '').trim().replace(',', '.'));
      const lng = Number((source.geoLng || '').trim().replace(',', '.'));
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return {
          payload: '',
          valid: false,
          error: 'Indiquez des coordonnées GPS valides (latitude -90..90, longitude -180..180).',
        };
      }
      const label = (source.geoLabel || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      const latStr = lat.toFixed(6);
      const lngStr = lng.toFixed(6);
      return {
        payload: label
          ? `geo:${latStr},${lngStr}?q=${latStr},${lngStr}(${encodeURIComponent(label)})`
          : `geo:${latStr},${lngStr}`,
        valid: true,
      };
    }

    if (source.textMode === 'payment') {
      const mode = source.paymentMode || 'sepa';
      if (mode === 'link') {
        const rawUrl = (source.paymentUrl || '').trim();
        if (!rawUrl || hasAsciiControlChars(rawUrl) || /\s/.test(rawUrl)) {
          return { payload: '', valid: false, error: 'Collez un lien de paiement HTTPS valide.' };
        }
        const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        try {
          const parsed = new URL(normalized);
          if (
            parsed.protocol !== 'https:' ||
            parsed.username ||
            parsed.password ||
            parsed.hostname.toLowerCase().includes('xn--') ||
            isAiStudioOrPreviewHost(parsed.hostname) ||
            isLocalOrPrivateHost(parsed.hostname)
          ) {
            return {
              payload: '',
              valid: false,
              error: 'Utilisez une URL de paiement publique en HTTPS sans identifiants intégrés.',
            };
          }
          return { payload: parsed.toString(), valid: true };
        } catch {
          return { payload: '', valid: false, error: 'URL de paiement invalide.' };
        }
      }

      // Standard European EPC SEPA QR Code (v002)
      const name = (source.paymentName || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 70);
      const iban = (source.paymentIban || '').replace(/\s+/g, '').toUpperCase();
      const bic = (source.paymentBic || '').replace(/\s+/g, '').toUpperCase();
      const amountNum = Number((source.paymentAmount || '').trim().replace(',', '.'));
      const ref = (source.paymentReference || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 140);

      if (!name) {
        return { payload: '', valid: false, error: 'Indiquez le nom du bénéficiaire.' };
      }
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
        return { payload: '', valid: false, error: 'Saisissez un IBAN valide (ex. FR76...).' };
      }
      if (bic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
        return { payload: '', valid: false, error: 'Format de code BIC invalide (8 ou 11 caractères).' };
      }
      const amountLine =
        Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 999999999.99
          ? `EUR${amountNum.toFixed(2)}`
          : '';
      const epcLines = [
        'BCD',
        '002',
        '1',
        'SCT',
        bic,
        name,
        iban,
        amountLine,
        '',
        ref,
      ];
      return { payload: epcLines.join('\n'), valid: true };
    }

    const text = source.textValue.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (!text) {
      return { payload: '', valid: false, error: 'Saisissez un texte à encoder.' };
    }
    return { payload: text, valid: true };
  }

  if (source.type === 'image') {
    return buildHostedMediaTargetPayload(
      source.imageUrl.trim(),
      (source.imagePageUrl || source.imageUrl).trim(),
      'Importez une image ou collez son lien URL public.',
      publicOrigin
    );
  }

  if (source.type === 'document') {
    return buildHostedMediaTargetPayload(
      (source.documentUrl || '').trim(),
      (source.documentPageUrl || source.documentUrl || '').trim(),
      'Importez un document (PDF, DOCX, TXT) pour générer son QR.',
      publicOrigin
    );
  }

  if (source.type === 'audio') {
    return buildHostedMediaTargetPayload(
      (source.audioUrl || '').trim(),
      (source.audioPageUrl || source.audioUrl || '').trim(),
      'Importez un fichier audio (MP3, WAV, M4A) pour générer son QR.',
      publicOrigin
    );
  }

  // video
  return buildHostedMediaTargetPayload(
    source.videoUrl.trim(),
    (source.videoPageUrl || source.videoUrl).trim(),
    'Importez une vidéo ou collez son lien URL public.',
    publicOrigin
  );
}

export function verifyQrDecodeFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return result ? result.data : null;
}

export function verifyMatrixRoundTrip(matrix: QrMatrixData, expectedPayload: string): boolean {
  const margin = 4;
  const scale = 6;
  const dim = (matrix.size + margin * 2) * scale;
  const buffer = new Uint8ClampedArray(dim * dim * 4);
  buffer.fill(255);

  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.modules[r][c]) continue;
      const startX = (c + margin) * scale;
      const startY = (r + margin) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const idx = ((startY + dy) * dim + (startX + dx)) * 4;
          buffer[idx] = 0;
          buffer[idx + 1] = 0;
          buffer[idx + 2] = 0;
          buffer[idx + 3] = 255;
        }
      }
    }
  }

  const decoded = verifyQrDecodeFromImageData(buffer, dim, dim);
  return decoded === expectedPayload;
}

export function toAbsoluteUrl(input: string, origin: string): string {
  if (/^(https?:\/\/|data:|blob:)/i.test(input)) {
    return input;
  }
  const cleanOrigin = origin.replace(/\/+$/, '');
  const cleanPath = input.startsWith('/') ? input : `/${input}`;
  return `${cleanOrigin}${cleanPath}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
  }
  if (cleaned.length >= 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
  }
  return { r: 0, g: 0, b: 0 };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function hasActiveLogo(config: QrConfig, _source?: QrSourceState): boolean {
  if (config.customLogoDataUrl) return true;
  if (config.logoId) return true;
  if (config.centerEmoji && config.centerEmoji.trim().length > 0) return true;
  return false;
}

export function getEffectiveErrorCorrection(
  config: QrConfig,
  source?: QrSourceState
): QrErrorCorrection {
  if (hasActiveLogo(config, source)) {
    return 'H';
  }
  return config.errorCorrection;
}

export function evaluateScannability(
  config: QrConfig,
  source?: QrSourceState
): ScannabilityReport {
  const logoActive = hasActiveLogo(config, source);
  const effectiveErrorCorrection = getEffectiveErrorCorrection(config, source);

  const primaryContrast = contrastRatio(config.foregroundColor, config.qrBackgroundColor);
  const secondaryContrast =
    config.gradientType !== 'solid'
      ? contrastRatio(config.foregroundSecondaryColor, config.qrBackgroundColor)
      : primaryContrast;

  const minContrast = Math.min(primaryContrast, secondaryContrast);
  const fgLum = relativeLuminance(config.foregroundColor);
  const bgLum = relativeLuminance(config.qrBackgroundColor);
  const isLightOnDark =
    config.filter === 'inverted' ? bgLum > fgLum : fgLum > bgLum;

  if (minContrast < 2.8) {
    return {
      contrastRatio: minContrast,
      effectiveErrorCorrection,
      hasLogo: logoActive,
      status: 'risky',
      label: 'Contraste faible',
      detail: 'Augmentez l’écart entre les modules et le fond pour garantir la lecture.',
    };
  }

  if (minContrast < 4.5 || isLightOnDark) {
    return {
      contrastRatio: minContrast,
      effectiveErrorCorrection,
      hasLogo: logoActive,
      status: 'acceptable',
      label: isLightOnDark ? 'Mode inversé lisible' : 'Lisibilité correcte',
      detail: isLightOnDark
        ? 'La majorité des caméras récentes lisent le clair sur fond sombre.'
        : 'Contraste modéré ; testez le scan avant impression.',
    };
  }

  return {
    contrastRatio: minContrast,
    effectiveErrorCorrection,
    hasLogo: logoActive,
    status: 'optimal',
    label: 'Lisibilité optimale',
    detail: logoActive
      ? 'Correction d’erreur H (30 %) activée pour compenser le logo central.'
      : 'Contraste élevé et géométrie fiable sur tout lecteur.',
  };
}

/**
 * Checks whether (row, col) belongs to one of the three 7x7 finder patterns.
 */
export function isFinderCell(row: number, col: number, size: number): boolean {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= size - 7;
  const inBottomLeft = row >= size - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

/**
 * Checks whether (row, col) falls inside the central knockout clearing zone reserved for a logo.
 */
export function isInLogoKnockoutZone(
  row: number,
  col: number,
  size: number,
  logoSizeRatio: number,
  logoActive: boolean
): boolean {
  if (!logoActive) return false;
  const center = (size - 1) / 2;
  const halfSpan = (size * logoSizeRatio) / 2 + 0.35;
  return Math.abs(row - center) <= halfSpan && Math.abs(col - center) <= halfSpan;
}

export function generateQrMatrix(
  payload: string,
  errorCorrection: QrErrorCorrection
): QrMatrixData {
  const safePayload = payload.trim();
  if (!safePayload) {
    throw new Error('Contenu vide : aucune donnée à encoder dans le QR code.');
  }
  const fallbackOrder: QrErrorCorrection[] = [
    errorCorrection,
    'Q',
    'M',
    'L',
  ];
  let qr: ReturnType<typeof QRCode.create> | null = null;
  let lastError: unknown;
  for (const ecc of fallbackOrder) {
    try {
      qr = QRCode.create(safePayload, { errorCorrectionLevel: ecc });
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!qr) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Données trop volumineuses pour un code QR direct.');
  }
  const size = qr.modules.size;
  const data = qr.modules.data;
  const modules: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(Boolean(data[r * size + c]));
    }
    modules.push(row);
  }
  return {
    size,
    modules,
    version: qr.version,
  };
}

export interface ShowcaseBackdrop {
  outerBackground: string;
  accentGlow: string;
  cardBackground: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
  accentColor: string;
}

export function mixHexColors(hexA: string, hexB: string, weightB: number): string {
  const w = Math.max(0, Math.min(1, weightB));
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r * (1 - w) + b.r * w);
  const g = Math.round(a.g * (1 - w) + b.g * w);
  const bl = Math.round(a.b * (1 - w) + b.b * w);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function buildShowcaseBackdrop(
  config: QrConfig,
  mood: 'auto' | 'gold-velvet' | 'midnight-neon' | 'cinema-35' | 'botanical' = 'auto'
): ShowcaseBackdrop {
  if (mood === 'auto' && (config.themeId === 'vice-city-neon' || config.themeId === 'gta-vice-city')) {
    return {
      outerBackground:
        'radial-gradient(circle at 18% 12%, rgba(255,92,225,0.34), transparent 52%), radial-gradient(circle at 84% 82%, rgba(69,243,255,0.28), transparent 56%), linear-gradient(155deg, #16062c 0%, #100720 52%, #070312 100%)',
      accentGlow: 'rgba(255,92,225,0.42)',
      cardBackground: 'rgba(18, 7, 36, 0.94)',
      cardBorder: 'rgba(255, 92, 225, 0.38)',
      textPrimary: '#FFF5FC',
      textMuted: '#D6B4F7',
      accentColor: '#45F3FF',
    };
  }
  if (mood === 'auto' && (config.themeId === 'los-santos-prestige' || config.themeId === 'gta-los-santos')) {
    return {
      outerBackground:
        'radial-gradient(circle at 16% 16%, rgba(245,196,61,0.26), transparent 52%), radial-gradient(circle at 85% 84%, rgba(74,222,128,0.20), transparent 58%), linear-gradient(155deg, #0b100b 0%, #111711 55%, #070907 100%)',
      accentGlow: 'rgba(245,196,61,0.38)',
      cardBackground: 'rgba(14, 18, 14, 0.95)',
      cardBorder: 'rgba(212, 175, 55, 0.42)',
      textPrimary: '#FAF5E4',
      textMuted: '#B8C4B4',
      accentColor: '#F5C43D',
    };
  }
  if (mood === 'auto' && config.themeId === 'legend-ligue-arcane') {
    return {
      outerBackground:
        'radial-gradient(circle at 20% 14%, rgba(253,224,71,0.28), transparent 52%), radial-gradient(circle at 84% 82%, rgba(192,132,252,0.28), transparent 56%), linear-gradient(155deg, #1a0b38 0%, #110726 55%, #080314 100%)',
      accentGlow: 'rgba(253,224,71,0.42)',
      cardBackground: 'rgba(24, 11, 51, 0.94)',
      cardBorder: 'rgba(245, 158, 11, 0.44)',
      textPrimary: '#FEF9C3',
      textMuted: '#D8B4FE',
      accentColor: '#FDE047',
    };
  }
  if (mood === 'auto' && config.themeId === 'legend-magma-volcanique') {
    return {
      outerBackground:
        'radial-gradient(circle at 18% 16%, rgba(255,179,71,0.28), transparent 52%), radial-gradient(circle at 85% 84%, rgba(255,107,107,0.24), transparent 56%), linear-gradient(155deg, #210c07 0%, #160705 55%, #090302 100%)',
      accentGlow: 'rgba(249,115,22,0.4)',
      cardBackground: 'rgba(26, 10, 7, 0.94)',
      cardBorder: 'rgba(249, 115, 22, 0.38)',
      textPrimary: '#FFF3E6',
      textMuted: '#FDBA74',
      accentColor: '#FFB347',
    };
  }
  if (mood === 'gold-velvet') {
    return {
      outerBackground:
        'radial-gradient(circle at 20% 15%, rgba(245,208,97,0.22), transparent 55%), radial-gradient(circle at 85% 85%, rgba(198,146,20,0.18), transparent 60%), linear-gradient(155deg, #0b0907 0%, #16120c 55%, #090705 100%)',
      accentGlow: 'rgba(245,208,97,0.34)',
      cardBackground: 'rgba(22, 18, 13, 0.92)',
      cardBorder: 'rgba(245, 208, 97, 0.24)',
      textPrimary: '#FBF3DB',
      textMuted: '#C9B889',
      accentColor: '#F5D061',
    };
  }
  if (mood === 'midnight-neon') {
    return {
      outerBackground:
        'radial-gradient(circle at 18% 15%, rgba(56,189,248,0.28), transparent 52%), radial-gradient(circle at 82% 85%, rgba(129,140,248,0.24), transparent 58%), linear-gradient(155deg, #070a12 0%, #10172a 55%, #05070d 100%)',
      accentGlow: 'rgba(34,211,238,0.35)',
      cardBackground: 'rgba(13, 19, 34, 0.90)',
      cardBorder: 'rgba(56, 189, 248, 0.24)',
      textPrimary: '#F8FAFC',
      textMuted: '#94A3B8',
      accentColor: '#22D3EE',
    };
  }
  if (mood === 'cinema-35') {
    return {
      outerBackground:
        'radial-gradient(circle at 22% 18%, rgba(217,119,6,0.18), transparent 55%), radial-gradient(circle at 82% 85%, rgba(120,90,64,0.20), transparent 60%), linear-gradient(155deg, #14110f 0%, #1e1915 55%, #0f0c0a 100%)',
      accentGlow: 'rgba(245,158,11,0.26)',
      cardBackground: 'rgba(28, 23, 20, 0.92)',
      cardBorder: 'rgba(255, 244, 224, 0.14)',
      textPrimary: '#FAF5EC',
      textMuted: '#B8ABA0',
      accentColor: '#F59E0B',
    };
  }
  if (mood === 'botanical') {
    return {
      outerBackground:
        'radial-gradient(circle at 18% 12%, rgba(21,128,61,0.16), transparent 52%), radial-gradient(circle at 85% 88%, rgba(13,59,46,0.12), transparent 58%), linear-gradient(155deg, #eef4ef 0%, #e4ede6 52%, #f4f7f4 100%)',
      accentGlow: 'rgba(21,128,61,0.22)',
      cardBackground: 'rgba(255, 255, 255, 0.94)',
      cardBorder: 'rgba(13, 59, 46, 0.12)',
      textPrimary: '#0D3B2E',
      textMuted: '#4E6B60',
      accentColor: '#15803D',
    };
  }

  const accent = config.useCustomEyeColor
    ? config.eyeColor
    : config.gradientType !== 'solid'
    ? config.foregroundSecondaryColor
    : config.foregroundColor;

  const { r: ar, g: ag, b: ab } = hexToRgb(accent);
  const { r: pr, g: pg, b: pb } = hexToRgb(config.foregroundColor);
  const cardBg = config.cardBackgroundColor || '#FFFFFF';
  const bgLum = relativeLuminance(cardBg);
  const isDarkTheme = bgLum < 0.22;

  if (isDarkTheme) {
    const darkBaseTop = mixHexColors(cardBg, '#07090E', 0.35);
    const darkBaseMid = mixHexColors(cardBg, '#111622', 0.25);
    const darkCard = mixHexColors(cardBg, '#131722', 0.3);
    return {
      outerBackground: `radial-gradient(circle at 20% 15%, rgba(${ar},${ag},${ab},0.28), transparent 55%), radial-gradient(circle at 82% 85%, rgba(${pr},${pg},${pb},0.22), transparent 60%), linear-gradient(155deg, ${darkBaseTop} 0%, ${darkBaseMid} 55%, #07090D 100%)`,
      accentGlow: `rgba(${ar},${ag},${ab},0.35)`,
      cardBackground: darkCard,
      cardBorder: `rgba(${ar},${ag},${ab},0.24)`,
      textPrimary: '#F8FAFC',
      textMuted: '#A1A8B8',
      accentColor: accent,
    };
  }

  const lightBaseTop = mixHexColors(cardBg, '#F8FAFC', 0.45);
  const lightBaseMid = mixHexColors(cardBg, '#F1F5F9', 0.55);
  return {
    outerBackground: `radial-gradient(circle at 18% 12%, rgba(${ar},${ag},${ab},0.18), transparent 54%), radial-gradient(circle at 85% 88%, rgba(${pr},${pg},${pb},0.13), transparent 58%), linear-gradient(155deg, ${lightBaseTop} 0%, ${lightBaseMid} 52%, #FFFFFF 100%)`,
    accentGlow: `rgba(${ar},${ag},${ab},0.24)`,
    cardBackground: '#FFFFFF',
    cardBorder: `rgba(${ar},${ag},${ab},0.16)`,
    textPrimary: '#111214',
    textMuted: '#5C5E66',
    accentColor: accent,
  };
}

export function extractHostname(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return urlString;
  }
}

export interface CornerStickerPoint {
  corner: 'tl' | 'tr' | 'bl' | 'br';
  x: number;
  y: number;
  rotation: number;
  needsBacking: boolean;
}

export function getCardLayout(frameStyle: QrFrameStyle): {
  width: number;
  height: number;
  qrSize: number;
  qrX: number;
  qrY: number;
} {
  const cardWidth = 400;
  switch (frameStyle) {
    case 'none':
      return { width: cardWidth, height: 400, qrSize: 368, qrX: 16, qrY: 16 };
    case 'signature':
      return { width: cardWidth, height: 504, qrSize: 336, qrX: 32, qrY: 76 };
    case 'ticket':
      return { width: cardWidth, height: 516, qrSize: 336, qrX: 32, qrY: 28 };
    case 'glass':
    case 'smoked-glass':
      return { width: cardWidth, height: 512, qrSize: 328, qrX: 36, qrY: 84 };
    case 'vip-gold':
    case 'limited':
      return { width: cardWidth, height: 520, qrSize: 328, qrX: 36, qrY: 82 };
    case 'polaroid':
      return { width: cardWidth, height: 496, qrSize: 348, qrX: 26, qrY: 26 };
    default:
      return { width: cardWidth, height: 504, qrSize: 336, qrX: 32, qrY: 76 };
  }
}

export function computeCornerStickerPositions(
  placement: QrCornerPlacement,
  frameStyle: QrFrameStyle,
  layout: { width: number; height: number; qrX: number; qrY: number; qrSize: number },
  offsetDelta = 0
): CornerStickerPoint[] {
  if (placement === 'none') return [];

  let coords: Record<'tl' | 'tr' | 'bl' | 'br', Omit<CornerStickerPoint, 'corner'>>;

  if (frameStyle === 'signature') {
    coords = {
      tl: { x: 42, y: 39, rotation: -10, needsBacking: false },
      tr: { x: layout.width - 42, y: 39, rotation: 10, needsBacking: false },
      bl: { x: 42, y: 460, rotation: -8, needsBacking: false },
      br: { x: layout.width - 42, y: 460, rotation: 8, needsBacking: false },
    };
  } else if (
    frameStyle === 'glass' ||
    frameStyle === 'smoked-glass' ||
    frameStyle === 'vip-gold' ||
    frameStyle === 'limited'
  ) {
    coords = {
      tl: { x: 42, y: 46, rotation: -10, needsBacking: false },
      tr: { x: layout.width - 42, y: 46, rotation: 10, needsBacking: false },
      bl: { x: 42, y: layout.height - 46, rotation: -8, needsBacking: false },
      br: { x: layout.width - 42, y: layout.height - 46, rotation: 8, needsBacking: false },
    };
  } else if (frameStyle === 'ticket') {
    coords = {
      tl: { x: 26, y: 26, rotation: -12, needsBacking: true },
      tr: { x: layout.width - 26, y: 26, rotation: 12, needsBacking: true },
      bl: { x: 44, y: 454, rotation: -8, needsBacking: false },
      br: { x: layout.width - 44, y: 454, rotation: 8, needsBacking: false },
    };
  } else if (frameStyle === 'polaroid') {
    coords = {
      tl: { x: 24, y: 24, rotation: -12, needsBacking: true },
      tr: { x: layout.width - 24, y: 24, rotation: 12, needsBacking: true },
      bl: { x: 42, y: 442, rotation: -8, needsBacking: false },
      br: { x: layout.width - 42, y: 442, rotation: 8, needsBacking: false },
    };
  } else {
    // 'none' — sits at the extreme outer card corners in the safe margin
    coords = {
      tl: { x: 22, y: 22, rotation: -12, needsBacking: true },
      tr: { x: layout.width - 22, y: 22, rotation: 12, needsBacking: true },
      bl: { x: 22, y: layout.height - 22, rotation: -10, needsBacking: true },
      br: { x: layout.width - 22, y: layout.height - 22, rotation: 10, needsBacking: true },
    };
  }

  const keysByPlacement: Record<Exclude<QrCornerPlacement, 'none'>, Array<'tl' | 'tr' | 'bl' | 'br'>> = {
    'all-4': ['tl', 'tr', 'bl', 'br'],
    'top-2': ['tl', 'tr'],
    'bottom-2': ['bl', 'br'],
    diagonal: ['tl', 'br'],
    'bottom-right': ['br'],
  };

  return keysByPlacement[placement].map((corner) => {
    const base = coords[corner];
    const dirX = corner === 'tl' || corner === 'bl' ? -1 : 1;
    const dirY = corner === 'tl' || corner === 'tr' ? -1 : 1;
    return {
      corner,
      ...base,
      x: Math.max(16, Math.min(layout.width - 16, base.x + dirX * offsetDelta)),
      y: Math.max(16, Math.min(layout.height - 16, base.y + dirY * offsetDelta)),
    };
  });
}


