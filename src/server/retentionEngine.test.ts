import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DosyaStorageService, type S3ClientLike } from './dosyaStorage';
import { RetentionEngine, writeJsonFileSafe } from './retentionEngine';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparkqr-retention-'));
}

test('RetentionEngine deletes expired media & collections from Dosya.dev S3 and leaves active items intact', async () => {
  const tmpDir = makeTempDir();
  const deletedKeys: string[] = [];

  const mockS3: S3ClientLike = {
    async send(cmd: unknown) {
      if (cmd instanceof DeleteObjectCommand) {
        deletedKeys.push(cmd.input.Key || '');
        return {};
      }
      return {};
    },
  };

  const storage = new DosyaStorageService(
    {
      endpoint: 'https://api.dosya.dev/s3',
      region: 'us-east-1',
      bucket: 'ws_test',
      accessKeyId: 'test_id',
      secretAccessKey: 'test_secret',
    },
    mockS3
  );

  const now = Date.parse('2026-11-20T12:00:00.000Z');
  const expiredIso = '2026-11-19T12:00:00.000Z';
  const activeIso = '2026-11-25T12:00:00.000Z';
  const expiringSoonIso = new Date(now + 20 * 3600 * 1000).toISOString();

  writeJsonFileSafe(path.join(tmpDir, 'media-index.json'), {
    exp1: {
      id: 'exp1',
      ownerWorkspaceId: 'ws_user1',
      kind: 'media',
      type: 'image',
      filename: 'secret.spk1',
      originalName: 'confidentiel.jpg',
      mimeType: 'application/octet-stream',
      size: 2048,
      url: '/api/media/exp1/file',
      isEncrypted: true,
      storage: { provider: 'dosya-s3', key: 'sparkqr/encrypted/exp1/secret.spk1' },
      serverExpiresAt: expiredIso,
      createdAt: '2026-11-12T12:00:00.000Z',
    },
    act1: {
      id: 'act1',
      ownerWorkspaceId: 'ws_user1',
      kind: 'media',
      type: 'video',
      filename: 'keep.mp4',
      originalName: 'keep.mp4',
      mimeType: 'video/mp4',
      size: 4096,
      url: '/api/media/act1/file',
      storage: { provider: 'dosya-s3', key: 'sparkqr/videos/act1/keep.mp4' },
      serverExpiresAt: activeIso,
      createdAt: '2026-11-19T12:00:00.000Z',
    },
    soon1: {
      id: 'soon1',
      ownerWorkspaceId: 'ws_user1',
      kind: 'collection',
      type: 'collection',
      filename: 'soon1',
      originalName: 'Secret note',
      mimeType: 'application/json',
      size: 512,
      url: '/m/soon1',
      isEncrypted: true,
      storage: { provider: 'collection' },
      serverExpiresAt: expiringSoonIso,
      createdAt: '2026-11-14T12:00:00.000Z',
    },
  });

  const engine = new RetentionEngine(tmpDir, storage);
  const sweep = await engine.runCleanupPass(now);

  assert.equal(sweep.expiredDeleted, 1);
  assert.equal(sweep.notificationsSent, 1); // 24h warning for soon1
  assert.deepEqual(deletedKeys, ['sparkqr/encrypted/exp1/secret.spk1']);

  const remainingIndex = JSON.parse(
    fs.readFileSync(path.join(tmpDir, 'media-index.json'), 'utf-8')
  );
  assert.equal(remainingIndex.exp1, undefined);
  assert.ok(remainingIndex.act1);
  assert.ok(remainingIndex.soon1);

  const stats = engine.getWorkspaceStats('ws_user1');
  assert.equal(stats.freedBytes, 2048);

  const audit = engine.listAuditLog('ws_user1');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].reason, 'expired');
  assert.equal(audit[0].s3ObjectsDeleted, 1);
  assert.equal(JSON.stringify(audit).includes('confidentiel'), false);

  const notifs = engine.listNotifications('ws_user1');
  assert.equal(notifs.length, 2); // expired + 24h warning
  assert.equal(JSON.stringify(notifs).includes('confidentiel'), false);

  // Repeat pass does not duplicate 24h notification
  const sweep2 = await engine.runCleanupPass(now + 60_000);
  assert.equal(sweep2.notificationsSent, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('RetentionEngine retries failed S3 deletions and supports cumulative extension', async () => {
  const tmpDir = makeTempDir();
  let failOnce = true;
  const deletedKeys: string[] = [];

  const flakyS3: S3ClientLike = {
    async send(cmd: unknown) {
      if (cmd instanceof DeleteObjectCommand) {
        if (failOnce) {
          failOnce = false;
          throw new Error('Temporary S3 timeout');
        }
        deletedKeys.push(cmd.input.Key || '');
        return {};
      }
      return {};
    },
  };

  const storage = new DosyaStorageService(
    {
      endpoint: 'https://api.dosya.dev/s3',
      region: 'us-east-1',
      bucket: 'ws_test',
      accessKeyId: 'test_id',
      secretAccessKey: 'test_secret',
    },
    flakyS3
  );

  const now = Date.parse('2026-11-20T12:00:00.000Z');
  writeJsonFileSafe(path.join(tmpDir, 'media-index.json'), {
    mfail: {
      id: 'mfail',
      ownerWorkspaceId: 'ws_2',
      kind: 'media',
      type: 'image',
      filename: 'a.png',
      originalName: 'a.png',
      mimeType: 'image/png',
      size: 1000,
      url: '/api/media/mfail/file',
      storage: { provider: 'dosya-s3', key: 'sparkqr/images/mfail/a.png' },
      serverExpiresAt: '2026-11-18T00:00:00.000Z',
      createdAt: '2026-11-11T00:00:00.000Z',
    },
    mkeep: {
      id: 'mkeep',
      ownerWorkspaceId: 'ws_2',
      kind: 'media',
      type: 'image',
      filename: 'b.png',
      originalName: 'b.png',
      mimeType: 'image/png',
      size: 1500,
      url: '/api/media/mkeep/file',
      storage: { provider: 'dosya-s3', key: 'sparkqr/images/mkeep/b.png' },
      serverExpiresAt: '2026-12-01T12:00:00.000Z',
      createdAt: '2026-11-19T12:00:00.000Z',
    },
  });

  const engine = new RetentionEngine(tmpDir, storage);
  await engine.runCleanupPass(now);
  assert.equal(deletedKeys.length, 0);

  const jobsAfterFirst = JSON.parse(
    fs.readFileSync(path.join(tmpDir, 'deletion-jobs.json'), 'utf-8')
  );
  assert.equal(jobsAfterFirst.length, 1);

  const retryPass = await engine.runCleanupPass(now + 60_000);
  assert.equal(retryPass.retriedJobsCompleted, 1);
  assert.deepEqual(deletedKeys, ['sparkqr/images/mfail/a.png']);

  const ext = engine.extendRetention({
    workspaceId: 'ws_2',
    targetKind: 'media',
    targetId: 'mkeep',
    months: 3,
    nowMs: now,
  });
  assert.equal(ext.updatedCount, 1);
  assert.equal(ext.newExpiresAt, '2027-03-01T12:00:00.000Z');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
