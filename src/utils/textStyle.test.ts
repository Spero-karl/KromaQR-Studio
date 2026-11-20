import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, FONT_CATALOG } from '../data/presets.ts';
import { extractPrimaryFontName, resolveEncodedTextStyle } from './textStyle.ts';

test('resolveEncodedTextStyle preserves exact user message font, weight, italic, size, color, align, spacing and underline', () => {
  const resolved = resolveEncodedTextStyle(
    {
      ...DEFAULT_CONFIG,
      fontId: 'bricolage',
      messageFontId: 'dancing',
      messageFontSize: 28,
      messageWeight: 400,
      messageItalic: true,
      messageAlign: 'center',
      messageColor: '#1D4ED8',
      messageLetterSpacing: 0.04,
      messageTextDecoration: 'underline',
    },
    '#F8FAFC'
  );

  assert.equal(resolved.fontId, 'dancing');
  assert.equal(resolved.fontFamily, FONT_CATALOG.dancing.cssFamily);
  assert.equal(resolved.fontSizePx, 28);
  assert.equal(resolved.fontWeight, 400);
  assert.equal(resolved.fontStyle, 'italic');
  assert.equal(resolved.textAlign, 'center');
  assert.equal(resolved.color, '#1D4ED8');
  assert.equal(resolved.letterSpacing, '0.04em');
  assert.equal(resolved.textDecoration, 'underline');
});

test('resolveEncodedTextStyle preserves every script/display/serif font without collapsing buckets', () => {
  const keys = Object.keys(FONT_CATALOG) as Array<keyof typeof FONT_CATALOG>;
  for (const key of keys) {
    const resolved = resolveEncodedTextStyle({
      ...DEFAULT_CONFIG,
      fontId: key,
      messageFontId: undefined,
    });
    assert.equal(resolved.fontId, key);
    assert.equal(resolved.fontFamily, FONT_CATALOG[key].cssFamily);
  }
});

test('resolveEncodedTextStyle falls back gracefully for legacy configs missing message* fields', () => {
  const resolved = resolveEncodedTextStyle(
    {
      fontId: 'pacifico',
      messageFontSize: 24,
      titleWeight: 600,
      titleItalic: true,
      textAlign: 'right',
    },
    '#111214'
  );

  assert.equal(resolved.fontId, 'pacifico');
  assert.equal(resolved.fontFamily, FONT_CATALOG.pacifico.cssFamily);
  assert.equal(resolved.fontSizePx, 24);
  assert.equal(resolved.fontWeight, 600);
  assert.equal(resolved.fontStyle, 'italic');
  assert.equal(resolved.textAlign, 'right');
  assert.equal(resolved.color, '#111214');
  assert.equal(resolved.textDecoration, 'none');
});

test('extractPrimaryFontName extracts unquoted family name for document.fonts loading', () => {
  assert.equal(extractPrimaryFontName("'Dancing Script', cursive"), 'Dancing Script');
  assert.equal(extractPrimaryFontName("'Plus Jakarta Sans', sans-serif"), 'Plus Jakarta Sans');
});
