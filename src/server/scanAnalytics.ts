import type { Request } from 'express';

export type ScanDeviceType = 'mobile' | 'desktop' | 'other';

export interface ServerDynamicScanEvent {
  at: string;
  device: string;
  deviceType?: ScanDeviceType;
  location?: string;
  unlocked: boolean;
}

export interface ServerDynamicStats {
  totalScans: number;
  lastScannedAt: string | null;
  deviceBreakdown?: {
    mobile: number;
    desktop: number;
    other: number;
  };
  locationCounts?: Record<string, number>;
  recentEvents: ServerDynamicScanEvent[];
}

export function classifyDeviceType(ua: string | undefined): ScanDeviceType {
  const agent = ua || '';
  if (
    /iPhone|iPad|iPod|Android|Mobile|Silk\/|Kindle|BlackBerry|Opera Mini|IEMobile|Tablet/i.test(
      agent
    )
  ) {
    return 'mobile';
  }
  if (/Macintosh|Windows NT|Windows|Linux|X11|CrOS/i.test(agent)) {
    return 'desktop';
  }
  return 'other';
}

export function summarizeDevice(ua: string | undefined): string {
  const agent = ua || '';
  if (/iPhone|iPad|iPod/i.test(agent)) return 'iOS Mobile';
  if (/Android/i.test(agent)) return 'Android Mobile';
  if (/Mobile|Tablet|Silk\/|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(agent)) {
    return 'Mobile';
  }
  if (/Macintosh/i.test(agent)) return 'macOS Desktop';
  if (/Windows/i.test(agent)) return 'Windows Desktop';
  if (/CrOS/i.test(agent)) return 'ChromeOS Desktop';
  if (/Linux|X11/i.test(agent)) return 'Linux Desktop';
  return 'Navigateur Web';
}

function cleanGeoText(raw: string | undefined): string {
  if (!raw) return '';
  let decoded = raw.trim();
  if (/%[0-9A-Fa-f]{2}/.test(decoded)) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Keep original string if malformed percent-encoding
    }
  }
  return decoded
    .replace(/[\r\n\t<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function isUsableGeoToken(value: string): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return (
    lower !== 'xx' &&
    lower !== 't1' &&
    lower !== 'unknown' &&
    lower !== 'null' &&
    lower !== 'undefined' &&
    lower !== '-'
  );
}

export function resolveGeoFromHeaders(
  getHeader: (name: string) => string | undefined
): { location: string; exact: boolean } | null {
  const cityCandidates = [
    getHeader('cf-ipcity'),
    getHeader('x-vercel-ip-city'),
    getHeader('x-appengine-city'),
    getHeader('x-geo-city'),
  ];
  const countryCandidates = [
    getHeader('cf-ipcountry'),
    getHeader('x-vercel-ip-country'),
    getHeader('x-appengine-country'),
    getHeader('x-geo-country'),
    getHeader('x-country-code'),
  ];

  const city = cityCandidates.map(cleanGeoText).find(isUsableGeoToken) || '';
  const country = countryCandidates.map(cleanGeoText).find(isUsableGeoToken) || '';

  if (city && country) {
    return { location: `${city}, ${country.toUpperCase()}`, exact: true };
  }
  if (city) {
    return { location: city, exact: true };
  }
  if (country) {
    return { location: country.toUpperCase(), exact: false };
  }
  return null;
}

export function normalizeClientIp(rawIp: string | undefined): string {
  if (!rawIp) return '';
  let ip = rawIp.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  // Strip IPv4 port suffix if present (e.g., 203.0.113.5:43210)
  const ipv4PortMatch = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4PortMatch) {
    ip = ipv4PortMatch[1];
  }
  return ip.slice(0, 64);
}

export function extractClientIpFromRequest(req: Request): string {
  const candidates = [
    req.get('cf-connecting-ip'),
    req.get('x-forwarded-for'),
    req.get('x-real-ip'),
    req.ip,
    req.socket?.remoteAddress,
  ];
  for (const cand of candidates) {
    const normalized = normalizeClientIp(cand);
    if (normalized) return normalized;
  }
  return '';
}

export function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === 'localhost' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  const parts = lower.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return !lower.includes(':');
  }
  const [a, b] = parts;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

interface GeoCacheEntry {
  location: string;
  expiresAt: number;
}

const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GEO_CACHE_MAX_ENTRIES = 500;
const geoIpCache = new Map<string, GeoCacheEntry>();
const geoInFlight = new Map<string, Promise<string | null>>();

export function getCachedIpLocation(ip: string): string | null {
  const entry = geoIpCache.get(ip);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    geoIpCache.delete(ip);
    return null;
  }
  return entry.location;
}

function setCachedIpLocation(ip: string, location: string): void {
  if (geoIpCache.size >= GEO_CACHE_MAX_ENTRIES) {
    const oldestKey = geoIpCache.keys().next().value;
    if (oldestKey) geoIpCache.delete(oldestKey);
  }
  geoIpCache.set(ip, {
    location,
    expiresAt: Date.now() + GEO_CACHE_TTL_MS,
  });
}

export async function lookupPublicIpLocation(ip: string): Promise<string | null> {
  if (!ip || isPrivateOrLocalIp(ip)) return null;
  const cached = getCachedIpLocation(ip);
  if (cached) return cached;

  const existing = geoInFlight.get(ip);
  if (existing) return existing;

  const task = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1600);
      try {
        const res = await fetch(
          `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,country_code`,
          { signal: controller.signal }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          success?: boolean;
          city?: string;
          country_code?: string;
        };
        if (!data?.success) return null;
        const city = cleanGeoText(data.city);
        const country = cleanGeoText(data.country_code).toUpperCase();
        const label =
          city && country ? `${city}, ${country}` : city || country || null;
        if (label) {
          setCachedIpLocation(ip, label);
        }
        return label;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    } finally {
      geoInFlight.delete(ip);
    }
  })();

  geoInFlight.set(ip, task);
  return task;
}

export function resolveImmediateScanLocation(req: Request): {
  location: string;
  needsAsyncIpLookup: boolean;
  clientIp: string;
} {
  const fromHeaders = resolveGeoFromHeaders((name) => req.get(name));
  if (fromHeaders?.exact) {
    return { location: fromHeaders.location, needsAsyncIpLookup: false, clientIp: '' };
  }

  const clientIp = extractClientIpFromRequest(req);
  if (!clientIp || isPrivateOrLocalIp(clientIp)) {
    return {
      location: fromHeaders?.location || 'Réseau local',
      needsAsyncIpLookup: false,
      clientIp: '',
    };
  }

  const cached = getCachedIpLocation(clientIp);
  if (cached) {
    return { location: cached, needsAsyncIpLookup: false, clientIp };
  }

  return {
    location: fromHeaders?.location || 'Localisation en cours',
    needsAsyncIpLookup: true,
    clientIp,
  };
}

function buildBaselineBreakdown(stats: ServerDynamicStats): {
  mobile: number;
  desktop: number;
  other: number;
} {
  if (stats.deviceBreakdown) {
    return {
      mobile: Math.max(0, Number(stats.deviceBreakdown.mobile) || 0),
      desktop: Math.max(0, Number(stats.deviceBreakdown.desktop) || 0),
      other: Math.max(0, Number(stats.deviceBreakdown.other) || 0),
    };
  }
  let mobile = 0;
  let desktop = 0;
  let other = 0;
  for (const ev of stats.recentEvents || []) {
    const dt = ev.deviceType || classifyDeviceType(ev.device);
    if (dt === 'mobile') mobile += 1;
    else if (dt === 'desktop') desktop += 1;
    else other += 1;
  }
  return { mobile, desktop, other };
}

export function applyDynamicScanEvent(
  stats: ServerDynamicStats,
  params: {
    at: string;
    userAgent?: string;
    location: string;
    unlocked?: boolean;
  }
): ServerDynamicStats {
  const deviceType = classifyDeviceType(params.userAgent);
  const device = summarizeDevice(params.userAgent);
  const location = cleanGeoText(params.location) || 'Inconnue';

  const breakdown = buildBaselineBreakdown(stats);
  breakdown[deviceType] += 1;

  const locationCounts: Record<string, number> = {
    ...(stats.locationCounts || {}),
  };
  locationCounts[location] = (locationCounts[location] || 0) + 1;

  const event: ServerDynamicScanEvent = {
    at: params.at,
    device,
    deviceType,
    location,
    unlocked: params.unlocked ?? true,
  };

  return {
    totalScans: (stats.totalScans || 0) + 1,
    lastScannedAt: params.at,
    deviceBreakdown: breakdown,
    locationCounts,
    recentEvents: [event, ...(stats.recentEvents || [])].slice(0, 20),
  };
}

export function replaceDynamicScanLocation(
  stats: ServerDynamicStats,
  params: { at: string; oldLocation: string; newLocation: string }
): ServerDynamicStats {
  const cleanNew = cleanGeoText(params.newLocation);
  if (!cleanNew || cleanNew === params.oldLocation) return stats;

  const locationCounts: Record<string, number> = {
    ...(stats.locationCounts || {}),
  };
  if (locationCounts[params.oldLocation]) {
    locationCounts[params.oldLocation] = Math.max(
      0,
      locationCounts[params.oldLocation] - 1
    );
    if (locationCounts[params.oldLocation] === 0) {
      delete locationCounts[params.oldLocation];
    }
  }
  locationCounts[cleanNew] = (locationCounts[cleanNew] || 0) + 1;

  const recentEvents = (stats.recentEvents || []).map((ev) =>
    ev.at === params.at && ev.location === params.oldLocation
      ? { ...ev, location: cleanNew }
      : ev
  );

  return {
    ...stats,
    locationCounts,
    recentEvents,
  };
}
