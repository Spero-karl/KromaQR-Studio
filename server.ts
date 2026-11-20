import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  buildPublicReaderUrl,
  detectEnvironmentIssue,
  inspectMediaUrlForQr,
  isAiStudioOrPreviewHost,
  isLocalOrPrivateHost,
  normalizeMediaAssetUrl,
  validatePublicAppUrl,
} from './src/utils/publicUrl.ts';
import { createDosyaStorageFromEnv } from './src/server/dosyaStorage.ts';
import { findMediaQrAssociations } from './src/server/mediaAssociations.ts';

interface MediaRecord {
  id: string;
  kind?: 'media' | 'collection';
  type: 'image' | 'video' | 'collection';
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
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
  createdAt: string;
}

interface DynamicScanEvent {
  at: string;
  device: string;
  unlocked: boolean;
}

interface ServerDynamicRecord {
  slug: string;
  active: boolean;
  pinSalt: string | null;
  pinHash: string | null;
  expiresAt: string | null;
  maxScans: number | null;
  createdAt: string;
  updatedAt: string;
  destination: {
    intent: 'url' | 'text' | 'wifi' | 'image' | 'video';
    payload: string;
    title: string;
    sourceSnapshot: Record<string, unknown>;
    experience: Record<string, unknown>;
    cardTheme: {
      cardBackgroundColor: string;
      foregroundColor: string;
      eyeColor: string;
      fontId: string;
    };
    config?: Record<string, unknown>;
  };
  stats: {
    totalScans: number;
    lastScannedAt: string | null;
    recentEvents: DynamicScanEvent[];
  };
}

const PORT = 3000;
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LEGACY_UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const INDEX_FILE = path.join(DATA_DIR, 'media-index.json');
const DYNAMIC_FILE = path.join(DATA_DIR, 'dynamic-qrs.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const PUBLIC_CONFIG_FILE = path.join(DATA_DIR, 'public-config.json');
const SECRET_FILE = path.join(DATA_DIR, '.hmac-secret');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function migrateLegacyJsonIfNeeded(legacyName: string, targetPath: string): void {
  const legacyPath = path.join(LEGACY_UPLOADS_DIR, legacyName);
  if (!fs.existsSync(targetPath) && fs.existsSync(legacyPath)) {
    try {
      fs.copyFileSync(legacyPath, targetPath);
    } catch {
      // Non-fatal migration skip
    }
  }
}

migrateLegacyJsonIfNeeded('index.json', INDEX_FILE);
migrateLegacyJsonIfNeeded('dynamic-qrs.json', DYNAMIC_FILE);
migrateLegacyJsonIfNeeded('projects.json', PROJECTS_FILE);
migrateLegacyJsonIfNeeded('public-config.json', PUBLIC_CONFIG_FILE);
migrateLegacyJsonIfNeeded('.hmac-secret', SECRET_FILE);

const dosyaStorage = createDosyaStorageFromEnv();

function getHmacSecret(): string {
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const val = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (val.length >= 32) return val;
    }
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret, 'utf-8');
    return secret;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const HMAC_SECRET = getHmacSecret();

function readJsonStore<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStore<T>(filePath: string, data: T): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readMediaIndex(): Record<string, MediaRecord> {
  return readJsonStore<Record<string, MediaRecord>>(INDEX_FILE, {});
}

function writeMediaIndex(index: Record<string, MediaRecord>): void {
  writeJsonStore(INDEX_FILE, index);
}

function readDynamicStore(): Record<string, ServerDynamicRecord> {
  return readJsonStore<Record<string, ServerDynamicRecord>>(DYNAMIC_FILE, {});
}

function writeDynamicStore(store: Record<string, ServerDynamicRecord>): void {
  writeJsonStore(DYNAMIC_FILE, store);
}

function readProjectsStore(): unknown[] {
  return readJsonStore<unknown[]>(PROJECTS_FILE, []);
}

function writeProjectsStore(projects: unknown[]): void {
  writeJsonStore(PROJECTS_FILE, projects);
}

interface StoredPublicConfig {
  publicAppUrl?: string;
}

function getDetectedOrigin(req?: express.Request): string {
  if (req) {
    const fwdHost = req.get('x-forwarded-host');
    const host = (fwdHost ? fwdHost.split(',')[0].trim() : '') || req.get('host') || '';
    const fwdProto = req.get('x-forwarded-proto');
    const proto = (fwdProto ? fwdProto.split(',')[0].trim() : '') || req.protocol || 'http';
    if (host) return `${proto}://${host}`;
  }
  return process.env.APP_URL || `http://localhost:${PORT}`;
}

function getEffectivePublicConfig(req?: express.Request) {
  const envRaw = (process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || '').trim();
  const saved = readJsonStore<StoredPublicConfig>(PUBLIC_CONFIG_FILE, {});
  const savedRaw = (saved.publicAppUrl || '').trim();
  const detectedOrigin = getDetectedOrigin(req);
  const diagnostics = detectEnvironmentIssue(detectedOrigin);

  if (envRaw) {
    const check = validatePublicAppUrl(envRaw);
    return {
      configuredUrl: check.valid ? check.normalizedUrl : envRaw,
      valid: check.valid,
      source: 'env' as const,
      error: check.error,
      detectedOrigin,
      diagnostics,
    };
  }

  if (savedRaw) {
    const check = validatePublicAppUrl(savedRaw);
    if (check.valid) {
      return {
        configuredUrl: check.normalizedUrl,
        valid: true,
        source: 'saved' as const,
        error: undefined,
        detectedOrigin,
        diagnostics,
      };
    }
  }

  // Only auto-accept current origin if deployed on a genuine public HTTPS domain (never AI Studio, never localhost)
  const detectedCheck = validatePublicAppUrl(detectedOrigin);
  if (detectedCheck.valid) {
    return {
      configuredUrl: detectedCheck.normalizedUrl,
      valid: true,
      source: 'detected' as const,
      error: undefined,
      detectedOrigin,
      diagnostics,
    };
  }

  return {
    configuredUrl: '',
    valid: false,
    source: 'none' as const,
    error: diagnostics.summary,
    detectedOrigin,
    diagnostics,
  };
}

function sanitizeSourceMediaUrls(source: Record<string, unknown>, experience?: Record<string, unknown>): string | null {
  const fieldsToInspect = ['imageUrl', 'videoUrl', 'videoPosterUrl'];
  for (const key of fieldsToInspect) {
    const val = source[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      const check = inspectMediaUrlForQr(val);
      if (!check.safe) {
        return check.error || 'URL média invalide.';
      }
    }
  }
  if (experience && Array.isArray(experience.galleryItems)) {
    for (const item of experience.galleryItems) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        if (typeof rec.url === 'string' && rec.url.trim().length > 0) {
          const check = inspectMediaUrlForQr(rec.url);
          if (!check.safe) {
            return check.error || 'URL de galerie invalide.';
          }
        }
        if (typeof rec.posterUrl === 'string' && rec.posterUrl.trim().length > 0) {
          const check = inspectMediaUrlForQr(rec.posterUrl);
          if (!check.safe) {
            return check.error || 'URL de miniature invalide.';
          }
        }
      }
    }
  }
  return null;
}

function generateShortId(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashPin(pin: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPinHash(pin: string, salt: string, expectedHex: string): boolean {
  try {
    const derived = crypto.scryptSync(pin, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function signUnlockToken(slug: string): string {
  const exp = Date.now() + 15 * 60 * 1000;
  const body = `${slug}:${exp}`;
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(body).digest('hex');
  return `${exp}.${sig}`;
}

function verifyUnlockToken(slug: string, token: string | undefined): boolean {
  if (!token || !token.includes('.')) return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const body = `${slug}:${exp}`;
  const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function summarizeDevice(ua: string | undefined): string {
  const agent = ua || '';
  if (/iPhone|iPad/i.test(agent)) return 'iOS Mobile';
  if (/Android/i.test(agent)) return 'Android Mobile';
  if (/Macintosh/i.test(agent)) return 'macOS Desktop';
  if (/Windows/i.test(agent)) return 'Windows Desktop';
  if (/Linux/i.test(agent)) return 'Linux Desktop';
  return 'Navigateur Web';
}

function sanitizeDynamicRecord(rec: ServerDynamicRecord, origin = '') {
  return {
    slug: rec.slug,
    shortUrl: origin ? `${origin}/d/${rec.slug}` : `/d/${rec.slug}`,
    active: rec.active,
    hasPin: Boolean(rec.pinHash),
    expiresAt: rec.expiresAt,
    maxScans: rec.maxScans,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    destination: rec.destination,
    stats: rec.stats,
  };
}

function renderStatusHtml(title: string, message: string, codeLabel: string): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} — KromaQR</title>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        padding: 24px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        background: linear-gradient(160deg, #FAF9F5 0%, #F1EFE8 100%); color: #111214;
      }
      .card {
        max-width: 460px; width: 100%; background: #FFFFFF; border: 1px solid #E6E4DC;
        border-radius: 24px; padding: 32px; text-align: center; box-shadow: 0 20px 56px rgba(17,18,20,0.07);
      }
      .kicker { font-size: 11px; font-weight: 600; color: #1D4ED8; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
      h1 { font-family: 'Bricolage Grotesque', sans-serif; font-size: 22px; margin: 0 0 10px; color: #111214; }
      p { font-size: 14px; color: #5C5E66; line-height: 1.6; margin: 0 0 22px; }
      a { display: inline-block; padding: 10px 20px; border-radius: 12px; background: #1D4ED8; color: #FFFFFF; text-decoration: none; font-size: 13px; font-weight: 600; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="kicker">${escapeHtml(codeLabel)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a href="/">Retour à KromaQR Studio</a>
    </main>
  </body>
</html>`;
}

function renderPinGateHtml(slug: string, title: string, errorMsg?: string): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Contenu protégé — ${escapeHtml(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        padding: 24px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        background: linear-gradient(160deg, #FAF9F5 0%, #F1EFE8 100%);
        color: #111214;
      }
      .card {
        max-width: 420px; width: 100%; background: #FFFFFF;
        border: 1px solid #E6E4DC; border-radius: 24px; padding: 32px;
        box-shadow: 0 20px 56px rgba(17,18,20,0.07);
      }
      .kicker { font-size: 11px; font-weight: 600; color: #1D4ED8; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; }
      h1 { font-family: 'Bricolage Grotesque', sans-serif; font-size: 20px; margin: 0 0 8px; color: #111214; }
      p { font-size: 13px; color: #5C5E66; line-height: 1.55; margin: 0 0 20px; }
      label { display: block; font-size: 12px; font-weight: 600; color: #2C2E33; margin-bottom: 8px; }
      input {
        width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid #DFDDD4;
        background: #FAF9F5; color: #111214; font-size: 16px; letter-spacing: 0.14em;
        margin-bottom: 14px; outline: none;
      }
      input:focus { border-color: #1D4ED8; background: #FFFFFF; }
      button {
        width: 100%; padding: 12px 18px; border-radius: 12px; border: 0;
        background: #1D4ED8; color: #FFFFFF; font-size: 14px; font-weight: 600; cursor: pointer;
      }
      button:hover { background: #1E40AF; }
      .error {
        background: #FEF2F2; border: 1px solid #FECACA;
        color: #B91C1C; padding: 10px 12px; border-radius: 10px; font-size: 12px; margin-bottom: 14px;
      }
    </style>
  </head>
  <body>
    <main class="card" data-testid="server-pin-gate">
      <div class="kicker">KromaQR Studio · Accès privé</div>
      <h1>Accès protégé</h1>
      <p>Ce code QR (« ${escapeHtml(title)} ») nécessite un code PIN ou mot de passe vérifié par le serveur pour afficher son contenu.</p>
      ${errorMsg ? `<div class="error" role="alert">${escapeHtml(errorMsg)}</div>` : ''}
      <form method="POST" action="/d/${escapeHtml(slug)}/unlock">
        <label for="pin">Code PIN / Mot de passe</label>
        <input id="pin" name="pin" type="password" required autocomplete="off" placeholder="••••" />
        <button type="submit">Déverrouiller le contenu</button>
      </form>
    </main>
  </body>
</html>`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024, // 60MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Format non pris en charge. Importez une image ou une vidéo.'));
    }
  },
});

function buildContentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const fallback =
    filename
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_') || 'media';
  const encoded = encodeURIComponent(filename);
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);

  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: false }));

  // Public scan routes & media assets must never block external clients with CORS/CORP
  app.use((req, res, next) => {
    const isPublicRoute =
      req.path.startsWith('/api/reader/') ||
      req.path.startsWith('/api/media') ||
      req.path.startsWith('/m/') ||
      req.path.startsWith('/d/') ||
      req.path.startsWith('/demo-');

    if (isPublicRoute) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Length, Content-Range, Accept-Ranges, Content-Disposition'
      );
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/storage/status', (_req, res) => {
    res.json(dosyaStorage.getPublicStatus());
  });

  app.get('/api/public-config', (req, res) => {
    res.json(getEffectivePublicConfig(req));
  });

  app.put('/api/public-config', (req, res) => {
    const rawUrl =
      typeof req.body?.publicAppUrl === 'string' ? req.body.publicAppUrl.trim() : '';
    if (!rawUrl) {
      if (fs.existsSync(PUBLIC_CONFIG_FILE)) {
        fs.unlinkSync(PUBLIC_CONFIG_FILE);
      }
      res.json(getEffectivePublicConfig(req));
      return;
    }
    const check = validatePublicAppUrl(rawUrl);
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }
    writeJsonStore(PUBLIC_CONFIG_FILE, { publicAppUrl: check.normalizedUrl });
    res.json(getEffectivePublicConfig(req));
  });

  app.delete('/api/public-config', (req, res) => {
    if (fs.existsSync(PUBLIC_CONFIG_FILE)) {
      fs.unlinkSync(PUBLIC_CONFIG_FILE);
    }
    res.json(getEffectivePublicConfig(req));
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier reçu.' });
      return;
    }

    if (!dosyaStorage.isConfigured()) {
      const status = dosyaStorage.getPublicStatus();
      res.status(503).json({
        error: `Stockage Dosya.dev non configuré sur le serveur (${status.missingVars.join(', ')} manquant(s)).`,
      });
      return;
    }

    const type: 'image' | 'video' = req.file.mimetype.startsWith('video/')
      ? 'video'
      : 'image';
    const id = generateShortId();
    const originalName = req.file.originalname || `media-${id}`;
    const objectKey = dosyaStorage.buildObjectKey({
      mediaId: id,
      type,
      originalName,
      mimeType: req.file.mimetype,
    });

    try {
      const uploaded = await dosyaStorage.uploadObject({
        key: objectKey,
        body: req.file.buffer,
        contentType: req.file.mimetype,
        metadata: {
          mediaid: id,
          mediatype: type,
        },
      });

      const fileUrl = `/api/media/${id}/file`;
      const downloadUrl = `/api/media/${id}/download`;
      const pageUrl = `/m/${id}`;

      const record: MediaRecord = {
        id,
        kind: 'media',
        type,
        filename: path.basename(uploaded.key),
        originalName,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: fileUrl,
        storage: {
          provider: 'dosya-s3',
          bucket: uploaded.bucket,
          key: uploaded.key,
          etag: uploaded.etag,
          endpoint: uploaded.endpoint,
          region: uploaded.region,
        },
        createdAt: new Date().toISOString(),
      };

      const index = readMediaIndex();
      index[id] = record;
      writeMediaIndex(index);

      const pub = getEffectivePublicConfig(req);
      res.status(201).json({
        ...record,
        fileUrl,
        downloadUrl,
        pageUrl,
        publicUrl: pub.valid ? buildPublicReaderUrl(pub.configuredUrl, pageUrl) : undefined,
      });
    } catch (err) {
      console.error('Dosya.dev S3 upload failed:', err);
      res.status(502).json({
        error:
          err instanceof Error
            ? `Échec du téléversement vers Dosya.dev : ${err.message}`
            : 'Échec du téléversement vers Dosya.dev.',
      });
    }
  });

  // Register a demo asset so scanning its QR opens a dedicated /m/:id viewer page
  app.post('/api/register-demo', (req, res) => {
    const { type, url, title, posterUrl } = req.body as {
      type?: 'image' | 'video';
      url?: string;
      title?: string;
      posterUrl?: string;
    };
    if (!type || !url) {
      res.status(400).json({ error: 'Paramètres manquants.' });
      return;
    }
    const id = type === 'image' ? 'demoimg' : 'demovid';
    const record: MediaRecord = {
      id,
      kind: 'media',
      type,
      filename: path.basename(url),
      originalName: title || (type === 'image' ? 'Exposition Formes Géométriques.jpg' : 'Teaser Atelier Motion.mp4'),
      mimeType: type === 'image' ? 'image/jpeg' : 'video/mp4',
      size: 0,
      url,
      storage: { provider: 'demo' },
      posterUrl: posterUrl || undefined,
      createdAt: new Date().toISOString(),
    };
    const index = readMediaIndex();
    index[id] = record;
    writeMediaIndex(index);
    res.json({
      ...record,
      pageUrl: `/m/${id}`,
    });
  });

  // Register a full hosted multimedia collection / custom reader bundle (/m/:id)
  app.post('/api/media-collection', (req, res) => {
    const { source, experience, config, title } = req.body as {
      source?: Record<string, unknown>;
      experience?: Record<string, unknown>;
      config?: Record<string, unknown>;
      title?: string;
    };
    if (!source) {
      res.status(400).json({ error: 'Données multimédia manquantes.' });
      return;
    }
    const unsafeError = sanitizeSourceMediaUrls(source, experience);
    if (unsafeError) {
      res.status(400).json({ error: unsafeError });
      return;
    }

    const id = generateShortId();
    const record: MediaRecord = {
      id,
      kind: 'collection',
      type: 'collection',
      filename: id,
      originalName: title || 'Collection KromaQR Studio',
      mimeType: 'application/json',
      size: 0,
      url: `/m/${id}`,
      storage: { provider: 'collection' },
      posterUrl:
        typeof source.videoPosterUrl === 'string' && source.videoPosterUrl
          ? source.videoPosterUrl
          : undefined,
      source,
      experience: experience || {},
      config: config || {},
      createdAt: new Date().toISOString(),
    };
    const index = readMediaIndex();
    index[id] = record;
    writeMediaIndex(index);
    const pub = getEffectivePublicConfig(req);
    const pageUrl = `/m/${id}`;
    res.status(201).json({
      id,
      pageUrl,
      publicUrl: pub.valid ? buildPublicReaderUrl(pub.configuredUrl, pageUrl) : undefined,
    });
  });

  app.get('/api/media', (req, res) => {
    const index = readMediaIndex();
    const dynamicStore = readDynamicStore();
    const pub = getEffectivePublicConfig(req);
    const items = Object.values(index)
      .filter((rec) => rec.kind !== 'collection' && rec.storage?.provider === 'dosya-s3')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((rec) => {
        const pageUrl = `/m/${rec.id}`;
        return {
          ...rec,
          fileUrl: `/api/media/${rec.id}/file`,
          downloadUrl: `/api/media/${rec.id}/download`,
          pageUrl,
          publicUrl: pub.valid ? buildPublicReaderUrl(pub.configuredUrl, pageUrl) : undefined,
          associations: findMediaQrAssociations(rec.id, rec.url, index, dynamicStore),
        };
      });
    res.json({ items });
  });

  app.get('/api/media/:id', (req, res) => {
    const index = readMediaIndex();
    const record = index[req.params.id];
    if (!record) {
      res.status(404).json({ error: 'Média introuvable.' });
      return;
    }
    const dynamicStore = readDynamicStore();
    const pub = getEffectivePublicConfig(req);
    const pageUrl = `/m/${record.id}`;
    const isS3 = record.storage?.provider === 'dosya-s3';
    res.json({
      ...record,
      fileUrl: isS3 ? `/api/media/${record.id}/file` : record.url,
      downloadUrl: isS3 ? `/api/media/${record.id}/download` : record.url,
      pageUrl,
      publicUrl: pub.valid ? buildPublicReaderUrl(pub.configuredUrl, pageUrl) : undefined,
      associations: findMediaQrAssociations(record.id, record.url, index, dynamicStore),
    });
  });

  const handleServeS3Media = async (
    req: express.Request,
    res: express.Response,
    disposition: 'inline' | 'attachment'
  ) => {
    const index = readMediaIndex();
    const record = index[req.params.id];
    if (!record || record.kind === 'collection') {
      res.status(404).json({ error: 'Média introuvable.' });
      return;
    }

    if (record.storage?.provider === 'demo' && record.url.startsWith('/demo-')) {
      const demoPath = path.join(ROOT_DIR, 'public', path.basename(record.url));
      if (!fs.existsSync(demoPath)) {
        res.status(404).json({ error: 'Média de démonstration introuvable.' });
        return;
      }
      if (disposition === 'attachment') {
        res.download(demoPath, record.originalName || path.basename(demoPath));
      } else {
        res.sendFile(demoPath);
      }
      return;
    }

    if (record.storage?.provider !== 'dosya-s3' || !record.storage.key) {
      res.status(404).json({ error: 'Objet S3 introuvable pour ce média.' });
      return;
    }

    if (!dosyaStorage.isConfigured()) {
      res.status(503).json({
        error: 'Stockage Dosya.dev non configuré sur le serveur pour lire ce média.',
      });
      return;
    }

    try {
      const rangeHeader =
        disposition === 'inline' && typeof req.headers.range === 'string'
          ? req.headers.range
          : undefined;
      const obj = await dosyaStorage.getObjectStream({
        key: record.storage.key,
        range: rangeHeader,
        fallbackContentType: record.mimeType,
      });

      res.status(obj.statusCode);
      res.setHeader('Content-Type', obj.contentType || record.mimeType);
      res.setHeader('Accept-Ranges', obj.acceptRanges || 'bytes');
      if (typeof obj.contentLength === 'number') {
        res.setHeader('Content-Length', String(obj.contentLength));
      }
      if (obj.contentRange) {
        res.setHeader('Content-Range', obj.contentRange);
      }
      if (obj.etag) {
        res.setHeader('ETag', `"${obj.etag}"`);
      }
      res.setHeader(
        'Content-Disposition',
        buildContentDisposition(disposition, record.originalName || record.filename)
      );
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      req.on('close', () => {
        if (!obj.stream.destroyed) {
          obj.stream.destroy();
        }
      });

      obj.stream.on('error', (streamErr) => {
        console.error('S3 stream error:', streamErr);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Erreur de lecture du flux Dosya.dev.' });
        } else {
          res.end();
        }
      });

      obj.stream.pipe(res);
    } catch (err) {
      const errName = (err as { name?: string })?.name;
      const httpStatus = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (errName === 'NoSuchKey' || httpStatus === 404) {
        res.status(404).json({ error: 'Fichier introuvable dans Dosya.dev.' });
        return;
      }
      console.error('Dosya.dev S3 read failed:', err);
      res.status(502).json({ error: 'Impossible de lire le fichier depuis Dosya.dev.' });
    }
  };

  app.get('/api/media/:id/file', (req, res) => {
    void handleServeS3Media(req, res, 'inline');
  });

  app.get('/api/media/:id/download', (req, res) => {
    void handleServeS3Media(req, res, 'attachment');
  });

  app.delete('/api/media/:id', async (req, res) => {
    const index = readMediaIndex();
    const record = index[req.params.id];
    if (!record) {
      res.status(404).json({ error: 'Média introuvable.' });
      return;
    }

    const dynamicStore = readDynamicStore();
    const associations = findMediaQrAssociations(record.id, record.url, index, dynamicStore);

    let removedFromS3 = false;
    if (record.storage?.provider === 'dosya-s3' && record.storage.key) {
      if (!dosyaStorage.isConfigured()) {
        res.status(503).json({
          error: 'Stockage Dosya.dev non configuré sur le serveur pour supprimer cet objet.',
        });
        return;
      }
      try {
        await dosyaStorage.deleteObject(record.storage.key);
        removedFromS3 = true;
      } catch (err) {
        console.error('Dosya.dev S3 delete failed:', err);
        res.status(502).json({
          error:
            err instanceof Error
              ? `Impossible de supprimer l’objet sur Dosya.dev : ${err.message}`
              : 'Impossible de supprimer l’objet sur Dosya.dev.',
        });
        return;
      }
    }

    delete index[req.params.id];
    writeMediaIndex(index);

    res.json({
      deleted: true,
      id: req.params.id,
      removedFromS3,
      associations,
    });
  });

  app.get('/api/reader/media/:id', (req, res) => {
    const index = readMediaIndex();
    const record = index[req.params.id];
    if (!record) {
      res.status(404).json({ error: 'Média introuvable ou expiré.' });
      return;
    }

    const pub = getEffectivePublicConfig(req);
    const publicPayload = pub.valid
      ? buildPublicReaderUrl(pub.configuredUrl, `/m/${record.id}`)
      : `/m/${record.id}`;

    if (record.kind === 'collection' && record.source) {
      const normalizedSource: Record<string, unknown> = { ...record.source };
      if (typeof normalizedSource.imageUrl === 'string') {
        normalizedSource.imageUrl = normalizeMediaAssetUrl(normalizedSource.imageUrl);
      }
      if (typeof normalizedSource.videoUrl === 'string') {
        normalizedSource.videoUrl = normalizeMediaAssetUrl(normalizedSource.videoUrl);
      }
      if (typeof normalizedSource.videoPosterUrl === 'string') {
        normalizedSource.videoPosterUrl = normalizeMediaAssetUrl(
          normalizedSource.videoPosterUrl
        );
      }
      res.json({
        id: record.id,
        payload: publicPayload,
        source: normalizedSource,
        experience: record.experience || {},
        config: record.config || null,
      });
      return;
    }

    const isVideo = record.type === 'video';
    const cleanAssetUrl = normalizeMediaAssetUrl(record.url);
    res.json({
      id: record.id,
      payload: publicPayload,
      source: {
        type: isVideo ? 'video' : 'image',
        textMode: 'url',
        imageUrl: isVideo ? '' : cleanAssetUrl,
        imageName: isVideo ? '' : record.originalName,
        imagePageUrl: isVideo ? '' : `/m/${record.id}`,
        videoUrl: isVideo ? cleanAssetUrl : '',
        videoName: isVideo ? record.originalName : '',
        videoPageUrl: isVideo ? `/m/${record.id}` : '',
        videoPosterUrl: record.posterUrl ? normalizeMediaAssetUrl(record.posterUrl) : '',
      },
      experience: {
        template: 'standard',
        headline: record.originalName,
        description: 'Partagé via KromaQR Studio — Lecteur multimédia natif',
        accentMood: 'auto',
      },
      config: record.config || null,
    });
  });

  // =========================================================================
  // REAL SERVER-SIDE DYNAMIC QR & SECURITY ENDPOINTS
  // =========================================================================

  app.get('/api/dynamic', (req, res) => {
    const store = readDynamicStore();
    const pub = getEffectivePublicConfig(req);
    const publicOrigin = pub.valid ? pub.configuredUrl : '';
    const list = Object.values(store)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((rec) => sanitizeDynamicRecord(rec, publicOrigin));
    res.json({ items: list });
  });

  app.post('/api/dynamic', (req, res) => {
    const body = req.body as {
      slug?: string | null;
      active?: boolean;
      pinCode?: string;
      expiresAt?: string | null;
      maxScans?: number | null;
      destination?: ServerDynamicRecord['destination'];
    };

    if (!body.destination || !body.destination.payload) {
      res.status(400).json({ error: 'Destination manquante pour le QR dynamique.' });
      return;
    }

    if (/^https?:\/\//i.test(body.destination.payload)) {
      try {
        const destParsed = new URL(body.destination.payload);
        if (isAiStudioOrPreviewHost(destParsed.hostname)) {
          res.status(400).json({
            error:
              'Destination Google AI Studio interdite dans un QR dynamique.',
          });
          return;
        }
        if (isLocalOrPrivateHost(destParsed.hostname)) {
          res.status(400).json({
            error:
              'Destination locale (localhost / IP privée) interdite dans un QR dynamique.',
          });
          return;
        }
      } catch {
        // Non-URL payload (e.g., Wi-Fi or text)
      }
    }

    if (body.destination.sourceSnapshot) {
      const unsafeErr = sanitizeSourceMediaUrls(
        body.destination.sourceSnapshot,
        body.destination.experience
      );
      if (unsafeErr) {
        res.status(400).json({ error: unsafeErr });
        return;
      }
    }

    const store = readDynamicStore();
    const now = new Date().toISOString();
    const slug = body.slug && store[body.slug] ? body.slug : generateShortId();
    const existing = store[slug];

    let pinSalt = existing?.pinSalt ?? null;
    let pinHash = existing?.pinHash ?? null;
    if (typeof body.pinCode === 'string') {
      const trimmedPin = body.pinCode.trim();
      if (trimmedPin.length > 0) {
        const hashed = hashPin(trimmedPin);
        pinSalt = hashed.salt;
        pinHash = hashed.hash;
      } else if (body.pinCode === '') {
        // Explicit clear only if creating or explicitly clearing
        if (!existing) {
          pinSalt = null;
          pinHash = null;
        }
      }
    }

    const nextRecord: ServerDynamicRecord = {
      slug,
      active: typeof body.active === 'boolean' ? body.active : existing?.active ?? true,
      pinSalt,
      pinHash,
      expiresAt: body.expiresAt ? body.expiresAt : null,
      maxScans:
        typeof body.maxScans === 'number' && body.maxScans > 0 ? body.maxScans : null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      destination: body.destination,
      stats: existing?.stats ?? {
        totalScans: 0,
        lastScannedAt: null,
        recentEvents: [],
      },
    };

    store[slug] = nextRecord;
    writeDynamicStore(store);

    const pub = getEffectivePublicConfig(req);
    const publicOrigin = pub.valid ? pub.configuredUrl : '';
    res.status(existing ? 200 : 201).json(sanitizeDynamicRecord(nextRecord, publicOrigin));
  });

  app.patch('/api/dynamic/:slug', (req, res) => {
    const store = readDynamicStore();
    const rec = store[req.params.slug];
    if (!rec) {
      res.status(404).json({ error: 'QR dynamique introuvable.' });
      return;
    }
    const body = req.body as {
      active?: boolean;
      pinCode?: string | null;
      clearPin?: boolean;
      expiresAt?: string | null;
      maxScans?: number | null;
      destination?: Partial<ServerDynamicRecord['destination']>;
    };

    if (typeof body.active === 'boolean') rec.active = body.active;
    if (body.clearPin) {
      rec.pinSalt = null;
      rec.pinHash = null;
    } else if (typeof body.pinCode === 'string' && body.pinCode.trim().length > 0) {
      const hashed = hashPin(body.pinCode.trim());
      rec.pinSalt = hashed.salt;
      rec.pinHash = hashed.hash;
    }
    if (body.expiresAt !== undefined) {
      rec.expiresAt = body.expiresAt || null;
    }
    if (body.maxScans !== undefined) {
      rec.maxScans =
        typeof body.maxScans === 'number' && body.maxScans > 0 ? body.maxScans : null;
    }
    if (body.destination) {
      if (
        typeof body.destination.payload === 'string' &&
        /^https?:\/\//i.test(body.destination.payload)
      ) {
        try {
          const destParsed = new URL(body.destination.payload);
          if (isAiStudioOrPreviewHost(destParsed.hostname)) {
            res.status(400).json({
              error: 'Destination Google AI Studio interdite dans un QR dynamique.',
            });
            return;
          }
          if (isLocalOrPrivateHost(destParsed.hostname)) {
            res.status(400).json({
              error: 'Destination locale (localhost / IP privée) interdite dans un QR dynamique.',
            });
            return;
          }
        } catch {
          // Ignore non-URL payloads
        }
      }
      rec.destination = {
        ...rec.destination,
        ...body.destination,
      };
    }
    rec.updatedAt = new Date().toISOString();

    store[rec.slug] = rec;
    writeDynamicStore(store);

    const pub = getEffectivePublicConfig(req);
    const publicOrigin = pub.valid ? pub.configuredUrl : '';
    res.json(sanitizeDynamicRecord(rec, publicOrigin));
  });

  app.delete('/api/dynamic/:slug', (req, res) => {
    const store = readDynamicStore();
    if (!store[req.params.slug]) {
      res.status(404).json({ error: 'QR dynamique introuvable.' });
      return;
    }
    delete store[req.params.slug];
    writeDynamicStore(store);
    res.json({ deleted: true });
  });

  // Server-side PIN verification API (used by interactive Showcase Modal as well)
  app.post('/api/dynamic/:slug/verify-pin', (req, res) => {
    const store = readDynamicStore();
    const rec = store[req.params.slug];
    if (!rec) {
      res.status(404).json({ error: 'QR dynamique introuvable.' });
      return;
    }
    if (!rec.active) {
      res.status(410).json({ error: 'Ce code QR dynamique a été désactivé.' });
      return;
    }
    if (rec.expiresAt && Date.now() > new Date(rec.expiresAt).getTime()) {
      res.status(410).json({ error: 'Ce code QR dynamique a expiré.' });
      return;
    }
    if (rec.maxScans && rec.stats.totalScans >= rec.maxScans) {
      res.status(429).json({ error: 'La limite de scans pour ce code QR est atteinte.' });
      return;
    }

    const { pin } = req.body as { pin?: string };
    if (rec.pinHash && rec.pinSalt) {
      if (!pin || !verifyPinHash(pin, rec.pinSalt, rec.pinHash)) {
        res.status(403).json({ valid: false, error: 'Code PIN incorrect.' });
        return;
      }
    }

    rec.stats.totalScans += 1;
    rec.stats.lastScannedAt = new Date().toISOString();
    rec.stats.recentEvents = [
      {
        at: rec.stats.lastScannedAt,
        device: summarizeDevice(req.get('user-agent')),
        unlocked: true,
      },
      ...rec.stats.recentEvents,
    ].slice(0, 20);
    store[rec.slug] = rec;
    writeDynamicStore(store);

    const token = signUnlockToken(rec.slug);
    res.cookie(`kroma_unlock_${rec.slug}`, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });
    res.json({ valid: true, destination: rec.destination, stats: rec.stats });
  });

  // Unified reader API for dynamic QRs
  app.get('/api/reader/dynamic/:slug', (req, res) => {
    const store = readDynamicStore();
    const rec = store[req.params.slug];
    if (!rec) {
      res.status(404).json({ error: 'Code QR introuvable.' });
      return;
    }
    if (!rec.active) {
      res.status(410).json({ error: 'Ce code QR dynamique a été désactivé.' });
      return;
    }
    if (rec.expiresAt && Date.now() > new Date(rec.expiresAt).getTime()) {
      res.status(410).json({ error: 'Ce lien dynamique a expiré.' });
      return;
    }
    if (rec.maxScans && rec.stats.totalScans >= rec.maxScans) {
      res.status(429).json({ error: 'La limite de scans pour ce code QR est atteinte.' });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const unlockCookie = cookies[`kroma_unlock_${rec.slug}`];
    if (rec.pinHash && rec.pinSalt && !verifyUnlockToken(rec.slug, unlockCookie)) {
      const pub = getEffectivePublicConfig(req);
      res.json({
        locked: true,
        dynamicSlug: rec.slug,
        hasPin: true,
        payload: pub.valid
          ? buildPublicReaderUrl(pub.configuredUrl, `/d/${rec.slug}`)
          : `/d/${rec.slug}`,
        source: { type: 'text', textMode: 'text', textValue: '' },
        experience: {
          template: 'private-page',
          headline: rec.destination.title || 'Contenu protégé',
          description: 'Entrez votre code PIN pour accéder au lecteur KromaQR.',
        },
        cardTheme: rec.destination.cardTheme,
        config: rec.destination.config || null,
      });
      return;
    }

    rec.stats.totalScans += 1;
    rec.stats.lastScannedAt = new Date().toISOString();
    rec.stats.recentEvents = [
      {
        at: rec.stats.lastScannedAt,
        device: summarizeDevice(req.get('user-agent')),
        unlocked: true,
      },
      ...rec.stats.recentEvents,
    ].slice(0, 20);
    store[rec.slug] = rec;
    writeDynamicStore(store);

    res.json({
      locked: false,
      dynamicSlug: rec.slug,
      hasPin: Boolean(rec.pinHash),
      payload: rec.destination.payload,
      source: rec.destination.sourceSnapshot || {},
      experience: rec.destination.experience || {},
      cardTheme: rec.destination.cardTheme,
      config: rec.destination.config || null,
    });
  });

  // Real public scan landing route /d/:slug
  app.get('/d/:slug', (req, res, next) => {
    const store = readDynamicStore();
    const rec = store[req.params.slug];
    if (!rec) {
      res
        .status(404)
        .send(
          renderStatusHtml(
            'Code QR introuvable',
            'Ce lien dynamique n’existe plus ou a été supprimé par son créateur.',
            '404 · INTROUVABLE'
          )
        );
      return;
    }

    if (!rec.active) {
      res
        .status(410)
        .send(
          renderStatusHtml(
            'Code QR désactivé',
            'Le propriétaire de ce code QR dynamique a suspendu son accès depuis le tableau de bord.',
            '410 · DÉSACTIVÉ'
          )
        );
      return;
    }

    if (rec.expiresAt && Date.now() > new Date(rec.expiresAt).getTime()) {
      res
        .status(410)
        .send(
          renderStatusHtml(
            'Lien expiré',
            'La date limite de consultation de ce code QR est dépassée.',
            '410 · EXPIRÉ'
          )
        );
      return;
    }

    if (rec.maxScans && rec.stats.totalScans >= rec.maxScans) {
      res
        .status(429)
        .send(
          renderStatusHtml(
            'Limite de scans atteinte',
            `Ce code QR était limité à ${rec.maxScans} consultation(s) et a atteint son quota.`,
            '429 · QUOTA ATTEINT'
          )
        );
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const unlockCookie = cookies[`kroma_unlock_${rec.slug}`];
    if (rec.pinHash && rec.pinSalt && !verifyUnlockToken(rec.slug, unlockCookie)) {
      res.status(200).send(renderPinGateHtml(rec.slug, rec.destination.title));
      return;
    }

    // If standard URL without custom page template, validate it is not a restricted AI Studio/local URL before redirect
    const expTemplate = (rec.destination.experience as { template?: string } | undefined)?.template;
    if (
      rec.destination.intent === 'url' &&
      (!expTemplate || expTemplate === 'standard') &&
      /^https?:\/\//i.test(rec.destination.payload)
    ) {
      let safeExternal = false;
      try {
        const destUrl = new URL(rec.destination.payload);
        safeExternal =
          !isAiStudioOrPreviewHost(destUrl.hostname) &&
          !isLocalOrPrivateHost(destUrl.hostname);
      } catch {
        safeExternal = false;
      }

      if (safeExternal) {
        rec.stats.totalScans += 1;
        rec.stats.lastScannedAt = new Date().toISOString();
        rec.stats.recentEvents = [
          {
            at: rec.stats.lastScannedAt,
            device: summarizeDevice(req.get('user-agent')),
            unlocked: true,
          },
          ...rec.stats.recentEvents,
        ].slice(0, 20);
        store[rec.slug] = rec;
        writeDynamicStore(store);

        res.redirect(302, rec.destination.payload);
        return;
      }
    }

    // Otherwise serve the interactive React KromaMediaReader SPA (which calls /api/reader/dynamic/:slug)
    next();
  });

  app.post('/d/:slug/unlock', (req, res) => {
    const store = readDynamicStore();
    const rec = store[req.params.slug];
    if (!rec) {
      res.status(404).send(renderStatusHtml('Code QR introuvable', 'Lien introuvable.', '404'));
      return;
    }
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (rec.pinHash && rec.pinSalt && !verifyPinHash(pin, rec.pinSalt, rec.pinHash)) {
      res
        .status(403)
        .send(renderPinGateHtml(rec.slug, rec.destination.title, 'Code PIN invalide. Réessayez.'));
      return;
    }
    const token = signUnlockToken(rec.slug);
    res.cookie(`kroma_unlock_${rec.slug}`, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });
    res.redirect(303, `/d/${rec.slug}`);
  });

  // =========================================================================
  // SERVER-SIDE PROJECTS DASHBOARD PERSISTENCE
  // =========================================================================

  app.get('/api/projects', (_req, res) => {
    res.json({ items: readProjectsStore() });
  });

  app.put('/api/projects', (req, res) => {
    const items = (req.body as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'Liste de projets invalide.' });
      return;
    }
    writeProjectsStore(items.slice(0, 200));
    res.json({ saved: true, count: items.length });
  });

  // Standalone responsive media landing page when someone scans an Image, Video, or Collection QR code
  app.get('/m/:id', (req, res, next) => {
    const index = readMediaIndex();
    const record = index[req.params.id];
    if (!record) {
      res
        .status(404)
        .send(
          renderStatusHtml(
            'Ce média n’est plus disponible',
            'Le fichier ou la collection associée à ce code QR a expiré ou été supprimé.',
            '404 · MÉDIA INTROUVABLE'
          )
        );
      return;
    }

    // Serve the interactive React KromaMediaReader SPA
    next();
  });

  // Error handler for multer
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(400).json({ error: err.message || 'Erreur lors du téléversement.' });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KromaQR server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
