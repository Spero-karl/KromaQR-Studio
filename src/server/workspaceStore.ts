import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { readJsonFileAtomic, writeJsonFileAtomic } from './jsonStore.ts';

export interface WorkspaceRecord {
  id: string;
  name: string;
  accessCode: string;
  createdAt: string;
  updatedAt: string;
}

const WORKSPACE_ID_RE = /^ws_[a-zA-Z0-9_-]{6,48}$/;

export function isValidWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && WORKSPACE_ID_RE.test(value.trim());
}

export function normalizeAccessCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatAccessCode(normalized: string): string {
  const clean = normalizeAccessCode(normalized);
  if (clean.length <= 3) return clean;
  if (clean.length <= 7) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 11)}`;
}

export function generateWorkspaceId(): string {
  return `ws_${crypto.randomBytes(9).toString('base64url')}`;
}

export function generateWorkspaceAccessCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 4; i++) {
    part1 += alphabet[bytes[i] % alphabet.length];
    part2 += alphabet[bytes[i + 4] % alphabet.length];
  }
  return `SPK-${part1}-${part2}`;
}

export function sanitizeWorkspaceName(name: unknown): string {
  if (typeof name !== 'string') return 'Mon espace créatif';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Mon espace créatif';
  return trimmed.slice(0, 48);
}

export function loadWorkspacesMap(filePath: string): Record<string, WorkspaceRecord> {
  const parsed = readJsonFileAtomic<unknown>(filePath, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, WorkspaceRecord>)
    : {};
}

export function saveWorkspacesMap(
  filePath: string,
  map: Record<string, WorkspaceRecord>
): void {
  writeJsonFileAtomic(filePath, map);
}

export function createWorkspaceRecord(
  map: Record<string, WorkspaceRecord>,
  customName?: string
): WorkspaceRecord {
  const id = generateWorkspaceId();
  let accessCode = generateWorkspaceAccessCode();
  const existingCodes = new Set(
    Object.values(map).map((ws) => normalizeAccessCode(ws.accessCode))
  );
  while (existingCodes.has(normalizeAccessCode(accessCode))) {
    accessCode = generateWorkspaceAccessCode();
  }
  const now = new Date().toISOString();
  const rec: WorkspaceRecord = {
    id,
    name: sanitizeWorkspaceName(customName),
    accessCode,
    createdAt: now,
    updatedAt: now,
  };
  map[id] = rec;
  return rec;
}

export function findWorkspaceByAccessCode(
  map: Record<string, WorkspaceRecord>,
  code: string
): WorkspaceRecord | null {
  const target = normalizeAccessCode(code);
  if (target.length < 6) return null;
  for (const ws of Object.values(map)) {
    if (normalizeAccessCode(ws.accessCode) === target) {
      return ws;
    }
  }
  return null;
}

export function resolveWorkspaceProjectsFile(
  dataDir: string,
  workspaceId: string
): string {
  if (!isValidWorkspaceId(workspaceId)) {
    throw new Error('Identifiant d’espace invalide.');
  }
  const dir = path.join(dataDir, 'workspaces');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${workspaceId}-projects.json`);
}

export function readWorkspaceProjects(dataDir: string, workspaceId: string): unknown[] {
  try {
    const file = resolveWorkspaceProjectsFile(dataDir, workspaceId);
    const parsed = readJsonFileAtomic<unknown>(file, []);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeWorkspaceProjects(
  dataDir: string,
  workspaceId: string,
  items: unknown[]
): void {
  const file = resolveWorkspaceProjectsFile(dataDir, workspaceId);
  writeJsonFileAtomic(file, items.slice(0, 200));
}

export function canWorkspaceAccessRecord(
  ownerWorkspaceId: string | undefined,
  currentWorkspaceId: string
): boolean {
  if (!ownerWorkspaceId) return false;
  return ownerWorkspaceId === currentWorkspaceId;
}
