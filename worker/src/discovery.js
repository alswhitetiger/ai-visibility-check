import { searchGemini } from './ai.js';

const clean = value => String(value || '').toLowerCase().replace(/^www\./, '').replace(/[^\p{L}\p{N}.]/gu, '');

export function mentionsTarget(result, { host, brand }) {
  const haystack = clean([result.text, ...(result.sources || []).flatMap(source => [source.title, source.uri])].join(' '));
  const names = [host, String(host || '').replace(/^www\./, '').split('.')[0], brand].map(clean).filter(name => name.length >= 2);
  return names.some(name => haystack.includes(name));
}

export async function discoverBrand(env, { query, host, brand }) {
  const result = await searchGemini(env, query);
  if (!result.ok) return { error: 'AI_UNAVAILABLE', message: 'Gemini 검색 답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.', kind: result.kind };
  return { ...result, found: result.grounded && mentionsTarget(result, { host, brand }), targetHost: host };
}
