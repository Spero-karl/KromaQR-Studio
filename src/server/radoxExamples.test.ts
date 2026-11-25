import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_DAILY_AI_REQUESTS,
  RadoxExamplesService,
  sanitizeGeneratedSample,
} from './radoxExamples';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparkqr-radox-test-'));
}

test('RadoxExamplesService falls back locally when API key is missing and never calls fetch', async () => {
  const dir = createTempDir();
  let fetchCalled = false;
  try {
    const service = new RadoxExamplesService(dir, undefined, {
      apiKey: '',
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error('Should not fetch without API key');
      },
    });
    const res = await service.generateExample('tiktok');
    assert.equal(res.ok, true);
    assert.equal(res.source, 'fallback');
    assert.equal(res.limitReached, false);
    assert.ok(res.sample.tiktokHandle?.startsWith('@'));
    assert.equal(fetchCalled, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RadoxExamplesService enforces strict 10 requests/UTC day cap, persists quota, and hides keys/provider details', async () => {
  const dir = createTempDir();
  let fetchCalls = 0;
  let currentDate = new Date('2026-11-25T10:00:00.000Z');
  const fakeKey = 'rx-secret-never-leak-key';

  try {
    const mockFetch: typeof fetch = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ tiktokHandle: '@studio.createur' }),
              },
            },
          ],
          usage: { total_tokens: 95 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const service = new RadoxExamplesService(dir, undefined, {
      apiKey: fakeKey,
      baseUrl: 'https://radoxai.com/v1',
      model: 'gpt-4o-mini',
      fetchImpl: mockFetch,
      now: () => currentDate,
    });

    for (let i = 1; i <= MAX_DAILY_AI_REQUESTS; i++) {
      const res = await service.generateExample('tiktok');
      assert.equal(res.ok, true);
      assert.equal(res.source, 'smart');
      assert.equal(res.sample.tiktokHandle, '@studio.createur');
      assert.equal(res.remainingToday, MAX_DAILY_AI_REQUESTS - i);
      const serialized = JSON.stringify(res).toLowerCase();
      assert.equal(serialized.includes('radox'), false);
      assert.equal(serialized.includes(fakeKey), false);
      assert.equal(serialized.includes('gpt-4o'), false);
    }

    assert.equal(fetchCalls, 10);

    // 11th request must NOT call Radox AI and must return fallback with limitReached: true
    const eleventh = await service.generateExample('instagram');
    assert.equal(eleventh.ok, true);
    assert.equal(eleventh.source, 'fallback');
    assert.equal(eleventh.limitReached, true);
    assert.equal(eleventh.remainingToday, 0);
    assert.equal(fetchCalls, 10);

    // Next UTC day resets daily quota
    currentDate = new Date('2026-11-26T00:05:00.000Z');
    const nextDay = await service.generateExample('tiktok');
    assert.equal(nextDay.source, 'smart');
    assert.equal(nextDay.remainingToday, 9);
    assert.equal(fetchCalls, 11);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RadoxExamplesService enforces daily token cap and rejects unsafe/phishing AI outputs', async () => {
  const dir = createTempDir();
  let fetchCalls = 0;

  try {
    const service = new RadoxExamplesService(dir, undefined, {
      apiKey: 'rx-token-cap-key',
      maxDailyRequests: 10,
      maxDailyTokens: 200,
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  // Malicious output should be rejected by sanitizer -> fallback
                  content: JSON.stringify({ urlValue: 'javascript:alert(1)' }),
                },
              },
            ],
            usage: { total_tokens: 250 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    const first = await service.generateExample('url');
    assert.equal(first.source, 'fallback'); // sanitized rejected javascript:
    assert.equal(first.limitReached, true); // tokensUsed (250) >= maxDailyTokens (200)
    assert.equal(fetchCalls, 1);

    // Subsequent call blocked by daily token cap
    const second = await service.generateExample('url');
    assert.equal(second.source, 'fallback');
    assert.equal(second.limitReached, true);
    assert.equal(fetchCalls, 1);

    assert.equal(sanitizeGeneratedSample('tiktok', { tiktokHandle: 'https://evil-tiktok.com/@x' }), null);
    assert.deepEqual(sanitizeGeneratedSample('twitter', { twitterHandle: 'atelier_x' }), {
      twitterHandle: '@atelier_x',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
