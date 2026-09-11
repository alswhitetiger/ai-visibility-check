import { fetchPublicText } from './public-web.js';
import { parseHTML } from 'linkedom';
import { diagnose, QUADRANT_LABEL, DIAGNOSIS_VERSION } from './diagnose.js';
import { askAI, brandProbePrompt } from './ai.js';
import { createAuth, sessionOf, providerStatus } from './auth.js';
import { quota, reserveScan, releaseScan, saveHistory, memberRoute, publicUrl, readSharedReport } from './members.js';

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin || '*',
      'cache-control': 'no-store',
    },
  });

// 인증 쿠키를 브라우저 세션 쿠키로 바꾼다. 브라우저를 닫으면 로그인도 끝난다.
function browserSessionCookies(response) {
  const headers = new Headers(response.headers);
  const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (!cookies.length) return response;
  headers.delete('set-cookie');
  for (let cookie of cookies) {
    const isSession = /^[^=]*better-auth\.(?:session_token|session_data|account_data)(?:\.\d+)?=/i.test(cookie);
    const isDeletion = /;\s*Max-Age=0(?:;|$)/i.test(cookie);
    if (isSession && !isDeletion) {
      cookie = cookie.replace(/;\s*Max-Age=[^;]*/ig, '').replace(/;\s*Expires=[^;]*/ig, '');
    }
    headers.append('set-cookie', cookie);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (/^chrome-extension:\/\/[a-z]{32}$/.test(origin)) return origin;
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
  const result = JSON.parse(row.result_json);
  if (result.version !== DIAGNOSIS_VERSION) return null;
  return { ...result, cached: true };
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
  const url = publicUrl(input);
  return url ? new URL(url) : null;
}

function extensionResult(input) {
  const images = Array.isArray(input?.images) ? input.images.slice(0, 100) : [];
  const title = typeof input?.title === 'string' ? input.title.trim().slice(0, 200) : '';
  const description = typeof input?.description === 'string' ? input.description.trim().slice(0, 600) : '';
  const headings = Array.isArray(input?.headings) ? input.headings.filter(x => typeof x === 'string' && x.trim()).slice(0, 20).map(x => x.slice(0, 200)) : [];
  const prices = Array.isArray(input?.prices) ? input.prices.filter(x => typeof x === 'string').slice(0, 30).map(x => x.slice(0, 80)) : [];
  const described = images.filter(x => typeof x?.alt === 'string' && x.alt.trim()).length;
  const aiScore = Math.round((title ? 30 : 0) + (description.length >= 40 ? 30 : description ? 15 : 0) + (headings.length ? 20 : 0) + (input?.url ? 20 : 0));
  const uxScore = Math.round((title ? 20 : 0) + (images.length ? (described / images.length) * 40 : 0) + (prices.length ? 25 : 0) + (description ? 15 : 0));
  return { url: input?.url || '', host: input?.url ? new URL(input.url).host : '', version: DIAGNOSIS_VERSION, browserExtracted: true, aiScore, uxScore, observed: { title, description, headings, images: { total: images.length, described }, prices }, scannedAt: Date.now(), checks: [] };
}

async function handleScan(request, env, origin) {
  const session = await sessionOf(request, env);
  if (env.AUTH_REQUIRED === 'true' && !session) return json({ error: 'LOGIN_REQUIRED', message: '로그인하면 검사와 기록 저장을 이용할 수 있어요.' }, 401, origin);
  if (env.AUTH_REQUIRED === 'true' && request.method !== 'POST') return json({ error: 'METHOD', message: '새 화면에서 다시 검사해 주세요.' }, 405, origin);
  const params = new URL(request.url).searchParams;
  const target = normalize(params.get('url'));
  if (!target) return json({ error: 'INVALID_URL' }, 400, origin);

  const ttl = Number(env.CACHE_TTL_HOURS || 24);
  const cached = params.get('refresh') === '1' ? null : await readCache(env, target.href, ttl);
  if (cached) {
    if (session && !cached.pageSkipped) await saveHistory(env, session.user.id, cached);
    return json(cached, 200, origin);
  }

  let reservation;
  if (session) {
    reservation = await reserveScan(env, session.user.id);
    if (!reservation) {
      const usage = await quota(env, session.user.id);
      return json({ error: usage.remaining === 0 ? 'ACCOUNT_LIMIT' : 'DAILY_LIMIT', message: usage.remaining === 0 ? '오늘 계정의 검사 횟수를 모두 사용했어요. 한국 시간 자정에 초기화됩니다.' : '오늘 서비스 전체 검사 한도에 도달했어요. 저장된 기록과 예시는 계속 볼 수 있습니다.', usage }, 429, origin);
    }
  }
  try {

  // 심사위원용 우회 코드. 설정돼 있고 일치하면 한도를 건너뛴다.
  const code = params.get('code') || '';
  const isJudge = !!env.JUDGE_CODE && code === env.JUDGE_CODE;

  if (!isJudge && !session) {
    const day = today();
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
             + '다른 AI 서비스의 접근 여부는 이 결과만으로 알 수 없습니다.',
    }, 200, origin);
  }
  // 서버가 우리를 거부한 경우. 우회하지 않고 그대로 알린다.
  // 이것 자체가 "이 사이트는 자동 접근을 막는다"는 진단 결과이기도 하다.
  if (result.error === 'FETCH_FAILED' && [401, 403, 429].includes(result.status)) {
    return json({
      error: 'REFUSED_BY_SITE',
      status: result.status,
      message: '이 사이트는 자동 접근을 거부했습니다(HTTP ' + result.status + '). '
             + '다른 AI 서비스의 접근 여부는 이 결과만으로 알 수 없습니다.',
    }, 200, origin);
  }
  if (result.error === 'LOGIN_WALL') return json(result, 200, origin);
  if (result.error) return json(result, 502, origin);

  result.quadrantLabel = QUADRANT_LABEL[result.quadrant];

  // AI 실제 질의. 실패해도 규칙 기반 결과는 그대로 돌려준다.
  const brand = result.brand || target.host.replace(/^www\./, '');
  const previousAnswer = await loadAiAnswer(env, target.host);
  const probe = result.pageSkipped || previousAnswer ? { ok: false, tried: [] } : await askAI(env, brandProbePrompt(brand, target.host));
  if (probe.ok) {
    result.ai = { provider: probe.provider, model: probe.model, answer: probe.json, collectedAt: Date.now() };
    await saveAiAnswer(env, target.host, result.ai);
  } else {
    // 이번 호출이 실패해도 예전에 받아 둔 응답이 있으면 그것을 쓴다. 수집 시점을 함께 밝힌다.
    result.ai = previousAnswer || {
      provider: null,
      model: null,
      unavailable: true,
      // 실패 내역은 운영자만 본다. 일반 사용자에게는 프로바이더 이름만 노출한다.
      tried: probe.tried.map(t => ({ provider: t.provider, kind: t.kind || t.skipped })),
    };
  }

  await writeCache(env, result);
  if (session && !result.pageSkipped) await saveHistory(env, session.user.id, result, reservation);
  return json(result, 200, origin);
  } finally {
    await releaseScan(env, reservation);
  }
}

// 공개 목록 등록은 "그 사이트를 실제로 제어하는 사람"만 할 수 있어야 한다.
// 버튼 한 번으로 남의 가게를 점수와 함께 게시하면, 우리가 피하려던 문제가 그대로 돌아온다.
//
// 토큰은 호스트에서 결정론적으로 만든다. 값 자체는 비밀이 아니어도 된다.
// 아무나 남의 호스트 토큰을 계산할 수는 있지만, 그 호스트에 파일이나 메타태그를
// 올릴 수는 없기 때문이다. 확인 근거는 토큰의 비밀성이 아니라 사이트 제어권이다.
async function optinToken(host) {
  const data = new TextEncoder().encode('ai-visibility-check:v1:' + host.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 메타태그 또는 well-known 파일 중 하나에 토큰이 있으면 소유를 인정한다.
async function verifyOwnership(origin, host) {
  const token = await optinToken(host);
  const ua = { 'User-Agent': 'AIVisibilityCheck/0.1 (+optin-verify)' };

  const wellKnown = await fetchPublicText(origin + '/.well-known/ai-visibility-check.txt', ua, { sameOrigin: true });
  if (wellKnown.ok && wellKnown.text.trim() === token) return { ok: true, via: 'well-known', token };

  const page = await fetchPublicText(origin + '/', ua, { sameOrigin: true });
  const { document } = parseHTML(page.text);
  if (document.querySelector('meta[name="ai-visibility-check"]')?.getAttribute('content')?.trim() === token) {
    return { ok: true, via: 'meta', token };
  }

  return { ok: false, token };
}

async function handleOptin(request, env, origin) {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'METHOD' }, 405, origin);
  const params = new URL(request.url).searchParams;
  const target = normalize(params.get('url'));
  if (!target) return json({ error: 'INVALID_URL' }, 400, origin);

  const host = target.host;

  // 확인 방법만 알려주는 조회. 등록하지 않는다.
  if (request.method === 'GET') {
    const token = await optinToken(host);
    return json({
      host,
      token,
      howto: {
        meta: `<meta name="ai-visibility-check" content="${token}">`,
        file: `/.well-known/ai-visibility-check.txt 에 ${token} 을 넣어 주세요.`,
      },
    }, 200, origin);
  }

  const scan = await env.DB.prepare(
    'SELECT host, ai_score, ux_score FROM scans WHERE host = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(host).first();
  if (!scan) return json({ error: 'SCAN_FIRST', message: '먼저 진단을 실행해 주세요.' }, 400, origin);

  const check = await verifyOwnership(target.origin, host);
  if (!check.ok) {
    return json({
      error: 'NOT_VERIFIED',
      message: '사이트에서 확인 값을 찾지 못했습니다. 반영에 시간이 걸릴 수 있으니 잠시 후 다시 시도해 주세요.',
      token: check.token,
    }, 200, origin);
  }

  const label = (params.get('label') || host).slice(0, 60);
  await env.DB.prepare(
    'INSERT INTO showcase (host, label, ai_score, ux_score, opted_in, updated_at) VALUES (?, ?, ?, ?, 1, ?) ' +
    'ON CONFLICT(host) DO UPDATE SET label=excluded.label, ai_score=excluded.ai_score, ' +
    'ux_score=excluded.ux_score, opted_in=1, updated_at=excluded.updated_at'
  ).bind(host, label, scan.ai_score, scan.ux_score, Date.now()).run();

  return json({ ok: true, host, via: check.via }, 200, origin);
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
          'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
        },
      });
    }

    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const expected = env.AUTH_BASE_URL || new URL(request.url).origin;
        const extensionRequest = pathname === '/api/extension/scan' && /^chrome-extension:\/\/[a-z]{32}$/.test(request.headers.get('Origin') || '');
        if (!extensionRequest && request.headers.get('Origin') !== expected) return json({ message: '허용되지 않은 요청입니다.' }, 403, origin);
      }
      if (pathname.startsWith('/api/auth/')) {
        if (!env.AUTH_SECRET) return json({ message: '로그인 설정을 준비 중입니다.' }, 503, origin);
        return browserSessionCookies(await createAuth(env).handler(request));
      }
      if (pathname === '/api/member/config') return json({ providers: providerStatus(env), emailReady: !!env.AUTH_SECRET, emailVerification: !!(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM), loginUrl: env.AUTH_BASE_URL + '/ai-visibility-check/signup/' }, 200, origin);
      if (pathname.startsWith('/api/member/')) {
        const session = await sessionOf(request, env);
        if (pathname === '/api/member/me') return json({ user: session ? { id: session.user.id, name: session.user.name, email: session.user.email, emailVerified: session.user.emailVerified } : null, usage: session ? await quota(env, session.user.id) : null }, 200, origin);
        if (!session) return json({ message: '로그인이 필요합니다.' }, 401, origin);
        return await memberRoute(request, env, session.user, json, origin);
      }
      if (pathname === '/api/health') {
        return json({ ok: true, version: DIAGNOSIS_VERSION, ts: Date.now() }, 200, origin);
      }
      if (pathname === '/api/extension/scan' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        const url = publicUrl(body?.url);
        if (!url) return json({ error: 'INVALID_URL', message: '현재 탭 주소를 읽지 못했습니다.' }, 400, origin);
        return json(extensionResult({ ...body, url }), 200, origin);
      }
      if (pathname === '/api/share') {
        const result = await readSharedReport(env, new URL(request.url).searchParams.get('token'));
        return result ? json(result, 200, origin) : json({ message: '공유 결과를 찾지 못했거나 만료되었습니다.' }, 404, origin);
      }
      if (pathname === '/api/scan') {
        return await handleScan(request, env, origin);
      }
      if (pathname === '/api/showcase') {
        return await handleShowcase(env, origin);
      }
      if (pathname === '/api/optin') {
        return await handleOptin(request, env, origin);
      }
      if (env.ASSETS && !pathname.startsWith('/api/')) {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = pathname.replace(/^\/ai-visibility-check\//, '/');
        if (/^\/(signup|login|account)\/?$/.test(assetUrl.pathname)) assetUrl.pathname = '/';
        if (assetUrl.pathname === '/ai-visibility-check') return Response.redirect(env.AUTH_BASE_URL + '/ai-visibility-check/', 302);
        const response = await env.ASSETS.fetch(new Request(assetUrl, request));
        const headers = new Headers(response.headers);
        headers.set('Referrer-Policy', 'same-origin');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
        return new Response(response.body, { status: response.status, headers });
      }
      return json({ error: 'NOT_FOUND' }, 404, origin);
    } catch (e) {
      console.error('Request failed:', e?.name);
      return json({ error: 'INTERNAL', message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 500, origin);
    }
  },
};
