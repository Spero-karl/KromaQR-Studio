import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  canWorkspaceAccessRecord,
  createWorkspaceRecord,
  findWorkspaceByAccessCode,
  isValidWorkspaceId,
  normalizeAccessCode,
  readWorkspaceProjects,
  writeWorkspaceProjects,
  type WorkspaceRecord,
} from './workspaceStore';

test('createWorkspaceRecord generates unique valid IDs and access codes', () => {
  const map: Record<string, WorkspaceRecord> = {};
  const ws1 = createWorkspaceRecord(map, 'Atelier Léa');
  const ws2 = createWorkspaceRecord(map, 'Studio Marc');

  assert.ok(isValidWorkspaceId(ws1.id));
  assert.ok(isValidWorkspaceId(ws2.id));
  assert.notEqual(ws1.id, ws2.id);
  assert.notEqual(ws1.accessCode, ws2.accessCode);
  assert.equal(ws1.name, 'Atelier Léa');
  assert.match(ws1.accessCode, /^SPK-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test('findWorkspaceByAccessCode matches ignoring dashes, spaces, and case', () => {
  const map: Record<string, WorkspaceRecord> = {};
  const ws = createWorkspaceRecord(map, 'Espace Test');
  const rawCode = ws.accessCode.toLowerCase().replace(/-/g, ' ');
  const found = findWorkspaceByAccessCode(map, rawCode);
  assert.ok(found);
  assert.equal(found.id, ws.id);
  assert.equal(normalizeAccessCode(found.accessCode), normalizeAccessCode(ws.accessCode));
  assert.equal(findWorkspaceByAccessCode(map, 'INVALID'), null);
});

test('workspace projects and ownership checks remain strictly isolated between users', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkqr-ws-'));
  try {
    const map: Record<string, WorkspaceRecord> = {};
    const alice = createWorkspaceRecord(map, 'Alice');
    const bob = createWorkspaceRecord(map, 'Bob');

    writeWorkspaceProjects(tmpDir, alice.id, [{ id: 'p1', name: 'QR Alice' }]);
    writeWorkspaceProjects(tmpDir, bob.id, [{ id: 'p2', name: 'QR Bob' }]);

    const aliceItems = readWorkspaceProjects(tmpDir, alice.id) as Array<{ id: string }>;
    const bobItems = readWorkspaceProjects(tmpDir, bob.id) as Array<{ id: string }>;

    assert.equal(aliceItems.length, 1);
    assert.equal(aliceItems[0].id, 'p1');
    assert.equal(bobItems.length, 1);
    assert.equal(bobItems[0].id, 'p2');

    assert.equal(canWorkspaceAccessRecord(alice.id, alice.id), true);
    assert.equal(canWorkspaceAccessRecord(alice.id, bob.id), false);
    assert.equal(canWorkspaceAccessRecord(undefined, bob.id), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
