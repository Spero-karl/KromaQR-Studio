import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMediaQrAssociations,
  type StoredDynamicLike,
  type StoredMediaLike,
} from './mediaAssociations';

test('findMediaQrAssociations detects collection and dynamic QR references across /api/media and /m URLs', () => {
  const mediaIndex: Record<string, StoredMediaLike> = {
    img1: {
      id: 'img1',
      kind: 'media',
      type: 'image',
      originalName: 'atelier.jpg',
      url: '/api/media/img1/file',
    },
    col1: {
      id: 'col1',
      kind: 'collection',
      type: 'collection',
      originalName: 'Galerie Printemps',
      url: '/m/col1',
      source: {
        imageUrl: 'https://qr.example.com/api/media/img1/file',
      },
      experience: {
        galleryItems: [],
      },
    },
    col2: {
      id: 'col2',
      kind: 'collection',
      type: 'collection',
      originalName: 'Mixte Vidéo',
      url: '/m/col2',
      source: {},
      experience: {
        galleryItems: [{ id: 'g1', url: '/api/media/img1/download' }],
      },
    },
    colUnrelated: {
      id: 'colUnrelated',
      kind: 'collection',
      type: 'collection',
      originalName: 'Autre',
      url: '/m/colUnrelated',
      source: { imageUrl: '/api/media/other/file' },
    },
  };

  const dynamicStore: Record<string, StoredDynamicLike> = {
    slugDirect: {
      slug: 'slugDirect',
      destination: {
        title: 'Carte VIP',
        payload: 'https://qr.example.com/m/img1',
      },
    },
    slugSnapshot: {
      slug: 'slugSnapshot',
      destination: {
        title: 'Invitation',
        payload: 'https://qr.example.com/d/slugSnapshot',
        sourceSnapshot: {
          videoPosterUrl: '/api/media/img1/file',
        },
      },
    },
    slugOther: {
      slug: 'slugOther',
      destination: {
        title: 'Lien externe',
        payload: 'https://example.org',
      },
    },
  };

  const associations = findMediaQrAssociations(
    'img1',
    '/api/media/img1/file',
    mediaIndex,
    dynamicStore
  );

  assert.deepEqual(associations, [
    { kind: 'collection', id: 'col1', title: 'Galerie Printemps' },
    { kind: 'collection', id: 'col2', title: 'Mixte Vidéo' },
    { kind: 'dynamic', id: 'slugDirect', title: 'Carte VIP' },
    { kind: 'dynamic', id: 'slugSnapshot', title: 'Invitation' },
  ]);
});
