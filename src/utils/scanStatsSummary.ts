import type { DynamicQrStats, DynamicScanEvent } from '../types/qr';

export interface DynamicScanStatsSummary {
  totalScans: number;
  lastScannedAt: string | null;
  mobileScans: number;
  desktopScans: number;
  otherScans: number;
  mobilePercent: number;
  desktopPercent: number;
  topLocations: Array<{ label: string; count: number }>;
  primaryLocation: string;
  primaryDeviceLabel: string;
}

export function inferEventDeviceType(
  event: Pick<DynamicScanEvent, 'device' | 'deviceType'>
): 'mobile' | 'desktop' | 'other' {
  if (
    event.deviceType === 'mobile' ||
    event.deviceType === 'desktop' ||
    event.deviceType === 'other'
  ) {
    return event.deviceType;
  }
  const label = (event.device || '').toLowerCase();
  if (/mobile|ios|android|iphone|ipad|tablette|tablet/.test(label)) {
    return 'mobile';
  }
  if (/desktop|macos|windows|linux|chromeos|ordinateur/.test(label)) {
    return 'desktop';
  }
  return 'other';
}

export function summarizeDynamicScanStats(
  stats?: DynamicQrStats | null
): DynamicScanStatsSummary {
  if (!stats) {
    return {
      totalScans: 0,
      lastScannedAt: null,
      mobileScans: 0,
      desktopScans: 0,
      otherScans: 0,
      mobilePercent: 0,
      desktopPercent: 0,
      topLocations: [],
      primaryLocation: 'En attente du 1er scan',
      primaryDeviceLabel: 'Aucun scan enregistré',
    };
  }

  const totalScans = Math.max(0, Number(stats.totalScans) || 0);
  const events = Array.isArray(stats.recentEvents) ? stats.recentEvents : [];

  let mobileScans = 0;
  let desktopScans = 0;
  let otherScans = 0;

  if (stats.deviceBreakdown) {
    mobileScans = Math.max(0, Number(stats.deviceBreakdown.mobile) || 0);
    desktopScans = Math.max(0, Number(stats.deviceBreakdown.desktop) || 0);
    otherScans = Math.max(0, Number(stats.deviceBreakdown.other) || 0);
  } else {
    for (const ev of events) {
      const kind = inferEventDeviceType(ev);
      if (kind === 'mobile') mobileScans += 1;
      else if (kind === 'desktop') desktopScans += 1;
      else otherScans += 1;
    }
  }

  const deviceTotal = mobileScans + desktopScans + otherScans;
  const mobilePercent =
    deviceTotal > 0 ? Math.round((mobileScans / deviceTotal) * 100) : 0;
  const desktopPercent =
    deviceTotal > 0 ? Math.round((desktopScans / deviceTotal) * 100) : 0;

  const locMap = new Map<string, number>();
  if (stats.locationCounts && Object.keys(stats.locationCounts).length > 0) {
    for (const [label, count] of Object.entries(stats.locationCounts)) {
      const clean = label.trim();
      if (!clean || Number(count) <= 0) continue;
      locMap.set(clean, (locMap.get(clean) || 0) + Number(count));
    }
  } else {
    for (const ev of events) {
      const clean = (ev.location || '').trim();
      if (!clean) continue;
      locMap.set(clean, (locMap.get(clean) || 0) + 1);
    }
  }

  const resolvedLocations = Array.from(locMap.entries())
    .filter(([label]) => label !== 'Localisation en cours')
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  const topLocations =
    resolvedLocations.length > 0
      ? resolvedLocations
      : locMap.has('Localisation en cours')
      ? [{ label: 'Détection en cours', count: locMap.get('Localisation en cours')! }]
      : [];

  let primaryLocation = 'En attente du 1er scan';
  if (totalScans > 0) {
    if (topLocations.length > 0) {
      primaryLocation = topLocations[0].label;
    } else {
      primaryLocation = 'Non renseignée';
    }
  }

  let primaryDeviceLabel = 'Aucun scan enregistré';
  if (totalScans > 0) {
    if (mobileScans === 0 && desktopScans === 0 && otherScans > 0) {
      primaryDeviceLabel = `Autre (${otherScans})`;
    } else if (mobileScans > 0 && desktopScans === 0) {
      primaryDeviceLabel = `Mobile (${mobileScans})`;
    } else if (desktopScans > 0 && mobileScans === 0) {
      primaryDeviceLabel = `Ordinateur (${desktopScans})`;
    } else {
      primaryDeviceLabel = `Mobile ${mobileScans} · Ordi ${desktopScans}`;
    }
  }

  return {
    totalScans,
    lastScannedAt: stats.lastScannedAt || null,
    mobileScans,
    desktopScans,
    otherScans,
    mobilePercent,
    desktopPercent,
    topLocations,
    primaryLocation,
    primaryDeviceLabel,
  };
}
