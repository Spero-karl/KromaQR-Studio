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
import {
  createDosyaStorageFromEnv,
} from './src/server/dosyaStorage.ts';
import { findMediaQrAssociations } from './src/server/mediaAssociations.ts';
import {
  RetentionEngine,
  type DynamicRecordLike,
  type MediaRecordLike,
} from './src/server/retentionEngine.ts';
import {
  AdminAuthService,
  getConfiguredEmailTransport,
  sendTransactionalEmail,
  verifyCronSecretHeader,
} from './src/server/adminService.ts';
import {
  canWorkspaceAccessRecord,
  createWorkspaceRecord,
  findWorkspaceByAccessCode,
  isValidWorkspaceId,
  loadWorkspacesMap,
  readWorkspaceProjects,
  sanitizeWorkspaceName,
  saveWorkspacesMap,
  writeWorkspaceProjects,
  type WorkspaceRecord,
} from './src/server/workspaceStore.ts';
import {
  computeFreeRetentionExpiry,
  isValidPaidMonths,
  type NotificationMilestone,
} from './src/utils/retentionPricing.ts';
import { computeDefaultServerExpiry } from './src/utils/serverAvailability.ts';

interface MediaRecord extends MediaRecordLike {
  type: 'image' | 'video' | 'document' | 'audio' | 'collection';
}

interface DynamicScanEvent {
  at: string;
  device: string;
  unlocked: boolean;
}

interface ServerDynamicRecord extends DynamicRecordLike {
  destination: {
    intent: 'url' | 'text' | 'wifi' | 'image' | 'video' | 'document' | 'audio';
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

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LEGACY_UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const INDEX_FILE = path.join(DATA_DIR, 'media-index.json');
const DYNAMIC_FILE = path.join(DATA_DIR, 'dynamic-qrs.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const WORKSPACES_FILE = path.join(DATA_DIR, 'workspaces.json');
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
const retentionEngine = new RetentionEngine(
  DATA_DIR,
  dosyaStorage,
  async (alert) => {
    if (getConfiguredEmailTransport() !== 'none') {
      await sendTransactionalEmail(alert);
    }
  }
);
const adminAuth = new AdminAuthService(DATA_DIR, HMAC_SECRET);

function isRecordExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) && Date.now() >= ms;
}

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

const WORKSPACE_COOKIE_NAME = 'sparkqr_ws';

function setWorkspaceCookie(res: express.Response, workspaceId: string): void {
  res.cookie(WORKSPACE_COOKIE_NAME, workspaceId, {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function resolveRequestWorkspace(
  req: express.Request,
  res?: express.Response,
  createIfMissing = true
): { workspace: WorkspaceRecord; isNew: boolean } | null {
  const map = loadWorkspacesMap(WORKSPACES_FILE);
  const headerId = req.get('x-workspace-id');
  const cookies = parseCookies(req.headers.cookie);
  const cookieId = cookies[WORKSPACE_COOKIE_NAME];

  const candidateId = isValidWorkspaceId(headerId)
    ? headerId.trim()
    : isValidWorkspaceId(cookieId)
    ? cookieId.trim()
    : null;

  if (candidateId && map[candidateId]) {
    if (res && cookieId !== candidateId) {
      setWorkspaceCookie(res, candidateId);
    }
    return { workspace: map[candidateId], isNew: false };
  }

  if (!createIfMissing) {
    return null;
  }

  const created = createWorkspaceRecord(map);
  saveWorkspacesMap(WORKSPACES_FILE, map);
  if (res) {
    setWorkspaceCookie(res, created.id);
  }
  return { workspace: created, isNew: true };
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <title>${escapeHtml(title)} — SparkQR</title>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
        padding: 24px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        background: linear-gradient(160deg, #F5F3FF 0%, #FDF2F8 50%, #EEF2FF 100%); color: #111214;
      }
      .card {
        max-width: 460px; width: 100%; background: #FFFFFF; border: 1px solid #E6E4DC;
        border-radius: 24px; padding: 32px; text-align: center; box-shadow: 0 20px 56px rgba(37,99,235,0.09);
      }
      .kicker { font-size: 11px; font-weight: 600; color: #2563EB; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
      h1 { font-family: 'Bricolage Grotesque', sans-serif; font-size: 22px; margin: 0 0 10px; color: #111214; }
      p { font-size: 14px; color: #5C5E66; line-height: 1.6; margin: 0; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="kicker">${escapeHtml(codeLabel)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

function renderPinGateHtml(slug: string, title: string, errorMsg?: string): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <title>Contenu protégé — ${escapeHtml(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
        padding: 24px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        background: linear-gradient(160deg, #F5F3FF 0%, #FDF2F8 50%, #EEF2FF 100%);
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
      <div class="kicker">SparkQR · Accès privé</div>
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

const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 65 * 1024 * 1024, // 65MB (allows up to 60MB + E2EE overhead)
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('audio/') ||
      ALLOWED_UPLOAD_MIMES.has(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Format non pris en charge. Importez une image, vidéo, audio ou document (PDF, TXT, CSV, DOCX).'
        )
      );
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

  // Ultra-lightweight Render keep-alive endpoint (zero disk I/O, zero S3, zero heavy operations)
  app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, status: 'alive', ts: Date.now() });
  });

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true });
  });

  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: false }));

  // Privacy & scan headers: prevent #fragment key leakage via Referer and allow public QR readers
  app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
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

  // =========================================================================
  // PERSONAL MULTI-USER WORKSPACE ENDPOINTS
  // =========================================================================

  app.get('/api/workspace', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    res.json({ workspace: resolved.workspace, isNew: resolved.isNew });
  });

  app.post('/api/workspace', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
    const map = loadWorkspacesMap(WORKSPACES_FILE);
    const created = createWorkspaceRecord(map, name);
    saveWorkspacesMap(WORKSPACES_FILE, map);
    setWorkspaceCookie(res, created.id);
    res.status(201).json({ workspace: created });
  });

  app.patch('/api/workspace', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const map = loadWorkspacesMap(WORKSPACES_FILE);
    const current = map[resolved.workspace.id] || resolved.workspace;
    current.name = sanitizeWorkspaceName(req.body?.name);
    current.updatedAt = new Date().toISOString();
    map[current.id] = current;
    saveWorkspacesMap(WORKSPACES_FILE, map);
    res.json({ workspace: current });
  });

  app.post('/api/workspace/join', (req, res) => {
    const code = typeof req.body?.accessCode === 'string' ? req.body.accessCode : '';
    const map = loadWorkspacesMap(WORKSPACES_FILE);
    const found = findWorkspaceByAccessCode(map, code);
    if (!found) {
      res.status(404).json({
        error: 'Code espace introuvable. Vérifiez votre code personnel (ex. SPK-XXXX-XXXX).',
      });
      return;
    }
    setWorkspaceCookie(res, found.id);
    res.json({ workspace: found });
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

    const bodyFlags = (req.body || {}) as {
      isEncrypted?: string;
      mediaType?: string;
      originalSize?: string;
    };
    const isEncrypted = bodyFlags.isEncrypted === 'true' || bodyFlags.isEncrypted === '1';

    let type: 'image' | 'video' | 'document' | 'audio' = 'image';
    if (
      bodyFlags.mediaType === 'video' ||
      bodyFlags.mediaType === 'document' ||
      bodyFlags.mediaType === 'audio' ||
      bodyFlags.mediaType === 'image'
    ) {
      type = bodyFlags.mediaType;
    } else if (req.file.mimetype.startsWith('video/')) {
      type = 'video';
    } else if (req.file.mimetype.startsWith('audio/')) {
      type = 'audio';
    } else if (
      req.file.mimetype === 'application/pdf' ||
      req.file.mimetype.startsWith('text/') ||
      req.file.mimetype.includes('wordprocessingml')
    ) {
      type = 'document';
    }

    const id = generateShortId();
    const originalName = isEncrypted
      ? 'contenu-chiffre.spk1'
      : req.file.originalname || `media-${id}`;
    const objectKey = dosyaStorage.buildObjectKey({
      mediaId: id,
      type: isEncrypted ? 'encrypted' : type,
      originalName,
      mimeType: isEncrypted ? 'application/octet-stream' : req.file.mimetype,
    });

    const { workspace } = resolveRequestWorkspace(req, res, true)!;
    const nowIso = new Date().toISOString();
    const serverExpiresAt = computeFreeRetentionExpiry(nowIso);

    try {
      const uploaded = await dosyaStorage.uploadObject({
        key: objectKey,
        body: req.file.buffer,
        contentType: isEncrypted ? 'application/octet-stream' : req.file.mimetype,
        metadata: {
          mediaid: id,
          mediatype: type,
          e2ee: isEncrypted ? '1' : '0',
        },
      });

      const fileUrl = `/api/media/${id}/file`;
      const downloadUrl = `/api/media/${id}/download`;
      const pageUrl = `/m/${id}`;

      const record: MediaRecord = {
        id,
        ownerWorkspaceId: workspace.id,
        kind: 'media',
        type,
        filename: path.basename(uploaded.key),
        originalName,
        mimeType: isEncrypted ? 'application/octet-stream' : req.file.mimetype,
        size: req.file.size,
        url: fileUrl,
        isEncrypted,
        e2eeVersion: isEncrypted ? 1 : undefined,
        retentionPlanMonths: null,
        sentMilestones: [],
        storage: {
          provider: 'dosya-s3',
          bucket: uploaded.bucket,
          key: uploaded.key,
          etag: uploaded.etag,
          endpoint: uploaded.endpoint,
          region: uploaded.region,
        },
        serverExpiresAt,
        createdAt: nowIso,
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
        serverExpiresAt,
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
    const { source, experience, config, title, isEncrypted, encryptedMeta } = req.body as {
      source?: Record<string, unknown>;
      experience?: Record<string, unknown>;
      config?: Record<string, unknown>;
      title?: string;
      isEncrypted?: boolean;
      encryptedMeta?: unknown;
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

    const { workspace } = resolveRequestWorkspace(req, res, true)!;
    const id = generateShortId();
    const nowIso = new Date().toISOString();
    const serverExpiresAt = computeFreeRetentionExpiry(nowIso);
    const record: MediaRecord = {
      id,
      ownerWorkspaceId: workspace.id,
      kind: 'collection',
      type: 'collection',
      filename: id,
      originalName: isEncrypted ? `Contenu chiffré #${id}` : title || 'Collection SparkQR',
      mimeType: 'application/json',
      size: encryptedMeta ? Buffer.byteLength(JSON.stringify(encryptedMeta), 'utf8') : 0,
      url: `/m/${id}`,
      isEncrypted: Boolean(isEncrypted),
      e2eeVersion: isEncrypted ? 1 : undefined,
      encryptedMeta: isEncrypted ? encryptedMeta : undefined,
      retentionPlanMonths: null,
      sentMilestones: [],
      storage: { provider: 'collection' },
      posterUrl:
        typeof source.videoPosterUrl === 'string' && source.videoPosterUrl
          ? source.videoPosterUrl
          : undefined,
      source,
      experience: experience || {},
      config: config || {},
      serverExpiresAt,
      createdAt: nowIso,
    };
    const index = readMediaIndex();
    index[id] = record;
    writeMediaIndex(index);
    const pub = getEffectivePublicConfig(req);
    const pageUrl = `/m/${id}`;
    res.status(201).json({
      id,
      pageUrl,
      serverExpiresAt,
      isEncrypted: Boolean(isEncrypted),
      publicUrl: pub.valid ? buildPublicReaderUrl(pub.configuredUrl, pageUrl) : undefined,
    });
  });

  app.get('/api/media', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const wsId = resolved.workspace.id;
    const index = readMediaIndex();
    const dynamicStore = readDynamicStore();
    const pub = getEffectivePublicConfig(req);
    const items = Object.values(index)
      .filter(
        (rec) =>
          rec.kind !== 'collection' &&
          rec.storage?.provider === 'dosya-s3' &&
          canWorkspaceAccessRecord(rec.ownerWorkspaceId, wsId)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((rec) => {
        const pageUrl = `/m/${rec.id}`;
        return {
          ...rec,
          fileUrl: `/api/media/${rec.id}/file`,
          downloadUrl: `/api/media/${rec.id}/download`,
          pageUrl,
          serverExpiresAt: rec.serverExpiresAt || computeDefaultServerExpiry(rec.createdAt),
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
    if (isRecordExpired(record.serverExpiresAt)) {
      void retentionEngine.deleteResourceNow({
        kind: record.kind === 'collection' ? 'collection' : 'media',
        id: record.id,
        reason: 'expired',
      });
      res.status(410).json({ error: 'Ce média a expiré et a été supprimé.' });
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
    if (isRecordExpired(record.serverExpiresAt)) {
      void retentionEngine.deleteResourceNow({
        kind: 'media',
        id: record.id,
        reason: 'expired',
      });
      res.status(410).json({ error: 'Ce fichier a expiré et a été supprimé.' });
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
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const index = readMediaIndex();
    const record = index[req.params.id];
    if (!record) {
      res.status(404).json({ error: 'Média introuvable.' });
      return;
    }
    if (!canWorkspaceAccessRecord(record.ownerWorkspaceId, resolved.workspace.id)) {
      res.status(403).json({ error: 'Ce média appartient à un autre espace utilisateur.' });
      return;
    }

    const dynamicStore = readDynamicStore();
    const associations = findMediaQrAssociations(record.id, record.url, index, dynamicStore);

    const result = await retentionEngine.deleteResourceNow({
      kind: record.kind === 'collection' ? 'collection' : 'media',
      id: record.id,
      reason: 'manual',
    });

    res.json({
      deleted: result.deleted,
      id: req.params.id,
      removedFromS3: result.s3ObjectsDeleted > 0,
      freedBytes: result.freedBytes,
      pendingRetry: result.pendingRetry,
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
    if (isRecordExpired(record.serverExpiresAt)) {
      void retentionEngine.deleteResourceNow({
        kind: record.kind === 'collection' ? 'collection' : 'media',
        id: record.id,
        reason: 'expired',
      });
      res.status(410).json({ error: 'Ce contenu a expiré et a été définitivement supprimé.' });
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
        isEncrypted: Boolean(record.isEncrypted),
        e2eeVersion: record.e2eeVersion,
        encryptedMeta: record.encryptedMeta,
        serverExpiresAt: record.serverExpiresAt || null,
        source: normalizedSource,
        experience: record.experience || {},
        config: record.config || null,
      });
      return;
    }

    const isVideo = record.type === 'video';
    const isDocument = record.type === 'document';
    const isAudio = record.type === 'audio';
    const cleanAssetUrl = normalizeMediaAssetUrl(record.url);
    res.json({
      id: record.id,
      payload: publicPayload,
      isEncrypted: Boolean(record.isEncrypted),
      e2eeVersion: record.e2eeVersion,
      mediaType: record.type,
      serverExpiresAt: record.serverExpiresAt || null,
      source: {
        type: isVideo ? 'video' : isDocument ? 'document' : isAudio ? 'audio' : 'image',
        textMode: 'url',
        imageUrl: !isVideo && !isDocument && !isAudio ? cleanAssetUrl : '',
        imageName: !isVideo && !isDocument && !isAudio ? record.originalName : '',
        imagePageUrl: !isVideo && !isDocument && !isAudio ? `/m/${record.id}` : '',
        videoUrl: isVideo ? cleanAssetUrl : '',
        videoName: isVideo ? record.originalName : '',
        videoPageUrl: isVideo ? `/m/${record.id}` : '',
        videoPosterUrl: record.posterUrl ? normalizeMediaAssetUrl(record.posterUrl) : '',
      },
      experience: {
        template: 'standard',
        headline: record.isEncrypted ? 'Contenu protégé de bout en bout' : record.originalName,
        description: 'Partagé via SparkQR — Lecteur sécurisé',
        accentMood: 'auto',
      },
      config: record.config || null,
    });
  });

  // =========================================================================
  // REAL SERVER-SIDE DYNAMIC QR & SECURITY ENDPOINTS
  // =========================================================================

  app.get('/api/dynamic', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const wsId = resolved.workspace.id;
    const store = readDynamicStore();
    const pub = getEffectivePublicConfig(req);
    const publicOrigin = pub.valid ? pub.configuredUrl : '';
    const list = Object.values(store)
      .filter((rec) => canWorkspaceAccessRecord(rec.ownerWorkspaceId, wsId))
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

    const resolved = resolveRequestWorkspace(req, res, true)!;
    const wsId = resolved.workspace.id;
    const store = readDynamicStore();
    const now = new Date().toISOString();
    const canReuseSlug =
      Boolean(body.slug && store[body.slug]) &&
      canWorkspaceAccessRecord(store[body.slug!].ownerWorkspaceId, wsId);
    const slug = canReuseSlug ? body.slug! : generateShortId();
    const existing = canReuseSlug ? store[slug] : undefined;

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
      ownerWorkspaceId: wsId,
      active: typeof body.active === 'boolean' ? body.active : existing?.active ?? true,
      pinSalt,
      pinHash,
      expiresAt: body.expiresAt
        ? body.expiresAt
        : existing?.expiresAt ?? computeFreeRetentionExpiry(now),
      retentionPlanMonths: existing?.retentionPlanMonths ?? null,
      isEncrypted: Boolean((body as { isEncrypted?: boolean }).isEncrypted ?? existing?.isEncrypted),
      sentMilestones: existing?.sentMilestones ?? [],
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
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const store = readDynamicStore();
    const rec = store[req.params.slug];
    if (!rec) {
      res.status(404).json({ error: 'QR dynamique introuvable.' });
      return;
    }
    if (!canWorkspaceAccessRecord(rec.ownerWorkspaceId, resolved.workspace.id)) {
      res.status(403).json({ error: 'Ce QR dynamique appartient à un autre espace utilisateur.' });
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

  app.delete('/api/dynamic/:slug', async (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const store = readDynamicStore();
    const rec = store[req.params.slug];
    if (!rec) {
      res.status(404).json({ error: 'QR dynamique introuvable.' });
      return;
    }
    if (!canWorkspaceAccessRecord(rec.ownerWorkspaceId, resolved.workspace.id)) {
      res.status(403).json({ error: 'Ce QR dynamique appartient à un autre espace utilisateur.' });
      return;
    }
    const result = await retentionEngine.deleteResourceNow({
      kind: 'dynamic',
      id: rec.slug,
      reason: 'manual',
    });
    res.json({ deleted: result.deleted, freedBytes: result.freedBytes });
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
    if (isRecordExpired(rec.expiresAt)) {
      void retentionEngine.deleteResourceNow({
        kind: 'dynamic',
        id: rec.slug,
        reason: 'expired',
      });
      res.status(410).json({ error: 'Ce code QR dynamique a expiré et a été supprimé.' });
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
    res.cookie(`sparkqr_unlock_${rec.slug}`, token, {
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
    if (isRecordExpired(rec.expiresAt)) {
      void retentionEngine.deleteResourceNow({
        kind: 'dynamic',
        id: rec.slug,
        reason: 'expired',
      });
      res.status(410).json({ error: 'Ce lien dynamique a expiré et a été supprimé.' });
      return;
    }
    if (rec.maxScans && rec.stats.totalScans >= rec.maxScans) {
      res.status(429).json({ error: 'La limite de scans pour ce code QR est atteinte.' });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const unlockCookie = cookies[`sparkqr_unlock_${rec.slug}`] || cookies[`kroma_unlock_${rec.slug}`];
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
          description: 'Entrez votre code PIN pour accéder au contenu SparkQR.',
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
      isEncrypted: Boolean(rec.isEncrypted),
      encryptedMeta: (rec.destination as { encryptedMeta?: unknown }).encryptedMeta,
      serverExpiresAt: rec.expiresAt || null,
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

    if (isRecordExpired(rec.expiresAt)) {
      void retentionEngine.deleteResourceNow({
        kind: 'dynamic',
        id: rec.slug,
        reason: 'expired',
      });
      res
        .status(410)
        .send(
          renderStatusHtml(
            'Lien expiré et supprimé',
            'La durée de conservation de ce code QR est dépassée. Les données associées ont été supprimées.',
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
    const unlockCookie = cookies[`sparkqr_unlock_${rec.slug}`] || cookies[`kroma_unlock_${rec.slug}`];
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

    // Otherwise serve the interactive React SparkMediaReader SPA
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
    res.cookie(`sparkqr_unlock_${rec.slug}`, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });
    res.redirect(303, `/d/${rec.slug}`);
  });

  // =========================================================================
  // SERVER-SIDE PROJECTS DASHBOARD PERSISTENCE (PER WORKSPACE)
  // =========================================================================

  app.get('/api/projects', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    res.json({ items: readWorkspaceProjects(DATA_DIR, resolved.workspace.id) });
  });

  app.put('/api/projects', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const items = (req.body as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'Liste de projets invalide.' });
      return;
    }
    writeWorkspaceProjects(DATA_DIR, resolved.workspace.id, items);
    res.json({ saved: true, count: items.length });
  });

  // =========================================================================
  // STORAGE & RETENTION DASHBOARD, NOTIFICATIONS, AUDIT, PAYMENTS & ADMIN
  // =========================================================================

  app.get('/api/storage/dashboard', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const wsId = resolved.workspace.id;
    const items = retentionEngine.buildWorkspaceDashboardItems(wsId);
    const activeItems = items.filter((it) => it.status !== 'expired' && it.status !== 'deleted');
    const expiringSoonCount = items.filter((it) => it.status === 'expiring').length;
    const expiredCount = items.filter((it) => it.status === 'expired').length;
    const totalStorageBytes = activeItems.reduce((sum, it) => sum + (it.sizeBytes || 0), 0);
    const maxPlanMonths = activeItems.reduce(
      (maxM, it) => Math.max(maxM, it.retentionPlanMonths || 0),
      0
    );
    const stats = retentionEngine.getWorkspaceStats(wsId);
    const emailSub = retentionEngine.getEmailSubscription(wsId);
    const transport = getConfiguredEmailTransport();

    res.json({
      workspace: resolved.workspace,
      summary: {
        activeCount: activeItems.length,
        expiringSoonCount,
        expiredCount,
        totalStorageBytes,
        freedStorageBytes: stats.freedBytes,
        currentPlanLabel:
          maxPlanMonths > 0 ? `Offre étendue (${maxPlanMonths} mois)` : 'Offre gratuite (7 jours)',
        maxPlanMonths,
      },
      items,
      notifications: retentionEngine.listNotifications(wsId),
      auditLog: retentionEngine.listAuditLog(wsId),
      emailAlerts: {
        configuredTransport: transport,
        email: emailSub?.email || null,
        verified: Boolean(emailSub?.verified),
        optedIn: Boolean(emailSub?.optedIn),
        pendingVerification: Boolean(emailSub && !emailSub.verified && emailSub.verificationCodeHash),
      },
    });
  });

  app.delete('/api/storage/item/:kind/:id', async (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const kind = req.params.kind as 'media' | 'collection' | 'dynamic';
    if (kind !== 'media' && kind !== 'collection' && kind !== 'dynamic') {
      res.status(400).json({ error: 'Type de ressource invalide.' });
      return;
    }
    const id = req.params.id;
    if (kind === 'dynamic') {
      const store = readDynamicStore();
      const rec = store[id];
      if (!rec) {
        res.status(404).json({ error: 'Ressource introuvable.' });
        return;
      }
      if (!canWorkspaceAccessRecord(rec.ownerWorkspaceId, resolved.workspace.id)) {
        res.status(403).json({ error: 'Accès refusé à cet espace.' });
        return;
      }
    } else {
      const index = readMediaIndex();
      const rec = index[id];
      if (!rec) {
        res.status(404).json({ error: 'Ressource introuvable.' });
        return;
      }
      if (!canWorkspaceAccessRecord(rec.ownerWorkspaceId, resolved.workspace.id)) {
        res.status(403).json({ error: 'Accès refusé à cet espace.' });
        return;
      }
    }

    const result = await retentionEngine.deleteResourceNow({
      kind,
      id,
      reason: 'manual',
    });
    res.json(result);
  });

  app.post('/api/notifications/read', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : undefined;
    retentionEngine.markNotificationsRead(resolved.workspace.id, ids);
    res.json({ ok: true });
  });

  app.post('/api/notifications/email/request', async (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      res.status(400).json({ error: 'Adresse e-mail invalide.' });
      return;
    }
    if (getConfiguredEmailTransport() === 'none') {
      res.status(503).json({
        error:
          'L’envoi d’e-mails n’est pas encore configuré sur le serveur Render (ajoutez RESEND_API_KEY ou SMTP_HOST / SMTP_USER / SMTP_PASS). Les notifications dans l’application restent actives.',
      });
      return;
    }

    const code = String(crypto.randomInt(100000, 999999));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    try {
      await sendTransactionalEmail({
        email: rawEmail,
        subject: 'SparkQR — Code de vérification des alertes de conservation',
        textBody: `Votre code de vérification SparkQR : ${code}\nCe code expire dans 15 minutes.\nSi vous n'avez pas demandé ces alertes, ignorez ce message.`,
      });
      retentionEngine.saveEmailSubscription({
        workspaceId: resolved.workspace.id,
        email: rawEmail,
        verified: false,
        optedIn: false,
        verificationCodeHash: codeHash,
        verificationExpiresAt: expiresAt,
        updatedAt: new Date().toISOString(),
      });
      res.json({ sent: true, email: rawEmail });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Impossible d’envoyer le code par e-mail.',
      });
    }
  });

  app.post('/api/notifications/email/verify', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const sub = retentionEngine.getEmailSubscription(resolved.workspace.id);
    if (!sub || !sub.verificationCodeHash) {
      res.status(400).json({ error: 'Aucune demande de vérification en attente.' });
      return;
    }
    if (sub.verificationExpiresAt && Date.now() > Date.parse(sub.verificationExpiresAt)) {
      res.status(400).json({ error: 'Le code de vérification a expiré. Demandez-en un nouveau.' });
      return;
    }
    const attemptHash = crypto.createHash('sha256').update(code).digest('hex');
    if (attemptHash !== sub.verificationCodeHash) {
      res.status(403).json({ error: 'Code de vérification incorrect.' });
      return;
    }
    retentionEngine.saveEmailSubscription({
      workspaceId: resolved.workspace.id,
      email: sub.email,
      verified: true,
      optedIn: true,
      updatedAt: new Date().toISOString(),
    });
    res.json({ verified: true, email: sub.email });
  });

  app.delete('/api/notifications/email', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    retentionEngine.deleteEmailSubscription(resolved.workspace.id);
    res.json({ removed: true });
  });

  app.get('/api/pricing', (_req, res) => {
    const pricing = retentionEngine.getPricingConfig();
    res.json({ pricing });
  });

  app.post('/api/retention/extend', (req, res) => {
    const resolved = resolveRequestWorkspace(req, res, true)!;
    const { months, targetKind, targetId } = req.body as {
      months?: number;
      targetKind?: 'media' | 'collection' | 'dynamic' | 'workspace';
      targetId?: string;
    };

    if (!isValidPaidMonths(months)) {
      res.status(400).json({ error: 'Choisissez une durée entre 1 et 12 mois.' });
      return;
    }

    const safeKind =
      targetKind === 'media' || targetKind === 'collection' || targetKind === 'dynamic'
        ? targetKind
        : 'workspace';
    const safeTargetId =
      safeKind === 'workspace'
        ? resolved.workspace.id
        : (targetId || '').trim();

    if (safeKind !== 'workspace' && !safeTargetId) {
      res.status(400).json({ error: 'Identifiant de ressource manquant.' });
      return;
    }

    if (safeKind === 'dynamic') {
      const store = readDynamicStore();
      const rec = store[safeTargetId];
      if (!rec) {
        res.status(404).json({ error: 'QR dynamique introuvable.' });
        return;
      }
      if (!canWorkspaceAccessRecord(rec.ownerWorkspaceId, resolved.workspace.id)) {
        res.status(403).json({ error: 'Accès refusé à cet espace.' });
        return;
      }
    } else if (safeKind === 'media' || safeKind === 'collection') {
      const index = readMediaIndex();
      const rec = index[safeTargetId];
      if (!rec) {
        res.status(404).json({ error: 'Ressource introuvable.' });
        return;
      }
      if (!canWorkspaceAccessRecord(rec.ownerWorkspaceId, resolved.workspace.id)) {
        res.status(403).json({ error: 'Accès refusé à cet espace.' });
        return;
      }
    }

    const ext = retentionEngine.extendRetention({
      workspaceId: resolved.workspace.id,
      targetKind: safeKind,
      targetId: safeTargetId,
      months,
    });

    res.json({
      ok: true,
      months,
      ...ext,
    });
  });

  // Admin Pricing Console Auth & Endpoints
  app.get('/api/admin/status', (_req, res) => {
    res.json({
      ...adminAuth.getStatus(),
      dosya: dosyaStorage.getPublicStatus(),
      emailTransport: getConfiguredEmailTransport(),
      cronSecretConfigured: Boolean((process.env.CRON_SECRET || '').trim()),
    });
  });

  app.post('/api/admin/claim', (req, res) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    const claimed = adminAuth.claimFirstRunPasscode(passcode);
    if (!claimed.ok) {
      res.status(400).json({ error: claimed.error });
      return;
    }
    res.json({ token: claimed.token });
  });

  app.post('/api/admin/login', (req, res) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!adminAuth.verifyPasscode(passcode)) {
      res.status(403).json({ error: 'Code administrateur invalide.' });
      return;
    }
    res.json({ token: adminAuth.issueAdminToken() });
  });

  app.put('/api/admin/pricing', (req, res) => {
    const authHeader = req.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!adminAuth.verifyAdminToken(token)) {
      res.status(401).json({ error: 'Session administrateur expirée ou invalide.' });
      return;
    }
    const monthsCents = (req.body as { monthsCents?: Record<number, number> })?.monthsCents;
    if (!monthsCents || typeof monthsCents !== 'object') {
      res.status(400).json({ error: 'Grille tarifaire invalide.' });
      return;
    }
    const saved = retentionEngine.savePricingConfig({ monthsCents });
    res.json({ pricing: saved });
  });

  // External/Scheduled Cleanup Endpoint (protected by CRON_SECRET if configured)
  app.post('/api/cron/cleanup', async (req, res) => {
    const expectedSecret = (process.env.CRON_SECRET || '').trim();
    if (expectedSecret) {
      const ok = verifyCronSecretHeader(
        req.get('authorization'),
        req.get('x-cron-secret'),
        expectedSecret
      );
      if (!ok) {
        res.status(401).json({ error: 'Jeton CRON invalide.' });
        return;
      }
    }
    const summary = await retentionEngine.runCleanupPass();
    res.json({ ok: true, ...summary, ranAt: new Date().toISOString() });
  });

  // Standalone responsive media landing page when someone scans an Image, Video, Document, Audio, or Collection QR code
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
    if (isRecordExpired(record.serverExpiresAt)) {
      void retentionEngine.deleteResourceNow({
        kind: record.kind === 'collection' ? 'collection' : 'media',
        id: record.id,
        reason: 'expired',
      });
      res
        .status(410)
        .send(
          renderStatusHtml(
            'Contenu expiré et supprimé',
            'La durée de conservation de ce code QR est écoulée. Son contenu et ses fichiers associés ont été supprimés définitivement.',
            '410 · EXPIRÉ'
          )
        );
      return;
    }

    // Serve the interactive React SparkMediaReader SPA
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
    console.log(`SparkQR server listening on http://0.0.0.0:${PORT}`);

    // Lightweight non-blocking retention catch-up pass after startup + periodic sweep every 15 min while awake
    setTimeout(() => {
      void retentionEngine.runCleanupPass().catch((err) => {
        console.error('Initial retention cleanup pass failed:', err);
      });
    }, 8000);

    const sweepTimer = setInterval(() => {
      void retentionEngine.runCleanupPass().catch((err) => {
        console.error('Periodic retention cleanup pass failed:', err);
      });
    }, 15 * 60 * 1000);
    sweepTimer.unref();
  });
}

startServer();
