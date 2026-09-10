const configured = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
export const API = location.hostname.endsWith('.workers.dev') ? '' : configured;
export const sameOrigin = !API || new URL(API).origin === location.origin;
export const memberBase = (API || location.origin) + '/ai-visibility-check/';
export const loginUrl = memberBase + 'login/';
const SESSION_KEY = 'shop-check:session-active';
export const sessionIsActive = () => sessionStorage.getItem(SESSION_KEY) === '1';
export const markSessionActive = () => sessionStorage.setItem(SESSION_KEY, '1');
export const clearSessionActive = () => sessionStorage.removeItem(SESSION_KEY);
export function memberPageUrl(page = 'signup', intent = {}) {
  const url = new URL(page + '/', memberBase);
  if (intent.action) url.searchParams.set('action', intent.action);
  if (intent.url) url.searchParams.set('url', intent.url);
  if (intent.id) url.searchParams.set('history', intent.id);
  return url.href;
}
export async function memberApi(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(API + path, { method, credentials: sameOrigin ? 'same-origin' : 'omit', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok || data.error) {
    const messages = { INVALID_EMAIL_OR_PASSWORD: '이메일 또는 비밀번호를 확인해 주세요.', USER_ALREADY_EXISTS: '가입 정보를 확인하거나 로그인해 주세요.', EMAIL_NOT_VERIFIED: '이메일의 확인 링크를 누른 뒤 로그인해 주세요.', PASSWORD_TOO_SHORT: '비밀번호는 12자 이상 입력해 주세요.', ACCOUNT_NOT_LINKED: '기존 계정으로 로그인한 뒤 계정 연결을 진행해 주세요.' };
    throw new Error(messages[data.code] || data.message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return data;
}
