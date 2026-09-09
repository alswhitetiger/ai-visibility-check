import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { dayKey, resetAt, reserveScan, releaseScan, quota, saveHistory } from '../src/members.js';
import { authOptions } from '../src/auth.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['../schema.sql', '../migrations/0001-auth.sql', '../migrations/0002-members.sql']) sqlite.exec(readFileSync(new URL(file, import.meta.url), 'utf8'));
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
  const env = { DB: db, AUTH_SECRET: 'test-only-secret-0123456789-0123456789', AUTH_BASE_URL: 'http://localhost:8787', AUTH_REQUIRED: 'true', ACCOUNT_DAILY_LIMIT: '2', DAILY_SCAN_LIMIT: '3' };
  async function request(path, { body, cookie, method = body ? 'POST' : 'GET', origin = env.AUTH_BASE_URL } = {}) {
    return worker.fetch(new Request(env.AUTH_BASE_URL + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
  }
  async function signup(email) {
    const r = await request('/api/auth/sign-up/email', { body: { name: 'Test', email, password: 'test-only-long-password' } });
    assert.equal(r.status, 200, await r.clone().text());
    return { cookie: r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '), data: await r.json() };
  }
  return { env, sqlite, request, signup };
}
test('email signup stores a hash, session works, wrong password fails and signout revokes cookie', async t => {
  const { sqlite, request, signup } = setup(t);
  const a = await signup('alpha@example.test');
  assert.ok(a.cookie);
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
