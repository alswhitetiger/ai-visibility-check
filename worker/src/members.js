const improvementTables = new WeakMap();
async function ensureImprovements(env) {
  if (!improvementTables.has(env.DB)) improvementTables.set(env.DB, env.DB.prepare(`CREATE TABLE IF NOT EXISTS improvement_checks (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 url TEXT NOT NULL, check_id TEXT NOT NULL, done INTEGER NOT NULL CHECK(done IN (0,1)),
 updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,url,check_id)
);`).run().catch(e => { improvementTables.delete(env.DB); throw e; }));
  await improvementTables.get(env.DB);
}
export const dayKey = (now = Date.now()) => new Date(now + 9 * 3600000).toISOString().slice(0, 10);
export const resetAt = (now = Date.now()) => new Date(Date.parse(dayKey(now) + 'T00:00:00+09:00') + 86400000).toISOString();
const limitOf = env => Math.max(1, Number(env.ACCOUNT_DAILY_LIMIT) || 20);
const sharedReportsTables = new WeakMap();
async function ensureSharedReportsTable(env) {
  if (!sharedReportsTables.has(env.DB)) sharedReportsTables.set(env.DB, env.DB.prepare(`CREATE TABLE IF NOT EXISTS shared_reports (
    token TEXT PRIMARY KEY, user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
    result_json TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
  )`).run().catch(error => { sharedReportsTables.delete(env.DB); throw error; }));
  await sharedReportsTables.get(env.DB);
}
export function publicUrl(input) {
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : 'https://' + input.trim());
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || !u.hostname.includes('.') || u.href.length > 2048) return null;
    u.hash = ''; return u.href;
  } catch { return null; }
}
export async function quota(env, userId) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT COUNT(*) AS used FROM scan_requests WHERE user_id = ? AND day = ? AND (status = 'done' OR created_at > ?)").bind(userId, dayKey(now), now - 120000).first();
  return { used: row.used, limit: limitOf(env), remaining: Math.max(0, limitOf(env) - row.used), resetsAt: resetAt(now) };
}
// One SQLite statement serializes concurrent reservations for both limits.
export async function reserveScan(env, userId) {
  const id = crypto.randomUUID(), now = Date.now(), day = dayKey(now);
  const row = await env.DB.prepare(`INSERT INTO scan_requests (id, user_id, day, status, created_at)
    SELECT ?, ?, ?, 'pending', ? WHERE
    (SELECT COUNT(*) FROM scan_requests WHERE user_id = ? AND day = ? AND (status = 'done' OR created_at > ?)) < ? AND
    (SELECT COUNT(*) FROM scan_requests WHERE day = ? AND (status = 'done' OR created_at > ?)) < ? RETURNING id`)
    .bind(id, userId, day, now, userId, day, now - 120000, limitOf(env), day, now - 120000, Number(env.DAILY_SCAN_LIMIT) || 400).first();
  return row?.id || null;
}
export async function releaseScan(env, id) {
  if (id) await env.DB.prepare("DELETE FROM scan_requests WHERE id = ? AND status = 'pending'").bind(id).run();
}
export async function saveHistory(env, userId, data, reservation) {
  const now = Date.now();
  const statements = [env.DB.prepare(`INSERT INTO scan_history (id, user_id, url, result_json, created_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS
    (SELECT 1 FROM scan_history WHERE user_id = ? AND url = ? AND json_extract(result_json, '$.scannedAt') = ?)`)
    .bind(crypto.randomUUID(), userId, data.url, JSON.stringify(data), now, userId, data.url, data.scannedAt)];
  if (reservation) statements.push(env.DB.prepare("UPDATE scan_requests SET status = 'done' WHERE id = ? AND user_id = ?").bind(reservation, userId));
  statements.push(env.DB.prepare('DELETE FROM scan_history WHERE user_id = ? AND created_at < ?').bind(userId, now - 90 * 86400000));
  await env.DB.batch(statements);
}

export async function createSharedReport(env, userId, result) {
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  const now = Date.now();
  if (!result || typeof result.url !== 'string' || !result.scannedAt) return null;
  const saved = await env.DB.prepare("SELECT result_json FROM scan_history WHERE user_id = ? AND url = ? AND json_extract(result_json, '$.scannedAt') = ? AND created_at >= ? LIMIT 1")
    .bind(userId, result.url, result.scannedAt, now - 90 * 86400000).first();
  if (!saved) return null;
  const payload = saved.result_json;
  if (payload.length > 300000) return null;
  await ensureSharedReportsTable(env);
  await env.DB.prepare('DELETE FROM shared_reports WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO shared_reports (token, user_id, result_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, userId, payload, now, now + 30 * 86400000).run();
  return token;
}

export async function readSharedReport(env, token) {
  if (!token || token.length > 100) return null;
  await ensureSharedReportsTable(env);
  const row = await env.DB.prepare('SELECT result_json, created_at, expires_at FROM shared_reports WHERE token = ? AND expires_at > ?').bind(token, Date.now()).first();
  if (!row) return null;
  try { return { ...JSON.parse(row.result_json), shared: true, sharedAt: row.created_at, shareExpiresAt: row.expires_at }; } catch { return null; }
}

export async function memberRoute(request, env, user, json, origin) {
  const u = new URL(request.url), path = u.pathname;
  if (path === '/api/member/checklist') {
    if (!['GET', 'POST'].includes(request.method)) return json({ message: '지원하지 않는 요청입니다.' }, 405, origin);
    const body = request.method === 'POST' ? await request.json().catch(() => null) : null;
    const url = publicUrl(request.method === 'GET' ? u.searchParams.get('url') || '' : body?.url || '');
    if (!url) return json({ message: '사이트 주소를 확인해 주세요.' }, 400, origin);
    await ensureImprovements(env);
    if (request.method === 'POST') {
      if (!/^[a-z_]{1,40}$/.test(body?.id || '') || typeof body?.done !== 'boolean') return json({ message: '체크 항목이 올바르지 않습니다.' }, 400, origin);
      const owned = await env.DB.prepare('SELECT id FROM scan_history WHERE user_id = ? AND url = ? LIMIT 1').bind(user.id, url).first();
      if (!owned) return json({ message: '본인 계정으로 검사한 사이트에서 저장할 수 있어요.' }, 403, origin);
      await env.DB.prepare(`INSERT INTO improvement_checks (user_id,url,check_id,done,updated_at) VALUES (?,?,?,?,?)
        ON CONFLICT(user_id,url,check_id) DO UPDATE SET done=excluded.done,updated_at=excluded.updated_at`)
        .bind(user.id,url,body.id,body.done ? 1 : 0,Date.now()).run();
    }
    const { results } = await env.DB.prepare('SELECT check_id,done FROM improvement_checks WHERE user_id = ? AND url = ?').bind(user.id,url).all();
    return json({ items: Object.fromEntries(results.map(r => [r.check_id, !!r.done])) }, 200, origin);
  }
  if (path === '/api/member/sites') {
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, url, label, created_at FROM user_sites WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all();
      return json({ items: results }, 200, origin);
    }
    if (request.method === 'POST') {
      const body = await request.json(), url = publicUrl(body.url || '');
      if (!url) return json({ message: '공개된 사이트 주소를 입력해 주세요.' }, 400, origin);
      const row = await env.DB.prepare(`INSERT INTO user_sites (id, user_id, url, label, created_at) SELECT ?, ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM user_sites WHERE user_id = ?) < 50
        ON CONFLICT(user_id, url) DO UPDATE SET label = excluded.label RETURNING id`)
        .bind(crypto.randomUUID(), user.id, url, String(body.label || new URL(url).hostname).slice(0, 80), Date.now(), user.id).first();
      return json(row ? { ok: true } : { message: '사이트는 최대 50개까지 저장할 수 있어요.' }, row ? 200 : 400, origin);
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM user_sites WHERE id = ? AND user_id = ?').bind(u.searchParams.get('id'), user.id).run();
      return json({ ok: true }, 200, origin);
    }
  }
  if (path === '/api/member/history') {
    const id = u.searchParams.get('id');
    if (request.method === 'DELETE' && id) {
      await env.DB.prepare('DELETE FROM scan_history WHERE id = ? AND user_id = ?').bind(id, user.id).run();
      return json({ ok: true }, 200, origin);
    }
    if (request.method !== 'GET') return json({ message: '지원하지 않는 요청입니다.' }, 405, origin);
    if (id) {
      const row = await env.DB.prepare('SELECT result_json FROM scan_history WHERE id = ? AND user_id = ? AND created_at >= ?').bind(id, user.id, Date.now() - 90 * 86400000).first();
      return json(row ? JSON.parse(row.result_json) : { message: '검사 기록을 찾지 못했습니다.' }, row ? 200 : 404, origin);
    }
    const offset = Math.max(0, Math.min(100000, Number(u.searchParams.get('offset')) || 0));
    const { results } = await env.DB.prepare(`SELECT id, url, created_at, json_extract(result_json, '$.aiScore') AS aiScore,
      json_extract(result_json, '$.uxScore') AS uxScore FROM scan_history WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC, id LIMIT 21 OFFSET ?`)
      .bind(user.id, Date.now() - 90 * 86400000, offset).all();
    return json({ items: results.slice(0, 20), hasMore: results.length > 20 }, 200, origin);
  }
  if (path === '/api/member/share') {
    if (request.method !== 'POST') return json({ message: '지원하지 않는 요청입니다.' }, 405, origin);
    const body = await request.json().catch(() => null);
    const token = await createSharedReport(env, user.id, body?.result);
    return token ? json({ ok: true, token, expiresInDays: 30 }, 200, origin) : json({ message: '공유할 검사 결과가 올바르지 않습니다.' }, 400, origin);
  }
  return json({ message: '지원하지 않는 요청입니다.' }, 405, origin);
}
