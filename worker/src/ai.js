const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 10000;

class GeminiError extends Error {
  constructor(kind, status) {
    super(kind + ' ' + status);
    this.kind = kind;
    this.status = status;
  }
}

function classify(status, body) {
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 && /location is not supported/i.test(body || '')) return 'region';
  return 'client';
}

async function post(url, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) {
      const body = await res.text();
      throw new GeminiError(classify(res.status, body), res.status);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    throw new GeminiError('network', 0);
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

async function callGemini(env, system, user, json = true) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  const data = await post(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
  });
  return { model, text: (data?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('').trim() };
}

export async function askAI(env, { system, user }) {
  if (!env.GEMINI_API_KEY) return { ok: false, tried: [{ provider: 'gemini', skipped: 'no_key' }] };
  try {
    const { model, text } = await callGemini(env, system, user);
    const json = extractJson(text);
    if (!json) throw new GeminiError('client', 200);
    return { ok: true, provider: 'gemini', model, json };
  } catch (error) {
    return { ok: false, tried: [{ provider: 'gemini', kind: error.kind || 'network', status: error.status || 0 }] };
  }
}

export async function queryGemini(env, query) {
  if (!env.GEMINI_API_KEY) return { ok: false, kind: 'no_key' };
  try {
    const { model, text } = await callGemini(env, '일반 소비자의 질문에 한국어로 답하세요. 질문에 없는 특정 브랜드를 미리 알려고 하거나 추측하지 말고, 알고 있는 범위만 답하세요.', query, false);
    if (!text) throw new GeminiError('client', 200);
    return { ok: true, provider: 'gemini', model, text: text.slice(0, 5000), generatedAt: Date.now() };
  } catch (error) {
    return { ok: false, kind: error.kind || 'network', status: error.status || 0 };
  }
}

/** 브랜드 질의 5개를 한 번의 호출로 묶는다. 호출 수를 5분의 1로 줄이기 위한 것. */
export function brandProbePrompt(brand, host) {
  const system = [
    '너는 소비자의 질문에 답하는 일반 AI 어시스턴트다.',
    '아는 것만 답하고, 모르면 모른다고 분명히 말한다. 추측해서 지어내지 않는다.',
    '반드시 지정된 JSON 형식으로만 답한다.',
  ].join(' ');

  const user = [
    '다음 브랜드에 대해 아는 대로 답하라.',
    '브랜드명: ' + brand,
    '웹사이트: ' + host,
    '',
    '아래 JSON 형식으로 답하라:',
    '{',
    '  "knows": true 또는 false,',
    '  "what_is_it": "이 브랜드가 무엇인지 한 문장. 모르면 빈 문자열",',
    '  "category": "취급 품목 추정. 모르면 빈 문자열",',
    '  "would_recommend_for": ["이 브랜드를 추천할 만한 상황 최대 3개"],',
    '  "competitors_named_first": ["같은 카테고리에서 먼저 떠오르는 다른 브랜드 최대 3개"],',
    '  "confidence": 0.0 에서 1.0 사이 숫자,',
    '  "possible_misinformation": "잘못 알고 있을 수 있는 내용. 없으면 빈 문자열"',
    '}',
  ].join('\n');

  return { system, user };
}
