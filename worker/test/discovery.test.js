import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionsTarget } from '../src/discovery.js';

test('discovery detects the target in an answer without receiving it in the query', () => {
  assert.equal(mentionsTarget({ text: '가게체크몰을 추천합니다.' }, { host: 'shop.example', brand: '가게체크몰' }), true);
  assert.equal(mentionsTarget({ text: 'shop.example을 참고하세요.' }, { host: 'shop.example', brand: '' }), true);
  assert.equal(mentionsTarget({ text: '다른 가게를 추천합니다.' }, { host: 'shop.example', brand: '가게체크몰' }), false);
});
