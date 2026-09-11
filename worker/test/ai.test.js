import test from 'node:test';
import assert from 'node:assert/strict';
import { askAI } from '../src/ai.js';

const prompt = { system: 'JSON only', user: 'Example shop' };
test('missing AI keys skip every provider without a request', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected request'));
  const result = await askAI({}, prompt);
  assert.equal(result.ok, false);
  assert.equal(result.tried.length, 3);
  assert.ok(result.tried.every(item => item.skipped === 'no_key'));
});

test('AI fails over once per provider and accepts fenced JSON', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    if (url.includes('googleapis')) return new Response('quota', { status: 429 });
    if (url.includes('openai')) return Response.json({ choices: [{ message: { content: 'invalid' } }] });
    return Response.json({ content: [{ text: '```json\n{"knows":false}\n```' }] });
  });
  const result = await askAI({ GEMINI_API_KEY: 'test', OPENAI_API_KEY: 'test', ANTHROPIC_API_KEY: 'test' }, prompt);
  assert.equal(result.provider, 'anthropic');
  assert.deepEqual(result.json, { knows: false });
  assert.equal(calls.length, 3);
});

test('AI provider error bodies are not returned to callers', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private-provider-detail', { status: 401 }));
  const result = await askAI({ GEMINI_API_KEY: 'test' }, prompt);
  assert.equal(result.tried[0].kind, 'auth');
  assert.ok(!JSON.stringify(result).includes('private-provider-detail'));
});
