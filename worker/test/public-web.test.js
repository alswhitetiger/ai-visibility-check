import test from 'node:test';
import assert from 'node:assert/strict';
import { publicUrl, fetchPublicText } from '../src/public-web.js';
import worker from '../src/index.js';

test('public URL validation rejects IP literals, local names, credentials and invalid inputs', () => {
  for (const input of [null, {}, '', '127.0.0.1', '2130706433', '0x7f000001', '10.0.0.1', 'https://[::1]', 'shop.local', 'a.localhost.', 'https://user:pass@shop.example', 'https://shop.example/' + 'a'.repeat(2048)]) {
    assert.equal(publicUrl(input), null, String(input));
  }
  assert.equal(publicUrl('shop.example/path#part'), 'https://shop.example/path');
});

test('redirects to private addresses are rejected before fetching the target', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => { calls.push(url); return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }); });
  assert.equal((await fetchPublicText('https://shop.example/')).ok, false);
  assert.equal(calls.length, 1);
});

test('ownership requests reject cross-origin redirects, regular requests follow public ones', async t => {
  t.mock.method(globalThis, 'fetch', async url => url.includes('other.example') ? new Response('ok') : new Response(null, { status: 302, headers: { location: 'https://other.example/' } }));
  assert.equal((await fetchPublicText('https://shop.example/', {}, { sameOrigin: true })).ok, false);
  const result = await fetchPublicText('https://shop.example/');
  assert.equal(result.text, 'ok');
  assert.equal(result.finalUrl, 'https://other.example/');
});

test('oversized responses and redirect loops terminate without scoring', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)));
  assert.equal((await fetchPublicText('https://shop.example/')).ok, false);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 302, headers: { location: '/' } }); });
  assert.equal((await fetchPublicText('https://shop.example/')).ok, false);
  assert.equal(calls, 6);
});

test('ownership meta verification accepts content before name and rejects unrelated methods', async t => {
  const env = { DB: { prepare() { return { bind() { return this; }, first: async () => ({ ai_score: 80, ux_score: 70 }), run: async () => ({}) }; } } };
  const url = 'https://worker.example/api/optin?url=https://shop.example/';
  const { token } = await (await worker.fetch(new Request(url), env)).json();
  t.mock.method(globalThis, 'fetch', async url => url.includes('.well-known') ? new Response('', { status: 404 }) : new Response(`<html><head><meta content="${token}" name="ai-visibility-check"></head></html>`));
  const request = method => new Request(url, { method, headers: { Origin: 'https://worker.example' } });
  assert.equal((await (await worker.fetch(request('POST'), env)).json()).via, 'meta');
  assert.equal((await worker.fetch(request('DELETE'), env)).status, 405);
});

test('extension scan limits price candidates and rejects malformed values', async () => {
  const request = new Request('https://worker.example/api/extension/scan', { method: 'POST', headers: { Origin: 'chrome-extension://' + 'a'.repeat(32), 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://shop.example/', title: 'Shop', images: [{ alt: 'shirt' }], prices: [{ private: 'x' }, ...Array(40).fill('1,000원')] }) });
  const result = await (await worker.fetch(request, {})).json();
  assert.equal(result.browserExtracted, true);
  assert.equal(result.observed.prices.length, 30);
  assert.ok(result.observed.prices.every(p => typeof p === 'string'));
});
