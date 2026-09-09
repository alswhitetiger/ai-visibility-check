import test from 'node:test';
import assert from 'node:assert/strict';
import { failureHelp, aiFailureHelp } from '../../web/src/failure-help.js';
test('site blocks and quotas do not encourage retries; AI limits stay separate', () => {
  for (const code of ['ACCOUNT_LIMIT','DAILY_LIMIT','BLOCKED_BY_SITE','REFUSED_BY_SITE']) assert.ok(!failureHelp(code).retry);
  assert.equal(failureHelp('TIMEOUT').retry, true);
  assert.match(aiFailureHelp({ tried: [{kind:'rate_limit'}] }), /별개/);
  assert.match(aiFailureHelp({ tried: [{kind:'network'}] }), /연결/);
});
