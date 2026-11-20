export interface MediaAssociationRef {
  kind: 'collection' | 'dynamic';
  id: string;
  title: string;
}

export interface StoredMediaLike {
  id: string;
  kind?: 'media' | 'collection';
  type: 'image' | 'video' | 'collection';
  originalName: string;
  url: string;
  posterUrl?: string;
  source?: Record<string, unknown>;
  experience?: Record<string, unknown>;
}

export interface StoredDynamicLike {
  slug: string;
  destination: {
    title?: string;
    payload?: string;
    sourceSnapshot?: Record<string, unknown>;
    experience?: Record<string, unknown>;
  };
}

function matchesMediaReference(
  candidate: unknown,
  mediaId: string,
  mediaUrls: Set<string>
): boolean {
  if (typeof candidate !== 'string' || !candidate.trim()) return false;
  const val = candidate.trim();
  if (mediaUrls.has(val)) return true;
  if (val.includes(`/api/media/${mediaId}/file`) || val.includes(`/api/media/${mediaId}/download`)) {
    return true;
  }
  if (val.endsWith(`/m/${mediaId}`) || val === `/m/${mediaId}`) {
    return true;
  }
  return false;
}

function recordReferencesMedia(
  source: Record<string, unknown> | undefined,
  experience: Record<string, unknown> | undefined,
  mediaId: string,
  mediaUrls: Set<string>
): boolean {
  if (source) {
    if (
      matchesMediaReference(source.imageUrl, mediaId, mediaUrls) ||
      matchesMediaReference(source.imagePageUrl, mediaId, mediaUrls) ||
      matchesMediaReference(source.videoUrl, mediaId, mediaUrls) ||
      matchesMediaReference(source.videoPageUrl, mediaId, mediaUrls) ||
      matchesMediaReference(source.videoPosterUrl, mediaId, mediaUrls)
    ) {
      return true;
    }
  }
  if (experience && Array.isArray(experience.galleryItems)) {
    for (const item of experience.galleryItems) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        if (
          matchesMediaReference(rec.url, mediaId, mediaUrls) ||
          matchesMediaReference(rec.posterUrl, mediaId, mediaUrls)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export function findMediaQrAssociations(
  mediaId: string,
  mediaUrl: string,
  mediaIndex: Record<string, StoredMediaLike>,
  dynamicStore: Record<string, StoredDynamicLike>
): MediaAssociationRef[] {
  const mediaUrls = new Set<string>([
    mediaUrl,
    `/api/media/${mediaId}/file`,
    `/api/media/${mediaId}/download`,
    `/m/${mediaId}`,
  ]);

  const associations: MediaAssociationRef[] = [];

  for (const rec of Object.values(mediaIndex)) {
    if (rec.id === mediaId) continue;
    if (rec.kind !== 'collection') continue;
    if (recordReferencesMedia(rec.source, rec.experience, mediaId, mediaUrls)) {
      associations.push({
        kind: 'collection',
        id: rec.id,
        title: rec.originalName || `Collection /m/${rec.id}`,
      });
    }
  }

  for (const dyn of Object.values(dynamicStore)) {
    const dest = dyn.destination;
    if (!dest) continue;
    const directPayloadMatch = matchesMediaReference(dest.payload, mediaId, mediaUrls);
    const snapshotMatch = recordReferencesMedia(
      dest.sourceSnapshot,
      dest.experience,
      mediaId,
      mediaUrls
    );
    if (directPayloadMatch || snapshotMatch) {
      associations.push({
        kind: 'dynamic',
        id: dyn.slug,
        title: dest.title || `QR dynamique /d/${dyn.slug}`,
      });
    }
  }

  return associations;
}
