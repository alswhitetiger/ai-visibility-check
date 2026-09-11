import test from 'node:test';
import assert from 'node:assert/strict';
import { readExtensionResult } from '../../web/src/extension-result.js';

const fixture = { url: 'https://shop.example/', browserExtracted: true, scannedAt: 1000, aiScore: 80, uxScore: 60,
  observed: { title: '예시 가게', description: '소개', prices: ['1,000원'], images: { total: 1, described: 1 } } };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
test('extension link preserves Korean text and discards unsupported fields', () => {
  const result = readExtensionResult(encode({ ...fixture, observed: { ...fixture.observed, brand: { invalid: true } } }));
  assert.equal(result.observed.title, '예시 가게');
  assert.equal(result.observed.brand, undefined);
  assert.deepEqual(result.observed.prices, ['1,000원']);
});
test('extension link rejects executable URLs, invalid dates, scores and image counts', () => {
  for (const patch of [{ url: 'javascript:alert(1)' }, { aiScore: null }, { uxScore: 101 }, { scannedAt: 9e15 }, { observed: { ...fixture.observed, images: { total: 1, described: 2 } } }]) {
    assert.throws(() => readExtensionResult(encode({ ...fixture, ...patch })));
  }
});
