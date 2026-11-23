import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const lockQueues = new Map<string, Promise<unknown>>();

export function withDataDirLock<T>(
  dataDir: string,
  fn: () => Promise<T> | T
): Promise<T> {
  const key = path.resolve(dataDir);
  const previous = lockQueues.get(key) ?? Promise.resolve();
  const next = previous.then(
    () => fn(),
    () => fn()
  );
  const tail = next.then(
    () => undefined,
    () => undefined
  );
  lockQueues.set(key, tail);
  return next.finally(() => {
    if (lockQueues.get(key) === tail) {
      lockQueues.delete(key);
    }
  });
}

export function readJsonFileAtomic<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFileAtomic<T>(filePath: string, data: T): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, serialized, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function writeTextFileAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function cleanupOrphanTempFiles(rootDir: string): number {
  let removed = 0;
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.tmp-\d+-[a-zA-Z0-9-]+$/.test(entry.name)) {
        try {
          fs.unlinkSync(fullPath);
          removed += 1;
        } catch {
          // Ignore races on active temp files
        }
      }
    }
  };
  walk(rootDir);
  return removed;
}
