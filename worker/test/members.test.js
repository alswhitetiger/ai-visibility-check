import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { dayKey, resetAt, reserveScan, releaseScan, quota, saveHistory } from '../src/members.js';
import { authOptions } from '../src/auth.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of ['../schema.sql', '../migrations/0001-auth.sql', '../migrations/0002-members.sql', '../migrations/0003-shared-reports.sql', '../migrations/0004-improvement-checks.sql']) sqlite.exec(readFileSync(new URL(file, import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async all() { const results = sqlite.prepare(sql).all(...values); return { results, meta: { changes: sqlite.prepare('SELECT changes() AS n').get().n } }; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async run() { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; },
      }; return statement;
    },
    async batch(statements) { sqlite.exec('BEGIN'); try { const r = await Promise.all(statements.map(s=>s.all())); sqlite.exec('COMMIT'); return r; } catch(e) { sqlite.exec('ROLLBACK'); throw e; } },
    async exec(sql) { sqlite.exec(sql); },
  };
  return { db, sqlite };
}
function setup(t) {
  const { db, sqlite } = database(); t.after(()=>sqlite.close());
  const env = { DB: db, AUTH_SECRET: 'test-only-secret-0123456789-0123456789', AUTH_BASE_URL: 'http://localhost:8787', AUTH_REQUIRED: 'true', ALLOW_UNVERIFIED_EMAIL_SIGNUP: 'true', ACCOUNT_DAILY_LIMIT: '2', DAILY_SCAN_LIMIT: '3' };
  async function request(path, { body, cookie, method = body ? 'POST' : 'GET', origin = env.AUTH_BASE_URL } = {}) {
    return worker.fetch(new Request(env.AUTH_BASE_URL + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
  }
  async function signup(email) {
    const r = await request('/api/auth/sign-up/email', { body: { name: 'Test', email, password: 'test-only-long-password' } });
    assert.equal(r.status, 200, await r.clone().text());
    const setCookies = r.headers.getSetCookie();
    return { cookie: setCookies.map(s=>s.split(';')[0]).join('; '), setCookies, data: await r.json() };
  }
  return { env, sqlite, request, signup };
}
test('production email signup is blocked until mail is configured', async t => {
  const { env, request } = setup(t);
  delete env.ALLOW_UNVERIFIED_EMAIL_SIGNUP;
  const response = await request('/api/auth/sign-up/email', { body: { name: 'Test', email: 'blocked@example.test', password: 'test-only-long-password' } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'EMAIL_SERVICE_UNAVAILABLE');
});

test('email signup sends a hashed six-digit OTP and signs in only after verification', async t => {
  const { env, sqlite, request } = setup(t);
  let sent; env.MAIL_SENDER = async message => { sent = message; };
  const signup = await request('/api/auth/sign-up/email', { body: { name: 'OTP Test', email: 'otp@example.test', password: 'test-only-long-password' } });
  assert.equal(signup.status, 200, await signup.clone().text());
  assert.equal(signup.headers.getSetCookie().some(value => value.includes('session_token=')), false);
  assert.equal(sent, undefined);
  const requested = await request('/api/auth/email-otp/send-verification-otp', { body: { email: 'otp@example.test', type: 'email-verification' } });
  assert.equal(requested.status, 200, await requested.clone().text());
  const otp = sent.text.match(/인증번호: (\d{6})/)?.[1];
  assert.ok(otp);
  assert.doesNotMatch(sqlite.prepare('SELECT value FROM verification').get().value, new RegExp(otp));
  assert.equal(sqlite.prepare('SELECT emailVerified FROM user').get().emailVerified, 0);
  const verified = await request('/api/auth/email-otp/verify-email', { body: { email: 'otp@example.test', otp } });
  assert.equal(verified.status, 200, await verified.clone().text());
  assert.ok(verified.headers.getSetCookie().some(value => value.includes('session_token=')));
  assert.equal(sqlite.prepare('SELECT emailVerified FROM user').get().emailVerified, 1);
});
test('verified email cannot sign up again or replace its password', async t => {
  const { env, sqlite, request } = setup(t);
  env.MAIL_SENDER = async () => {};
  const email = 'already@example.test', original = 'original-test-password', replacement = 'replacement-test-password';
  assert.equal((await request('/api/auth/sign-up/email', { body: { name: 'Original', email, password: original } })).status, 200);
  sqlite.prepare('UPDATE user SET emailVerified = 1 WHERE email = ?').run(email);
  const duplicate = await request('/api/auth/sign-up/email', { body: { name: 'Replacement', email: email.toUpperCase(), password: replacement } });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'EMAIL_ALREADY_REGISTERED');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM user WHERE lower(email) = lower(?)').get(email).n, 1);
  assert.equal((await request('/api/auth/sign-in/email', { body: { email, password: original } })).status, 200);
  assert.equal((await request('/api/auth/sign-in/email', { body: { email, password: replacement } })).status, 401);
});
test('find-id only emails a verified account and returns the same public response', async t => {
  const { env, sqlite, request } = setup(t), sent = [];
  env.MAIL_SENDER = async message => sent.push(message);
  const email = 'find-me@example.test';
  await request('/api/auth/sign-up/email', { body: { name: 'Find Me', email, password: 'test-only-long-password' } });
  sqlite.prepare('UPDATE user SET emailVerified = 1 WHERE email = ?').run(email);
  const found = await request('/api/auth/find-id', { body: { email } });
  const missing = await request('/api/auth/find-id', { body: { email: 'missing@example.test' } });
  assert.equal(found.status, 200); assert.equal(missing.status, 200);
  assert.deepEqual(await found.json(), await missing.json());
  assert.equal(sent.length, 1); assert.equal(sent[0].to, email);
  assert.match(sent[0].text, /로그인 아이디/);
});
test('account deletion removes the user and every account-owned record', async t => {
  const { sqlite, request, signup } = setup(t), email = 'leave@example.test', password = 'test-only-long-password';
  const member = await signup(email), id = member.data.user.id, now = Date.now();
  sqlite.prepare('INSERT INTO user_sites VALUES (?,?,?,?,?)').run('site', id, 'https://shop.example', 'Shop', now);
  sqlite.prepare('INSERT INTO scan_history VALUES (?,?,?,?,?)').run('history', id, 'https://shop.example', '{}', now);
  sqlite.prepare('INSERT INTO scan_requests VALUES (?,?,?,?,?)').run('request', id, '2026-09-15', 'done', now);
  sqlite.prepare('INSERT INTO shared_reports VALUES (?,?,?,?,?)').run('share', id, '{}', now, now + 10000);
  sqlite.prepare('INSERT INTO improvement_checks VALUES (?,?,?,?,?)').run(id, 'https://shop.example', 'title', 1, now);
  sqlite.prepare('INSERT INTO verification VALUES (?,?,?,?,?,?)').run('verify', `email-verification-otp-${email}`, 'hash', new Date(now + 10000).toISOString(), new Date(now).toISOString(), new Date(now).toISOString());
  const deleted = await request('/api/auth/delete-user', { body: { password }, cookie: member.cookie });
  assert.equal(deleted.status, 200, await deleted.clone().text());
  for (const table of ['user','account','session','user_sites','scan_history','scan_requests','shared_reports','improvement_checks','verification']) {
    assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
  }
});
test('email signup stores a hash, session works, wrong password fails and signout revokes cookie', async t => {
  const { sqlite, request, signup } = setup(t);
  const a = await signup('alpha@example.test');
  assert.ok(a.cookie);
  const sessionCookie = a.setCookies.find(value => value.includes('session_token='));
  assert.ok(sessionCookie);
  assert.doesNotMatch(sessionCookie, /;\s*(?:Max-Age|Expires)=/i);
  assert.notEqual(sqlite.prepare('SELECT password FROM account').get().password, 'test-only-long-password');
  assert.equal((await (await request('/api/member/me', a)).json()).user.email, 'alpha@example.test');
  assert.equal((await request('/api/auth/sign-in/email', { body: { email: 'alpha@example.test', password: 'wrong-password' } })).status, 401);
  assert.equal((await request('/api/auth/sign-out', { ...a, body: {} })).status, 200);
  assert.equal((await (await request('/api/member/me', a)).json()).user, null);
});
test('member routes require login, reject foreign origins and isolate sites and history', async t => {
  const { request, signup, env } = setup(t), a = await signup('a@example.test'), b = await signup('b@example.test');
  assert.equal((await request('/api/member/sites')).status, 401);
  assert.equal((await request('/api/member/sites', { ...a, body: { url: 'https://shop.example' }, origin: 'https://evil.example' })).status, 403);
  await request('/api/member/sites', { ...a, body: { url: 'https://shop.example', label: 'Shop' } });
  const sites = await (await request('/api/member/sites', a)).json();
  assert.equal(sites.items.length, 1);
  assert.equal((await (await request('/api/member/sites', b)).json()).items.length, 0);
  await request('/api/member/sites?id='+sites.items[0].id, { ...b, method: 'DELETE' });
  assert.equal((await (await request('/api/member/sites', a)).json()).items.length, 1);
  await saveHistory(env, a.data.user.id, { url: 'https://shop.example/', scannedAt: 123, aiScore: 20 });
  const history = await (await request('/api/member/history', a)).json();
  assert.equal((await request('/api/member/history?id='+history.items[0].id, b)).status, 404);
  await request('/api/member/history?id='+history.items[0].id, { ...b, method: 'DELETE' });
  assert.equal((await request('/api/member/history?id='+history.items[0].id, a)).status, 200);
});
test('atomic account and global reservations enforce limits; failures release and history deletion does not refund', async t => {
  const { env, signup, request } = setup(t), a = await signup('a@example.test'), b = await signup('b@example.test');
  const ids = await Promise.all(Array.from({ length: 8 }, ()=>reserveScan(env, a.data.user.id)));
  assert.equal(ids.filter(Boolean).length, 2);
  await releaseScan(env, ids.find(Boolean));
  assert.equal((await quota(env, a.data.user.id)).remaining, 1);
  const next = await reserveScan(env, a.data.user.id);
  await saveHistory(env, a.data.user.id, { url: 'https://shop.example/', scannedAt: 123 }, next);
  await releaseScan(env, next);
  assert.equal((await quota(env, a.data.user.id)).remaining, 0);
  assert.ok(await reserveScan(env, b.data.user.id));
  assert.equal(await reserveScan(env, b.data.user.id), null);
  const h = await (await request('/api/member/history', a)).json();
  await request('/api/member/history?id='+h.items[0].id, { ...a, method: 'DELETE' });
  assert.equal((await quota(env, a.data.user.id)).remaining, 0);
});
test('Korean midnight reset, cached history deduplication, expired history and safe account linking', async t => {
  assert.equal(dayKey(Date.parse('2026-09-08T15:00:00Z')), '2026-09-09');
  assert.equal(resetAt(Date.parse('2026-09-08T14:59:00Z')), '2026-09-08T15:00:00.000Z');
  const { env, sqlite, signup, request } = setup(t), a = await signup('a@example.test');
  const data = { url: 'https://shop.example/', scannedAt: 123 };
  await saveHistory(env, a.data.user.id, data); await saveHistory(env, a.data.user.id, data);
  assert.equal((await (await request('/api/member/history', a)).json()).items.length, 1);
  assert.equal((await quota(env, a.data.user.id)).used, 0);
  sqlite.prepare('UPDATE scan_history SET created_at = ?').run(Date.now() - 91 * 86400000);
  assert.equal((await (await request('/api/member/history', a)).json()).items.length, 0);
  assert.equal(authOptions(env).account.accountLinking.disableImplicitLinking, true);
  assert.equal((await request('/api/auth/sign-in/social', { body: { provider: 'google', callbackURL: 'https://evil.example/' } })).ok, false);
});

test('authenticated scan saves history, cached lookup is free, unauthenticated scans are blocked', async t => {
  const { env, request, signup } = setup(t), a = await signup('scan@example.test');
  const actualFetch = globalThis.fetch;
  t.after(()=>{globalThis.fetch = actualFetch;});
  globalThis.fetch = async url => {
    const path = new URL(url).pathname;
    if (path !== '/') return new Response('', { status: 404 });
    return new Response('<!doctype html><html><head><title>Test shop</title></head><body><h1>Shop</h1><p>Clothing and everyday goods</p></body></html>');
  };
  const path = '/api/scan?url=https://shop.example/';
  assert.equal((await request(path, { body: {} })).status, 401);
  assert.equal((await request(path, a)).status, 405);
  const r = await request(path, { ...a, body: {} });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await quota(env, a.data.user.id)).used, 1);
  assert.equal((await (await request('/api/member/history', a)).json()).items.length, 1);
  const cached = await (await request(path, { ...a, body: {} })).json();
  assert.equal(cached.cached, true);
  assert.equal((await quota(env, a.data.user.id)).used, 1);
  assert.equal((await (await request('/api/member/history', a)).json()).items.length, 1);
  globalThis.fetch = async()=>new Response('', {status:503});
  await request(path+'&refresh=1', { ...a, body: {} });
  assert.equal((await quota(env, a.data.user.id)).used, 1);
});

test('operator answers stay out of the shared scan cache and discovery requires a member', async t => {
  const { env, sqlite, request, signup } = setup(t), member = await signup('discover@example.test');
  env.GEMINI_API_KEY = 'test';
  const result = { url: 'https://shop.example/', host: 'shop.example', brand: 'Test Shop', version: '2026-09-09.1', scannedAt: Date.now(), aiScore: 50, uxScore: 50, quadrant: 'balanced', observed: { title: 'Test Shop' }, checks: [] };
  sqlite.prepare('INSERT INTO scans VALUES (?,?,?,?,?,?,?,?,?)').run(result.url, result.host, 50, 50, result.quadrant, JSON.stringify(result), null, null, Date.now());
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: body.generationConfig?.responseMimeType ? JSON.stringify({ about: '소개', faq: [1,2,3].map(i=>({ question: `질문${i}`, answer: `답변${i}` })) }) : 'Test Shop을 추천합니다.' }] } }] });
  });
  const answers = ['offering','details','cost','delivery','support'].map(id=>({ id, answer: `${id} 답변` }));
  assert.equal((await request('/api/interview', { body: { url: result.url, answers } })).status, 200);
  assert.equal(sqlite.prepare("SELECT json_type(result_json, '$.interview') AS type FROM scans").get().type, null);
  assert.equal((await request('/api/discovery', { body: { url: result.url, query: '매일 쓰기 좋은 국내 그릇 쇼핑몰을 추천해 주세요.' } })).status, 401);
  const discovered = await request('/api/discovery', { ...member, body: { url: result.url, query: '매일 쓰기 좋은 국내 그릇 쇼핑몰을 추천해 주세요.' } });
  assert.equal(discovered.status, 200, await discovered.clone().text());
  assert.equal((await discovered.json()).found, true);
});

test('sharing requires owned history, preserves server result and expires without consuming scans', async t => {
  const { env, sqlite, request, signup } = setup(t);
  const a = await signup('share-a@example.test'), b = await signup('share-b@example.test');
  const result = { url: 'https://shop.example/', scannedAt: 123, aiScore: 20, checks: [] };
  assert.equal((await request('/api/member/share', { body: { result } })).status, 401);
  assert.equal((await request('/api/member/share', { ...a, body: {} })).status, 400);
  await saveHistory(env, a.data.user.id, result);
  assert.equal((await request('/api/member/share', { ...b, body: { result } })).status, 400);
  const response = await request('/api/member/share', { ...a, body: { result: { ...result, aiScore: 100 } } });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  const shared = await (await request('/api/share?token=' + token)).json();
  assert.equal(shared.aiScore, 20);
  assert.equal(shared.shared, true);
  assert.equal((await quota(env, a.data.user.id)).used, 0);
  sqlite.prepare('UPDATE shared_reports SET expires_at = ?').run(Date.now() - 1);
  assert.equal((await request('/api/share?token=' + token)).status, 404);
});

test('checklists persist per account and URL, isolate writes and validate input', async t => {
  const { env, request, signup } = setup(t);
  const a = await signup('checks-a@example.test'), b = await signup('checks-b@example.test');
  const url = 'https://shop.example/';
  assert.equal((await request('/api/member/checklist?url=' + encodeURIComponent(url))).status, 401);
  await saveHistory(env, a.data.user.id, { url, scannedAt: 123 });
  const write = body => request('/api/member/checklist', { ...a, body: { url, ...body } });
  assert.equal((await write({ id: 'description', done: 'yes' })).status, 400);
  assert.equal((await request('/api/member/checklist', { ...b, body: { url, id: 'description', done: true } })).status, 403);
  assert.equal((await request('/api/member/checklist', { ...a, origin: 'https://evil.example', body: { url, id: 'description', done: true } })).status, 403);
  assert.equal((await write({ id: 'description', done: true })).status, 200);
  await write({ id: 'img_alt', done: true });
  const read = opts => request('/api/member/checklist?url=' + encodeURIComponent(url), opts).then(r => r.json());
  assert.deepEqual((await read(a)).items, { description: true, img_alt: true });
  assert.deepEqual((await read(b)).items, {});
  await write({ id: 'description', done: false });
  assert.deepEqual((await read(a)).items, { description: false, img_alt: true });
  assert.deepEqual((await (await request('/api/member/checklist?url=https%3A%2F%2Fother.example%2F', a)).json()).items, {});
  assert.equal((await quota(env, a.data.user.id)).used, 0);
});
