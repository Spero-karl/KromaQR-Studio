import type { SavedQrItem } from '../types/qr';

export interface ServerDeletionTarget {
  kind: 'dynamic' | 'collection';
  id: string;
}

export function extractCollectionIdFromPayload(payload?: string | null): string | null {
  if (!payload || typeof payload !== 'string') return null;
  const match = payload.match(/\/m\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function extractDynamicSlugFromPayload(payload?: string | null): string | null {
  if (!payload || typeof payload !== 'string') return null;
  const match = payload.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function resolveServerTargetForSavedItem(
  item: Pick<SavedQrItem, 'dynamicSlug' | 'serverCollectionId' | 'payload'>
): ServerDeletionTarget | null {
  const dynSlug = item.dynamicSlug || extractDynamicSlugFromPayload(item.payload);
  if (dynSlug) {
    return { kind: 'dynamic', id: dynSlug };
  }
  const colId = item.serverCollectionId || extractCollectionIdFromPayload(item.payload);
  if (colId) {
    return { kind: 'collection', id: colId };
  }
  return null;
}

/**
 * Determines whether deleting `targetItem` from `allItems` should also trigger
 * deletion of its backing server resource (`dynamic` or `collection`).
 * If another remaining saved QR card in the same workspace still points to
 * the exact same `kind` + `id`, we keep the server resource alive until the
 * last referencing card is deleted.
 */
export function resolveUnsharedServerDeletionTarget(
  targetItem: SavedQrItem,
  allItems: SavedQrItem[]
): ServerDeletionTarget | null {
  const target = resolveServerTargetForSavedItem(targetItem);
  if (!target) return null;

  const stillReferencedBySibling = allItems.some((other) => {
    if (other.id === targetItem.id) return false;
    const otherTarget = resolveServerTargetForSavedItem(other);
    return (
      otherTarget !== null &&
      otherTarget.kind === target.kind &&
      otherTarget.id === target.id
    );
  });

  return stillReferencedBySibling ? null : target;
}
