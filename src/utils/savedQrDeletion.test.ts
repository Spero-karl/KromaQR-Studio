import test from 'node:test';
import assert from 'node:assert/strict';
import type { SavedQrItem } from '../types/qr';
import {
  resolveServerTargetForSavedItem,
  resolveUnsharedServerDeletionTarget,
} from './savedQrDeletion';

function makeSavedItem(overrides: Partial<SavedQrItem>): SavedQrItem {
  return {
    id: 'item-1',
    name: 'Test QR',
    category: 'Personnel',
    createdAt: '2026-11-20T10:00:00.000Z',
    source: {
      type: 'text',
      textMode: 'text',
      urlValue: '',
      textValue: 'Bonjour',
      wifiSsid: '',
      wifiPassword: '',
      wifiSecurity: 'WPA',
      imageUrl: '',
      imageName: '',
      imagePageUrl: '',
      useSourceImageAsLogo: false,
      videoUrl: '',
      videoName: '',
      videoPageUrl: '',
    },
    config: {} as SavedQrItem['config'],
    payload: 'https://sparkqr.example/m/col_123',
    ...overrides,
  };
}

test('resolveServerTargetForSavedItem extracts dynamic slug or collection id cleanly', () => {
  const dynItem = makeSavedItem({
    dynamicSlug: 'dyn_abc',
    payload: 'https://sparkqr.example/d/dyn_abc#k=secret',
  });
  assert.deepEqual(resolveServerTargetForSavedItem(dynItem), {
    kind: 'dynamic',
    id: 'dyn_abc',
  });

  const colItem = makeSavedItem({
    serverCollectionId: 'col_xyz',
    payload: 'https://sparkqr.example/m/col_xyz',
  });
  assert.deepEqual(resolveServerTargetForSavedItem(colItem), {
    kind: 'collection',
    id: 'col_xyz',
  });

  const payloadOnlyItem = makeSavedItem({
    serverCollectionId: null,
    payload: 'https://sparkqr.example/m/col_from_url#k=key123',
  });
  assert.deepEqual(resolveServerTargetForSavedItem(payloadOnlyItem), {
    kind: 'collection',
    id: 'col_from_url',
  });

  const staticUrlItem = makeSavedItem({
    serverCollectionId: null,
    dynamicSlug: null,
    payload: 'https://example.org/hello',
  });
  assert.equal(resolveServerTargetForSavedItem(staticUrlItem), null);
});

test('resolveUnsharedServerDeletionTarget preserves server resource if a sibling duplicate still references it', () => {
  const original = makeSavedItem({
    id: 'qr-1',
    serverCollectionId: 'col_shared',
    payload: 'https://sparkqr.example/m/col_shared',
  });
  const duplicate = makeSavedItem({
    id: 'qr-2',
    serverCollectionId: 'col_shared',
    payload: 'https://sparkqr.example/m/col_shared',
  });

  // Deleting original while duplicate exists must NOT delete col_shared on server
  assert.equal(
    resolveUnsharedServerDeletionTarget(original, [original, duplicate]),
    null
  );

  // Deleting duplicate once it is the last card DOES delete col_shared on server
  assert.deepEqual(resolveUnsharedServerDeletionTarget(duplicate, [duplicate]), {
    kind: 'collection',
    id: 'col_shared',
  });
});
