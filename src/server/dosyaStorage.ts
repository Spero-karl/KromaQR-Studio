import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import path from 'path';
import { Readable } from 'stream';

export const DEFAULT_DOSYA_ENDPOINT = 'https://api.dosya.dev/s3';
export const DEFAULT_DOSYA_REGION = 'us-east-1';
export const DEFAULT_DOSYA_BUCKET = 'ws_DW34yrBK9IcRm1vYQb47G';

export interface DosyaStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface DosyaPublicStatus {
  provider: 'dosya.dev';
  configured: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  missingVars: string[];
}

export interface DosyaUploadResult {
  provider: 'dosya-s3';
  bucket: string;
  key: string;
  etag?: string;
  size: number;
  endpoint: string;
  region: string;
}

export interface DosyaObjectStreamResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
  acceptRanges?: string;
  etag?: string;
  statusCode: 200 | 206;
}

export interface DosyaHeadResult {
  contentType: string;
  contentLength?: number;
  etag?: string;
}

export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/ogg': '.ogv',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'application/octet-stream': '.spk1',
};

export function readDosyaConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): DosyaStorageConfig {
  const endpoint = (env.DOSYA_ENDPOINT || DEFAULT_DOSYA_ENDPOINT).trim().replace(/\/+$/, '');
  const region = (env.DOSYA_REGION || DEFAULT_DOSYA_REGION).trim();
  const bucket = (env.DOSYA_BUCKET || DEFAULT_DOSYA_BUCKET).trim();
  const accessKeyId = (env.DOSYA_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.DOSYA_SECRET_ACCESS_KEY || '').trim();

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

function toNodeReadable(body: unknown): Readable {
  if (!body) {
    throw new Error('Corps de réponse S3 vide.');
  }
  if (body instanceof Readable) {
    return body;
  }
  if (
    typeof (body as { transformToWebStream?: () => unknown }).transformToWebStream === 'function'
  ) {
    const webStream = (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
    return Readable.fromWeb(webStream as never);
  }
  if (Symbol.asyncIterator in (body as object)) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  throw new Error('Flux objet S3 incompatible.');
}

export class DosyaStorageService {
  private readonly config: DosyaStorageConfig;
  private readonly customClient?: S3ClientLike;
  private s3Client: S3ClientLike | null = null;

  constructor(config?: DosyaStorageConfig, clientOverride?: S3ClientLike) {
    this.config = config ?? readDosyaConfigFromEnv();
    this.customClient = clientOverride;
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.endpoint &&
        this.config.region &&
        this.config.bucket &&
        this.config.accessKeyId &&
        this.config.secretAccessKey
    );
  }

  getPublicStatus(): DosyaPublicStatus {
    const missingVars: string[] = [];
    if (!this.config.endpoint) missingVars.push('DOSYA_ENDPOINT');
    if (!this.config.region) missingVars.push('DOSYA_REGION');
    if (!this.config.bucket) missingVars.push('DOSYA_BUCKET');
    if (!this.config.accessKeyId) missingVars.push('DOSYA_ACCESS_KEY_ID');
    if (!this.config.secretAccessKey) missingVars.push('DOSYA_SECRET_ACCESS_KEY');

    return {
      provider: 'dosya.dev',
      configured: missingVars.length === 0,
      endpoint: this.config.endpoint,
      region: this.config.region,
      bucket: this.config.bucket,
      missingVars,
    };
  }

  private getClient(): S3ClientLike {
    if (this.customClient) {
      return this.customClient;
    }
    if (!this.isConfigured()) {
      const status = this.getPublicStatus();
      throw new Error(
        `Stockage Dosya.dev non configuré sur le serveur (${status.missingVars.join(', ')} manquant(s)).`
      );
    }
    if (!this.s3Client) {
      const clientConfig: S3ClientConfig = {
        endpoint: this.config.endpoint,
        region: this.config.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      };
      this.s3Client = new S3Client(clientConfig);
    }
    return this.s3Client;
  }

  buildObjectKey(params: {
    mediaId: string;
    type: 'image' | 'video' | 'document' | 'audio' | 'encrypted';
    originalName: string;
    mimeType: string;
  }): string {
    const folderMap: Record<string, string> = {
      image: 'images',
      video: 'videos',
      document: 'documents',
      audio: 'audio',
      encrypted: 'encrypted',
    };
    const folder = folderMap[params.type] || 'files';
    const rawExt = path.extname(params.originalName || '').toLowerCase();
    const safeRawExt = rawExt.replace(/[^a-z0-9.]/g, '');
    const ext =
      safeRawExt && safeRawExt.length <= 8
        ? safeRawExt
        : MIME_EXTENSION_MAP[params.mimeType] || '.bin';
    const baseRaw = path.basename(params.originalName || params.mediaId, rawExt);
    const safeBase =
      baseRaw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'media';

    return `sparkqr/${folder}/${params.mediaId}/${Date.now()}-${safeBase}${ext}`;
  }

  async uploadObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<DosyaUploadResult> {
    const client = this.getClient();
    const cmd = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ContentLength: params.body.length,
      Metadata: params.metadata,
    });
    const out = (await client.send(cmd)) as { ETag?: string };
    return {
      provider: 'dosya-s3',
      bucket: this.config.bucket,
      key: params.key,
      etag: out?.ETag ? String(out.ETag).replace(/"/g, '') : undefined,
      size: params.body.length,
      endpoint: this.config.endpoint,
      region: this.config.region,
    };
  }

  async getObjectStream(params: {
    key: string;
    range?: string;
    fallbackContentType?: string;
  }): Promise<DosyaObjectStreamResult> {
    const client = this.getClient();
    const cmd = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: params.key,
      ...(params.range ? { Range: params.range } : {}),
    });
    const out = (await client.send(cmd)) as {
      Body?: unknown;
      ContentType?: string;
      ContentLength?: number;
      ContentRange?: string;
      AcceptRanges?: string;
      ETag?: string;
    };

    const stream = toNodeReadable(out.Body);
    const isPartial = Boolean(out.ContentRange);

    return {
      stream,
      contentType: out.ContentType || params.fallbackContentType || 'application/octet-stream',
      contentLength: typeof out.ContentLength === 'number' ? out.ContentLength : undefined,
      contentRange: out.ContentRange,
      acceptRanges: out.AcceptRanges || 'bytes',
      etag: out.ETag ? String(out.ETag).replace(/"/g, '') : undefined,
      statusCode: isPartial ? 206 : 200,
    };
  }

  async headObject(key: string): Promise<DosyaHeadResult> {
    const client = this.getClient();
    const cmd = new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });
    const out = (await client.send(cmd)) as {
      ContentType?: string;
      ContentLength?: number;
      ETag?: string;
    };
    return {
      contentType: out.ContentType || 'application/octet-stream',
      contentLength: typeof out.ContentLength === 'number' ? out.ContentLength : undefined,
      etag: out.ETag ? String(out.ETag).replace(/"/g, '') : undefined,
    };
  }

  async deleteObject(key: string): Promise<void> {
    if (!key || !key.trim()) return;
    const client = this.getClient();
    const cmd = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });
    try {
      await client.send(cmd);
    } catch (err) {
      const errName = (err as { name?: string })?.name;
      const httpStatus = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (errName === 'NoSuchKey' || httpStatus === 404) {
        return; // Idempotent deletion
      }
      throw err;
    }
  }

  async deleteObjects(keys: string[]): Promise<{
    deletedCount: number;
    failedKeys: Array<{ key: string; error: string }>;
  }> {
    const uniqueKeys = Array.from(new Set(keys.map((k) => k.trim()).filter(Boolean)));
    let deletedCount = 0;
    const failedKeys: Array<{ key: string; error: string }> = [];
    for (const key of uniqueKeys) {
      try {
        await this.deleteObject(key);
        deletedCount += 1;
      } catch (err) {
        failedKeys.push({
          key,
          error: err instanceof Error ? err.message : 'Erreur S3 inconnue',
        });
      }
    }
    return { deletedCount, failedKeys };
  }
}

export function createDosyaStorageFromEnv(): DosyaStorageService {
  return new DosyaStorageService(readDosyaConfigFromEnv(process.env));
}
