import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createSparkQrApp } from '../../server';
import { DosyaStorageService, type S3ClientLike } from './dosyaStorage';

interface StoredS3Object {
  body: Buffer;
  contentType: string;
  etag: string;
}

class InMemoryS3Simulator implements S3ClientLike {
  readonly objects = new Map<string, StoredS3Object>();
  failDeletes = false;

  async send(command: unknown): Promise<unknown> {
    if (command instanceof PutObjectCommand) {
      const key = command.input.Key || '';
      const rawBody = command.input.Body;
      const buf = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(typeof rawBody === 'string' ? rawBody : (rawBody as Uint8Array));
      const etag = crypto.createHash('md5').update(buf).digest('hex');
      this.objects.set(key, {
        body: buf,
        contentType: command.input.ContentType || 'application/octet-stream',
        etag,
      });
      return { ETag: `"${etag}"` };
    }

    if (command instanceof HeadObjectCommand) {
      const key = command.input.Key || '';
      const obj = this.objects.get(key);
      if (!obj) {
        const err = new Error('NoSuchKey') as Error & {
          name: string;
          $metadata: { httpStatusCode: number };
        };
        err.name = 'NoSuchKey';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return {
        ContentType: obj.contentType,
        ContentLength: obj.body.length,
        ETag: `"${obj.etag}"`,
      };
    }

    if (command instanceof GetObjectCommand) {
      const key = command.input.Key || '';
      const obj = this.objects.get(key);
      if (!obj) {
        const err = new Error('NoSuchKey') as Error & {
          name: string;
          $metadata: { httpStatusCode: number };
        };
        err.name = 'NoSuchKey';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      const range = command.input.Range;
      if (range) {
        const match = range.match(/^bytes=(\d+)-(\d*)$/);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), obj.body.length - 1) : obj.body.length - 1;
          const slice = obj.body.subarray(start, end + 1);
          return {
            Body: Readable.from(slice),
            ContentType: obj.contentType,
            ContentLength: slice.length,
            ContentRange: `bytes ${start}-${end}/${obj.body.length}`,
            AcceptRanges: 'bytes',
            ETag: `"${obj.etag}"`,
          };
        }
      }
      return {
        Body: Readable.from(obj.body),
        ContentType: obj.contentType,
        ContentLength: obj.body.length,
        AcceptRanges: 'bytes',
        ETag: `"${obj.etag}"`,
      };
    }

    if (command instanceof DeleteObjectCommand) {
      if (this.failDeletes) {
        throw new Error('Dosya.dev S3 service temporarily unavailable');
      }
      const key = command.input.Key || '';
      this.objects.delete(key);
      return {};
    }

    if (command instanceof ListObjectsV2Command) {
      const prefix = command.input.Prefix || '';
      const contents = Array.from(this.objects.keys())
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((Key) => ({ Key }));
      return { Contents: contents, IsTruncated: false };
    }

    return {};
  }
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparkqr-audit-'));
}

async function startTestServer(dataDir: string, simS3: InMemoryS3Simulator) {
  const storage = new DosyaStorageService(
    {
      endpoint: 'https://api.dosya.dev/s3',
      region: 'us-east-1',
      bucket: 'ws_audit_test',
      accessKeyId: 'audit_key',
      secretAccessKey: 'audit_secret',
    },
    simS3
  );

  const instance = await createSparkQrApp({
    dataDir,
    storage,
    enableS3StateBackup: true,
  });

  const server = http.createServer(instance.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    instance,
    close: async () => {
      await instance.stateBackup.flush();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    },
  };
}

async function createWorkspace(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/workspace`);
  assert.equal(res.status, 200);
  const data = (await res.json()) as { workspace: { id: string } };
  assert.ok(data.workspace.id.startsWith('ws_'));
  return data.workspace.id;
}

async function uploadMedia(
  baseUrl: string,
  wsId: string,
  filename: string,
  mimeType: string,
  bytes: Buffer,
  mediaType?: 'image' | 'video'
) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
  if (mediaType) {
    form.append('mediaType', mediaType);
  }
  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'X-Workspace-Id': wsId },
    body: form,
  });
  assert.equal(res.status, 201);
  return (await res.json()) as {
    id: string;
    fileUrl: string;
    pageUrl: string;
    serverExpiresAt: string;
    storage: { provider: string; key: string };
  };
}

test('Audit Tests 1-8: Image, Video & Text QRs, metadata/S3 verification, accessibility, expiration & complete deletion (Render JSON + Dosya.dev S3)', async () => {
  const tmpDir = makeTempDir();
  const simS3 = new InMemoryS3Simulator();
  const prevCronSecret = process.env.CRON_SECRET;

  try {
    const srv = await startTestServer(tmpDir, simS3);
    try {
      const wsId = await createWorkspace(srv.baseUrl);

      // Lightweight /health check (must stay 200 OK without touching S3)
      const healthRes = await fetch(`${srv.baseUrl}/health`);
      assert.equal(healthRes.status, 200);
      const healthJson = (await healthRes.json()) as { ok: boolean; status: string };
      assert.equal(healthJson.ok, true);
      assert.equal(healthJson.status, 'alive');

      // Test 1: Create QR code containing an Image
      const imageBytes = Buffer.from('FAKE_PNG_BINARY_HEADER_1234567890');
      const uploadedImg = await uploadMedia(
        srv.baseUrl,
        wsId,
        'mon-visuel.png',
        'image/png',
        imageBytes,
        'image'
      );
      const imgColRes = await fetch(`${srv.baseUrl}/api/media-collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({
          title: 'QR Photo Audit',
          source: { type: 'image', imageUrl: uploadedImg.fileUrl, imagePageUrl: uploadedImg.pageUrl },
          experience: { template: 'standard', headline: 'Photo souvenir' },
        }),
      });
      assert.equal(imgColRes.status, 201);
      const imgCol = (await imgColRes.json()) as { id: string; pageUrl: string; serverExpiresAt: string };

      // Test 2: Create QR code containing a Video
      const videoBytes = Buffer.from('00000018ftypmp42_FAKE_MP4_VIDEO_PAYLOAD_ABCDEFG');
      const uploadedVid = await uploadMedia(
        srv.baseUrl,
        wsId,
        'demo-video.mp4',
        'video/mp4',
        videoBytes,
        'video'
      );
      const vidColRes = await fetch(`${srv.baseUrl}/api/media-collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({
          title: 'QR Video Audit',
          source: { type: 'video', videoUrl: uploadedVid.fileUrl, videoPageUrl: uploadedVid.pageUrl },
          experience: { template: 'video-page', headline: 'Clip événement' },
        }),
      });
      assert.equal(vidColRes.status, 201);
      const vidCol = (await vidColRes.json()) as { id: string; pageUrl: string };

      // Test 3: Create QR code containing Text (hosted collection + dynamic QR)
      const textColRes = await fetch(`${srv.baseUrl}/api/media-collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({
          title: 'QR Texte Audit',
          source: { type: 'text', textMode: 'text', textValue: 'Message confidentiel SparkQR' },
          experience: { template: 'standard', headline: 'Note privée' },
        }),
      });
      assert.equal(textColRes.status, 201);
      const textCol = (await textColRes.json()) as { id: string; pageUrl: string };

      // Save workspace projects list (simulating "Mes QR codes" persistence)
      const syncProjectsRes = await fetch(`${srv.baseUrl}/api/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({
          items: [
            { id: 'proj-img', serverCollectionId: imgCol.id, payload: `https://sparkqr.app/m/${imgCol.id}` },
            { id: 'proj-vid', serverCollectionId: vidCol.id, payload: `https://sparkqr.app/m/${vidCol.id}` },
            { id: 'proj-txt', serverCollectionId: textCol.id, payload: `https://sparkqr.app/m/${textCol.id}` },
          ],
        }),
      });
      assert.equal(syncProjectsRes.status, 200);

      // Test 4: Verify metadata and media registration on server & S3
      const mediaIndexBefore = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'media-index.json'), 'utf8')
      ) as Record<string, { storage?: { key?: string } }>;
      assert.ok(mediaIndexBefore[uploadedImg.id]);
      assert.ok(mediaIndexBefore[uploadedVid.id]);
      assert.ok(mediaIndexBefore[imgCol.id]);
      assert.ok(mediaIndexBefore[vidCol.id]);
      assert.ok(mediaIndexBefore[textCol.id]);
      assert.ok(simS3.objects.has(uploadedImg.storage.key));
      assert.ok(simS3.objects.has(uploadedVid.storage.key));

      // Test 5: Verify QR accessibility (reader JSON + file streaming + HTTP Range 206 + Cache-Control)
      const imgReaderRes = await fetch(`${srv.baseUrl}/api/reader/media/${imgCol.id}`);
      assert.equal(imgReaderRes.status, 200);
      assert.equal(imgReaderRes.headers.get('cache-control'), 'no-store');
      const imgReaderJson = (await imgReaderRes.json()) as { source: { imageUrl: string } };
      assert.equal(imgReaderJson.source.imageUrl, uploadedImg.fileUrl);

      const imgFileRes = await fetch(`${srv.baseUrl}${uploadedImg.fileUrl}`);
      assert.equal(imgFileRes.status, 200);
      assert.equal(imgFileRes.headers.get('cache-control'), 'private, no-cache, must-revalidate');
      assert.deepEqual(Buffer.from(await imgFileRes.arrayBuffer()), imageBytes);

      const vidRangeRes = await fetch(`${srv.baseUrl}${uploadedVid.fileUrl}`, {
        headers: { Range: 'bytes=0-15' },
      });
      assert.equal(vidRangeRes.status, 206);
      assert.deepEqual(Buffer.from(await vidRangeRes.arrayBuffer()), videoBytes.subarray(0, 16));

      const txtReaderRes = await fetch(`${srv.baseUrl}/api/reader/media/${textCol.id}`);
      assert.equal(txtReaderRes.status, 200);
      const txtReaderJson = (await txtReaderRes.json()) as { source: { textValue: string } };
      assert.equal(txtReaderJson.source.textValue, 'Message confidentiel SparkQR');

      // Cron security check: fail-closed when CRON_SECRET unset -> 503
      delete process.env.CRON_SECRET;
      const unauthCron503 = await fetch(`${srv.baseUrl}/api/cron/cleanup`, { method: 'POST' });
      assert.equal(unauthCron503.status, 503);

      // Cron security check: invalid bearer -> 401
      process.env.CRON_SECRET = 'audit-cron-secret-xyz';
      const unauthCron401 = await fetch(`${srv.baseUrl}/api/cron/cleanup`, {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
      });
      assert.equal(unauthCron401.status, 401);

      // Test 6: Simulate expiration (8 days into the future)
      const expiredTimeMs = Date.now() + 8 * 24 * 60 * 60 * 1000;
      const idxForExpire = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'media-index.json'), 'utf8')
      ) as Record<string, { serverExpiresAt?: string }>;
      // Set all 5 records to expired 1 hour ago so authenticated POST /api/cron/cleanup sweeps them realistically
      const pastIso = new Date(Date.now() - 3600 * 1000).toISOString();
      for (const k of Object.keys(idxForExpire)) {
        idxForExpire[k].serverExpiresAt = pastIso;
      }
      fs.writeFileSync(path.join(tmpDir, 'media-index.json'), JSON.stringify(idxForExpire, null, 2));

      // Verify /m/:id & /api/reader/media/:id immediately block expired reads with 410 before cron even runs
      const expiredPageRes = await fetch(`${srv.baseUrl}/m/${imgCol.id}`);
      assert.equal(expiredPageRes.status, 410);

      // Run authenticated /api/cron/cleanup (with CRON_SECRET) to sweep any remaining expired records
      const cronRes = await fetch(`${srv.baseUrl}/api/cron/cleanup`, {
        method: 'POST',
        headers: { Authorization: 'Bearer audit-cron-secret-xyz' },
      });
      assert.equal(cronRes.status, 200);
      await srv.instance.retentionEngine.runCleanupPass(expiredTimeMs);

      // Test 7: Verify complete deletion of JSON data on Render side
      const mediaIndexAfter = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'media-index.json'), 'utf8')
      ) as Record<string, unknown>;
      assert.deepEqual(Object.keys(mediaIndexAfter), []);

      const projectsAfter = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'workspaces', `${wsId}-projects.json`), 'utf8')
      ) as unknown[];
      assert.deepEqual(projectsAfter, []);

      // Verify endpoints now return 404
      assert.equal((await fetch(`${srv.baseUrl}/api/reader/media/${imgCol.id}`)).status, 404);
      assert.equal((await fetch(`${srv.baseUrl}/api/reader/media/${vidCol.id}`)).status, 404);
      assert.equal((await fetch(`${srv.baseUrl}/api/reader/media/${textCol.id}`)).status, 404);
      assert.equal((await fetch(`${srv.baseUrl}${uploadedImg.fileUrl}`)).status, 404);
      assert.equal((await fetch(`${srv.baseUrl}${uploadedVid.fileUrl}`)).status, 404);

      // Test 8: Verify deletion of ALL media objects on Dosya.dev side
      assert.equal(simS3.objects.has(uploadedImg.storage.key), false);
      assert.equal(simS3.objects.has(uploadedVid.storage.key), false);
      const remainingMediaKeys = Array.from(simS3.objects.keys()).filter(
        (k) => !k.startsWith('sparkqr/_state/')
      );
      assert.deepEqual(remainingMediaKeys, []);
    } finally {
      await srv.close();
    }
  } finally {
    if (prevCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = prevCronSecret;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Audit Tests 9-11 & Render State Recovery: Manual deletion, S3 failure retry, shared media preservation & S3 backup restore', async () => {
  const tmpDir = makeTempDir();
  const simS3 = new InMemoryS3Simulator();

  try {
    const srv = await startTestServer(tmpDir, simS3);
    let wsId = '';
    let sharedImgKey = '';
    let dynMediaKey = '';

    try {
      wsId = await createWorkspace(srv.baseUrl);

      // -------------------------------------------------------------------
      // Test 9: Manual deletion (from Storage Dashboard / Mes QR codes API)
      // -------------------------------------------------------------------
      const manualImg = await uploadMedia(
        srv.baseUrl,
        wsId,
        'manual-delete.png',
        'image/png',
        Buffer.from('MANUAL_DELETE_IMAGE_DATA'),
        'image'
      );
      const manualColRes = await fetch(`${srv.baseUrl}/api/media-collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({
          title: 'Suppression manuelle',
          source: { type: 'image', imageUrl: manualImg.fileUrl, imagePageUrl: manualImg.pageUrl },
        }),
      });
      const manualCol = (await manualColRes.json()) as { id: string };
      assert.ok(simS3.objects.has(manualImg.storage.key));

      const delRes = await fetch(`${srv.baseUrl}/api/storage/item/collection/${manualCol.id}`, {
        method: 'DELETE',
        headers: { 'X-Workspace-Id': wsId },
      });
      assert.equal(delRes.status, 200);
      const delJson = (await delRes.json()) as { deleted: boolean; s3ObjectsDeleted: number };
      assert.equal(delJson.deleted, true);
      assert.equal(delJson.s3ObjectsDeleted, 1);
      assert.equal(simS3.objects.has(manualImg.storage.key), false);
      assert.equal((await fetch(`${srv.baseUrl}/m/${manualCol.id}`)).status, 404);
      assert.equal((await fetch(`${srv.baseUrl}${manualImg.fileUrl}`)).status, 404);

      // -------------------------------------------------------------------
      // Test 10: Temporary Dosya.dev failure & automatic deletion retry
      // -------------------------------------------------------------------
      const retryImg = await uploadMedia(
        srv.baseUrl,
        wsId,
        'retry-outage.png',
        'image/png',
        Buffer.from('RETRY_OUTAGE_PAYLOAD'),
        'image'
      );
      const dynRes = await fetch(`${srv.baseUrl}/api/dynamic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({
          active: true,
          destination: {
            intent: 'image',
            payload: `https://sparkqr.app/m/${retryImg.id}`,
            title: 'QR dynamique avec retry S3',
            sourceSnapshot: { type: 'image', imageUrl: retryImg.fileUrl },
            experience: { template: 'standard' },
            cardTheme: {},
          },
        }),
      });
      assert.equal(dynRes.status, 201);
      const dynRec = (await dynRes.json()) as { slug: string };
      dynMediaKey = retryImg.storage.key;

      // Inject temporary Dosya.dev outage
      simS3.failDeletes = true;
      const failDelRes = await fetch(`${srv.baseUrl}/api/storage/item/dynamic/${dynRec.slug}`, {
        method: 'DELETE',
        headers: { 'X-Workspace-Id': wsId },
      });
      assert.equal(failDelRes.status, 200);
      const failDelJson = (await failDelRes.json()) as { pendingRetry: boolean; s3ObjectsDeleted: number };
      assert.equal(failDelJson.pendingRetry, true);
      assert.equal(failDelJson.s3ObjectsDeleted, 0);

      // Metadata & public routes are already gone, while deletion job is queued
      assert.equal((await fetch(`${srv.baseUrl}/d/${dynRec.slug}`)).status, 404);
      assert.equal((await fetch(`${srv.baseUrl}${retryImg.fileUrl}`)).status, 404);
      assert.equal(simS3.objects.has(dynMediaKey), true);
      const pendingJobs = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'deletion-jobs.json'), 'utf8')
      ) as Array<{ pendingS3Keys: string[] }>;
      assert.equal(pendingJobs.length, 1);
      assert.deepEqual(pendingJobs[0].pendingS3Keys, [dynMediaKey]);

      // Restore Dosya.dev & trigger automatic cleanup retry pass
      simS3.failDeletes = false;
      const retrySweep = await srv.instance.retentionEngine.runCleanupPass();
      assert.equal(retrySweep.retriedJobsCompleted, 1);
      assert.equal(simS3.objects.has(dynMediaKey), false);
      const jobsAfterRetry = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'deletion-jobs.json'), 'utf8')
      ) as unknown[];
      assert.deepEqual(jobsAfterRetry, []);
      const auditEntries = srv.instance.retentionEngine.listAuditLog(wsId);
      assert.ok(auditEntries.some((a) => a.shortRef === `#${dynRec.slug.slice(0, 6)}` && a.s3ObjectsDeleted === 1));

      // -------------------------------------------------------------------
      // Test 11: Shared media referenced by QR A and QR B
      // -------------------------------------------------------------------
      const sharedBytes = Buffer.from('SHARED_HIGH_RES_IMAGE_99999');
      const sharedImg = await uploadMedia(
        srv.baseUrl,
        wsId,
        'shared-asset.jpg',
        'image/jpeg',
        sharedBytes,
        'image'
      );
      sharedImgKey = sharedImg.storage.key;

      const colARes = await fetch(`${srv.baseUrl}/api/media-collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({
          title: 'QR A partage',
          source: { type: 'image', imageUrl: sharedImg.fileUrl, imagePageUrl: sharedImg.pageUrl },
        }),
      });
      const colA = (await colARes.json()) as { id: string };

      const colBRes = await fetch(`${srv.baseUrl}/api/media-collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({
          title: 'QR B partage',
          source: { type: 'image', imageUrl: sharedImg.fileUrl, imagePageUrl: sharedImg.pageUrl },
        }),
      });
      const colB = (await colBRes.json()) as { id: string };

      // Deleting standalone media directly while referenced by QR A & QR B must be blocked (409 Conflict)
      const blockedMediaDel = await fetch(`${srv.baseUrl}/api/media/${sharedImg.id}`, {
        method: 'DELETE',
        headers: { 'X-Workspace-Id': wsId },
      });
      assert.equal(blockedMediaDel.status, 409);
      assert.equal(simS3.objects.has(sharedImgKey), true);

      // Delete QR A: QR A disappears, QR B and shared S3 file remain 100% intact!
      const delARes = await fetch(`${srv.baseUrl}/api/storage/item/collection/${colA.id}`, {
        method: 'DELETE',
        headers: { 'X-Workspace-Id': wsId },
      });
      assert.equal(delARes.status, 200);
      assert.equal((await fetch(`${srv.baseUrl}/m/${colA.id}`)).status, 404);
      assert.equal((await fetch(`${srv.baseUrl}/api/reader/media/${colA.id}`)).status, 404);
      assert.equal((await fetch(`${srv.baseUrl}/api/reader/media/${colB.id}`)).status, 200);
      const sharedFileStillAlive = await fetch(`${srv.baseUrl}${sharedImg.fileUrl}`);
      assert.equal(sharedFileStillAlive.status, 200);
      assert.deepEqual(Buffer.from(await sharedFileStillAlive.arrayBuffer()), sharedBytes);
      assert.equal(simS3.objects.has(sharedImgKey), true);

      // Flush S3 state backup before closing server 1 so we can test Render Free redeploy recovery
      await srv.instance.stateBackup.flush();
    } finally {
      await srv.close();
    }

    // -------------------------------------------------------------------
    // Bonus Verification: Simulate Render Free ephemeral disk wipe & startup restore from Dosya.dev S3
    // -------------------------------------------------------------------
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const restartedSrv = await startTestServer(tmpDir, simS3);
    try {
      // Verify QR B & shared media automatically restored from Dosya.dev S3 state mirror!
      const listRes = await fetch(`${restartedSrv.baseUrl}/api/media`, {
        headers: { 'X-Workspace-Id': wsId },
      });
      assert.equal(listRes.status, 200);
      const listJson = (await listRes.json()) as { items: Array<{ id: string }> };
      assert.equal(listJson.items.length, 1);

      const dashRes = await fetch(`${restartedSrv.baseUrl}/api/storage/dashboard`, {
        headers: { 'X-Workspace-Id': wsId },
      });
      assert.equal(dashRes.status, 200);
      const dashJson = (await dashRes.json()) as { items: Array<{ id: string; kind: string }> };
      const colBItem = dashJson.items.find((i) => i.kind === 'collection');
      assert.ok(colBItem);

      // Deleting QR B now deletes the last reference -> S3 object is finally deleted too!
      const delBRes = await fetch(`${restartedSrv.baseUrl}/api/storage/item/collection/${colBItem.id}`, {
        method: 'DELETE',
        headers: { 'X-Workspace-Id': wsId },
      });
      assert.equal(delBRes.status, 200);
      assert.equal(simS3.objects.has(sharedImgKey), false);
    } finally {
      await restartedSrv.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
