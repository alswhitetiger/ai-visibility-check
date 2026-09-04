// 3단 폴백 AI 호출기.
//   ① Gemini (무료 티어)  → ② OpenAI  → ③ Anthropic Claude
// 앞 단계가 한도(429)나 장애(5xx/타임아웃)를 내면 다음 단계로 넘어간다.
// 키 오류(4xx)는 폴백하지 않는다. 키 하나가 잘못됐을 때 셋을 다 태우지 않기 위해서다.

const PROVIDERS = [
  { name: 'gemini', keyVar: 'GEMINI_API_KEY', model: 'gemini-2.5-flash-lite' },
  { name: 'openai', keyVar: 'OPENAI_API_KEY', model: 'gpt-5-mini' },
  { name: 'anthropic', keyVar: 'ANTHROPIC_API_KEY', model: 'claude-haiku-4-5-20251001' },
];

const TIMEOUT_MS = 25000;
const RETRY_DELAYS = [1200, 3000]; // 429는 같은 단계에서 먼저 재시도한다.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class ProviderError extends Error {
  constructor(kind, status, body) {
    super(kind + ' ' + status);
    this.kind = kind; // 'rate_limit' | 'server' | 'auth' | 'network'
    this.status = status;
    this.body = body;
  }
}

function classify(status) {
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status === 401 || status === 403) return 'auth';
  return 'client';
}

async function post(url, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new ProviderError(classify(res.status), res.status, await res.text());
    return await res.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError('network', 0, String(e));
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

async function callGemini(key, model, system, user) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  const data = await post(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  });
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI(key, model, system, user) {
  const data = await post('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
    }),
  });
  return data?.choices?.[0]?.message?.content || '';
}

async function callAnthropic(key, model, system, user) {
  const data = await post('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  return data?.content?.[0]?.text || '';
}

const CALLERS = { gemini: callGemini, openai: callOpenAI, anthropic: callAnthropic };

/**
 * 세 프로바이더를 하나로 감싼다. 뒷단 코드는 누가 답했는지 몰라도 된다.
 * @returns {{ ok: true, provider: string, model: string, json: object }}
 *        | {{ ok: false, reason: 'exhausted', tried: object[] }}
 */
export async function askAI(env, { system, user }) {
  const tried = [];

  for (const p of PROVIDERS) {
    const key = env[p.keyVar];
    if (!key) { tried.push({ provider: p.name, skipped: 'no_key' }); continue; }

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const text = await CALLERS[p.name](key, p.model, system, user);
        const json = extractJson(text);
        if (!json) throw new ProviderError('client', 200, 'unparseable');
        return { ok: true, provider: p.name, model: p.model, json };
      } catch (e) {
        const kind = e.kind || 'network';
        // 분당 한도는 같은 단계에서 잠깐 기다렸다 다시 시도한다.
        if (kind === 'rate_limit' && attempt < RETRY_DELAYS.length) {
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }
        tried.push({ provider: p.name, kind, status: e.status });
        break; // 다음 프로바이더로
      }
    }
  }

  return { ok: false, reason: 'exhausted', tried };
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
