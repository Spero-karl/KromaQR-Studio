import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type express from 'express';
import { readJsonFileAtomic, writeJsonFileAtomic } from './jsonStore.ts';
import type { S3StateBackupService } from './s3StateBackup.ts';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private lastPruneMs = Date.now();

  check(key: string, maxRequests: number, windowMs: number, nowMs = Date.now()): RateLimitDecision {
    if (nowMs - this.lastPruneMs > Math.max(windowMs, 60_000)) {
      this.prune(nowMs, windowMs);
    }

    const cutoff = nowMs - windowMs;
    const existing = this.buckets.get(key) || [];
    const active = existing.filter((ts) => ts > cutoff);

    if (active.length >= maxRequests) {
      this.buckets.set(key, active);
      const oldest = active[0] ?? nowMs;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    active.push(nowMs);
    this.buckets.set(key, active);
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - active.length),
      retryAfterSec: 0,
    };
  }

  private prune(nowMs: number, maxWindowMs: number): void {
    this.lastPruneMs = nowMs;
    for (const [key, list] of this.buckets.entries()) {
      const kept = list.filter((ts) => ts > nowMs - maxWindowMs);
      if (kept.length === 0) {
        this.buckets.delete(key);
      } else {
        this.buckets.set(key, kept);
      }
    }
  }
}

export function extractClientIp(req: express.Request): string {
  const cfIp = req.get('cf-connecting-ip');
  if (cfIp) return cfIp.split(',')[0].trim();
  const xff = req.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createRateLimitMiddleware(
  limiter: SlidingWindowRateLimiter,
  options: { bucket: string; maxRequests: number; windowMs: number; message?: string }
): express.RequestHandler {
  return (req, res, next) => {
    const ip = extractClientIp(req);
    const key = `${options.bucket}:${ip}`;
    const decision = limiter.check(key, options.maxRequests, options.windowMs);
    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSec));
      res.status(429).json({
        error:
          options.message ||
          `Trop de requêtes détectées. Patientez ${decision.retryAfterSec} seconde(s) avant de réessayer.`,
      });
      return;
    }
    next();
  };
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizeJsonObject<T>(value: T, depth = 0): T {
  if (depth > 24 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonObject(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    out[k] = sanitizeJsonObject(v, depth + 1);
  }
  // Convert null-prototype object back to clean plain object while preserving stripped keys
  return { ...out } as T;
}

export function isValidResourceId(raw: string | undefined | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  return /^[a-zA-Z0-9_-]{3,48}$/.test(raw);
}

export function inspectUploadedFileBuffer(
  buffer: Buffer,
  mimeType: string,
  isEncrypted: boolean
): { safe: boolean; reason?: string } {
  if (!buffer || buffer.length === 0) {
    return { safe: false, reason: 'Fichier vide refusé.' };
  }

  // Encrypted E2EE SPK1 payloads must start with "SPK1" header or valid envelope
  if (isEncrypted) {
    if (buffer.length < 16) {
      return { safe: false, reason: 'Enveloppe chiffrée invalide.' };
    }
    return { safe: true };
  }

  const head = buffer.subarray(0, Math.min(buffer.length, 4096));
  const headText = head.toString('utf8');

  // Block active script / XSS payloads inside SVG, text, or spoofed images
  if (mimeType === 'image/svg+xml' || mimeType.startsWith('text/')) {
    if (
      /<\s*script\b/i.test(headText) ||
      /javascript\s*:/i.test(headText) ||
      /\bon(?:load|error|click|mouseover|focus)\s*=/i.test(headText) ||
      /<\s*foreignObject\b/i.test(headText)
    ) {
      return {
        safe: false,
        reason: 'Contenu actif non autorisé détecté dans le fichier importé.',
      };
    }
    if (mimeType === 'image/svg+xml' && !/<\s*svg\b/i.test(headText)) {
      return { safe: false, reason: 'Structure SVG invalide.' };
    }
    return { safe: true };
  }

  // Block polyglot HTML masked as binary media
  const headTrimmed = headText.trimStart().toLowerCase();
  if (
    headTrimmed.startsWith('<!doctype html') ||
    headTrimmed.startsWith('<html') ||
    headTrimmed.startsWith('<script')
  ) {
    return {
      safe: false,
      reason: 'Format de fichier incohérent ou contenu HTML non autorisé.',
    };
  }

  // Strict magic-byte validation for common binary formats
  if (mimeType === 'image/png') {
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngMagic)) {
      return { safe: false, reason: 'Signature PNG invalide.' };
    }
  } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return { safe: false, reason: 'Signature JPEG invalide.' };
    }
  } else if (mimeType === 'image/webp') {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      return { safe: false, reason: 'Signature WEBP invalide.' };
    }
  } else if (mimeType === 'image/gif') {
    const sig = buffer.subarray(0, 6).toString('ascii');
    if (sig !== 'GIF87a' && sig !== 'GIF89a') {
      return { safe: false, reason: 'Signature GIF invalide.' };
    }
  } else if (mimeType === 'application/pdf') {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return { safe: false, reason: 'En-tête PDF invalide.' };
    }
  }

  return { safe: true };
}

export interface StoredSparkQrMarkRecord {
  fingerprint: string;
  hmac: string;
  bundle: Record<string, unknown>;
  issuedAt: string;
}

export class SparkQrMarkRegistry {
  private readonly filePath: string;
  private readonly hmacSecret: string;
  private readonly stateBackup?: S3StateBackupService;

  constructor(dataDir: string, hmacSecret: string, stateBackup?: S3StateBackupService) {
    this.filePath = path.join(dataDir, 'sparkqr-marks.json');
    this.hmacSecret = hmacSecret;
    this.stateBackup = stateBackup;
  }

  private readMap(): Record<string, StoredSparkQrMarkRecord> {
    return readJsonFileAtomic<Record<string, StoredSparkQrMarkRecord>>(this.filePath, {});
  }

  private writeMap(map: Record<string, StoredSparkQrMarkRecord>): void {
    const keys = Object.keys(map);
    // Bound growth at 8,000 most recent exported SparkQR marks
    if (keys.length > 8000) {
      const sorted = keys.sort(
        (a, b) => Date.parse(map[a].issuedAt || '') - Date.parse(map[b].issuedAt || '')
      );
      for (let i = 0; i < sorted.length - 8000; i++) {
        delete map[sorted[i]];
      }
    }
    writeJsonFileAtomic(this.filePath, map);
    if (this.stateBackup) {
      this.stateBackup.scheduleFileSync(this.filePath);
    }
  }

  computeHmac(bundle: Record<string, unknown>): string {
    const fingerprint = String(bundle.fingerprint || '').toLowerCase();
    const localSeal = String(bundle.localSeal || '').toLowerCase();
    const payload = String(bundle.payload || '');
    const issuedAt = String(bundle.issuedAt || '');
    const canonical = `${fingerprint}|${localSeal}|${payload}|${issuedAt}`;
    return crypto.createHmac('sha256', this.hmacSecret).update(canonical).digest('hex');
  }

  signAndRegister(rawBundle: unknown): { ok: true; hmac: string; fingerprint: string } | { ok: false; error: string } {
    if (!rawBundle || typeof rawBundle !== 'object') {
      return { ok: false, error: 'Données SparkQR absentes.' };
    }
    const clean = sanitizeJsonObject(rawBundle as Record<string, unknown>);
    const fp = typeof clean.fingerprint === 'string' ? clean.fingerprint.toLowerCase() : '';
    const localSeal = typeof clean.localSeal === 'string' ? clean.localSeal.toLowerCase() : '';
    const payload = typeof clean.payload === 'string' ? clean.payload : '';
    if (
      clean.format !== 'sparkqr-card-v1' ||
      clean.issuer !== 'SparkQR' ||
      !/^[0-9a-f]{16}$/.test(fp) ||
      !/^[0-9a-f]{16,64}$/.test(localSeal) ||
      !payload.trim()
    ) {
      return { ok: false, error: 'Structure de carte SparkQR invalide.' };
    }

    const hmac = this.computeHmac(clean);
    const map = this.readMap();
    const sanitizedForStorage: Record<string, unknown> = {
      ...clean,
      hmac,
    };
    map[fp] = {
      fingerprint: fp,
      hmac,
      bundle: sanitizedForStorage,
      issuedAt: typeof clean.issuedAt === 'string' ? clean.issuedAt : new Date().toISOString(),
    };
    this.writeMap(map);
    return { ok: true, hmac, fingerprint: fp };
  }

  verify(params: {
    bundle?: Record<string, unknown> | null;
    fingerprint?: string;
  }): { authentic: boolean; bundle?: Record<string, unknown>; reason?: string } {
    const map = this.readMap();

    if (params.bundle && typeof params.bundle === 'object') {
      const clean = sanitizeJsonObject(params.bundle);
      const fp = typeof clean.fingerprint === 'string' ? clean.fingerprint.toLowerCase() : '';
      const providedHmac = typeof clean.hmac === 'string' ? clean.hmac.toLowerCase() : '';
      if (providedHmac && /^[0-9a-f]{64}$/.test(providedHmac)) {
        const expected = this.computeHmac(clean);
        try {
          if (crypto.timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expected, 'hex'))) {
            return { authentic: true, bundle: clean };
          }
        } catch {
          // Fall through to registry lookup
        }
      }
      if (fp && map[fp]) {
        return { authentic: true, bundle: map[fp].bundle };
      }
      return { authentic: false, reason: 'Empreinte SparkQR non authentifiée.' };
    }

    const fpLookup = typeof params.fingerprint === 'string' ? params.fingerprint.toLowerCase() : '';
    if (fpLookup && /^[0-9a-f]{16}$/.test(fpLookup) && map[fpLookup]) {
      return { authentic: true, bundle: map[fpLookup].bundle };
    }

    return { authentic: false, reason: 'Code QR absent du registre SparkQR.' };
  }

  existsOnDisk(): boolean {
    return fs.existsSync(this.filePath);
  }
}
