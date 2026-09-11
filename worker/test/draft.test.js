import test from 'node:test';
import assert from 'node:assert/strict';
import { draftFacts, validateDraft, generateDraft } from '../src/draft.js';

test('draft only uses bounded textual observations and rejects invented source IDs', () => {
  const facts = draftFacts({ observed: { title: '가게', description: '설명', prices: ['999'], textExcerpt: 'x'.repeat(900) } });
  assert.equal(facts.length, 3);
  assert.equal(facts[2].text.length, 600);
  const option = { title: '가게', description: '설명', sources: ['title'] };
  assert.equal(validateDraft({ options: [option, option, option] }, facts).length, 3);
  assert.throws(() => validateDraft({ options: [option, option, { ...option, sources: ['imagined'] }] }, facts));
  assert.throws(() => validateDraft({ options: [option] }, facts));
});

test('missing evidence and unavailable AI produce explicit failures', async () => {
  assert.equal((await generateDraft({}, {})).error, 'NO_FACTS');
  assert.equal((await generateDraft({}, { observed: { title: '가게' } })).error, 'AI_UNAVAILABLE');
});
