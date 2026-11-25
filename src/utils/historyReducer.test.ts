import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoryState,
  moveLayer,
  normalizeConfigWithDefaults,
  pushHistoryState,
  redoHistoryState,
  toggleLayer,
  undoHistoryState,
} from './historyReducer';
import {
  DEFAULT_CONFIG,
  DEFAULT_LAYERS,
  LEGENDARY_THEME_PRESETS,
  MASTER_THEME_PRESETS,
  PREMIUM_THEME_PRESETS,
  STUDIO_THEME_PRESETS,
  THEME_PRESETS,
} from '../data/presets';
import { buildShowcaseBackdrop, computeCornerStickerPositions, getCardLayout } from './qrLogic';

test('undoHistoryState and redoHistoryState revert and restore config states cleanly', () => {
  const s0 = createHistoryState(DEFAULT_CONFIG);
  const s1 = pushHistoryState(s0, { ...DEFAULT_CONFIG, titleText: 'Étape 1' });
  const s2 = pushHistoryState(s1, { ...DEFAULT_CONFIG, titleText: 'Étape 2' });

  assert.equal(s2.present.titleText, 'Étape 2');
  assert.equal(s2.past.length, 2);

  const u1 = undoHistoryState(s2);
  assert.equal(u1.present.titleText, 'Étape 1');
  assert.equal(u1.future.length, 1);

  const u2 = undoHistoryState(u1);
  assert.equal(u2.present.titleText, DEFAULT_CONFIG.titleText);

  const r1 = redoHistoryState(u2);
  assert.equal(r1.present.titleText, 'Étape 1');

  // Pushing after undo clears redo branch
  const branched = pushHistoryState(u1, { ...DEFAULT_CONFIG, titleText: 'Branche' });
  assert.equal(branched.future.length, 0);
  assert.equal(branched.present.titleText, 'Branche');
});

test('moveLayer and toggleLayer adjust visibility and render order accurately', () => {
  const reordered = moveLayer(DEFAULT_LAYERS, 'frame', 'up');
  assert.equal(reordered[1].id, 'frame');

  const toggled = toggleLayer(DEFAULT_LAYERS, 'cornerStickers');
  const found = toggled.find((l) => l.id === 'cornerStickers');
  assert.equal(found?.visible, false);
});

test('normalizeConfigWithDefaults preserves saved configs and fills missing fields', () => {
  const partial = { titleText: 'Ancien Projet', cornerRadius: 12 };
  const normalized = normalizeConfigWithDefaults(partial, DEFAULT_CONFIG);
  assert.equal(normalized.titleText, 'Ancien Projet');
  assert.equal(normalized.cornerRadius, 12);
  assert.equal(normalized.layers.length, DEFAULT_LAYERS.length);
  assert.deepEqual(normalized.extraTexts, []);
});

test('24 redesigned presets (4 Studio, 11 Ultra Premium, 5 Master, 4 Légendaire) & backdrops are well-formed', () => {
  assert.equal(STUDIO_THEME_PRESETS.length, 4);
  assert.equal(PREMIUM_THEME_PRESETS.length, 11);
  assert.equal(MASTER_THEME_PRESETS.length, 5);
  assert.equal(LEGENDARY_THEME_PRESETS.length, 4);
  assert.equal(THEME_PRESETS.length, 24);

  const goldLayout = getCardLayout('vip-gold');
  assert.equal(goldLayout.width, 400);
  assert.equal(goldLayout.height, 520);

  const stickers = computeCornerStickerPositions('all-4', 'vip-gold', goldLayout, 4);
  assert.equal(stickers.length, 4);
  assert.ok(stickers[0].x < 42);

  const goldMood = buildShowcaseBackdrop(DEFAULT_CONFIG, 'gold-velvet');
  assert.equal(goldMood.accentColor, '#F5D061');
});
