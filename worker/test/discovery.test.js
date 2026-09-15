import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionsTarget } from '../src/discovery.js';

test('discovery detects the target in answer or grounded source without receiving it in the query', () => {
  assert.equal(mentionsTarget({ text: '가게체크몰을 추천합니다.', sources: [] }, { host: 'shop.example', brand: '가게체크몰' }), true);
  assert.equal(mentionsTarget({ text: '다른 가게를 추천합니다.', sources: [{ title: 'shop.example', uri: 'https://redirect.example/x' }] }, { host: 'shop.example', brand: '' }), true);
  assert.equal(mentionsTarget({ text: '다른 가게를 추천합니다.', sources: [] }, { host: 'shop.example', brand: '가게체크몰' }), false);
});
