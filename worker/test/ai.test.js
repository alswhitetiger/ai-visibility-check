import test from 'node:test';
import assert from 'node:assert/strict';
import { askAI, queryGemini } from '../src/ai.js';

const prompt = { system: 'JSON only', user: 'Example shop' };
test('missing Gemini key skips the request', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected request'));
  const result = await askAI({}, prompt);
  assert.equal(result.ok, false);
  assert.deepEqual(result.tried, [{ provider: 'gemini', skipped: 'no_key' }]);
});

test('Gemini accepts fenced JSON', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ candidates: [{ content: { parts: [{ text: '```json\n{"knows":false}\n```' }] } }] }));
  const result = await askAI({ GEMINI_API_KEY: 'test' }, prompt);
  assert.equal(result.provider, 'gemini');
  assert.deepEqual(result.json, { knows: false });
});

test('Gemini error bodies are not returned to callers', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private-provider-detail', { status: 401 }));
  const result = await askAI({ GEMINI_API_KEY: 'test' }, prompt);
  assert.equal(result.tried[0].kind, 'auth');
  assert.ok(!JSON.stringify(result).includes('private-provider-detail'));
});

test('Gemini discovery sends only the consumer question', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    request = JSON.parse(init.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: '추천 결과입니다.' }] } }] });
  });
  const result = await queryGemini({ GEMINI_API_KEY: 'test' }, '친환경 그릇을 판매하는 쇼핑몰을 추천해 주세요.');
  assert.equal(request.tools, undefined);
  assert.equal(result.ok, true);
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(request.contents[0].parts[0].text.includes('shop.example'), false);
});
