import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DosyaStorageService } from './dosyaStorage.ts';
import { readWorkspaceProjects, writeWorkspaceProjects } from './workspaceStore.ts';
import {
  addMonthsToIso,
  classifyRetentionStatus,
  getDueNotificationMilestones,
  normalizePricingConfig,
  type NotificationMilestone,
  type PricingConfig,
} from '../utils/retentionPricing.ts';
import type {
  DeletionAuditEntry,
  RetentionNotification,
  StorageDashboardItem,
} from '../types/qr.ts';

export interface MediaRecordLike {
  id: string;
  ownerWorkspaceId?: string;
  kind?: 'media' | 'collection';
  type: 'image' | 'video' | 'document' | 'audio' | 'collection';
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  isEncrypted?: boolean;
  e2eeVersion?: 1;
  encryptedMeta?: unknown;
  retentionPlanMonths?: number | null;
  extraS3Keys?: string[];
  sentMilestones?: NotificationMilestone[];
  storage?: {
    provider: 'dosya-s3' | 'demo' | 'collection';
    bucket?: string;
    key?: string;
    etag?: string;
    endpoint?: string;
    region?: string;
  };
  posterUrl?: string;
  source?: Record<string, unknown>;
  experience?: Record<string, unknown>;
  config?: Record<string, unknown>;
  serverExpiresAt?: string | null;
  createdAt: string;
}

export interface DynamicRecordLike {
  slug: string;
  ownerWorkspaceId?: string;
  active: boolean;
  pinSalt: string | null;
  pinHash: string | null;
  expiresAt: string | null;
  retentionPlanMonths?: number | null;
  isEncrypted?: boolean;
  sentMilestones?: NotificationMilestone[];
  maxScans: number | null;
  createdAt: string;
  updatedAt: string;
  destination: {
    intent: string;
    payload: string;
    title: string;
    sourceSnapshot: Record<string, unknown>;
    experience: Record<string, unknown>;
    cardTheme: Record<string, unknown>;
    config?: Record<string, unknown>;
  };
  stats: {
    totalScans: number;
    lastScannedAt: string | null;
    recentEvents: Array<{ at: string; device: string; unlocked: boolean }>;
  };
}

export interface DeletionJobRecord {
  id: string;
  workspaceId: string;
  resourceKind: 'media' | 'collection' | 'dynamic';
  resourceId: string;
  reason: 'expired' | 'manual';
  pendingS3Keys: string[];
  freedBytes: number;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSubscriptionRecord {
  workspaceId: string;
  email: string;
  verified: boolean;
  optedIn: boolean;
  verificationCodeHash?: string;
  verificationExpiresAt?: string;
  updatedAt: string;
}

interface WorkspaceStatsRecord {
  freedBytes: number;
  updatedAt: string;
}

export function readJsonFileSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFileSafe<T>(filePath: string, data: T): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function extractMediaIdFromAssetUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const match = rawUrl.match(/\/api\/media\/([a-zA-Z0-9_-]+)\/(?:file|download)/);
  return match ? match[1] : null;
}

export function collectReferencedMediaIds(
  source?: Record<string, unknown>,
  experience?: Record<string, unknown>
): string[] {
  const ids = new Set<string>();
  if (source) {
    for (const field of ['imageUrl', 'videoUrl', 'videoPosterUrl']) {
      const id = extractMediaIdFromAssetUrl(source[field]);
      if (id) ids.add(id);
    }
  }
  if (experience && Array.isArray(experience.galleryItems)) {
    for (const item of experience.galleryItems) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const urlId = extractMediaIdFromAssetUrl(rec.url);
        if (urlId) ids.add(urlId);
        const posterId = extractMediaIdFromAssetUrl(rec.posterUrl);
        if (posterId) ids.add(posterId);
      }
    }
  }
  return Array.from(ids);
}

export function collectS3KeysForMediaRecord(
  record: MediaRecordLike,
  mediaIndex: Record<string, MediaRecordLike>,
  includeReferencedAssets = false
): string[] {
  const keys = new Set<string>();
  if (record.storage?.provider === 'dosya-s3' && record.storage.key) {
    keys.add(record.storage.key);
  }
  if (Array.isArray(record.extraS3Keys)) {
    for (const k of record.extraS3Keys) {
      if (typeof k === 'string' && k.trim()) keys.add(k.trim());
    }
  }
  const posterId = extractMediaIdFromAssetUrl(record.posterUrl);
  if (posterId && mediaIndex[posterId]?.storage?.key) {
    keys.add(mediaIndex[posterId].storage!.key!);
  }
  if (includeReferencedAssets) {
    const refIds = collectReferencedMediaIds(record.source, record.experience);
    for (const refId of refIds) {
      const refRec = mediaIndex[refId];
      if (refRec?.storage?.provider === 'dosya-s3' && refRec.storage.key) {
        keys.add(refRec.storage.key);
      }
    }
  }
  return Array.from(keys);
}

function isMediaReferencedElsewhere(
  targetMediaId: string,
  excludingKind: 'media' | 'collection' | 'dynamic',
  excludingId: string,
  mediaIndex: Record<string, MediaRecordLike>,
  dynamicStore: Record<string, DynamicRecordLike>
): boolean {
  for (const [id, rec] of Object.entries(mediaIndex)) {
    if (excludingKind === 'collection' && id === excludingId) continue;
    if (excludingKind === 'media' && id === excludingId) continue;
    if (rec.kind === 'collection') {
      const refs = collectReferencedMediaIds(rec.source, rec.experience);
      if (refs.includes(targetMediaId)) return true;
    }
  }
  for (const [slug, dyn] of Object.entries(dynamicStore)) {
    if (excludingKind === 'dynamic' && slug === excludingId) continue;
    const refs = collectReferencedMediaIds(
      dyn.destination?.sourceSnapshot,
      dyn.destination?.experience
    );
    if (refs.includes(targetMediaId)) return true;
  }
  return false;
}

export interface RetentionStorePaths {
  dataDir: string;
  mediaIndexFile: string;
  dynamicFile: string;
  notificationsFile: string;
  deletionJobsFile: string;
  deletionAuditFile: string;
  workspaceStatsFile: string;
  pricingConfigFile: string;
  emailSubsFile: string;
}

export function getRetentionStorePaths(dataDir: string): RetentionStorePaths {
  return {
    dataDir,
    mediaIndexFile: path.join(dataDir, 'media-index.json'),
    dynamicFile: path.join(dataDir, 'dynamic-qrs.json'),
    notificationsFile: path.join(dataDir, 'notifications.json'),
    deletionJobsFile: path.join(dataDir, 'deletion-jobs.json'),
    deletionAuditFile: path.join(dataDir, 'deletion-audit.json'),
    workspaceStatsFile: path.join(dataDir, 'workspace-stats.json'),
    pricingConfigFile: path.join(dataDir, 'pricing-config.json'),
    emailSubsFile: path.join(dataDir, 'email-subscriptions.json'),
  };
}

export type AlertEmailDispatchFn = (params: {
  email: string;
  subject: string;
  textBody: string;
}) => Promise<void>;

export class RetentionEngine {
  private readonly paths: RetentionStorePaths;
  private readonly storage: DosyaStorageService;
  private readonly sendAlertEmail?: AlertEmailDispatchFn;
  private runningSweep = false;

  constructor(
    dataDir: string,
    storage: DosyaStorageService,
    sendAlertEmail?: AlertEmailDispatchFn
  ) {
    this.paths = getRetentionStorePaths(dataDir);
    this.storage = storage;
    this.sendAlertEmail = sendAlertEmail;
  }

  getPricingConfig(): PricingConfig {
    const raw = readJsonFileSafe<Partial<PricingConfig> | null>(
      this.paths.pricingConfigFile,
      null
    );
    return normalizePricingConfig(raw);
  }

  savePricingConfig(next: Partial<PricingConfig>): PricingConfig {
    const normalized = normalizePricingConfig({
      ...next,
      updatedAt: new Date().toISOString(),
    });
    writeJsonFileSafe(this.paths.pricingConfigFile, normalized);
    return normalized;
  }

  getWorkspaceStats(workspaceId: string): WorkspaceStatsRecord {
    const all = readJsonFileSafe<Record<string, WorkspaceStatsRecord>>(
      this.paths.workspaceStatsFile,
      {}
    );
    return all[workspaceId] || { freedBytes: 0, updatedAt: new Date().toISOString() };
  }

  private addFreedBytes(workspaceId: string, bytes: number): void {
    if (!workspaceId || bytes <= 0) return;
    const all = readJsonFileSafe<Record<string, WorkspaceStatsRecord>>(
      this.paths.workspaceStatsFile,
      {}
    );
    const cur = all[workspaceId] || { freedBytes: 0, updatedAt: new Date().toISOString() };
    all[workspaceId] = {
      freedBytes: cur.freedBytes + bytes,
      updatedAt: new Date().toISOString(),
    };
    writeJsonFileSafe(this.paths.workspaceStatsFile, all);
  }

  listNotifications(workspaceId: string): RetentionNotification[] {
    const all = readJsonFileSafe<RetentionNotification[]>(this.paths.notificationsFile, []);
    return all
      .filter((n) => n.workspaceId === workspaceId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  markNotificationsRead(workspaceId: string, ids?: string[]): void {
    const all = readJsonFileSafe<RetentionNotification[]>(this.paths.notificationsFile, []);
    const idSet = ids && ids.length > 0 ? new Set(ids) : null;
    const next = all.map((n) => {
      if (n.workspaceId !== workspaceId) return n;
      if (idSet && !idSet.has(n.id)) return n;
      return { ...n, read: true };
    });
    writeJsonFileSafe(this.paths.notificationsFile, next);
  }

  appendNotification(entry: Omit<RetentionNotification, 'id' | 'createdAt' | 'read'>): RetentionNotification {
    const all = readJsonFileSafe<RetentionNotification[]>(this.paths.notificationsFile, []);
    const created: RetentionNotification = {
      ...entry,
      id: `notif_${crypto.randomBytes(6).toString('hex')}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    const next = [created, ...all].slice(0, 500);
    writeJsonFileSafe(this.paths.notificationsFile, next);
    return created;
  }

  listAuditLog(workspaceId: string): DeletionAuditEntry[] {
    const all = readJsonFileSafe<DeletionAuditEntry[]>(this.paths.deletionAuditFile, []);
    return all
      .filter((a) => a.workspaceId === workspaceId)
      .sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
  }

  private appendAuditEntry(entry: Omit<DeletionAuditEntry, 'id'>): void {
    const all = readJsonFileSafe<DeletionAuditEntry[]>(this.paths.deletionAuditFile, []);
    const record: DeletionAuditEntry = {
      ...entry,
      id: `del_${crypto.randomBytes(6).toString('hex')}`,
    };
    writeJsonFileSafe(this.paths.deletionAuditFile, [record, ...all].slice(0, 1000));
  }

  getEmailSubscription(workspaceId: string): EmailSubscriptionRecord | null {
    const map = readJsonFileSafe<Record<string, EmailSubscriptionRecord>>(
      this.paths.emailSubsFile,
      {}
    );
    return map[workspaceId] || null;
  }

  saveEmailSubscription(record: EmailSubscriptionRecord): void {
    const map = readJsonFileSafe<Record<string, EmailSubscriptionRecord>>(
      this.paths.emailSubsFile,
      {}
    );
    map[record.workspaceId] = record;
    writeJsonFileSafe(this.paths.emailSubsFile, map);
  }

  deleteEmailSubscription(workspaceId: string): void {
    const map = readJsonFileSafe<Record<string, EmailSubscriptionRecord>>(
      this.paths.emailSubsFile,
      {}
    );
    delete map[workspaceId];
    writeJsonFileSafe(this.paths.emailSubsFile, map);
  }

  /**
   * Safe anonymized label for notifications (never includes private text or encrypted filenames)
   */
  private safeNotificationTitle(
    isEncrypted: boolean | undefined,
    kind: 'media' | 'collection' | 'dynamic',
    id: string
  ): string {
    const shortId = id.slice(0, 6);
    if (isEncrypted) {
      return `QR chiffré #${shortId}`;
    }
    if (kind === 'dynamic') return `QR dynamique #${shortId}`;
    if (kind === 'collection') return `Collection #${shortId}`;
    return `Média #${shortId}`;
  }

  private async maybeSendEmailAlert(
    workspaceId: string,
    title: string,
    message: string
  ): Promise<void> {
    if (!this.sendAlertEmail) return;
    const sub = this.getEmailSubscription(workspaceId);
    if (!sub || !sub.verified || !sub.optedIn || !sub.email) return;
    try {
      await this.sendAlertEmail({
        email: sub.email,
        subject: `SparkQR — Alerte de conservation (${title})`,
        textBody: `${message}\n\nAucun contenu privé n’est inclus dans ce message.\nGérez vos QR codes depuis votre espace « Stockage et conservation » sur SparkQR.`,
      });
    } catch (err) {
      console.error('Non-fatal email alert error:', err);
    }
  }

  async deleteResourceNow(params: {
    kind: 'media' | 'collection' | 'dynamic';
    id: string;
    reason: 'expired' | 'manual';
    nowMs?: number;
  }): Promise<{
    deleted: boolean;
    freedBytes: number;
    s3ObjectsDeleted: number;
    pendingRetry: boolean;
  }> {
    const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
    const mediaIndex = readJsonFileSafe<Record<string, MediaRecordLike>>(
      this.paths.mediaIndexFile,
      {}
    );
    const dynamicStore = readJsonFileSafe<Record<string, DynamicRecordLike>>(
      this.paths.dynamicFile,
      {}
    );

    const s3KeysToDelete = new Set<string>();
    let freedBytes = 0;
    let workspaceId = '';
    let isEncrypted = false;
    const mediaIdsToRemove = new Set<string>();

    if (params.kind === 'media' || params.kind === 'collection') {
      const rec = mediaIndex[params.id];
      if (!rec) {
        return { deleted: false, freedBytes: 0, s3ObjectsDeleted: 0, pendingRetry: false };
      }
      workspaceId = rec.ownerWorkspaceId || '';
      isEncrypted = Boolean(rec.isEncrypted);
      freedBytes += Number(rec.size || 0);
      mediaIdsToRemove.add(rec.id);

      for (const k of collectS3KeysForMediaRecord(rec, mediaIndex, false)) {
        s3KeysToDelete.add(k);
      }

      if (rec.kind === 'collection') {
        const refIds = collectReferencedMediaIds(rec.source, rec.experience);
        for (const refId of refIds) {
          const refRec = mediaIndex[refId];
          if (!refRec) continue;
          const stillUsed = isMediaReferencedElsewhere(
            refId,
            'collection',
            rec.id,
            mediaIndex,
            dynamicStore
          );
          if (!stillUsed) {
            freedBytes += Number(refRec.size || 0);
            mediaIdsToRemove.add(refId);
            for (const k of collectS3KeysForMediaRecord(refRec, mediaIndex, false)) {
              s3KeysToDelete.add(k);
            }
          }
        }
      }
    } else if (params.kind === 'dynamic') {
      const dyn = dynamicStore[params.id];
      if (!dyn) {
        return { deleted: false, freedBytes: 0, s3ObjectsDeleted: 0, pendingRetry: false };
      }
      workspaceId = dyn.ownerWorkspaceId || '';
      isEncrypted = Boolean(dyn.isEncrypted);
      const refIds = collectReferencedMediaIds(
        dyn.destination?.sourceSnapshot,
        dyn.destination?.experience
      );
      for (const refId of refIds) {
        const refRec = mediaIndex[refId];
        if (!refRec) continue;
        const stillUsed = isMediaReferencedElsewhere(
          refId,
          'dynamic',
          dyn.slug,
          mediaIndex,
          dynamicStore
        );
        if (!stillUsed) {
          freedBytes += Number(refRec.size || 0);
          mediaIdsToRemove.add(refId);
          for (const k of collectS3KeysForMediaRecord(refRec, mediaIndex, false)) {
            s3KeysToDelete.add(k);
          }
        }
      }
      delete dynamicStore[params.id];
      writeJsonFileSafe(this.paths.dynamicFile, dynamicStore);
    }

    // Remove targeted media records from index immediately so expired/deleted items are never served again
    for (const id of mediaIdsToRemove) {
      delete mediaIndex[id];
    }
    if (mediaIdsToRemove.size > 0) {
      writeJsonFileSafe(this.paths.mediaIndexFile, mediaIndex);
    }

    // Remove matching project entries in workspace project file so dashboard stays accurate
    if (workspaceId) {
      try {
        const wsProjects = readWorkspaceProjects(this.paths.dataDir, workspaceId) as Array<{
          id?: string;
          dynamicSlug?: string | null;
          serverCollectionId?: string | null;
          payload?: string;
        }>;
        const filtered = wsProjects.filter((proj) => {
          if (params.kind === 'dynamic' && proj.dynamicSlug === params.id) return false;
          if (params.kind === 'collection' && proj.serverCollectionId === params.id) return false;
          if (
            (params.kind === 'media' || params.kind === 'collection') &&
            typeof proj.payload === 'string' &&
            proj.payload.includes(`/m/${params.id}`)
          ) {
            return false;
          }
          return true;
        });
        if (filtered.length !== wsProjects.length) {
          writeWorkspaceProjects(this.paths.dataDir, workspaceId, filtered);
        }
      } catch {
        // Non-fatal project sync
      }
    }

    // Execute real Dosya.dev S3 deletion
    const keysArray = Array.from(s3KeysToDelete);
    let s3ObjectsDeleted = 0;
    let pendingRetry = false;

    if (keysArray.length > 0) {
      if (this.storage.isConfigured()) {
        const res = await this.storage.deleteObjects(keysArray);
        s3ObjectsDeleted = res.deletedCount;
        if (res.failedKeys.length > 0) {
          pendingRetry = true;
          const jobs = readJsonFileSafe<DeletionJobRecord[]>(this.paths.deletionJobsFile, []);
          jobs.push({
            id: `job_${crypto.randomBytes(6).toString('hex')}`,
            workspaceId,
            resourceKind: params.kind,
            resourceId: params.id,
            reason: params.reason,
            pendingS3Keys: res.failedKeys.map((f) => f.key),
            freedBytes,
            attempts: 1,
            lastError: res.failedKeys[0]?.error,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
          writeJsonFileSafe(this.paths.deletionJobsFile, jobs);
        }
      } else {
        // Queue for retry once Dosya credentials are present
        pendingRetry = true;
        const jobs = readJsonFileSafe<DeletionJobRecord[]>(this.paths.deletionJobsFile, []);
        jobs.push({
          id: `job_${crypto.randomBytes(6).toString('hex')}`,
          workspaceId,
          resourceKind: params.kind,
          resourceId: params.id,
          reason: params.reason,
          pendingS3Keys: keysArray,
          freedBytes,
          attempts: 0,
          lastError: 'Stockage Dosya.dev non configuré lors du passage.',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        writeJsonFileSafe(this.paths.deletionJobsFile, jobs);
      }
    }

    if (workspaceId) {
      this.addFreedBytes(workspaceId, freedBytes);
      this.appendAuditEntry({
        workspaceId,
        shortRef: `#${params.id.slice(0, 6)}`,
        resourceKind: params.kind,
        reason: params.reason,
        freedBytes,
        s3ObjectsDeleted,
        deletedAt: nowIso,
      });

      const title = this.safeNotificationTitle(isEncrypted, params.kind, params.id);
      const msg =
        params.reason === 'expired'
          ? `${title} a expiré et a été supprimé définitivement de votre espace.`
          : `${title} a été supprimé définitivement sur votre demande.`;
      this.appendNotification({
        workspaceId,
        targetKind: params.kind,
        targetId: params.id,
        targetTitle: title,
        milestone: params.reason === 'expired' ? 'expired' : 'deleted',
        message: msg,
        expiresAt: nowIso,
      });
      if (params.reason === 'expired') {
        await this.maybeSendEmailAlert(workspaceId, title, msg);
      }
    }

    return {
      deleted: true,
      freedBytes,
      s3ObjectsDeleted,
      pendingRetry,
    };
  }

  extendRetention(params: {
    workspaceId: string;
    targetKind: 'media' | 'collection' | 'dynamic' | 'workspace';
    targetId: string;
    months: number;
    nowMs?: number;
  }): { updatedCount: number; newExpiresAt: string } {
    const nowMs = params.nowMs ?? Date.now();
    const mediaIndex = readJsonFileSafe<Record<string, MediaRecordLike>>(
      this.paths.mediaIndexFile,
      {}
    );
    const dynamicStore = readJsonFileSafe<Record<string, DynamicRecordLike>>(
      this.paths.dynamicFile,
      {}
    );

    let updatedCount = 0;
    let latestExpiry = addMonthsToIso(null, params.months, nowMs);

    const extendMedia = (rec: MediaRecordLike) => {
      const nextExp = addMonthsToIso(rec.serverExpiresAt, params.months, nowMs);
      rec.serverExpiresAt = nextExp;
      rec.retentionPlanMonths = Math.max(rec.retentionPlanMonths || 0, params.months);
      rec.sentMilestones = [];
      updatedCount += 1;
      latestExpiry = nextExp;

      // Also extend referenced S3 media assets inside a collection
      if (rec.kind === 'collection') {
        for (const refId of collectReferencedMediaIds(rec.source, rec.experience)) {
          const refRec = mediaIndex[refId];
          if (refRec) {
            const refNext = addMonthsToIso(refRec.serverExpiresAt, params.months, nowMs);
            refRec.serverExpiresAt = refNext;
            refRec.retentionPlanMonths = Math.max(refRec.retentionPlanMonths || 0, params.months);
            refRec.sentMilestones = [];
          }
        }
      }
    };

    const extendDynamic = (dyn: DynamicRecordLike) => {
      const nextExp = addMonthsToIso(dyn.expiresAt, params.months, nowMs);
      dyn.expiresAt = nextExp;
      dyn.retentionPlanMonths = Math.max(dyn.retentionPlanMonths || 0, params.months);
      dyn.sentMilestones = [];
      dyn.updatedAt = new Date(nowMs).toISOString();
      updatedCount += 1;
      latestExpiry = nextExp;

      for (const refId of collectReferencedMediaIds(
        dyn.destination?.sourceSnapshot,
        dyn.destination?.experience
      )) {
        const refRec = mediaIndex[refId];
        if (refRec) {
          const refNext = addMonthsToIso(refRec.serverExpiresAt, params.months, nowMs);
          refRec.serverExpiresAt = refNext;
          refRec.retentionPlanMonths = Math.max(refRec.retentionPlanMonths || 0, params.months);
          refRec.sentMilestones = [];
        }
      }
    };

    if (params.targetKind === 'workspace') {
      for (const rec of Object.values(mediaIndex)) {
        if (rec.ownerWorkspaceId === params.workspaceId && rec.storage?.provider !== 'demo') {
          extendMedia(rec);
        }
      }
      for (const dyn of Object.values(dynamicStore)) {
        if (dyn.ownerWorkspaceId === params.workspaceId) {
          extendDynamic(dyn);
        }
      }
    } else if (params.targetKind === 'dynamic') {
      const dyn = dynamicStore[params.targetId];
      if (dyn && dyn.ownerWorkspaceId === params.workspaceId) {
        extendDynamic(dyn);
      }
    } else {
      const rec = mediaIndex[params.targetId];
      if (rec && rec.ownerWorkspaceId === params.workspaceId) {
        extendMedia(rec);
      }
    }

    writeJsonFileSafe(this.paths.mediaIndexFile, mediaIndex);
    writeJsonFileSafe(this.paths.dynamicFile, dynamicStore);

    // Sync serverExpiresAt into workspace saved projects list
    try {
      const projects = readWorkspaceProjects(this.paths.dataDir, params.workspaceId) as Array<
        Record<string, unknown>
      >;
      let touched = false;
      const updatedProjects = projects.map((p) => {
        const matchesAll = params.targetKind === 'workspace' && p.accessibilityKind !== 'permanent';
        const matchesDyn = params.targetKind === 'dynamic' && p.dynamicSlug === params.targetId;
        const matchesMedia =
          (params.targetKind === 'media' || params.targetKind === 'collection') &&
          (p.serverCollectionId === params.targetId ||
            (typeof p.payload === 'string' && p.payload.includes(`/m/${params.targetId}`)));
        if (matchesAll || matchesDyn || matchesMedia) {
          touched = true;
          const nextExp = addMonthsToIso(
            typeof p.serverExpiresAt === 'string' ? p.serverExpiresAt : null,
            params.months,
            nowMs
          );
          return {
            ...p,
            serverExpiresAt: nextExp,
            retentionPlanMonths: Math.max(Number(p.retentionPlanMonths || 0), params.months),
          };
        }
        return p;
      });
      if (touched) {
        writeWorkspaceProjects(this.paths.dataDir, params.workspaceId, updatedProjects);
      }
    } catch {
      // Non-fatal
    }

    if (updatedCount > 0) {
      this.appendNotification({
        workspaceId: params.workspaceId,
        targetKind: params.targetKind === 'workspace' ? 'collection' : params.targetKind,
        targetId: params.targetId,
        targetTitle:
          params.targetKind === 'workspace'
            ? 'Abonnement espace'
            : `#${params.targetId.slice(0, 6)}`,
        milestone: 'extended',
        message: `Conservation prolongée de ${params.months} mois sans perte de données.`,
        expiresAt: latestExpiry,
      });
    }

    return { updatedCount, newExpiresAt: latestExpiry };
  }

  async runCleanupPass(nowMs = Date.now()): Promise<{
    expiredDeleted: number;
    notificationsSent: number;
    retriedJobsCompleted: number;
  }> {
    if (this.runningSweep) {
      return { expiredDeleted: 0, notificationsSent: 0, retriedJobsCompleted: 0 };
    }
    this.runningSweep = true;
    try {
      let expiredDeleted = 0;
      let notificationsSent = 0;
      let retriedJobsCompleted = 0;

      // 1. Retry any pending S3 deletion jobs first
      const jobs = readJsonFileSafe<DeletionJobRecord[]>(this.paths.deletionJobsFile, []);
      if (jobs.length > 0 && this.storage.isConfigured()) {
        const remainingJobs: DeletionJobRecord[] = [];
        for (const job of jobs) {
          if (job.pendingS3Keys.length === 0) {
            retriedJobsCompleted += 1;
            continue;
          }
          const res = await this.storage.deleteObjects(job.pendingS3Keys);
          if (res.failedKeys.length === 0) {
            retriedJobsCompleted += 1;
          } else {
            remainingJobs.push({
              ...job,
              pendingS3Keys: res.failedKeys.map((f) => f.key),
              attempts: job.attempts + 1,
              lastError: res.failedKeys[0]?.error,
              updatedAt: new Date(nowMs).toISOString(),
            });
          }
        }
        writeJsonFileSafe(this.paths.deletionJobsFile, remainingJobs);
      }

      // 2. Check dynamic QRs for 48h/24h notifications & expiration
      const dynamicStore = readJsonFileSafe<Record<string, DynamicRecordLike>>(
        this.paths.dynamicFile,
        {}
      );
      let dynamicModified = false;
      for (const dyn of Object.values(dynamicStore)) {
        if (!dyn.expiresAt) continue;
        const expMs = Date.parse(dyn.expiresAt);
        if (!Number.isFinite(expMs)) continue;

        if (expMs <= nowMs) {
          const del = await this.deleteResourceNow({
            kind: 'dynamic',
            id: dyn.slug,
            reason: 'expired',
            nowMs,
          });
          if (del.deleted) expiredDeleted += 1;
          continue;
        }

        const due = getDueNotificationMilestones(
          dyn.expiresAt,
          dyn.sentMilestones || [],
          nowMs
        );
        if (due.length > 0 && dyn.ownerWorkspaceId) {
          dyn.sentMilestones = Array.from(new Set([...(dyn.sentMilestones || []), ...due]));
          dynamicModified = true;
          for (const milestone of due) {
            const title = this.safeNotificationTitle(dyn.isEncrypted, 'dynamic', dyn.slug);
            const msg =
              milestone === '48h'
                ? `${title} expirera dans moins de 48 heures. Pensez à le prolonger si vous souhaitez le conserver.`
                : `${title} expirera dans moins de 24 heures avant suppression définitive.`;
            this.appendNotification({
              workspaceId: dyn.ownerWorkspaceId,
              targetKind: 'dynamic',
              targetId: dyn.slug,
              targetTitle: title,
              milestone,
              message: msg,
              expiresAt: dyn.expiresAt,
            });
            notificationsSent += 1;
            await this.maybeSendEmailAlert(dyn.ownerWorkspaceId, title, msg);
          }
        }
      }
      if (dynamicModified) {
        // Re-read before saving in case deleteResourceNow removed expired entries
        const latestDyn = readJsonFileSafe<Record<string, DynamicRecordLike>>(
          this.paths.dynamicFile,
          {}
        );
        for (const [slug, dyn] of Object.entries(dynamicStore)) {
          if (latestDyn[slug]) {
            latestDyn[slug].sentMilestones = dyn.sentMilestones;
          }
        }
        writeJsonFileSafe(this.paths.dynamicFile, latestDyn);
      }

      // 3. Check media & collections for 48h/24h notifications & expiration
      const mediaIndex = readJsonFileSafe<Record<string, MediaRecordLike>>(
        this.paths.mediaIndexFile,
        {}
      );
      let mediaModified = false;
      // Delete collections first, then standalone media
      const orderedMedia = Object.values(mediaIndex).sort((a, b) =>
        a.kind === 'collection' && b.kind !== 'collection' ? -1 : 1
      );

      for (const rec of orderedMedia) {
        if (rec.storage?.provider === 'demo') continue;
        if (!rec.serverExpiresAt) continue;
        const expMs = Date.parse(rec.serverExpiresAt);
        if (!Number.isFinite(expMs)) continue;

        if (expMs <= nowMs) {
          const kind = rec.kind === 'collection' ? 'collection' : 'media';
          const del = await this.deleteResourceNow({
            kind,
            id: rec.id,
            reason: 'expired',
            nowMs,
          });
          if (del.deleted) expiredDeleted += 1;
          continue;
        }

        const due = getDueNotificationMilestones(
          rec.serverExpiresAt,
          rec.sentMilestones || [],
          nowMs
        );
        if (due.length > 0 && rec.ownerWorkspaceId) {
          rec.sentMilestones = Array.from(new Set([...(rec.sentMilestones || []), ...due]));
          mediaModified = true;
          const kind = rec.kind === 'collection' ? 'collection' : 'media';
          for (const milestone of due) {
            const title = this.safeNotificationTitle(rec.isEncrypted, kind, rec.id);
            const msg =
              milestone === '48h'
                ? `${title} sera supprimé dans moins de 48 heures. Vous pouvez prolonger sa conservation de 1 à 12 mois.`
                : `${title} sera supprimé définitivement dans moins de 24 heures.`;
            this.appendNotification({
              workspaceId: rec.ownerWorkspaceId,
              targetKind: kind,
              targetId: rec.id,
              targetTitle: title,
              milestone,
              message: msg,
              expiresAt: rec.serverExpiresAt,
            });
            notificationsSent += 1;
            await this.maybeSendEmailAlert(rec.ownerWorkspaceId, title, msg);
          }
        }
      }
      if (mediaModified) {
        const latestMedia = readJsonFileSafe<Record<string, MediaRecordLike>>(
          this.paths.mediaIndexFile,
          {}
        );
        for (const [id, rec] of Object.entries(mediaIndex)) {
          if (latestMedia[id]) {
            latestMedia[id].sentMilestones = rec.sentMilestones;
          }
        }
        writeJsonFileSafe(this.paths.mediaIndexFile, latestMedia);
      }

      return { expiredDeleted, notificationsSent, retriedJobsCompleted };
    } finally {
      this.runningSweep = false;
    }
  }

  buildWorkspaceDashboardItems(workspaceId: string, nowMs = Date.now()): StorageDashboardItem[] {
    const mediaIndex = readJsonFileSafe<Record<string, MediaRecordLike>>(
      this.paths.mediaIndexFile,
      {}
    );
    const dynamicStore = readJsonFileSafe<Record<string, DynamicRecordLike>>(
      this.paths.dynamicFile,
      {}
    );

    const items: StorageDashboardItem[] = [];

    for (const rec of Object.values(mediaIndex)) {
      if (rec.storage?.provider === 'demo') continue;
      if (rec.ownerWorkspaceId && rec.ownerWorkspaceId !== workspaceId) continue;
      if (!rec.ownerWorkspaceId) continue;

      const kind: 'media' | 'collection' = rec.kind === 'collection' ? 'collection' : 'media';
      const refIds =
        kind === 'collection' ? collectReferencedMediaIds(rec.source, rec.experience) : [];
      let totalSize = Number(rec.size || 0);
      let s3Count = rec.storage?.provider === 'dosya-s3' && rec.storage.key ? 1 : 0;
      for (const refId of refIds) {
        const refRec = mediaIndex[refId];
        if (refRec) {
          totalSize += Number(refRec.size || 0);
          if (refRec.storage?.provider === 'dosya-s3' && refRec.storage.key) {
            s3Count += 1;
          }
        }
      }

      const exp = rec.serverExpiresAt || null;
      items.push({
        id: rec.id,
        kind,
        title: rec.isEncrypted
          ? `Contenu chiffré #${rec.id.slice(0, 6)}`
          : rec.originalName || `SparkQR #${rec.id.slice(0, 6)}`,
        mediaType: kind === 'collection' ? 'collection' : (rec.type as StorageDashboardItem['mediaType']),
        sizeBytes: totalSize,
        isEncrypted: Boolean(rec.isEncrypted),
        createdAt: rec.createdAt,
        expiresAt: exp,
        retentionPlanMonths: rec.retentionPlanMonths ?? null,
        status: classifyRetentionStatus(exp, false, nowMs),
        pageUrl: `/m/${rec.id}`,
        s3ObjectsCount: s3Count,
      });
    }

    for (const dyn of Object.values(dynamicStore)) {
      if (dyn.ownerWorkspaceId !== workspaceId) continue;
      const refIds = collectReferencedMediaIds(
        dyn.destination?.sourceSnapshot,
        dyn.destination?.experience
      );
      let totalSize = 0;
      let s3Count = 0;
      for (const refId of refIds) {
        const refRec = mediaIndex[refId];
        if (refRec) {
          totalSize += Number(refRec.size || 0);
          if (refRec.storage?.provider === 'dosya-s3' && refRec.storage.key) {
            s3Count += 1;
          }
        }
      }

      items.push({
        id: dyn.slug,
        kind: 'dynamic',
        title: dyn.isEncrypted
          ? `QR dynamique chiffré #${dyn.slug.slice(0, 6)}`
          : dyn.destination?.title || `QR dynamique #${dyn.slug.slice(0, 6)}`,
        mediaType: 'dynamic',
        sizeBytes: totalSize,
        isEncrypted: Boolean(dyn.isEncrypted),
        createdAt: dyn.createdAt,
        expiresAt: dyn.expiresAt || null,
        retentionPlanMonths: dyn.retentionPlanMonths ?? null,
        status: classifyRetentionStatus(dyn.expiresAt, false, nowMs),
        pageUrl: `/d/${dyn.slug}`,
        s3ObjectsCount: s3Count,
      });
    }

    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}
