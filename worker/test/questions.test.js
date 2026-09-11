import test from 'node:test';
import assert from 'node:assert/strict';
import { questions, validateAnswers, generateQuestions } from '../src/questions.js';

const facts = [{ id: 'description', text: '도자기 그릇을 판매합니다.' }];
const unknowns = () => questions.map(([id]) => ({ id, status: 'unknown', answer: '', evidence: [] }));
test('customer answers require exact source quotes and all five unique questions', () => {
  const answers = unknowns();
  answers[0] = { id: 'offering', status: 'answered', answer: '도자기 그릇을 판매합니다.', evidence: [{ source: 'description', quote: '도자기 그릇을 판매합니다.' }] };
  const result = validateAnswers({ answers }, facts);
  assert.equal(result[0].suggestion, '');
  assert.ok(result[1].suggestion);
  assert.equal(result[1].answer, '수집한 자료에서 답을 확인하지 못했습니다.');
  assert.throws(() => validateAnswers({ answers: answers.slice(1) }, facts));
  assert.throws(() => validateAnswers({ answers: [answers[0], answers[0], ...answers.slice(2)] }, facts));
  answers[0].evidence[0].quote = '무료 배송입니다.';
  assert.throws(() => validateAnswers({ answers }, facts), /INVALID_EVIDENCE/);
  answers[0].evidence = [];
  assert.throws(() => validateAnswers({ answers }, facts), /MISSING_EVIDENCE/);
});
test('question generation reports unavailable inputs and providers', async () => {
  assert.equal((await generateQuestions({}, {})).error, 'NO_FACTS');
  assert.equal((await generateQuestions({}, { observed: { description: facts[0].text } })).error, 'AI_UNAVAILABLE');
});
