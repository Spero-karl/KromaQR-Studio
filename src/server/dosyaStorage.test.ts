import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  DEFAULT_DOSYA_BUCKET,
  DEFAULT_DOSYA_ENDPOINT,
  DEFAULT_DOSYA_REGION,
  DosyaStorageService,
  readDosyaConfigFromEnv,
  type S3ClientLike,
} from './dosyaStorage';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

test('readDosyaConfigFromEnv uses Dosya.dev public defaults and trims env vars', () => {
  const cfgDefault = readDosyaConfigFromEnv({});
  assert.equal(cfgDefault.endpoint, DEFAULT_DOSYA_ENDPOINT);
  assert.equal(cfgDefault.region, DEFAULT_DOSYA_REGION);
  assert.equal(cfgDefault.bucket, DEFAULT_DOSYA_BUCKET);
  assert.equal(cfgDefault.accessKeyId, '');
  assert.equal(cfgDefault.secretAccessKey, '');

  const cfgCustom = readDosyaConfigFromEnv({
    DOSYA_ENDPOINT: ' https://api.dosya.dev/s3/ ',
    DOSYA_REGION: ' us-east-1 ',
    DOSYA_BUCKET: ' ws_test_bucket ',
    DOSYA_ACCESS_KEY_ID: ' key_abc ',
    DOSYA_SECRET_ACCESS_KEY: ' secret_xyz ',
  });
  assert.equal(cfgCustom.endpoint, 'https://api.dosya.dev/s3');
  assert.equal(cfgCustom.region, 'us-east-1');
  assert.equal(cfgCustom.bucket, 'ws_test_bucket');
  assert.equal(cfgCustom.accessKeyId, 'key_abc');
  assert.equal(cfgCustom.secretAccessKey, 'secret_xyz');
});

test('getPublicStatus reports missing vars and never leaks secret values', () => {
  const unconfigured = new DosyaStorageService({
    endpoint: DEFAULT_DOSYA_ENDPOINT,
    region: DEFAULT_DOSYA_REGION,
    bucket: DEFAULT_DOSYA_BUCKET,
    accessKeyId: '',
    secretAccessKey: '',
  });
  assert.equal(unconfigured.isConfigured(), false);
  const statusMissing = unconfigured.getPublicStatus();
  assert.equal(statusMissing.provider, 'dosya.dev');
  assert.equal(statusMissing.configured, false);
  assert.deepEqual(statusMissing.missingVars, [
    'DOSYA_ACCESS_KEY_ID',
    'DOSYA_SECRET_ACCESS_KEY',
  ]);

  const configured = new DosyaStorageService({
    endpoint: DEFAULT_DOSYA_ENDPOINT,
    region: DEFAULT_DOSYA_REGION,
    bucket: DEFAULT_DOSYA_BUCKET,
    accessKeyId: 'synthetic-key-id',
    secretAccessKey: 'synthetic-secret-value',
  });
  assert.equal(configured.isConfigured(), true);
  const statusOk = configured.getPublicStatus();
  const serialized = JSON.stringify(statusOk);
  assert.equal(statusOk.configured, true);
  assert.deepEqual(statusOk.missingVars, []);
  assert.equal(serialized.includes('synthetic-key-id'), false);
  assert.equal(serialized.includes('synthetic-secret-value'), false);
});

test('DosyaStorageService throws a clear error when uploading without credentials', async () => {
  const service = new DosyaStorageService({
    endpoint: DEFAULT_DOSYA_ENDPOINT,
    region: DEFAULT_DOSYA_REGION,
    bucket: DEFAULT_DOSYA_BUCKET,
    accessKeyId: '',
    secretAccessKey: '',
  });

  await assert.rejects(
    () =>
      service.uploadObject({
        key: 'kromaqr/images/m1/photo.png',
        body: Buffer.from('hello'),
        contentType: 'image/png',
      }),
    /DOSYA_ACCESS_KEY_ID.*DOSYA_SECRET_ACCESS_KEY/
  );
});

test('buildObjectKey sanitizes French accents and spaces while preserving extension', () => {
  const service = new DosyaStorageService();
  const imgKey = service.buildObjectKey({
    mediaId: 'abc123',
    type: 'image',
    originalName: 'Affiche Été Studio (HD) !.png',
    mimeType: 'image/png',
  });
  assert.match(imgKey, /^sparkqr\/images\/abc123\/\d+-affiche-ete-studio-hd\.png$/);

  const vidKey = service.buildObjectKey({
    mediaId: 'vid999',
    type: 'video',
    originalName: 'sans-extension',
    mimeType: 'video/mp4',
  });
  assert.match(vidKey, /^sparkqr\/videos\/vid999\/\d+-sans-extension\.mp4$/);

  const encKey = service.buildObjectKey({
    mediaId: 'enc111',
    type: 'encrypted',
    originalName: 'encrypted-media.spk1',
    mimeType: 'application/octet-stream',
  });
  assert.match(encKey, /^sparkqr\/encrypted\/enc111\/\d+-encrypted-media\.spk1$/);
});

test('uploadObject, getObjectStream (full + Range 206), headObject, and deleteObject issue valid AWS S3 commands', async () => {
  const sentCommands: unknown[] = [];
  const fakePayload = Buffer.from('0123456789ABCDEF');

  const fakeClient: S3ClientLike = {
    async send(command: unknown) {
      sentCommands.push(command);
      if (command instanceof PutObjectCommand) {
        return { ETag: '"etag-put-1"' };
      }
      if (command instanceof HeadObjectCommand) {
        return {
          ContentType: 'video/mp4',
          ContentLength: fakePayload.length,
          ETag: '"etag-head-1"',
        };
      }
      if (command instanceof GetObjectCommand) {
        if (command.input.Range === 'bytes=0-3') {
          return {
            Body: Readable.from([fakePayload.subarray(0, 4)]),
            ContentType: 'video/mp4',
            ContentLength: 4,
            ContentRange: 'bytes 0-3/16',
            AcceptRanges: 'bytes',
            ETag: '"etag-get-206"',
          };
        }
        return {
          Body: Readable.from([fakePayload]),
          ContentType: 'video/mp4',
          ContentLength: fakePayload.length,
          AcceptRanges: 'bytes',
          ETag: '"etag-get-200"',
        };
      }
      if (command instanceof DeleteObjectCommand) {
        return {};
      }
      throw new Error('Unexpected command');
    },
  };

  const service = new DosyaStorageService(
    {
      endpoint: DEFAULT_DOSYA_ENDPOINT,
      region: DEFAULT_DOSYA_REGION,
      bucket: DEFAULT_DOSYA_BUCKET,
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    },
    fakeClient
  );

  const key = 'kromaqr/videos/vid1/1700000-demo.mp4';
  const uploaded = await service.uploadObject({
    key,
    body: fakePayload,
    contentType: 'video/mp4',
    metadata: { mediaid: 'vid1' },
  });
  assert.equal(uploaded.provider, 'dosya-s3');
  assert.equal(uploaded.bucket, DEFAULT_DOSYA_BUCKET);
  assert.equal(uploaded.key, key);
  assert.equal(uploaded.etag, 'etag-put-1');
  assert.equal(uploaded.size, fakePayload.length);

  const head = await service.headObject(key);
  assert.equal(head.contentType, 'video/mp4');
  assert.equal(head.contentLength, fakePayload.length);
  assert.equal(head.etag, 'etag-head-1');

  const fullStream = await service.getObjectStream({ key });
  assert.equal(fullStream.statusCode, 200);
  assert.equal(fullStream.contentType, 'video/mp4');
  assert.deepEqual(await streamToBuffer(fullStream.stream), fakePayload);

  const partialStream = await service.getObjectStream({ key, range: 'bytes=0-3' });
  assert.equal(partialStream.statusCode, 206);
  assert.equal(partialStream.contentRange, 'bytes 0-3/16');
  assert.deepEqual(await streamToBuffer(partialStream.stream), Buffer.from('0123'));

  await service.deleteObject(key);

  assert.equal(sentCommands.length, 5);
  assert.ok(sentCommands[0] instanceof PutObjectCommand);
  assert.equal((sentCommands[0] as PutObjectCommand).input.Bucket, DEFAULT_DOSYA_BUCKET);
  assert.equal((sentCommands[0] as PutObjectCommand).input.Key, key);
  assert.ok(sentCommands[1] instanceof HeadObjectCommand);
  assert.ok(sentCommands[2] instanceof GetObjectCommand);
  assert.ok(sentCommands[3] instanceof GetObjectCommand);
  assert.ok(sentCommands[4] instanceof DeleteObjectCommand);
});
