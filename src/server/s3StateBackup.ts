import fs from 'fs';
import path from 'path';
import type { DosyaStorageService } from './dosyaStorage.ts';
import { writeTextFileAtomic } from './jsonStore.ts';

const STATE_PREFIX = 'sparkqr/_state/';

function isSafeStateRelativePath(relPath: string): boolean {
  if (!relPath || relPath.startsWith('/') || relPath.includes('..') || relPath.includes('\\')) {
    return false;
  }
  if (/\.tmp-\d+-[a-zA-Z0-9-]+$/.test(relPath)) {
    return false;
  }
  if (relPath === '.hmac-secret') return true;
  if (/^[a-z0-9_-]+\.json$/i.test(relPath)) return true;
  if (/^workspaces\/ws_[a-zA-Z0-9_-]+-projects\.json$/.test(relPath)) return true;
  return false;
}

export class S3StateBackupService {
  private readonly dataDir: string;
  private readonly storage: DosyaStorageService;
  private readonly pendingPaths = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private flushQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string, storage: DosyaStorageService) {
    this.dataDir = path.resolve(dataDir);
    this.storage = storage;
  }

  private toRelativePath(filePath: string): string | null {
    const resolved = path.resolve(filePath);
    const rel = path.relative(this.dataDir, resolved).replace(/\\/g, '/');
    return isSafeStateRelativePath(rel) ? rel : null;
  }

  scheduleFileSync(filePath: string): void {
    if (!this.storage.isConfigured()) return;
    const rel = this.toRelativePath(filePath);
    if (!rel) return;
    this.pendingPaths.add(rel);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush().catch((err) => {
        console.error('Non-fatal Dosya.dev state backup sync error:', err);
      });
    }, 300);
    this.debounceTimer.unref();
  }

  async flush(): Promise<number> {
    if (!this.storage.isConfigured()) {
      this.pendingPaths.clear();
      return 0;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const batch = Array.from(this.pendingPaths);
    this.pendingPaths.clear();
    if (batch.length === 0) {
      await this.flushQueue;
      return 0;
    }

    let synced = 0;
    const task = this.flushQueue.then(async () => {
      for (const rel of batch) {
        const localPath = path.join(this.dataDir, rel);
        const s3Key = `${STATE_PREFIX}${rel}`;
        try {
          if (!fs.existsSync(localPath)) {
            await this.storage.deleteObject(s3Key);
            synced += 1;
            continue;
          }
          const body = fs.readFileSync(localPath);
          await this.storage.uploadObject({
            key: s3Key,
            body,
            contentType: rel.endsWith('.json') ? 'application/json' : 'text/plain',
          });
          synced += 1;
        } catch (err) {
          console.error(`Failed to mirror state file ${rel} to Dosya.dev S3:`, err);
        }
      }
    });
    this.flushQueue = task.catch(() => undefined);
    await task;
    return synced;
  }

  async restoreMissingStateFromS3(): Promise<{ restoredCount: number; restoredFiles: string[] }> {
    if (!this.storage.isConfigured()) {
      return { restoredCount: 0, restoredFiles: [] };
    }
    const keys = await this.storage.listObjectKeys(STATE_PREFIX);
    const restoredFiles: string[] = [];

    for (const key of keys) {
      if (!key.startsWith(STATE_PREFIX)) continue;
      const rel = key.slice(STATE_PREFIX.length);
      if (!isSafeStateRelativePath(rel)) continue;

      const localPath = path.join(this.dataDir, rel);
      // Never overwrite an existing local file (e.g. if local disk has live state or Render Persistent Disk is attached)
      if (fs.existsSync(localPath)) {
        try {
          const stat = fs.statSync(localPath);
          if (stat.size > 0) continue;
        } catch {
          continue;
        }
      }

      const buf = await this.storage.getObjectBuffer(key);
      if (!buf || buf.length === 0) continue;

      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      writeTextFileAtomic(localPath, buf.toString('utf-8'));
      restoredFiles.push(rel);
    }

    return {
      restoredCount: restoredFiles.length,
      restoredFiles,
    };
  }
}
