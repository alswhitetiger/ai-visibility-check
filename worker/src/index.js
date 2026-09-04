import { diagnose, QUADRANT_LABEL } from './diagnose.js';
import { askAI, brandProbePrompt } from './ai.js';

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin || '*',
      'cache-control': 'no-store',
    },
  });

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] || '*';
}

const today = () => new Date().toISOString().slice(0, 10);

// D1로 일일 사용량을 센다. 한도 초과 여부만 돌려준다.
async function bump(env, key, limit) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO usage (key, count, updated_at) VALUES (?, 1, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = ?'
  ).bind(key, now, now).run();
  const row = await env.DB.prepare('SELECT count FROM usage WHERE key = ?').bind(key).first();
  return { count: row?.count ?? 1, exceeded: (row?.count ?? 1) > limit };
}

async function readCache(env, url, ttlHours) {
  const row = await env.DB.prepare('SELECT * FROM scans WHERE url = ?').bind(url).first();
  if (!row) return null;
  if (Date.now() - row.created_at > ttlHours * 3600 * 1000) return null;
  return { ...JSON.parse(row.result_json), cached: true };
}

async function writeCache(env, result) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO scans (url, host, ai_score, ux_score, quadrant, result_json, provider, model, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(url) DO UPDATE SET ai_score=excluded.ai_score, ux_score=excluded.ux_score, ' +
    'quadrant=excluded.quadrant, result_json=excluded.result_json, provider=excluded.provider, ' +
    'model=excluded.model, created_at=excluded.created_at'
  ).bind(
    // uxScore 는 수집이 차단된 경우 null 이다. 컬럼은 숫자만 받으므로 0 으로 넣는다.
    // 화면이 쓰는 값은 result_json 쪽이라 표시에는 영향이 없다.
    result.url, result.host, result.aiScore ?? 0, result.uxScore ?? 0, result.quadrant,
    JSON.stringify(result), result.ai?.provider ?? null, result.ai?.model ?? null, now
  ).run();
}

// AI 응답은 진단 캐시와 따로 보관한다.
// Gemini 무료 티어가 콜로 위치 때문에 간헐적으로 거부당하므로,
// 한 번 성공한 응답을 남겨 두었다가 실패한 요청에 대신 보여준다.
async function saveAiAnswer(env, host, ai) {
  await env.DB.prepare(
    'INSERT INTO ai_answers (host, answer_json, provider, model, created_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(host) DO UPDATE SET answer_json=excluded.answer_json, provider=excluded.provider, ' +
    'model=excluded.model, created_at=excluded.created_at'
  ).bind(host, JSON.stringify(ai.answer), ai.provider, ai.model, Date.now()).run();
}

async function loadAiAnswer(env, host) {
  const row = await env.DB.prepare('SELECT * FROM ai_answers WHERE host = ?').bind(host).first();
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    answer: JSON.parse(row.answer_json),
    collectedAt: row.created_at,
    stale: true,
  };
}

function normalize(input) {
  let s = (input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u;
  } catch {
    return null;
  }
}

async function handleScan(request, env, origin) {
  const params = new URL(request.url).searchParams;
  const target = normalize(params.get('url'));
  if (!target) return json({ error: 'INVALID_URL' }, 400, origin);

  const ttl = Number(env.CACHE_TTL_HOURS || 24);
  const cached = await readCache(env, target.href, ttl);
  if (cached) return json(cached, 200, origin);

  // 심사위원용 우회 코드. 설정돼 있고 일치하면 한도를 건너뛴다.
  const code = params.get('code') || '';
  const isJudge = !!env.JUDGE_CODE && code === env.JUDGE_CODE;

  if (!isJudge) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const day = today();
    const perIp = await bump(env, 'ip:' + ip + ':' + day, Number(env.IP_DAILY_LIMIT || 5));
    if (perIp.exceeded) {
      return json({ error: 'IP_LIMIT', message: '오늘 무료 분석 횟수를 모두 사용했습니다.' }, 429, origin);
    }
    const global = await bump(env, 'global:' + day, Number(env.DAILY_SCAN_LIMIT || 400));
    if (global.exceeded) {
      return json({
        error: 'DAILY_LIMIT',
        message: '실시간 분석은 대기 중입니다. 저장된 분석 결과를 먼저 확인하세요.',
      }, 429, origin);
    }
  }

  const result = await diagnose(target.href);
  if (result.error === 'BLOCKED_BY_SITE') {
    return json({
      error: 'BLOCKED_BY_SITE',
      message: '이 사이트는 자동 접근을 차단하고 있어 진단할 수 없습니다. '
             + '차단 자체가 AI 크롤러에게도 동일하게 적용될 가능성이 큽니다.',
    }, 200, origin);
  }
  if (result.error) return json(result, 502, origin);

  result.quadrantLabel = QUADRANT_LABEL[result.quadrant];

  // AI 실제 질의. 실패해도 규칙 기반 결과는 그대로 돌려준다.
  const brand = params.get('brand') || target.host.replace(/^www\./, '');
  const probe = await askAI(env, brandProbePrompt(brand, target.host));
  if (probe.ok) {
    result.ai = { provider: probe.provider, model: probe.model, answer: probe.json };
    await saveAiAnswer(env, target.host, result.ai);
  } else {
    // 이번 호출이 실패해도 예전에 받아 둔 응답이 있으면 그것을 쓴다. 수집 시점을 함께 밝힌다.
    const previous = await loadAiAnswer(env, target.host);
    result.ai = previous || {
      provider: null,
      model: null,
      unavailable: true,
      // 실패 내역은 운영자만 본다. 일반 사용자에게는 프로바이더 이름만 노출한다.
      tried: isJudge ? probe.tried : probe.tried.map(t => ({ provider: t.provider, kind: t.kind || t.skipped })),
    };
  }

  await writeCache(env, result);
  return json(result, 200, origin);
}

async function handleShowcase(env, origin) {
  const { results } = await env.DB.prepare(
    'SELECT host, label, ai_score, ux_score FROM showcase WHERE opted_in = 1 ORDER BY ai_score DESC LIMIT 200'
  ).all();
  return json({ items: results ?? [] }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request, env);
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET,OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
        },
      });
    }

    try {
      if (pathname === '/api/health') {
        return json({ ok: true, ts: Date.now() }, 200, origin);
      }
      if (pathname === '/api/scan') {
        return await handleScan(request, env, origin);
      }
      if (pathname === '/api/showcase') {
        return await handleShowcase(env, origin);
      }
      return json({ error: 'NOT_FOUND' }, 404, origin);
    } catch (e) {
      return json({ error: 'INTERNAL', message: String(e && e.message || e) }, 500, origin);
    }
  },
};
