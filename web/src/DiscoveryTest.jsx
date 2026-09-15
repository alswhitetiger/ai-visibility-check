import { useState } from 'react';
import { memberApi } from './member-api';

export default function DiscoveryTest({ data }) {
  const [query, setQuery] = useState(''), [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try { setResult(await memberApi('/api/discovery', { url: data.url, query: query.trim() })); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="panel discovery-test"><p className="eyebrow">브랜드명을 알려주지 않는 AI 기억 검사</p><h2>소비자 질문에서 우리 가게가 떠오를까요?</h2>
    <p>Gemini에는 가게 이름과 주소를 보내지 않고 아래 질문만 전달합니다. 모델 자체 답변에 현재 가게가 등장했는지 확인합니다.</p>
    <form onSubmit={submit}><label>소비자가 실제로 물어볼 질문<textarea required minLength={10} maxLength={300} rows={3} value={query} onChange={event=>setQuery(event.target.value)} placeholder="예: 매일 쓰기 좋은 국내 도자기 그릇 쇼핑몰을 추천해 줘" /></label><button className="button primary" disabled={busy}>{busy ? '검색 중…' : 'AI 발견 가능성 검사'}</button></form>
    <p className="muted">로그인 회원 기준 하루 3회 · 실시간 검색 순위 검사가 아닙니다. 질문에 개인정보나 공개하지 않은 사업 정보를 넣지 마세요.</p>
    {error && <p role="alert" className="account-message">{error}</p>}
    {result && <div className={'discovery-result '+(result.found ? 'is-found' : 'not-found')}><b>{result.found ? 'Gemini 답변에서 이 가게를 찾았습니다.' : '이번 질문에서는 이 가게가 나오지 않았습니다.'}</b><p>{result.text}</p><small>{result.model} · 모델 지식과 질문 표현에 따라 결과가 달라질 수 있습니다.</small></div>}
  </section>;
}
